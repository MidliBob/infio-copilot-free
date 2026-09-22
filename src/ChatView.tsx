// @ts-nocheck
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ItemView, WorkspaceLeaf } from 'obsidian'
import React from 'react'
import { Root, createRoot } from 'react-dom/client'

import Chat, { ChatProps, ChatRef } from './components/chat-view/ChatView'
import { CHAT_VIEW_TYPE } from './constants'
import { AppProvider } from './contexts/AppContext'
import { DarkModeProvider } from './contexts/DarkModeContext'
import { DatabaseProvider } from './contexts/DatabaseContext'
import { DataviewProvider } from './contexts/DataviewContext'
import { DialogProvider } from './contexts/DialogContext'
import { DiffStrategyProvider } from './contexts/DiffStrategyContext'
import { LLMProvider } from './contexts/LLMContext'
import { McpHubProvider } from './contexts/McpHubContext'
import { RAGProvider } from './contexts/RAGContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { TransProvider } from './contexts/TransContext'
import InfioPlugin from './main'
import { MentionableBlockData } from './types/mentionable'
import { InfioSettings } from './types/settings'
import { logger } from './utils/logger'

export class ChatView extends ItemView {
	private root: Root | null = null
	private settings: InfioSettings
	private initialChatProps?: ChatProps
	private chatRef: React.RefObject<ChatRef> = React.createRef()

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: InfioPlugin,
	) {
		super(leaf)
		// @ts-ignore
		this.settings = plugin.settings
		// @ts-ignore
		this.initialChatProps = plugin.initChatProps
	}

	getViewType() {
		return CHAT_VIEW_TYPE
	}

	getIcon() {
		return 'wand-sparkles'
	}

	getDisplayText() {
		return 'Infio chat'
	}

	async onOpen() {
		await this.render()

		// Consume chatProps
		this.initialChatProps = undefined
	}

	async onClose() {
		this.root?.unmount()
	}

	async render() {
		// 确保容器元素存在
		const containerElement = this.containerEl.children[1]
		if (!containerElement || !(containerElement instanceof HTMLElement)) {
			logger.error('ChatView: Container element not found or invalid')
			return
		}

		if (!this.root) {
			this.root = createRoot(containerElement)
		}

		const queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					gcTime: 0, // Immediately garbage collect queries. It prevents memory leak on ChatView close.
				},
				mutations: {
					gcTime: 0, // Immediately garbage collect mutations. It prevents memory leak on ChatView close.
				},
			},
		})

		this.root.render(
			<AppProvider app={this.app}>
				<SettingsProvider
					settings={this.settings}
					// @ts-ignore
					setSettings={(newSettings) => this.plugin.setSettings(newSettings)}
					addSettingsChangeListener={(listener) =>
						// @ts-ignore
						this.plugin.addSettingsListener(listener)
					}
				>
					<DarkModeProvider>
						<LLMProvider>
							<DatabaseProvider
								getDatabaseManager={() => this.plugin.getDbManager()}
							>
								<DiffStrategyProvider diffStrategy={this.plugin.diffStrategy}>
									<RAGProvider getRAGEngine={() => this.plugin.getRAGEngine()}>
										<TransProvider getTransEngine={() => this.plugin.getTransEngine()}>
											<DataviewProvider dataviewManager={this.plugin.dataviewManager}>
											<McpHubProvider getMcpHub={() => this.plugin.getMcpHub()}>
												<QueryClientProvider client={queryClient}>
													<React.StrictMode>
														<DialogProvider
															container={containerElement}
														>
															<Chat ref={this.chatRef} {...this.initialChatProps} />
														</DialogProvider>
													</React.StrictMode>
												</QueryClientProvider>
											</McpHubProvider>
										</DataviewProvider>
										</TransProvider>
									</RAGProvider>
								</DiffStrategyProvider>
							</DatabaseProvider>
						</LLMProvider>
					</DarkModeProvider>
				</SettingsProvider>
			</AppProvider>,
		)
	}

	openNewChat(selectedBlock?: MentionableBlockData) {
		this.chatRef.current?.openNewChat(selectedBlock)
	}

	addSelectionToChat(selectedBlock: MentionableBlockData) {
		this.chatRef.current?.addSelectionToChat(selectedBlock)
	}

	focusMessage() {
		this.chatRef.current?.focusMessage()
	}
}
