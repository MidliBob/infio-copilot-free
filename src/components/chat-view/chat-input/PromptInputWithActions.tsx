import { BaseSerializedNode } from '@lexical/clipboard/clipboard'
import { useQuery } from '@tanstack/react-query'
import { $nodesOfType, LexicalEditor, SerializedEditorState } from 'lexical'
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from 'react'

import { useApp } from '../../../contexts/AppContext'
import { useDarkModeContext } from '../../../contexts/DarkModeContext'
import { useSettings } from '../../../contexts/SettingsContext'
import {
	Mentionable,
	MentionableImage,
	SerializedMentionable,
} from '../../../types/mentionable'
import { fileToMentionableImage } from '../../../utils/image'
import {
	deserializeMentionable,
	getMentionableKey,
	serializeMentionable,
} from '../../../utils/mentionable'
import { openMarkdownFile, readTFileContent } from '../../../utils/obsidian'
import { MemoizedSyntaxHighlighterWrapper } from '../Markdown/SyntaxHighlighterWrapper'

import { ImageUploadButton } from './ImageUploadButton'
import LexicalContentEditable from './LexicalContentEditable'
import MentionableBadge from './MentionableBadge'
import { ModelSelect } from './ModelSelect'
import { ModeSelect } from './ModeSelect'
import { MentionNode } from './plugins/mention/MentionNode'
import { NodeMutations } from './plugins/on-mutation/OnMutationPlugin'
import { SubmitButton } from './SubmitButton'
export type ChatUserInputRef = {
	focus: () => void
}

export type ChatUserInputProps = {
	initialSerializedEditorState: SerializedEditorState | null
	onChange?: (content: SerializedEditorState) => void
	onSubmit: (content: SerializedEditorState, useVaultSearch?: boolean) => void
	onFocus: () => void
	onCreateCommand: (nodes: BaseSerializedNode[]) => void
	mentionables: Mentionable[]
	setMentionables: (mentionables: Mentionable[]) => void
	autoFocus?: boolean
	addedBlockKey?: string | null
}

