import { App, normalizePath } from 'obsidian'

import { DBManager } from '../database-manager'
import { DuplicateCommandException } from '../exception'
import { ConversationManager } from '../modules/conversation/conversation-manager'

import { ChatManager } from './chat/ChatManager'
import { CommandManager } from './command/CommandManager'
import { INITIAL_MIGRATION_MARKER, ROOT_DIR } from './constants'
import { serializeChatMessage } from './utils'
import { logger } from '../../utils/logger'

async function hasMigrationCompleted(app: App): Promise<boolean> {
	const markerPath = normalizePath(`${ROOT_DIR}/${INITIAL_MIGRATION_MARKER}`)
	return await app.vault.adapter.exists(markerPath)
}

async function markMigrationCompleted(app: App): Promise<void> {
	const markerPath = normalizePath(`${ROOT_DIR}/${INITIAL_MIGRATION_MARKER}`)
	await app.vault.adapter.write(
		markerPath,
		`Migration completed on ${new Date().toISOString()}`,
	)
}

async function transferChatHistory(app: App, dbManager: DBManager): Promise<void> {
	const oldChatManager = new ConversationManager(app, dbManager)
	const newChatManager = new ChatManager(app)

	const chatList = await oldChatManager.conversations()

	for (const chatMeta of chatList) {
		try {
			const existingChat = await newChatManager.findById(chatMeta.id)
			if (existingChat) {
				continue
			}

			const oldChatMessageList = await oldChatManager.findConversation(chatMeta.id)
			if (!oldChatMessageList) {
				continue
			}

			await newChatManager.createChat({
				id: chatMeta.id,
				title: chatMeta.title,
				messages: oldChatMessageList.map(msg => serializeChatMessage(msg)),
				createdAt: chatMeta.created_at instanceof Date ? chatMeta.created_at.getTime() : chatMeta.created_at,
				updatedAt: chatMeta.updated_at instanceof Date ? chatMeta.updated_at.getTime() : chatMeta.updated_at,
			})

			const verifyChat = await newChatManager.findById(chatMeta.id)
			if (!verifyChat) {
				throw new Error(`Failed to verify migration of chat ${chatMeta.id}`)
			}

			await oldChatManager.deleteConversation(chatMeta.id)
		} catch (error) {
			logger.error(`Error migrating chat ${chatMeta.id}:`, error)
		}
	}

	logger.debug('Chat history migration to JSON database completed')
}

async function transferCommands(
	app: App,
	dbManager: DBManager,
): Promise<void> {
	const jsonCommandManager = new CommandManager(app)
	const commandManager = dbManager.getCommandManager()

	const commands = await commandManager.findAllCommands()

	for (const command of commands) {
		try {
			if (await jsonCommandManager.findByName(command.name)) {
				// Template already exists, skip
				continue
			}
			await jsonCommandManager.createCommand({
				name: command.name,
				content: command.content,
			})

			const verifyCommand = await jsonCommandManager.findByName(command.name)
			if (!verifyCommand) {
				throw new Error(
					`Failed to verify migration of command ${command.name}`,
				)
			}

			await commandManager.deleteCommand(command.id)
		} catch (error) {
			if (error instanceof DuplicateCommandException) {
				logger.debug(`Duplicate command found: ${command.name}. Skipping...`)
			} else {
				logger.error(`Error migrating command ${command.name}:`, error)
			}
		}
	}

	logger.debug('Commands migration to JSON database completed')
}

export async function migrateToJsonDatabase(
	app: App,
	dbManager: DBManager,
	onMigrationComplete?: () => void,
): Promise<void> {
	if (await hasMigrationCompleted(app)) {
		return
	}

	await transferChatHistory(app, dbManager)
	await transferCommands(app, dbManager)
	await markMigrationCompleted(app)
	onMigrationComplete?.()
}

