import { Check, Loader2, Replace, X } from 'lucide-react'
import React from 'react'

import { useApp } from '../../../contexts/AppContext'
import { useDarkModeContext } from '../../../contexts/DarkModeContext'
import { t } from '../../../lang/helpers'
import { ApplyStatus, SearchAndReplaceToolArgs } from '../../../types/apply'
import { openMarkdownFile } from '../../../utils/obsidian'

import { MemoizedSyntaxHighlighterWrapper } from "./SyntaxHighlighterWrapper"

export default function MarkdownSearchAndReplace({
	applyStatus,
	onApply,
	path,
	content,
	operations,
	finish
}: {
	applyStatus: ApplyStatus
	onApply: (args: SearchAndReplaceToolArgs) => void
	path: string,
	content: string,
	operations: SearchAndReplaceToolArgs['operations'],
	finish: boolean
}) {
	const app = useApp()
	const { isDarkMode } = useDarkModeContext()

	const [applying, setApplying] = React.useState(false)

	const handleClick = () => {
		openMarkdownFile(app, path)
	}

	const handleApply = async () => {
		if (applyStatus !== ApplyStatus.Idle) {
			return
		}
		setApplying(true)
		onApply({
			type: 'search_and_replace',
			filepath: path,
			operations
		})
	}

	return (
		<div
			className={`icf-chat-code-block ${path ? 'has-filename' : ''}  icf-reasoning-block`}
			onClick={handleClick}
		>
			<div className={'icf-chat-code-block-header'}>
				<div className={'icf-chat-code-block-header-filename'}>
					<Replace size={10} className="icf-chat-code-block-header-icon" />
					{t('chat.reactMarkdown.searchAndReplaceInPath').replace('{path}', path)}
				</div>
				<div className={'icf-chat-code-block-header-button'}>
					<button
						onClick={handleApply}
						disabled={applyStatus !== ApplyStatus.Idle || applying || !finish}
					>
						{!finish ? (
							<>
								<Loader2 className="spinner" size={14} />
							</>
						) : applyStatus === ApplyStatus.Idle ? (
							applying ? (
								<>
									<Loader2 className="spinner" size={14} /> {t('chat.reactMarkdown.applying')}
								</>
							) : (
								t('chat.reactMarkdown.apply')
							)
						) : applyStatus === ApplyStatus.Applied ? (
							<>
								<Check size={14} /> {t('chat.reactMarkdown.success')}
							</>
						) : (
							<>
								<X size={14} /> {t('chat.reactMarkdown.failed')}
							</>
						)}
					</button>
				</div>
			</div>
			<div className="icf-reasoning-content-wrapper">
				<MemoizedSyntaxHighlighterWrapper
					isDarkMode={isDarkMode}
					language="markdown"
					hasFilename={!!path}
					wrapLines={true}
				>
					{content}
				</MemoizedSyntaxHighlighterWrapper>
			</div>
		</div>
	)
} 
