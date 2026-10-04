import * as path from 'path'

import { BaseSerializedNode } from '@lexical/clipboard/clipboard'
import { useMutation } from '@tanstack/react-query'
import { Box, Lightbulb, CircleStop, History, NotebookPen, Plus, Search, Server, SquareSlash, Undo } from 'lucide-react'
import { App, Notice, TFile, WorkspaceLeaf } from 'obsidian'
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from 'react'
import { v4 as uuidv4 } from 'uuid'

import { ApplyView, ApplyViewState } from '../../ApplyView'
import { APPLY_VIEW_TYPE } from '../../constants'
import { useApp } from '../../contexts/AppContext'
import { useDataview } from '../../contexts/DataviewContext'
import { useDiffStrategy } from '../../contexts/DiffStrategyContext'
import { useLLM } from '../../contexts/LLMContext'
import { useMcpHub } from '../../contexts/McpHubContext'
import { useRAG } from '../../contexts/RAGContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useTrans } from '../../contexts/TransContext'
import { matchSearchUsingCorePlugin } from '../../core/file-search/match/coreplugin-match'
import { matchSearchUsingOmnisearch } from '../../core/file-search/match/omnisearch-match'
import { regexSearchUsingCorePlugin } from '../../core/file-search/regex/coreplugin-regex'
import { regexSearchUsingRipgrep } from '../../core/file-search/regex/ripgrep-regex'
import {
	LLMAPIKeyInvalidException,
	LLMAPIKeyNotSetException,
	LLMBaseUrlNotSetException,
	LLMModelNotSetException,
} from '../../core/llm/exception'
import { TransformationType } from '../../core/transformations/trans-engine'
import { Workspace } from '../../database/json/workspace/types'
import { WorkspaceManager } from '../../database/json/workspace/WorkspaceManager'
import { useChatHistory } from '../../hooks/use-chat-history'
import { useCustomModes } from '../../hooks/use-custom-mode'
import { t } from '../../lang/helpers'
import { PreviewView } from '../../PreviewView'
import { ApplyStatus, ToolArgs } from '../../types/apply'
import { ChatMessage, ChatUserMessage } from '../../types/chat'
import {
	Mentionable,
	MentionableBlock,
	MentionableBlockData,
	MentionableCurrentFile,
} from '../../types/mentionable'
import { isCancellation } from '../../utils/abort-errors'
import { ApplyEditToFile, SearchAndReplace } from '../../utils/apply'
import { listFilesAndFolders, semanticSearchFiles } from '../../utils/glob-utils'
import { checkManageFilesPermission, runManageFilesOperations } from '../../utils/manage-files'
import {
	getMentionableKey,
	serializeMentionable,
} from '../../utils/mentionable'
import { readTFileContent, readTFileContentPdf } from '../../utils/obsidian'
import { openSettingsModalWithError } from '../../utils/open-settings-modal'
import { PromptGenerator, addLineNumbers } from '../../utils/prompt-generator'
// Removed empty line above, added one below for group separation
import { fetchUrlsContent, webSearch } from '../../utils/web-search'
import ErrorBoundary from '../common/ErrorBoundary'

import PromptInputWithActions, { ChatUserInputRef } from './chat-input/PromptInputWithActions'
import { editorStateToPlainText } from './chat-input/utils/editor-state-to-plain-text'
import ChatHistoryView from './ChatHistoryView'
import CommandsView from './CommandsView'
import CustomModeView from './CustomModeView'
import FileReadResults from './FileReadResults'
import HelloInfo from './HelloInfo'
import InsightView from './InsightView'
import MarkdownReasoningBlock from './Markdown/MarkdownReasoningBlock'
import McpHubView from './McpHubView'; // Moved after MarkdownReasoningBlock
import QueryProgress, { QueryProgressState } from './QueryProgress'
import ReactMarkdown from './ReactMarkdown'
import SearchView from './SearchView'
import SimilaritySearchResults from './SimilaritySearchResults'
import UserMessageView from './UserMessageView'
import WebsiteReadResults from './WebsiteReadResults'
import WorkspaceSelect from './WorkspaceSelect'
import WorkspaceView from './WorkspaceView'
import { logger } from '../../utils/logger'
import { showConfirm } from '../../utils/modal-dialogs'

// Add an empty line here
const getNewInputMessage = (app: App, defaultMention: string): ChatUserMessage => {
	const mentionables: Mentionable[] = [];
	if (defaultMention === 'current-file') {
		const activeFile = app.workspace.getActiveFile();
		if (activeFile) {
			mentionables.push({
				type: 'current-file',
				file: activeFile,
			});
		}
	} else if (defaultMention === 'vault') {
		mentionables.push({
			type: 'vault',
		});
	}
	return {
		role: 'user',
		applyStatus: ApplyStatus.Idle,
		content: null,
		promptContent: null,
		id: uuidv4(),
		mentionables: mentionables,
	}
}

export type ChatRef = {
	openNewChat: (selectedBlock?: MentionableBlockData) => void
	addSelectionToChat: (selectedBlock: MentionableBlockData) => void
	focusMessage: () => void
}

export type ChatProps = {
	selectedBlock?: MentionableBlockData
}

