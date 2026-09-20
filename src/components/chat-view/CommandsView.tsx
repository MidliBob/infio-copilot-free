import { $generateNodesFromSerializedNodes } from '@lexical/clipboard'
import { BaseSerializedNode } from '@lexical/clipboard/clipboard'
import { InitialEditorStateType } from '@lexical/react/LexicalComposer'
import { $getRoot, $insertNodes, LexicalEditor } from 'lexical'
import { Pencil, Search, Trash2 } from 'lucide-react'
import { Notice } from 'obsidian'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { TemplateContent } from '../../database/schema'
import { useCommands } from '../../hooks/use-commands'
import { t } from '../../lang/helpers'

import LexicalContentEditable from './chat-input/LexicalContentEditable'


export interface QuickCommand {
	id: string
	name: string
	content: TemplateContent
	contentText: string
	createdAt: number
	updatedAt: number
}

const CommandsView = (
	{
		selectedSerializedNodes
	}: {
		selectedSerializedNodes?: BaseSerializedNode[]
	}
) => {
	const {
		createCommand,
		deleteCommand,
		updateCommand,
		commandList,
	} = useCommands()

	// new command name
	const [newCommandName, setNewCommandName] = useState('')

	// search term
	const [searchTerm, setSearchTerm] = useState('')

	// editing command id
	const [editingCommandId, setEditingCommandId] = useState<string | null>(null)

	const nameInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
	const contentEditorRefs = useRef<Map<string, LexicalEditor>>(new Map())

	// create refs for each command
	const commandEditRefs = useRef<Map<string, {
		editorRef: React.RefObject<LexicalEditor>,
		contentEditableRef: React.RefObject<HTMLDivElement>
	}>>(new Map());

	// get or create command edit refs
	const getCommandEditRefs = useCallback((id: string) => {
		if (!commandEditRefs.current.has(id)) {
			commandEditRefs.current.set(id, {
				editorRef: React.createRef<LexicalEditor>(),
				contentEditableRef: React.createRef<HTMLDivElement>()
			});
		}
		// 由于之前的if语句确保了值存在，所以这里不会返回undefined
		const refs = commandEditRefs.current.get(id);
		if (!refs) {
			// 添加保险逻辑，创建一个新的refs对象
			const newRefs = {
				editorRef: React.createRef<LexicalEditor>(),
				contentEditableRef: React.createRef<HTMLDivElement>()
			};
			commandEditRefs.current.set(id, newRefs);
			return newRefs;
		}
		return refs;
	}, []);

	// update command edit refs when editing command id changes
	useEffect(() => {
		if (editingCommandId) {
			const refs = getCommandEditRefs(editingCommandId);
			if (refs.editorRef.current) {
				contentEditorRefs.current.set(editingCommandId, refs.editorRef.current);
			}
		}
	}, [editingCommandId, getCommandEditRefs]);

	// new command content's editor state
	const initialEditorState: InitialEditorStateType = (
		editor: LexicalEditor,
	) => {
		if (!selectedSerializedNodes) return
		editor.update(() => {
			const parsedNodes = $generateNodesFromSerializedNodes(
				selectedSerializedNodes,
			)
			$insertNodes(parsedNodes)
		})
	}
	// new command content's editor
	const editorRef = useRef<LexicalEditor>(null)
	// new command content's editable
	const contentEditableRef = useRef<HTMLDivElement>(null)

	// Create new command
	const handleAddCommand = async () => {
		const serializedEditorState = editorRef.current.toJSON()
		const nodes = serializedEditorState.editorState.root.children
		if (nodes.length === 0) {
			new Notice(String(t('command.errorContentRequired')))
			return
		}
		if (newCommandName.trim().length === 0) {
			new Notice(String(t('command.errorNameRequired')))
			return
		}
		
		await createCommand(newCommandName, { nodes })

		// clear editor content
		editorRef.current.update(() => {
			const root = $getRoot()
			root.clear()
		})
		setNewCommandName('')
	}

	// delete command
	const handleDeleteCommand = async (id: string) => {
		await deleteCommand(id)
	}

	// edit command
	const handleEditCommand = (command: QuickCommand) => {
		setEditingCommandId(command.id)
	}

	// save edited command
	const handleSaveEdit = async (id: string) => {
		const nameInput = nameInputRefs.current.get(id)
		const currContentEditorRef = contentEditorRefs.current.get(id)
		if (!currContentEditorRef) {
			new Notice(String(t('command.errorContentRequired')))
			return
		}
		const serializedEditorState = currContentEditorRef.toJSON()
		const nodes = serializedEditorState.editorState.root.children
		if (nodes.length === 0) {
			new Notice(String(t('command.errorContentRequired')))
			return
		}
		await updateCommand(
			id,
			nameInput.value,
			{ nodes },
		)
		setEditingCommandId(null)
	}

	// handle search
	const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchTerm(e.target.value)
	}

	// filter commands list
	const filteredCommands = useMemo(() => {
		if (!searchTerm.trim()) {
			return commandList;
		}
		return commandList.filter(
			command =>
				command.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
				command.contentText.toLowerCase().includes(searchTerm.toLowerCase())
		);
	}, [commandList, searchTerm]);

	const getCommandEditorState = (commandContent: TemplateContent): InitialEditorStateType => {
		return (editor: LexicalEditor) => {
			editor.update(() => {
				const parsedNodes = $generateNodesFromSerializedNodes(
					commandContent.nodes,
				)
				$insertNodes(parsedNodes)
			})
		}
	}

	return (
		<div className="icf-commands-container">
			{/* header */}
			<div className="icf-commands-header">
				<div className="icf-commands-new">
					<h2 className="icf-commands-header-title">{t('command.createQuickCommand')}</h2>
					<div className="icf-commands-label">{t('command.name')}</div>
					<input
						type="text"
						value={newCommandName}
						onChange={(e) => setNewCommandName(e.target.value)}
						className="icf-commands-input"
					/>
					<div className="icf-commands-label">{t('command.content')}</div>
					<div className="icf-commands-textarea">
						<LexicalContentEditable
							initialEditorState={initialEditorState}
							editorRef={editorRef}
							contentEditableRef={contentEditableRef}
						/>
					</div>
					<button
						onClick={handleAddCommand}
						className="icf-commands-add-btn"
						disabled={!newCommandName.trim()}
					>
						<span>{t('command.createCommand')}</span>
					</button>
				</div>
			</div>

			{/* search bar */}
			<div className="icf-commands-search">
				<Search size={18} className="icf-commands-search-icon" />
				<input
					type="text"
					placeholder={t('command.searchPlaceholder')}
					value={searchTerm}
					onChange={handleSearch}
					className="icf-commands-search-input"
				/>
			</div>

			{/* commands list */}
			<div className="icf-commands-list">
				{filteredCommands.length === 0 ? (
					<div className="icf-commands-empty">
						<p>{t('command.noCommandsFound')}</p>
					</div>
				) : (
					filteredCommands.map(command => (
						<div key={command.name} className="icf-commands-item">
							{editingCommandId === command.id ? (
								// edit mode
								<div className="icf-commands-edit-mode">
									<input
										type="text"
										defaultValue={command.name}
										className="icf-commands-edit-name"
										ref={(el) => {
											if (el) nameInputRefs.current.set(command.id, el)
										}}
									/>
									<div className="icf-commands-textarea">
										<LexicalContentEditable
											initialEditorState={getCommandEditorState(command.content)}
											editorRef={getCommandEditRefs(command.id).editorRef}
											contentEditableRef={getCommandEditRefs(command.id).contentEditableRef}
										/>
									</div>
									<div className="icf-commands-actions">
										<button
											onClick={() => handleSaveEdit(command.id)}
											className="icf-commands-add-btn"
										>
											<span>{t('command.updateCommand')}</span>
										</button>
									</div>
								</div>
							) : (
								// view mode
								<div className="icf-commands-view-mode">
									<div className="icf-commands-name">{command.name}</div>
									<div className="icf-commands-content">{command.contentText}</div>
									<div className="icf-commands-actions">
										<button
											onClick={() => handleEditCommand(command)}
											className="icf-commands-btn"
										>
											<Pencil size={16} />
										</button>
										<button
											onClick={() => handleDeleteCommand(command.id)}
											className="icf-commands-btn"
										>
											<Trash2 size={16} />
										</button>
									</div>
								</div>
							)}
						</div>
					))
				)}
			</div>
		</div>
	)
}

export default CommandsView