const PromptInputWithActions = forwardRef<ChatUserInputRef, ChatUserInputProps>(
	(
		{
			initialSerializedEditorState,
			onChange,
			onSubmit,
			onFocus,
			onCreateCommand,
			mentionables,
			setMentionables,
			autoFocus = false,
			addedBlockKey,
		},
		ref,
	) => {
		const app = useApp()
		const { settings, setSettings } = useSettings()

		const editorRef = useRef<LexicalEditor | null>(null)
		const contentEditableRef = useRef<HTMLDivElement>(null)
		const containerRef = useRef<HTMLDivElement>(null)

		const [displayedMentionableKey, setDisplayedMentionableKey] = useState<
			string | null
		>(addedBlockKey ?? null)

		useEffect(() => {
			if (addedBlockKey) {
				setDisplayedMentionableKey(addedBlockKey)
			}
		}, [addedBlockKey])

		// 添加快捷键监听器
		useEffect(() => {
			const handleKeyDown = (event: KeyboardEvent) => {
				// 检查是否按下了 Cmd + Shift 键 (macOS)
				if (event.ctrlKey && event.shiftKey) {
					// 使用 event.key 直接匹配，不使用 toLowerCase()
					switch (event.key) {
						case '.':
						case '>': // Shift + . 在某些键盘布局下可能是 >
							event.preventDefault()
							setSettings({
								...settings,
								mode: 'write',
							})
							break
						case ',':
						case '<': // Shift + , 在某些键盘布局下可能是 <
							event.preventDefault()
							setSettings({
								...settings,
								mode: 'ask',
							})
							break
						case '/':
						case '?': // Shift + / 在某些键盘布局下可能是 ?
							event.preventDefault()
							setSettings({
								...settings,
								mode: 'research',
							})
							break
					}
				}
			}

			// 添加事件监听器到 document
			document.addEventListener('keydown', handleKeyDown)

			// 清理函数
			return () => {
				document.removeEventListener('keydown', handleKeyDown)
			}
		}, [settings, setSettings])

		useImperativeHandle(ref, () => ({
			focus: () => {
				contentEditableRef.current?.focus()
			},
		}))

		const handleMentionNodeMutation = (
			mutations: NodeMutations<MentionNode>,
		) => {
			const destroyedMentionableKeys: string[] = []
			const addedMentionables: SerializedMentionable[] = []
			mutations.forEach((mutation) => {
				const mentionable = mutation.node.getMentionable()
				const mentionableKey = getMentionableKey(mentionable)

				if (mutation.mutation === 'destroyed') {
					const nodeWithSameMentionable = editorRef.current?.read(() =>
						$nodesOfType(MentionNode).find(
							(node) =>
								getMentionableKey(node.getMentionable()) === mentionableKey,
						),
					)

					if (!nodeWithSameMentionable) {
						// remove mentionable only if it's not present in the editor state
						destroyedMentionableKeys.push(mentionableKey)
					}
				} else if (mutation.mutation === 'created') {
					if (
						mentionables.some(
							(m) =>
								getMentionableKey(serializeMentionable(m)) === mentionableKey,
						) ||
						addedMentionables.some(
							(m) => getMentionableKey(m) === mentionableKey,
						)
					) {
						// do nothing if mentionable is already added
						return
					}

					addedMentionables.push(mentionable)
				}
			})

			setMentionables(
				mentionables
					.filter(
						(m) =>
							!destroyedMentionableKeys.includes(
								getMentionableKey(serializeMentionable(m)),
							),
					)
					.concat(
						addedMentionables
							.map((m) => deserializeMentionable(m, app))
							.filter((v) => !!v),
					),
			)
			if (addedMentionables.length > 0) {
				setDisplayedMentionableKey(
					getMentionableKey(addedMentionables[addedMentionables.length - 1]),
				)
			}
		}

		const handleCreateImageMentionables = useCallback(
			(mentionableImages: MentionableImage[]) => {
				const newMentionableImages = mentionableImages.filter(
					(m) =>
						!mentionables.some(
							(mentionable) =>
								getMentionableKey(serializeMentionable(mentionable)) ===
								getMentionableKey(serializeMentionable(m)),
						),
				)
				if (newMentionableImages.length === 0) return
				setMentionables([...mentionables, ...newMentionableImages])
				setDisplayedMentionableKey(
					getMentionableKey(
						serializeMentionable(
							newMentionableImages[newMentionableImages.length - 1],
						),
					),
				)
			},
			[mentionables, setMentionables],
		)

		const handleMentionableDelete = (mentionable: Mentionable) => {
			const mentionableKey = getMentionableKey(
				serializeMentionable(mentionable),
			)
			setMentionables(
				mentionables.filter(
					(m) => getMentionableKey(serializeMentionable(m)) !== mentionableKey,
				),
			)

			editorRef.current?.update(() => {
				$nodesOfType(MentionNode).forEach((node) => {
					if (getMentionableKey(node.getMentionable()) === mentionableKey) {
						node.remove()
					}
				})
			})
		}

		const handleUploadImages = async (images: File[]) => {
			const mentionableImages = await Promise.all(
				images.map((image) => fileToMentionableImage(image)),
			)
			handleCreateImageMentionables(mentionableImages)
		}

		const handleSubmit = (options: { useVaultSearch?: boolean } = {}) => {
			const content = editorRef.current?.getEditorState()?.toJSON()
			content && onSubmit(content, options.useVaultSearch)
		}

		return (
			<div className="icf-chat-user-input-container" ref={containerRef}>
				{mentionables.length > 0 && (
					<div className="icf-chat-user-input-files">
						{mentionables.map((m) => (
							<MentionableBadge
								key={getMentionableKey(serializeMentionable(m))}
								mentionable={m}
								onDelete={() => handleMentionableDelete(m)}
								onClick={() => {
									const mentionableKey = getMentionableKey(
										serializeMentionable(m),
									)
									if (
										(m.type === 'current-file' ||
											m.type === 'file' ||
											m.type === 'block') &&
										m.file &&
										mentionableKey === displayedMentionableKey
									) {
										// open file on click again
										openMarkdownFile(
											app,
											m.file.path,
											m.type === 'block' ? m.startLine : undefined,
										)
									} else {
										setDisplayedMentionableKey(mentionableKey)
									}
								}}
								isFocused={
									getMentionableKey(serializeMentionable(m)) ===
									displayedMentionableKey
								}
							/>
						))}
					</div>
				)}

				<MentionableContentPreview
					displayedMentionableKey={displayedMentionableKey}
					mentionables={mentionables}
				/>

				<LexicalContentEditable
					initialEditorState={(editor) => {
						if (initialSerializedEditorState) {
							editor.setEditorState(
								editor.parseEditorState(initialSerializedEditorState),
							)
						}
					}}
					editorRef={editorRef}
					contentEditableRef={contentEditableRef}
					onChange={onChange}
					onEnter={() => handleSubmit({ useVaultSearch: false })}
					onFocus={onFocus}
					onMentionNodeMutation={handleMentionNodeMutation}
					onCreateImageMentionables={handleCreateImageMentionables}
					autoFocus={autoFocus}
					plugins={{
						onEnter: {
							onVaultChat: () => {
								handleSubmit({ useVaultSearch: true })
							},
						},
						commandPopover: {
							anchorElement: containerRef.current,
							onCreateCommand: onCreateCommand,
						},
					}}
				/>

				<div className="icf-chat-user-input-controls">
					<div className="icf-chat-user-input-controls__model-select-container">
						<ModeSelect />
						<ModelSelect />
					</div>
					<div className="icf-chat-user-input-controls__buttons">
						<ImageUploadButton onUpload={handleUploadImages} />
						<SubmitButton onClick={() => handleSubmit()} />
					</div>
				</div>
			</div>
		)
	},
)

