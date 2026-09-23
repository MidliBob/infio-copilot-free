import { Check, Loader2, Search, X } from 'lucide-react'
import React from 'react'

import { DEFAULT_YACY_BASE_URL } from '../../../constants'
import { useSettings } from "../../../contexts/SettingsContext"
import { t } from '../../../lang/helpers'
import { ApplyStatus, SearchWebToolArgs } from "../../../types/apply"

export default function MarkdownWebSearchBlock({
	applyStatus,
	onApply,
	query,
	finish
}: {
	applyStatus: ApplyStatus
	onApply: (args: SearchWebToolArgs) => void
	query: string,
	finish: boolean
}) {

	const { settings } = useSettings()

	const handleClick = () => {
		// Open the query in a browser: YaCy users land on their own peer's
		// search page; Tavily is API-only, so fall back to Google.
		if (settings.webSearchProvider === 'yacy') {
			const base = (settings.yacyBaseUrl || DEFAULT_YACY_BASE_URL).trim().replace(/\/+$/, '')
			window.open(`${base}/yacysearch.html?query=${encodeURIComponent(query)}`, '_blank')
		} else {
			window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank')
		}
	}

	React.useEffect(() => {
		if (finish && applyStatus === ApplyStatus.Idle) {
			onApply({
				type: 'search_web',
				query: query,
			})
		}
	}, [finish])

	return (
		<div
			className={`icf-chat-code-block has-filename`
			}
			onClick={handleClick}
		>
			<div className={'icf-chat-code-block-header'}>
				<div className={'icf-chat-code-block-header-filename'}>
					<Search size={14} className="icf-chat-code-block-header-icon" />
					{t('chat.reactMarkdown.webSearch').replace('{query}', query)}
				</div>
				<div className={'icf-chat-code-block-header-button'}>
					<button
						style={{ color: '#008000' }}
						disabled={true}
					>
						{
							!finish || applyStatus === ApplyStatus.Idle ? (
								<>
									<Loader2 className="spinner" size={14} /> {t('chat.reactMarkdown.searching')}
								</>
							) : applyStatus === ApplyStatus.Applied ? (
								<>
									<Check size={14} /> {t('chat.reactMarkdown.done')}
								</>
							) : (
								<>
									<X size={14} /> {t('chat.reactMarkdown.failed')}
								</>
							)}
					</button>
				</div>
			</div>
		</div>
	)
} 
