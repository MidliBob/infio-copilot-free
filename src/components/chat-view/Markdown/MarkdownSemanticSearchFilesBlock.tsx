import { FileSearch } from 'lucide-react'
import React from 'react'

import { useApp } from "../../../contexts/AppContext"
import { t } from '../../../lang/helpers'
import { ApplyStatus, SemanticSearchFilesToolArgs } from "../../../types/apply"
import { openMarkdownFile } from "../../../utils/obsidian"

export default function MarkdownSemanticSearchFilesBlock({
	applyStatus,
	onApply,
	path,
	query,
	finish
}: {
	applyStatus: ApplyStatus
	onApply: (args: SemanticSearchFilesToolArgs) => void
	path: string,
	query: string,
	finish: boolean
}) {
	const app = useApp()

	const handleClick = () => {
		openMarkdownFile(app, path)
	}

	React.useEffect(() => {
		if (finish && applyStatus === ApplyStatus.Idle) {
			onApply({
				type: 'semantic_search_files',
				filepath: path,
				query: query,
			})
		}
	}, [finish])

	return (
		<div
			className={`icf-chat-code-block ${path ? 'has-filename' : ''}`}
			onClick={handleClick}
		>
			<div className={'icf-chat-code-block-header'}>
				<div className={'icf-chat-code-block-header-filename'}>
					<FileSearch size={14} className="icf-chat-code-block-header-icon" />
					<span>{t('chat.reactMarkdown.semanticSearchInPath').replace('{query}', query).replace('{path}', path)}</span>
				</div>
			</div>
		</div>
	)
} 