function MentionableContentPreview({
	displayedMentionableKey,
	mentionables,
}: {
	displayedMentionableKey: string | null
	mentionables: Mentionable[]
}) {
	const app = useApp()
	const { isDarkMode } = useDarkModeContext()

	const displayedMentionable: Mentionable | null = useMemo(() => {
		return (
			mentionables.find(
				(m) =>
					getMentionableKey(serializeMentionable(m)) ===
					displayedMentionableKey,
			) ?? null
		)
	}, [displayedMentionableKey, mentionables])

	const { data: displayFileContent } = useQuery({
		enabled:
			!!displayedMentionable &&
			['file', 'current-file', 'block'].includes(displayedMentionable.type),
		queryKey: [
			'file',
			displayedMentionableKey,
			mentionables.map((m) => getMentionableKey(serializeMentionable(m))), // should be updated when mentionables change (especially on delete)
		],
		queryFn: async () => {
			if (!displayedMentionable) return null
			if (
				displayedMentionable.type === 'file' ||
				displayedMentionable.type === 'current-file'
			) {
				if (!displayedMentionable.file) return null
				return await readTFileContent(displayedMentionable.file, app.vault)
			} else if (displayedMentionable.type === 'block') {
				const fileContent = await readTFileContent(
					displayedMentionable.file,
					app.vault,
				)

				return fileContent
					.split('\n')
					.slice(
						displayedMentionable.startLine - 1,
						displayedMentionable.endLine,
					)
					.join('\n')
			}

			return null
		},
	})

	const displayImage: MentionableImage | null = useMemo(() => {
		return displayedMentionable?.type === 'image' ? displayedMentionable : null
	}, [displayedMentionable])

	return displayFileContent ? (
		<div className="icf-chat-user-input-file-content-preview">
			<MemoizedSyntaxHighlighterWrapper
				isDarkMode={isDarkMode}
				language="markdown"
				hasFilename={false}
				wrapLines={false}
			>
				{displayFileContent}
			</MemoizedSyntaxHighlighterWrapper>
		</div>
	) : displayImage ? (
		<div className="icf-chat-user-input-file-content-preview">
			<img src={displayImage.data} alt={displayImage.name} />
		</div>
	) : null
}

PromptInputWithActions.displayName = 'ChatUserInput'

export default PromptInputWithActions
