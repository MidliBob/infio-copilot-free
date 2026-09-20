import { Check, Diff, Loader2, X } from 'lucide-react'
import { PropsWithChildren, useState } from 'react'

import { useDarkModeContext } from "../../../contexts/DarkModeContext"
import { t } from '../../../lang/helpers'
import { ApplyStatus, ToolArgs } from "../../../types/apply"

import { MemoizedSyntaxHighlighterWrapper } from "./SyntaxHighlighterWrapper"

export default function MarkdownApplyDiffBlock({
	mode,
	applyStatus,
	onApply,
	path,
	diff,
	finish,
}: PropsWithChildren<{
	mode: string
	applyStatus: ApplyStatus
	onApply: (args: ToolArgs) => void
	path: string
	diff: string
	finish: boolean
}>) {
	const [applying, setApplying] = useState(false)
	const { isDarkMode } = useDarkModeContext()

	const handleApply = async () => {
		if (applyStatus !== ApplyStatus.Idle) {
			return
		}
		setApplying(true)
		onApply({
			type: "apply_diff",
			filepath: path,
			diff,
			finish,
		})
	}

	return (
		<div className={`icf-chat-code-block ${path ? 'has-filename' : ''} icf-reasoning-block`}>
			<div className={'icf-chat-code-block-header'}>
				{path && (
					<div className={'icf-chat-code-block-header-filename'}>
						<Diff size={10} className="icf-chat-code-block-header-icon" />
						{mode}: {path}
					</div>
				)}
				<div className={'icf-chat-code-block-header-button'}>
					<button
						onClick={handleApply}
						style={{ color: '#008000' }}
						disabled={applyStatus !== ApplyStatus.Idle || applying || !finish}
					>
						{
							!finish ? (
								<>
									<Loader2 className="spinner" size={14} /> {t('chat.reactMarkdown.loading')}
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
					language="diff"
					hasFilename={!!path}
					wrapLines={true}
				>
					{diff}
				</MemoizedSyntaxHighlighterWrapper>
			</div>
		</div>
	)
}
