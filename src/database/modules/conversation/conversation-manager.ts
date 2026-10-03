import { Transaction } from '@electric-sql/pglite'
import { App } from 'obsidian'

import { editorStateToPlainText } from '../../../components/chat-view/chat-input/utils/editor-state-to-plain-text'
import { ChatAssistantMessage, ChatConversationMeta, ChatMessage, ChatUserMessage } from '../../../types/chat'
import { Mentionable } from '../../../types/mentionable'
import { deserializeMentionable, serializeMentionable } from '../../../utils/mentionable'
import { DBManager } from '../../database-manager'
import { InsertMessage, SelectConversation, SelectMessage } from '../../schema'

import { ConversationRepository } from './conversation-repository'

export class ConversationManager {
	private app: App
	private repository: ConversationRepository
	private dbManager: DBManager

	constructor(app: App, dbManager: DBManager) {
		this.app = app
		this.dbManager = dbManager
		const db = dbManager.getPgClient()
		if (!db) throw new Error('Database not initialized')
		this.repository = new ConversationRepository(app, db)
	}

	async createConversation(id: string, title = 'New chat', tx?: Transaction): Promise<void> {
		const conversation = {
			id,
			title,
			createdAt: new Date(),
			updatedAt: new Date(),
		}
		await this.repository.create(conversation, tx)
	}

	async txCreateOrUpdateConversation(id: string, messages: ChatMessage[]): Promise<void> {
		await this.repository.tx(async (tx) => {
			const conversation = await this.repository.findById(id, tx)
			if (!conversation) {
				let title = 'New chat'
				if (messages.length > 0 && messages[0].role === 'user') {
					const query = editorStateToPlainText(messages[0].content)
					if (query.length > 20) {
						title = `${query.slice(0, 20)}...`
					} else {
						title = query
					}
				}
				await this.createConversation(id, title, tx)
			}

			// Delete existing messages
			await this.repository.deleteAllMessagesFromConversation(id, tx)

			// Insert new messages
			for (const message of messages) {
				const insertMessage = this.serializeMessage(message, id)
				await this.repository.createMessage(insertMessage, tx)
			}

			// Update conversation timestamp
			await this.repository.update(id, { updatedAt: new Date() }, tx)
		})
	}

	async findConversation(id: string): Promise<ChatMessage[] | null> {
		const conversation = await this.repository.findById(id)
		if (!conversation) {
			return null
		}

		const messages = await this.repository.findMessagesByConversationId(id)
		return messages.map(msg => this.deserializeMessage(msg))
	}

	async deleteConversation(id: string): Promise<void> {
		await this.repository.delete(id)
	}

	async conversations(): Promise<SelectConversation[]>{
		return this.repository.findAll()
	}

	getAllConversations(callback: (conversations: ChatConversationMeta[]) => void): void {
		const db = this.dbManager.getPgClient()
		// fire-and-forget live subscription (PGlite resolves it once and then
		// pushes updates into the callback); explicitly void-marked since
		// 1.7.10 (no-floating-promises is enabled)
		void db?.live.query('SELECT * FROM conversations ORDER BY updated_at DESC', [], (results: { rows: Array<SelectConversation> }) => {
			callback(results.rows.map(conv => ({
				schemaVersion: 2,
				id: conv.id,
				title: conv.title,
				createdAt: conv.created_at instanceof Date ? conv.created_at.getTime() : conv.created_at,
				updatedAt: conv.updated_at instanceof Date ? conv.updated_at.getTime() : conv.updated_at,
			})))
		})
	}

	async updateConversationTitle(id: string, title: string): Promise<void> {
		await this.repository.update(id, { title })
	}

	// convert ChatMessage to InsertMessage
	private serializeMessage(message: ChatMessage, conversationId: string): InsertMessage {
		const base = {
			id: message.id,
			conversationId: conversationId,
			role: message.role,
			createdAt: new Date(),
		}

		if (message.role === 'user') {
			const userMessage: ChatUserMessage = message
			return {
				...base,
				apply_status: message.applyStatus,
				content: userMessage.content ? JSON.stringify(userMessage.content) : null,
				promptContent: userMessage.promptContent
					? typeof userMessage.promptContent === 'string'
						? userMessage.promptContent
						: JSON.stringify(userMessage.promptContent)
					: null,
				mentionables: JSON.stringify(userMessage.mentionables.map(serializeMentionable)),
				similaritySearchResults: userMessage.similaritySearchResults
					? JSON.stringify(userMessage.similaritySearchResults)
					: null,
			}
		} else {
			const assistantMessage: ChatAssistantMessage = message
			return {
				...base,
				apply_status: message.applyStatus,
				content: assistantMessage.content,
				reasoningContent: assistantMessage.reasoningContent,
				metadata: assistantMessage.metadata ? JSON.stringify(assistantMessage.metadata) : null,
			}
		}
	}

	// convert SelectMessage to ChatMessage
	private deserializeMessage(message: SelectMessage): ChatMessage {
		if (message.role === 'user') {
			return {
				id: message.id,
				role: 'user',
				applyStatus: message.apply_status,
				content: message.content ? JSON.parse(message.content) : null,
				promptContent: message.prompt_content
					? message.prompt_content.startsWith('{')
						? JSON.parse(message.prompt_content)
						: message.prompt_content
					: null,
				mentionables: message.mentionables
					? JSON.parse(message.mentionables)
						.map(m => deserializeMentionable(m, this.app))
						.filter((m: Mentionable | null): m is Mentionable => m !== null)
					: [],
				similaritySearchResults: message.similarity_search_results
					? JSON.parse(message.similarity_search_results)
					: undefined,
			}
		} else {
			return {
				id: message.id,
				applyStatus: message.apply_status,
				role: 'assistant',
				content: message.content || '',
				reasoningContent: message.reasoning_content || '',
				metadata: message.metadata ? JSON.parse(message.metadata) : undefined,
			}
		}
	}
}
