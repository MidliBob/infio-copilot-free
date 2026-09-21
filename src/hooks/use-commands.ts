import { useCallback, useEffect, useMemo, useState } from 'react'

import { lexicalNodeToPlainText } from '../components/chat-view/chat-input/utils/editor-state-to-plain-text'
import { useApp } from '../contexts/AppContext'
import { CommandManager } from '../database/json/command/CommandManager'
import { TemplateContent } from '../database/schema'


export interface QuickCommand {
	id: string
	name: string
	content: TemplateContent
	contentText: string
	createdAt: number
	updatedAt: number
}

type UseCommands = {
	createCommand: (name: string, content: TemplateContent) => Promise<void>
	deleteCommand: (id: string) => Promise<void>
	updateCommand: (id: string, name: string, content: TemplateContent) => Promise<void>
	commandList: QuickCommand[]
}

export function useCommands(): UseCommands {

	const [commandList, setCommandList] = useState<QuickCommand[]>([])


	const app = useApp()
	const templateManager = useMemo(() => new CommandManager(app), [app])

	const fetchCommandList = useCallback(async () => {
		void templateManager.ListCommands().then((rows) => {
			setCommandList(rows.map((row) => ({
				id: row.id,
				name: row.name,
				content: row.content,
				contentText: row.content.nodes.map(lexicalNodeToPlainText).join(''),
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			})))
		})
	}, [templateManager])

	useEffect(() => {
		void fetchCommandList()
	}, [fetchCommandList])

	const createCommand = useCallback(
		async (name: string, content: TemplateContent): Promise<void> => {
			await templateManager.createCommand({
				name,
				content,
			})
			void fetchCommandList()
		},
		[templateManager, fetchCommandList],
	)

	const deleteCommand = useCallback(
		async (id: string): Promise<void> => {
			await templateManager.deleteCommand(id)
			void fetchCommandList()
		},
		[templateManager, fetchCommandList],
	)

	const updateCommand = useCallback(
		async (id: string, name: string, content: TemplateContent): Promise<void> => {
			await templateManager.updateCommand(id, {
				name,
				content,
			})
			void fetchCommandList()
		},
		[templateManager, fetchCommandList],
	)

	return {
		createCommand,
		deleteCommand,
		updateCommand,
		commandList,
	}
}
