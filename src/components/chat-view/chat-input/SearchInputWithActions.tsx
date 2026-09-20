import { $getRoot, LexicalEditor, SerializedEditorState } from 'lexical'
import {
	forwardRef,
	useImperativeHandle,
	useRef,
	useState
} from 'react'


import { Mentionable } from '../../../types/mentionable'

import LexicalContentEditable from './LexicalContentEditable'
import { SearchButton } from './SearchButton'
import { SearchModeSelect } from './SearchModeSelect'

export type SearchInputRef = {
	focus: () => void
	clear: () => void
}

export type SearchInputProps = {
	initialSerializedEditorState: SerializedEditorState | null
	onChange?: (content: SerializedEditorState) => void
	onSubmit: (content: SerializedEditorState, useVaultSearch?: boolean) => void
	mentionables?: Mentionable[]
	setMentionables?: (mentionables: Mentionable[]) => void
	placeholder?: string
	autoFocus?: boolean
	disabled?: boolean
	searchMode?: 'notes' | 'insights' | 'all'
	onSearchModeChange?: (mode: 'notes' | 'insights' | 'all') => void
}

// 检查编辑器状态是否为空
const isEditorStateEmpty = (editorState: SerializedEditorState): boolean => {
	try {
		const root = editorState.root
		if (!root || !root.children) return true
		
		// 检查是否有实际内容
		const hasContent = root.children.some((child: any) => {
			if (child.type === 'paragraph') {
				return child.children && child.children.length > 0
			}
			return true
		})
		
		return !hasContent
	} catch (error) {
		return true
	}
}

const SearchInputWithActions = forwardRef<SearchInputRef, SearchInputProps>(
	(
		{
			initialSerializedEditorState,
			onChange,
			onSubmit,
			placeholder = '',
			autoFocus = false,
			disabled = false,
			searchMode = 'all',
			onSearchModeChange,
		},
		ref
	) => {
		const editorRef = useRef<LexicalEditor | null>(null)
		const contentEditableRef = useRef<HTMLDivElement>(null)
		const containerRef = useRef<HTMLDivElement>(null)
		
		// 追踪编辑器是否为空
		const [isEmpty, setIsEmpty] = useState(() => 
			initialSerializedEditorState ? isEditorStateEmpty(initialSerializedEditorState) : true
		)

		// 暴露给父组件的方法
		useImperativeHandle(ref, () => ({
			focus: () => {
				contentEditableRef.current?.focus()
			},
			clear: () => {
				editorRef.current?.update(() => {
					const root = $getRoot()
					root.clear()
				})
				setIsEmpty(true)
			}
		}))

		const handleSubmit = (options?: { useVaultSearch?: boolean }) => {
			const content = editorRef.current?.getEditorState()?.toJSON()
			if (content) {
				onSubmit(content, options?.useVaultSearch)
			}
		}

		const handleChange = (content: SerializedEditorState) => {
			// 检查内容是否为空并更新状态
			setIsEmpty(isEditorStateEmpty(content))
			// 调用父组件的 onChange 回调
			onChange?.(content)
		}

		const onCreateCommand = () => {
			// 处理命令创建逻辑
			// 这里可以根据实际需求添加具体实现
		}

		return (
			<div 
				className={`icf-chat-user-input-container ${disabled ? 'disabled' : ''}`} 
				ref={containerRef}
			>
				{placeholder && isEmpty && (
					<div className="icf-input-placeholder">
						{placeholder}
					</div>
				)}
				<LexicalContentEditable
					rootTheme="icf-search-lexical-content-editable-root"
					initialEditorState={(editor) => {
						if (initialSerializedEditorState) {
							editor.setEditorState(
								editor.parseEditorState(initialSerializedEditorState),
							)
						}
					}}
					editorRef={editorRef}
					contentEditableRef={contentEditableRef}
					onChange={handleChange}
					onEnter={() => handleSubmit()}
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
						{onSearchModeChange && (
							<SearchModeSelect 
								searchMode={searchMode}
								onSearchModeChange={onSearchModeChange}
							/>
						)}

					</div>
					<div className="icf-chat-user-input-controls__buttons">
						<SearchButton onClick={() => handleSubmit()} />
					</div>
				</div>
				<style>
					{`
					.icf-chat-user-input-container.disabled {
						opacity: 0.6;
						pointer-events: none;
					}

					.icf-input-placeholder {
						position: absolute;
						color: var(--text-muted);
						pointer-events: none;
						z-index: 1;
						padding: calc(var(--size-2-2) + 1px) var(--size-4-2);
						font-size: var(--font-ui-small);
					}

					.icf-search-button {
						position: absolute;
						bottom: var(--size-2-2);
						right: var(--size-2-2);
						display: flex;
						align-items: center;
						justify-content: center;
						width: var(--size-4-4);
						height: var(--size-4-4);
						padding: 0;
						background-color: transparent;
						border: none;
						box-shadow: none;
						color: var(--text-muted);
						cursor: pointer;
						border-radius: var(--radius-s);
						transition: all 0.15s ease-in-out;
						z-index: 10;
					}
					`}
				</style>
			</div>
		)
	},
)

SearchInputWithActions.displayName = 'SearchInput'

export default SearchInputWithActions