const Chat = forwardRef<ChatRef, ChatProps>((props, ref) => {
	const app = useApp()
	const { settings, setSettings } = useSettings()
	const { getRAGEngine } = useRAG()
	const { getTransEngine } = useTrans()
	const diffStrategy = useDiffStrategy()
	const dataviewManager = useDataview()
	const { getMcpHub } = useMcpHub()
	const { customModeList, customModePrompts } = useCustomModes()

	const {
		createOrUpdateConversation,
		deleteConversation,
		getChatMessagesById,
		updateConversationTitle,
		chatList,
	} = useChatHistory()
	const { streamResponse, chatModel } = useLLM()

	const promptGenerator = useMemo(() => {
		// @ts-expect-error TODO: Review PromptGenerator constructor parameters and types
		return new PromptGenerator(getRAGEngine, app, settings, diffStrategy, customModePrompts, customModeList, getMcpHub)
	}, [getRAGEngine, app, settings, diffStrategy, customModePrompts, customModeList, getMcpHub])

	const workspaceManager = useMemo(() => {
		return new WorkspaceManager(app)
	}, [app])

	const [inputMessage, setInputMessage] = useState<ChatUserMessage>(() => {
		const newMessage = getNewInputMessage(app, settings.defaultMention)
		if (props.selectedBlock) {
			newMessage.mentionables = [
				...newMessage.mentionables,
				{
					type: 'block',
					...props.selectedBlock,
				},
			]
		}
		return newMessage
	})
	const [addedBlockKey, setAddedBlockKey] = useState<string | null>(
		props.selectedBlock
			? getMentionableKey(
				serializeMentionable({
					type: 'block',
					...props.selectedBlock,
				}),
			)
			: null,
	)
	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
	const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null)
	const [currentConversationId, setCurrentConversationId] =
		useState<string>(uuidv4())
	const [queryProgress, setQueryProgress] = useState<QueryProgressState>({
		type: 'idle',
	})

	const preventAutoScrollRef = useRef(false)
	const lastProgrammaticScrollRef = useRef<number>(0)
	const activeStreamAbortControllersRef = useRef<AbortController[]>([])
	const chatUserInputRefs = useRef<Map<string, ChatUserInputRef>>(new Map())
	const chatMessagesRef = useRef<HTMLDivElement>(null)
	const registerChatUserInputRef = (
		id: string,
		ref: ChatUserInputRef | null,
	) => {
		if (ref) {
			chatUserInputRefs.current.set(id, ref)
		} else {
			chatUserInputRefs.current.delete(id)
		}
	}

	const [tab, setTab] = useState<'chat' | 'commands' | 'custom-mode' | 'mcp' | 'search' | 'history' | 'workspace' | 'insights'>('chat')

	const [selectedSerializedNodes, setSelectedSerializedNodes] = useState<BaseSerializedNode[]>([])

	// 跟踪正在编辑的消息ID
	const [editingMessageId, setEditingMessageId] = useState<string | null>(null)

	useEffect(() => {
		const scrollContainer = chatMessagesRef.current
		if (!scrollContainer) return

		const handleScroll = () => {
			// If the scroll event happened very close to our programmatic scroll, ignore it
			if (Date.now() - lastProgrammaticScrollRef.current < 50) {
				return
			}

			preventAutoScrollRef.current =
				scrollContainer.scrollHeight -
				scrollContainer.scrollTop -
				scrollContainer.clientHeight >
				20
		}

		scrollContainer.addEventListener('scroll', handleScroll)
		return () => scrollContainer.removeEventListener('scroll', handleScroll)
	}, [chatMessages])


	const handleCreateCommand = (serializedNodes: BaseSerializedNode[]) => {
		setSelectedSerializedNodes(serializedNodes)
		setTab('commands')
	}

	const handleScrollToBottom = () => {
		if (chatMessagesRef.current) {
			const scrollContainer = chatMessagesRef.current
			if (scrollContainer.scrollTop !== scrollContainer.scrollHeight) {
				lastProgrammaticScrollRef.current = Date.now()
				scrollContainer.scrollTop = scrollContainer.scrollHeight
			}
		}
	}

	const abortActiveStreams = () => {
		for (const abortController of activeStreamAbortControllersRef.current) {
			abortController.abort()
		}
		activeStreamAbortControllersRef.current = []
	}

	const handleLoadConversation = async (conversationId: string) => {
		try {
			abortActiveStreams()
			const conversation = await getChatMessagesById(conversationId)
			if (!conversation) {
				throw new Error(String(t('chat.errors.conversationNotFound')))
			}
			setCurrentConversationId(conversationId)
			setChatMessages(conversation)
			const newInputMessage = getNewInputMessage(app, settings.defaultMention)
			setInputMessage(newInputMessage)
			setFocusedMessageId(newInputMessage.id)
			setQueryProgress({
				type: 'idle',
			})
		} catch (error) {
			new Notice(String(t('chat.errors.failedToLoadConversation')))
			logger.error(String(t('chat.errors.failedToLoadConversation')), error)
		}
	}

	const handleNewChat = (selectedBlock?: MentionableBlockData) => {
		setCurrentConversationId(uuidv4())
		setChatMessages([])
		const newInputMessage = getNewInputMessage(app, settings.defaultMention)
		if (selectedBlock) {
			const mentionableBlock: MentionableBlock = {
				type: 'block',
				...selectedBlock,
			}
			newInputMessage.mentionables = [
				...newInputMessage.mentionables,
				mentionableBlock,
			]
			setAddedBlockKey(
				getMentionableKey(serializeMentionable(mentionableBlock)),
			)
		}
		setInputMessage(newInputMessage)
		setFocusedMessageId(newInputMessage.id)
		setQueryProgress({
			type: 'idle',
		})
		abortActiveStreams()
	}

	const submitMutation = useMutation({
		mutationFn: async ({
			newChatHistory,
			useVaultSearch,
		}: {
			newChatHistory: ChatMessage[]
			useVaultSearch?: boolean
		}) => {
			abortActiveStreams()
			setQueryProgress({
				type: 'idle',
			})

			const responseMessageId = uuidv4()

			try {
				const abortController = new AbortController()
				activeStreamAbortControllersRef.current.push(abortController)
				const { requestMessages, compiledMessages } =
					await promptGenerator.generateRequestMessages({
						messages: newChatHistory,
						useVaultSearch,
						onQueryProgressChange: setQueryProgress,
					})
				setQueryProgress({
					type: 'idle',
				})

				setChatMessages([
					...compiledMessages,
					{
						role: 'assistant',
						applyStatus: ApplyStatus.Idle,
						content: '',
						reasoningContent: '',
						id: responseMessageId,
						metadata: {
							usage: undefined,
							model: undefined,
						},
					},
				])
				const stream = await streamResponse(
					chatModel,
					{
						messages: requestMessages,
						model: chatModel.modelId,
						max_tokens: settings.modelOptions.max_tokens,
						temperature: settings.modelOptions.temperature,
						top_p: settings.modelOptions.top_p,
						frequency_penalty: settings.modelOptions.frequency_penalty,
						presence_penalty: settings.modelOptions.presence_penalty,
						stream: true,
					},
					{
						signal: abortController.signal,
					},
				)

				for await (const chunk of stream) {
					const content = chunk.choices[0]?.delta?.content ?? ''
					const reasoning_content = chunk.choices[0]?.delta?.reasoning_content ?? ''
					setChatMessages((prevChatHistory) =>
						prevChatHistory.map((message) =>
							message.role === 'assistant' && message.id === responseMessageId
								? {
									...message,
									content: message.content + content,
									reasoningContent: message.reasoningContent + reasoning_content,
									metadata: {
										...message.metadata,
										usage: chunk.usage ?? message.metadata?.usage, // Keep existing usage if chunk has no usage data
										model: chatModel,
									},
								}
								: message,
						),
					)
					if (!preventAutoScrollRef.current) {
						handleScrollToBottom()
					}
				}
			} catch (error) {
				// Stop button, new submission, conversation switch, new chat and
				// view unmount abort active streams on purpose - not an error.
				if (isCancellation(error)) {
					return
				}
				throw error
			}
		},
		onError: (error) => {
			setQueryProgress({
				type: 'idle',
			})
			if (isCancellation(error)) {
				return
			}
			if (
				error instanceof LLMAPIKeyNotSetException ||
				error instanceof LLMAPIKeyInvalidException ||
				error instanceof LLMBaseUrlNotSetException ||
				error instanceof LLMModelNotSetException
			) {
				openSettingsModalWithError(app, error.message)
			} else {
				new Notice(error.message)
				logger.error('Failed to generate response', error)
			}
		},
	})

	const handleSubmit = (
		newChatHistory: ChatMessage[],
		useVaultSearch?: boolean,
	) => {
		submitMutation.mutate({ newChatHistory, useVaultSearch })
	}

	const applyMutation = useMutation<
		{
			type: string;
			applyMsgId: string;
			applyStatus: ApplyStatus;
			returnMsg?: ChatUserMessage
		},
		Error,
		{ applyMsgId: string, toolArgs: ToolArgs }
	>({
		mutationFn: async ({ applyMsgId, toolArgs }) => {
			try {
				let opFile = app.workspace.getActiveFile()
				if ('filepath' in toolArgs && toolArgs.filepath) {
					opFile = app.vault.getFileByPath(toolArgs.filepath)
				}
				if (toolArgs.type === 'write_to_file') {
					let newFile = false
					if (!opFile) {
						// 确保目录结构存在
						const dir = path.dirname(toolArgs.filepath)
						if (dir && dir !== '.' && dir !== '/') {
							const dirExists = await app.vault.adapter.exists(dir)
							if (!dirExists) {
								await app.vault.adapter.mkdir(dir)
							}
						}
						opFile = await app.vault.create(toolArgs.filepath, '')
						newFile = true
					}
					// return a Promise, which will be resolved after user makes a choice
					return new Promise<{ type: string; applyMsgId: string; applyStatus: ApplyStatus; returnMsg?: ChatUserMessage }>((resolve) => {
						void app.workspace.getLeaf(true).setViewState({
							type: APPLY_VIEW_TYPE,
							active: true,
							state: {
								file: opFile.path,
								oldContent: '',
								newContent: toolArgs.content,
								onClose: (applied: boolean) => {
									const applyStatus = applied ? ApplyStatus.Applied : ApplyStatus.Rejected
									const applyEditContent = applied ? 'Changes successfully applied'
										: 'User rejected changes'
									if (newFile) {
										if (!applied) {
											void app.fileManager.trashFile(opFile) // delete the new file if user rejected changes
										} else {
											void app.workspace.openLinkText(toolArgs.filepath, 'split', true)
										}
									}
									resolve({
										type: toolArgs.type,
										applyMsgId,
										applyStatus,
										returnMsg: {
											role: 'user',
											applyStatus: ApplyStatus.Idle,
											content: null,
											promptContent: `[${toolArgs.type} for '${toolArgs.filepath}'] Result:\n${applyEditContent}\n`,
											id: uuidv4(),
											mentionables: [],
										}
									});
								}
							} satisfies ApplyViewState,
						})
					})
				} else if (toolArgs.type === 'insert_content') {
					if (!opFile) {
						throw new Error(`File not found: ${toolArgs.filepath}`)
					}
					const fileContent = await readTFileContent(opFile, app.vault)
					const appliedFileContent = await ApplyEditToFile(
						fileContent,
						toolArgs.content,
						toolArgs.startLine,
						toolArgs.endLine
					)
					if (!appliedFileContent) {
						throw new Error('Failed to apply edit changes')
					}
					// return a Promise, which will be resolved after user makes a choice
					return new Promise<{ type: string; applyMsgId: string; applyStatus: ApplyStatus; returnMsg?: ChatUserMessage }>((resolve) => {
						void app.workspace.getLeaf(true).setViewState({
							type: APPLY_VIEW_TYPE,
							active: true,
							state: {
								file: opFile.path,
								oldContent: fileContent,
								newContent: appliedFileContent,
								onClose: (applied: boolean) => {
									const applyStatus = applied ? ApplyStatus.Applied : ApplyStatus.Rejected
									const applyEditContent = applied ? 'Changes successfully applied'
										: 'User rejected changes'
									resolve({
										type: toolArgs.type,
										applyMsgId,
										applyStatus,
										returnMsg: {
											role: 'user',
											applyStatus: ApplyStatus.Idle,
											content: null,
											promptContent: `[${toolArgs.type} for '${toolArgs.filepath}'] Result:\n${applyEditContent}\n`,
											id: uuidv4(),
											mentionables: [],
										}
									});
								}
							} satisfies ApplyViewState,
						})
					})
				} else if (toolArgs.type === 'search_and_replace') {
					if (!opFile) {
						throw new Error(`File not found: ${toolArgs.filepath}`)
					}
					const fileContent = await readTFileContent(opFile, app.vault)
					const appliedFileContent = await SearchAndReplace(
						fileContent,
						toolArgs.operations
					)
					if (!appliedFileContent) {
						throw new Error('Failed to search_and_replace')
					}
					// return a Promise, which will be resolved after user makes a choice
					return new Promise<{ type: string; applyMsgId: string; applyStatus: ApplyStatus; returnMsg?: ChatUserMessage }>((resolve) => {
						void app.workspace.getLeaf(true).setViewState({
							type: APPLY_VIEW_TYPE,
							active: true,
							state: {
								file: opFile.path,
								oldContent: fileContent,
								newContent: appliedFileContent,
								onClose: (applied: boolean) => {
									const applyStatus = applied ? ApplyStatus.Applied : ApplyStatus.Rejected
									const applyEditContent = applied ? 'Changes successfully applied'
										: 'User rejected changes'
									resolve({
										type: 'search_and_replace',
										applyMsgId,
										applyStatus,
										returnMsg: {
											role: 'user',
											applyStatus: ApplyStatus.Idle,
											content: null,
											promptContent: `[search_and_replace for '${toolArgs.filepath}'] Result:\n${applyEditContent}\n`,
											id: uuidv4(),
											mentionables: [],
										}
									});
								}
							} satisfies ApplyViewState,
						})
					})
				} else if (toolArgs.type === 'apply_diff') {
					if (!opFile) {
						throw new Error(`File not found: ${toolArgs.filepath}`)
					}
					const fileContent = await readTFileContent(opFile, app.vault)
					const appliedResult = await diffStrategy.applyDiff(
						fileContent,
						toolArgs.diff
					)
					if (!appliedResult || !appliedResult.success) {
						throw new Error(`Failed to apply_diff`)
					}
					// return a Promise, which will be resolved after user makes a choice
					return new Promise<{ type: string; applyMsgId: string; applyStatus: ApplyStatus; returnMsg?: ChatUserMessage }>((resolve) => {
						void app.workspace.getLeaf(true).setViewState({
							type: APPLY_VIEW_TYPE,
							active: true,
							state: {
								file: opFile.path,
								oldContent: fileContent,
								newContent: appliedResult.content,
								onClose: (applied: boolean) => {
									const applyStatus = applied ? ApplyStatus.Applied : ApplyStatus.Rejected
									const applyEditContent = applied ? 'Changes successfully applied'
										: 'User rejected changes'
									resolve({
										type: 'apply_diff',
										applyMsgId,
										applyStatus,
										returnMsg: {
											role: 'user',
											applyStatus: ApplyStatus.Idle,
											content: null,
											promptContent: `[apply_diff for '${toolArgs.filepath}'] Result:\n${applyEditContent}\n`,
											id: uuidv4(),
											mentionables: [],
										}
									});
								}
							} satisfies ApplyViewState,
						})
					})
				} else if (toolArgs.type === 'read_file') {
					if (!opFile) {
						throw new Error(`File not found: ${toolArgs.filepath}`)
					}
					const fileContent = await readTFileContentPdf(opFile, app.vault, app)
					const formattedContent = `[read_file for '${toolArgs.filepath}'] Result:\n${addLineNumbers(fileContent)}\n`;
					return {
						type: 'read_file',
						applyMsgId,
						applyStatus: ApplyStatus.Applied,
						returnMsg: {
							role: 'user',
							applyStatus: ApplyStatus.Idle,
							content: null,
							promptContent: formattedContent,
							id: uuidv4(),
							mentionables: [],
						}
					};
				} else if (toolArgs.type === 'list_files') {
					// 获取当前工作区
					let currentWorkspace: Workspace | null = null
					if (settings.workspace && settings.workspace !== 'vault') {
						currentWorkspace = await workspaceManager.findByName(String(settings.workspace))
					}

					const files = await listFilesAndFolders(
						app.vault,
						toolArgs.filepath,
						toolArgs.recursive,
						currentWorkspace || undefined,
						app
					)

					const contextInfo = currentWorkspace
						? `workspace '${currentWorkspace.name}'`
						: toolArgs.filepath || 'vault root'
					const formattedContent = `[list_files for '${contextInfo}'] Result:\n${files.join('\n')}\n`;
					return {
						type: 'list_files',
						applyMsgId,
						applyStatus: ApplyStatus.Applied,
						returnMsg: {
							role: 'user',
							applyStatus: ApplyStatus.Idle,
							content: null,
							promptContent: formattedContent,
							id: uuidv4(),
							mentionables: [],
						}
					}
				} else if (toolArgs.type === 'match_search_files') {
					const searchBackend = settings.filesSearchSettings.matchBackend
					let results: string;
					if (searchBackend === 'omnisearch') {
						results = await matchSearchUsingOmnisearch(toolArgs.query, app)
					} else {
						results = await matchSearchUsingCorePlugin(toolArgs.query, app)
					}
					const formattedContent = `[match_search_files for '${toolArgs.filepath}'] Result:\n${results}\n`;
					return {
						type: 'match_search_files',
						applyMsgId,
						applyStatus: ApplyStatus.Applied,
						returnMsg: {
							role: 'user',
							applyStatus: ApplyStatus.Idle,
							content: null,
							promptContent: formattedContent,
							id: uuidv4(),
							mentionables: [],
						}
					}
				} else if (toolArgs.type === 'regex_search_files') {
					const searchBackend = settings.filesSearchSettings.regexBackend
					let results: string;
					if (searchBackend === 'coreplugin') {
						results = await regexSearchUsingCorePlugin(toolArgs.regex, app)
					} else {
						// @ts-expect-error Obsidian API type mismatch
						const baseVaultPath = String(app.vault.adapter.getBasePath())
						const absolutePath = path.join(baseVaultPath, toolArgs.filepath)
						const ripgrepPath = settings.filesSearchSettings.ripgrepPath
						results = await regexSearchUsingRipgrep(
							absolutePath,
							toolArgs.regex,
							ripgrepPath,
							app.vault.configDir,
						)
					}
					const formattedContent = `[regex_search_files for '${toolArgs.filepath}'] Result:\n${results}\n`;
					return {
						type: 'regex_search_files',
						applyMsgId,
						applyStatus: ApplyStatus.Applied,
						returnMsg: {
							role: 'user',
							applyStatus: ApplyStatus.Idle,
							content: null,
							promptContent: formattedContent,
							id: uuidv4(),
							mentionables: [],
						}
					}
				} else if (toolArgs.type === 'semantic_search_files') {
					// 获取当前工作区
					let currentWorkspace: Workspace | null = null
					if (settings.workspace && settings.workspace !== 'vault') {
						currentWorkspace = await workspaceManager.findByName(String(settings.workspace))
					}

					const snippets = await semanticSearchFiles(
						await getRAGEngine(),
						toolArgs.query,
						toolArgs.filepath,
						currentWorkspace || undefined,
						app,
						await getTransEngine()
					)

					const contextInfo = currentWorkspace
						? `workspace '${currentWorkspace.name}'`
						: toolArgs.filepath || 'vault'
					const formattedContent = `[semantic_search_files for '${contextInfo}'] Result:\n${snippets}\n`;
					return {
						type: 'semantic_search_files',
						applyMsgId,
						applyStatus: ApplyStatus.Applied,
						returnMsg: {
							role: 'user',
							applyStatus: ApplyStatus.Idle,
							content: null,
							promptContent: formattedContent,
							id: uuidv4(),
							mentionables: [],
						}
					}
				} else if (toolArgs.type === 'search_web') {
					const results = await webSearch(
						toolArgs.query,
						{
							provider: settings.webSearchProvider,
							yacyBaseUrl: settings.yacyBaseUrl,
							searxngBaseUrl: settings.searxngBaseUrl,
						},
						(await getRAGEngine())
					)
					const formattedContent = `[search_web for '${toolArgs.query}'] Result:\n${results}\n`;
					return {
						type: 'search_web',
						applyMsgId,
						applyStatus: ApplyStatus.Applied,
						returnMsg: {
							role: 'user',
							applyStatus: ApplyStatus.Idle,
							content: null,
							promptContent: formattedContent,
							id: uuidv4(),
							mentionables: [],
						}
					}
				} else if (toolArgs.type === 'fetch_urls_content') {
					const results = await fetchUrlsContent(toolArgs.urls)
					const formattedContent = `[ fetch_urls_content ] Result:\n${results}\n`;
					return {
						type: 'fetch_urls_content',
						applyMsgId,
						applyStatus: ApplyStatus.Applied,
						returnMsg: {
							role: 'user',
							applyStatus: ApplyStatus.Idle,
							content: null,
							promptContent: formattedContent,
							id: uuidv4(),
							mentionables: [],
						}
					}
				} else if (toolArgs.type === 'switch_mode') {
					setSettings({
						...settings,
						mode: toolArgs.mode,
					})
					const formattedContent = `[switch_mode to ${toolArgs.mode}] Result: successfully switched to ${toolArgs.mode}\n`
					return {
						type: 'switch_mode',
						applyMsgId,
						applyStatus: ApplyStatus.Applied,
						returnMsg: {
							role: 'user',
							applyStatus: ApplyStatus.Idle,
							content: null,
							promptContent: formattedContent,
							id: uuidv4(),
							mentionables: [],
						}
					}
				} else if (toolArgs.type === 'use_mcp_tool') {
					const mcpHub = await getMcpHub()
					if (!mcpHub) {
						throw new Error('MCP hub not found')
					}
					const toolResult = await mcpHub.callTool(toolArgs.server_name, toolArgs.tool_name, toolArgs.parameters)
					const toolResultPretty =
						(toolResult?.isError ? "Error:\n" : "") +
						toolResult?.content
							.map((item) => {
								if (item.type === "text") {
									return item.text
								}
								if (item.type === "resource") {
									// eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentionally unused binding
									const { blob, ...rest } = item.resource
									return JSON.stringify(rest, null, 2)
								}
								return ""
							})
							.filter(Boolean)
							.join("\n\n") || "(No response)"

					const formattedContent = `[use_mcp_tool for '${toolArgs.server_name}'] Result:\n${toolResultPretty}\n`;
					return {
						type: 'use_mcp_tool',
						applyMsgId,
						applyStatus: ApplyStatus.Applied,
						returnMsg: {
							role: 'user',
							applyStatus: ApplyStatus.Idle,
							content: null,
							promptContent: formattedContent,
							id: uuidv4(),
							mentionables: [],
						}
					}
				} else if (toolArgs.type === 'dataview_query') {
					if (!dataviewManager) {
						throw new Error(t('chat.dataview.notInitialized'))
					}

					if (!dataviewManager.isDataviewAvailable()) {
						throw new Error(t('chat.dataview.notInstalled'))
					}

					// 执行 Dataview 查询
					const result = await dataviewManager.executeQuery(toolArgs.query)

					let formattedContent: string;
					if (result.success) {
						formattedContent = t('chat.dataview.querySuccess', { data: result.data });
					} else {
						formattedContent = t('chat.dataview.queryFailed', { error: result.error });
					}

					return {
						type: 'dataview_query',
						applyMsgId,
						applyStatus: result.success ? ApplyStatus.Applied : ApplyStatus.Failed,
						returnMsg: {
							role: 'user',
							applyStatus: ApplyStatus.Idle,
							content: null,
							promptContent: formattedContent,
							id: uuidv4(),
							mentionables: [],
						}
					}
				} else if (toolArgs.type === 'call_transformations') {
					// Handling for the unified transformations tool
					try {
						logger.debug("call_transformations", toolArgs)
						// Validate that the transformation type is a valid enum member
						const validTransformationTypes = Object.values(TransformationType) as string[]
						if (!validTransformationTypes.includes(toolArgs.transformation)) {
							throw new Error(`Unsupported transformation type: ${toolArgs.transformation}`);
						}

						const transformationType = toolArgs.transformation;
						const transEngine = await getTransEngine();

						// Execute the transformation using the TransEngine
						const transformationResult = await transEngine.runTransformation({
							filePath: toolArgs.path,
							transformationType: transformationType as TransformationType,
							model: {
								provider: settings.applyModelProvider,
								modelId: settings.applyModelId,
							},
							saveToDatabase: true
						});

						if (!transformationResult.success) {
							throw new Error(transformationResult.error || 'Transformation failed');
						}

						// Build the result message
						let formattedContent = `[${toolArgs.transformation}] transformation complete:\n\n${transformationResult.result}`;

						if (transformationResult.truncated) {
							formattedContent += `\n\n*Note: The original content was too long (${String(transformationResult.originalTokens)} tokens) and was truncated to ${String(transformationResult.processedTokens)} tokens for processing.*`;
						}

						return {
							type: toolArgs.type,
							applyMsgId,
							applyStatus: ApplyStatus.Applied,
							returnMsg: {
								role: 'user',
								applyStatus: ApplyStatus.Idle,
								content: null,
								promptContent: formattedContent,
								id: uuidv4(),
								mentionables: [],
							}
						};
					} catch (error) {
						logger.error(`Transformation failed (${toolArgs.transformation}):`, error);
						return {
							type: toolArgs.type,
							applyMsgId,
							applyStatus: ApplyStatus.Failed,
							returnMsg: {
								role: 'user',
								applyStatus: ApplyStatus.Idle,
								content: null,
								promptContent: `[${toolArgs.transformation}] transformation failed: ${error instanceof Error ? error.message : String(error)}`,
								id: uuidv4(),
								mentionables: [],
							}
						};
					}
				} else if (toolArgs.type === 'manage_files') {
					// Runtime mode gate: the tool availability used to be enforced
					// only while the system prompt was assembled, so a block the model
					// emitted anyway (or one left over from a conversation started in
					// another mode) could still mutate the vault with a single click in
					// a read-only mode. The refusal goes back to the model as a
					// tool_result, so it stops re-emitting the block and can explain
					// itself to the user.
					const permission = checkManageFilesPermission(settings.mode, customModeList)
					if (permission.allowed === false) {
						return {
							type: 'manage_files',
							applyMsgId,
							applyStatus: ApplyStatus.Failed,
							returnMsg: {
								role: 'user',
								applyStatus: ApplyStatus.Idle,
								content: null,
								promptContent: permission.message,
								id: uuidv4(),
								mentionables: [],
							}
						};
					}
					// Deleting is the one manage_files action that removes user data,
					// and unlike write_to_file / apply_diff this block has no preview
					// step: the Execute button runs the whole batch immediately. Ask first.
					const deletions = toolArgs.operations
						.filter((operation) => operation.action === 'delete' && operation.path)
						.map((operation) => operation.path ?? '')
					if (deletions.length > 0) {
						const confirmed = await showConfirm(app, {
							title: String(t('fileOps.header', { count: toolArgs.operations.length })),
							message: String(t('fileOps.deleteConfirm', { count: deletions.length, paths: deletions.join('\n') })),
							danger: true,
						})
						if (!confirmed) {
							return {
								type: 'manage_files',
								applyMsgId,
								applyStatus: ApplyStatus.Rejected,
								returnMsg: {
									role: 'user',
									applyStatus: ApplyStatus.Idle,
									content: null,
									promptContent: t('fileOps.userRejected'),
									id: uuidv4(),
									mentionables: [],
								}
							};
						}
					}
					// The executor owns the applied/failed decision (1.6.22): an
					// operation list that validated to zero entries must fail loudly,
					// otherwise the model reads the no-op as a successful file creation.
					// 'partial' (some operations failed) maps to Failed as well: the
					// block must not look like a clean success, and the tool_result
					// carries the per-operation report the model needs to react to.
					const run = await runManageFilesOperations(app, toolArgs.operations);
					return {
						type: 'manage_files',
						applyMsgId,
						applyStatus: run.status === 'applied' ? ApplyStatus.Applied : ApplyStatus.Failed,
						returnMsg: {
							role: 'user',
							applyStatus: ApplyStatus.Idle,
							content: null,
							promptContent: run.message,
							id: uuidv4(),
							mentionables: [],
						}
					};
				} else {
					// 处理未知的工具类型
					throw new Error(`Unsupported tool type: ${String((toolArgs as any).type || 'unknown')}`);
				}
			} catch (error) {
				logger.error('Failed to apply changes', error)
				throw error
			}
		},
		onSuccess: (result) => {
			if (result.applyMsgId || result.returnMsg) {
				let newChatMessages = [...chatMessages];

				if (result.applyMsgId) {
					newChatMessages = newChatMessages.map((message) =>
						message.role === 'assistant' && message.id === result.applyMsgId ? {
							...message,
							applyStatus: result.applyStatus
						} : message,
					);
				}
				if (result.returnMsg) {
					newChatMessages.push({
						id: uuidv4(),
						role: 'assistant',
						applyStatus: ApplyStatus.Idle,
						isToolResult: true,
						content: `<tool_result>${typeof result.returnMsg.promptContent === 'string' ? result.returnMsg.promptContent : ''}</tool_result>`,
						reasoningContent: '',
						metadata: {
							usage: undefined,
							model: undefined,
						},
					})
				}
				setChatMessages(newChatMessages);

				if (result.returnMsg) {
					handleSubmit([...newChatMessages, result.returnMsg], false);
				}
			}
		},
		onError: (error) => {
			if (
				error instanceof LLMAPIKeyNotSetException ||
				error instanceof LLMAPIKeyInvalidException ||
				error instanceof LLMBaseUrlNotSetException ||
				error instanceof LLMModelNotSetException
			) {
				openSettingsModalWithError(app, error.message)
			} else {
				new Notice(error.message)
				logger.error('Failed to apply changes', error)
			}
		},
	})

	const handleApply = useCallback(
		(applyMsgId: string, toolArgs: ToolArgs) => {
			applyMutation.mutate({ applyMsgId, toolArgs })
		},
		[applyMutation],
	)

	useEffect(() => {
		setFocusedMessageId(inputMessage.id)
		// 初始化当前活动文件引用
		currentActiveFileRef.current = app.workspace.getActiveFile()
		// eslint-disable-next-line react-hooks/exhaustive-deps -- dependency list is intentionally narrow
	}, [])

	useEffect(() => {
		const updateConversationAsync = async () => {
			try {
				if (chatMessages.length > 0) {
					void createOrUpdateConversation(currentConversationId, chatMessages)
				}
			} catch (error) {
				new Notice('Failed to save chat history')
				logger.error('Failed to save chat history', error)
			}
		}
		void updateConversationAsync()
	}, [currentConversationId, chatMessages, createOrUpdateConversation])

	// 保存当前活动文件的引用，用于比较是否真的发生了变化
	const currentActiveFileRef = useRef<TFile | null>(null)

	// Updates the currentFile of the focused message (input or chat history)
	// This happens when active file changes or focused message changes
	const handleActiveLeafChange = useCallback((leaf: WorkspaceLeaf | null) => {
		// 过滤掉 ApplyView 和 PreviewView 的切换
		if ((leaf?.view instanceof ApplyView) || (leaf?.view instanceof PreviewView)) {
			return
		}

		const activeFile = app.workspace.getActiveFile()

		// 🎯 关键优化：只有当活动文件真正发生变化时才更新
		if (activeFile === currentActiveFileRef.current) {
			return // 文件没有变化，不需要更新
		}

		// 更新文件引用
		currentActiveFileRef.current = activeFile

		if (!activeFile) return

		const mentionable: Omit<MentionableCurrentFile, 'id'> = {
			type: 'current-file',
			file: activeFile,
		}

		if (!focusedMessageId) return
		if (inputMessage.id === focusedMessageId) {
			setInputMessage((prevInputMessage) => ({
				...prevInputMessage,
				mentionables: [
					mentionable,
					...prevInputMessage.mentionables.filter(
						(mentionable) => mentionable.type !== 'current-file',
					),
				],
			}))
		} else {
			setChatMessages((prevChatHistory) =>
				prevChatHistory.map((message) =>
					message.id === focusedMessageId && message.role === 'user'
						? {
							...message,
							mentionables: [
								mentionable,
								...message.mentionables.filter(
									(mentionable) => mentionable.type !== 'current-file',
								),
							],
						}
						: message,
				),
			)
		}
	}, [app.workspace, focusedMessageId, inputMessage.id])

	useEffect(() => {
		app.workspace.on('active-leaf-change', handleActiveLeafChange)
		return () => {
			app.workspace.off('active-leaf-change', handleActiveLeafChange)
		}
	}, [app.workspace, handleActiveLeafChange])

	useImperativeHandle(ref, () => ({
		openNewChat: (selectedBlock?: MentionableBlockData) =>
			handleNewChat(selectedBlock),
		addSelectionToChat: (selectedBlock: MentionableBlockData) => {
			const mentionable: Omit<MentionableBlock, 'id'> = {
				type: 'block',
				...selectedBlock,
			}

			setAddedBlockKey(getMentionableKey(serializeMentionable(mentionable)))

			if (focusedMessageId === inputMessage.id) {
				setInputMessage((prevInputMessage) => {
					const mentionableKey = getMentionableKey(
						serializeMentionable(mentionable),
					)
					// Check if mentionable already exists
					if (
						prevInputMessage.mentionables.some(
							(m) =>
								getMentionableKey(serializeMentionable(m)) === mentionableKey,
						)
					) {
						return prevInputMessage
					}
					return {
						...prevInputMessage,
						mentionables: [...prevInputMessage.mentionables, mentionable],
					}
				})
			} else {
				setChatMessages((prevChatHistory) =>
					prevChatHistory.map((message) => {
						if (message.id === focusedMessageId && message.role === 'user') {
							const mentionableKey = getMentionableKey(
								serializeMentionable(mentionable),
							)
							// Check if mentionable already exists
							if (
								message.mentionables.some(
									(m) =>
										getMentionableKey(serializeMentionable(m)) ===
										mentionableKey,
								)
							) {
								return message
							}
							return {
								...message,
								mentionables: [...message.mentionables, mentionable],
							}
						}
						return message
					}),
				)
			}
		},
		focusMessage: () => {
			if (!focusedMessageId) return
			chatUserInputRefs.current.get(focusedMessageId)?.focus()
		},
	}))

	return (
		<div className="icf-chat-container">
			{/* header view */}
			<div className="icf-chat-header">
				<div className="icf-chat-header-title">
					<WorkspaceSelect />
				</div>
				<div className="icf-chat-header-buttons">
					<button
						onClick={() => {
							setTab('chat')
							handleNewChat()
						}}
						className="icf-chat-list-dropdown"
					>
						<Plus size={18} />
					</button>
					<button
						onClick={() => {
							if (tab === 'history') {
								setTab('chat')
							} else {
								setTab('history')
							}
						}}
						className="icf-chat-list-dropdown"
					>
						<History size={18} color={tab === 'history' ? 'var(--text-accent)' : 'var(--text-color)'} />
					</button>
					<button
						onClick={() => {
							if (tab === 'search') {
								setTab('chat')
							} else {
								setTab('search')
							}
						}}
						className="icf-chat-list-dropdown"
					>
						<Search size={18} color={tab === 'search' ? 'var(--text-accent)' : 'var(--text-color)'} />
					</button>
					<button
						onClick={() => {
							if (tab === 'insights') {
								setTab('chat')
							} else {
								setTab('insights')
							}
						}}
						className="icf-chat-list-dropdown"
					>
						<Lightbulb size={18} color={tab === 'insights' ? 'var(--text-accent)' : 'var(--text-color)'} />
					</button>
					<button
						onClick={() => {
							if (tab === 'workspace') {
								setTab('chat')
							} else {
								setTab('workspace')
							}
						}}
						className="icf-chat-list-dropdown"
					>
						<Box size={18} color={tab === 'workspace' ? 'var(--text-accent)' : 'var(--text-color)'} />
					</button>
					<button
						onClick={() => {
							// switch between chat and prompts
							if (tab === 'commands') {
								setTab('chat')
							} else {
								setTab('commands')
							}
						}}
						className="icf-chat-list-dropdown"
					>
						<SquareSlash size={18} color={tab === 'commands' ? 'var(--text-accent)' : 'var(--text-color)'} />
					</button>
					<button
						onClick={() => {
							// switch between chat and prompts
							if (tab === 'custom-mode') {
								setTab('chat')
							} else {
								setTab('custom-mode')
							}
						}}
						className="icf-chat-list-dropdown"
					>
						<NotebookPen size={18} color={tab === 'custom-mode' ? 'var(--text-accent)' : 'var(--text-color)'} />
					</button>
					<button
						onClick={() => {
							if (tab === 'mcp') {
								setTab('chat')
							} else {
								setTab('mcp')
							}
						}}
						className="icf-chat-list-dropdown"
					>
						<Server size={18} color={tab === 'mcp' ? 'var(--text-accent)' : 'var(--text-color)'} />
					</button>
				</div>
			</div>
			{/* main view */}
			{tab === 'chat' ? (
				<>
					<div className="icf-chat-messages" ref={chatMessagesRef}>
						{
							// If the chat is empty, show a message to start a new chat
							chatMessages.length === 0 && (
								<div className="icf-chat-empty-state">
									<HelloInfo onNavigate={(tab) => setTab(tab)} />
								</div>
							)
						}
						{chatMessages.map((message, index) =>
							message.role === 'user' ? (
								message.content &&
								<div key={"user-" + message.id} className="icf-chat-messages-user">
									{editingMessageId === message.id ? (
										<div className="icf-chat-edit-container">
											<button
												onClick={() => {
													setEditingMessageId(null)
													chatUserInputRefs.current.get(inputMessage.id)?.focus()
												}}
												className="icf-chat-edit-cancel-button"
												title={t('chat.cancelEdit')}
											>
												<Undo size={16} />
											</button>
											<PromptInputWithActions
												key={"input-" + message.id}
												ref={(ref) => registerChatUserInputRef(message.id, ref)}
												initialSerializedEditorState={message.content}
												onSubmit={(content, useVaultSearch) => {
													if (editorStateToPlainText(content).trim() === '') return
													setEditingMessageId(null) // 退出编辑模式
													handleSubmit(
														[
															...chatMessages.slice(0, index),
															{
																role: 'user',
																applyStatus: ApplyStatus.Idle,
																content: content,
																promptContent: null,
																id: message.id,
																mentionables: message.mentionables,
															},
														],
														useVaultSearch,
													)
													chatUserInputRefs.current.get(inputMessage.id)?.focus()
												}}
												onFocus={() => {
													setFocusedMessageId(message.id)
												}}
												onCreateCommand={handleCreateCommand}
												mentionables={message.mentionables}
												setMentionables={(mentionables) => {
													setChatMessages((prevChatHistory) =>
														prevChatHistory.map((msg) =>
															msg.id === message.id ? { ...msg, mentionables } : msg,
														),
													)
												}}

											/>
										</div>
									) : (
										<ErrorBoundary>
											<UserMessageView
												content={message.content}
												mentionables={message.mentionables}
												onEdit={() => {
													setEditingMessageId(message.id)
													setFocusedMessageId(message.id)
													// 延迟聚焦，确保组件已渲染
													window.setTimeout(() => {
														chatUserInputRefs.current.get(message.id)?.focus()
													}, 0)
												}}
											/>
										</ErrorBoundary>
									)}
									{message.fileReadResults && (
										<FileReadResults
											key={"file-read-" + message.id}
											fileContents={message.fileReadResults}
										/>
									)}
									{message.websiteReadResults && (
										<WebsiteReadResults
											key={"website-read-" + message.id}
											websiteContents={message.websiteReadResults}
										/>
									)}
									{message.similaritySearchResults && (
										<SimilaritySearchResults
											key={"similarity-search-" + message.id}
											similaritySearchResults={message.similaritySearchResults}
										/>
									)}
								</div>
							) : (
								<div key={"assistant-" + message.id} className="icf-chat-messages-assistant">
									<MarkdownReasoningBlock
										key={"reasoning-" + message.id}
										reasoningContent={message.reasoningContent} />
									<ReactMarkdownItem
										key={"content-" + message.id}
										handleApply={(toolArgs) => handleApply(message.id, toolArgs)}
										applyStatus={message.applyStatus}
									>
										{message.content}
									</ReactMarkdownItem>
								</div>
							),
						)}
						<QueryProgress state={queryProgress} />
						{submitMutation.isPending && (
							<button onClick={abortActiveStreams} className="icf-stop-gen-btn">
								<CircleStop size={16} />
								<div>{t('chat.stop')}</div>
							</button>
						)}
					</div>
					<PromptInputWithActions
						key={inputMessage.id}
						ref={(ref) => registerChatUserInputRef(inputMessage.id, ref)}
						initialSerializedEditorState={inputMessage.content}
						onSubmit={(content, useVaultSearch) => {
							if (editorStateToPlainText(content).trim() === '') return
							handleSubmit(
								[...chatMessages, { ...inputMessage, content }],
								useVaultSearch,
							)
							setInputMessage(getNewInputMessage(app, settings.defaultMention))
							preventAutoScrollRef.current = false
							handleScrollToBottom()
						}}
						onFocus={() => {
							setFocusedMessageId(inputMessage.id)
						}}
						onCreateCommand={handleCreateCommand}
						mentionables={inputMessage.mentionables}
						setMentionables={(mentionables) => {
							setInputMessage((prevInputMessage) => ({
								...prevInputMessage,
								mentionables,
							}))
						}}
						autoFocus
						addedBlockKey={addedBlockKey}
					/>
				</>
			) : tab === 'search' ? (
				<div className="icf-chat-commands">
					<SearchView />
				</div>
			) : tab === 'commands' ? (
				<div className="icf-chat-commands">
					<CommandsView
						selectedSerializedNodes={selectedSerializedNodes}
					/>
				</div>
			) : tab === 'custom-mode' ? (
				<div className="icf-chat-commands">
					<CustomModeView />
				</div>
			) : tab === 'history' ? (
				<div className="icf-chat-commands">
					<ChatHistoryView
						currentConversationId={currentConversationId}
						onSelect={(conversationId) => {
							void (async () => {
							setTab('chat')
							if (conversationId === currentConversationId) return
							await handleLoadConversation(conversationId)
						})()
						}}
						onDelete={(conversationId) => {
							void (async () => {
							await deleteConversation(conversationId)
							if (conversationId === currentConversationId) {
								const nextConversation = chatList.find(
									(chat) => chat.id !== conversationId,
								)
								if (nextConversation) {
									void handleLoadConversation(nextConversation.id)
								} else {
									handleNewChat()
								}
							}
						})()
						}}
						onUpdateTitle={(conversationId, newTitle) => {
							void updateConversationTitle(conversationId, newTitle)
						}}
					/>
				</div>
			) : tab === 'workspace' ? (
				<div className="icf-chat-commands">
					<WorkspaceView />
				</div>
			) : tab === 'insights' ? (
				<div className="icf-chat-commands">
					<InsightView />
				</div>
			) : (
				<div className="icf-chat-commands">
					<McpHubView />
				</div>
			)}
		</div>
	)
})

function ReactMarkdownItem({
	handleApply,
	applyStatus,
	// applyMutation,
	children,
}: {
	handleApply: (toolArgs: ToolArgs) => void
	applyStatus: ApplyStatus
	children: string
}) {
	return (
		<ReactMarkdown
			applyStatus={applyStatus}
			onApply={handleApply}
		>
			{children}
		</ReactMarkdown>
	)
}

Chat.displayName = 'Chat'

export default Chat
