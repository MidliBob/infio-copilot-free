import { debounce, isEqual } from '../utils/lodash-lite'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { editorStateToPlainText } from '../components/chat-view/chat-input/utils/editor-state-to-plain-text'
import { useApp } from '../contexts/AppContext'
import { useSettings } from '../contexts/SettingsContext'
import { ChatManager } from '../database/json/chat/ChatManager'
import { deserializeChatMessage, serializeChatMessage } from '../database/json/utils'
import { WorkspaceManager } from '../database/json/workspace/WorkspaceManager'
import { ChatConversationMeta, ChatMessage, ChatUserMessage } from '../types/chat'

type UseChatHistory = {
	createOrUpdateConversation: (
		id: string,
		messages: ChatMessage[],
	) => Promise<void>
	deleteConversation: (id: string) => Promise<void>
	getChatMessagesById: (id: string) => Promise<ChatMessage[] | null>
	updateConversationTitle: (id: string, title: string) => Promise<void>
	chatList: ChatConversationMeta[]
	cleanupOutdatedChats: () => Promise<number>
}

export function useChatHistory(): UseChatHistory {
	const app = useApp()
	const { settings } = useSettings()
	const workspaceManager = useMemo(() => new WorkspaceManager(app), [app])
	const chatManager = useMemo(() => new ChatManager(app, workspaceManager), [app, workspaceManager])

	const [chatList, setChatList] = useState<ChatConversationMeta[]>([])

	const fetchChatList = useCallback(async () => {
		const conversations = await chatManager.listChats()
		setChatList(conversations)
	}, [chatManager])

	// 获取当前工作区
	const currentWorkspace = settings.workspace || 'vault'

	useEffect(() => {
		void fetchChatList()
	}, [fetchChatList])

	const createOrUpdateConversation = useMemo(
		() =>
			debounce(
				async (id: string, messages: ChatMessage[]): Promise<void> => {
					const serializedMessages = messages.map(serializeChatMessage)
					const existingConversation = await chatManager.findById(id)

					if (existingConversation) {
						if (isEqual(existingConversation.messages, serializedMessages)) {
							return
						}
						await chatManager.updateChat(existingConversation.id, {
							messages: serializedMessages,
						})
					} else {
						const firstUserMessage = messages.find((v) => v.role === 'user') as ChatUserMessage

						await chatManager.createChat({
							id,
							title: firstUserMessage?.content
								? editorStateToPlainText(firstUserMessage.content).substring(
									0,
									50,
								)
								: 'New chat',
							messages: serializedMessages,
							workspace: currentWorkspace,
						})
					}

					await fetchChatList()
				},
				300,
				{
					maxWait: 1000,
				},
			),
		[chatManager, fetchChatList, settings, workspaceManager],
	)

	const deleteConversation = useCallback(
		async (id: string): Promise<void> => {
			await chatManager.deleteChat(id)
			await fetchChatList()
		},
		[chatManager, fetchChatList],
	)

	const getChatMessagesById = useCallback(
		async (id: string): Promise<ChatMessage[] | null> => {
			const conversation = await chatManager.findById(id)
			if (!conversation) {
				return null
			}
			return conversation.messages.map((message) =>
				deserializeChatMessage(message, app),
			)
		},
		[chatManager, app],
	)

	const updateConversationTitle = useCallback(
		async (id: string, title: string): Promise<void> => {
			if (title.length === 0) {
				throw new Error('Chat title cannot be empty')
			}
			const conversation = await chatManager.findById(id)
			if (!conversation) {
				throw new Error('Conversation not found')
			}
			await chatManager.updateChat(conversation.id, {
				title,
			})
			await fetchChatList()
		},
		[chatManager, fetchChatList],
	)

	const cleanupOutdatedChats = useCallback(async (): Promise<number> => {
		const count = await chatManager.cleanupOutdatedChats()
		await fetchChatList()
		return count
	}, [chatManager, fetchChatList])

	return {
		createOrUpdateConversation,
		deleteConversation,
		getChatMessagesById,
		updateConversationTitle,
		chatList,
		cleanupOutdatedChats,
	}
}
