import { getIcon } from 'obsidian'
import { useEffect, useRef } from 'react'

import { t } from '../../lang/helpers'
import { PreviewViewState } from '../../PreviewView'

export default function PreviewViewRoot({
	state,
	close,
}: {
	state: PreviewViewState
	close: () => void
}) {
	const closeIcon = getIcon('x')
	const contentRef = useRef<HTMLDivElement>(null)

	// 显示内容 - 支持 HTML 和纯文本
	useEffect(() => {
		if (contentRef.current && state.content) {
			// 清空现有内容
			contentRef.current.replaceChildren()
			
			// 判断是否为 HTML 内容（包含 SVG）
			const isHtmlContent = state.content.trim().startsWith('<') && 
				(state.content.includes('<svg') || state.content.includes('<div') || 
				 state.content.includes('<span') || state.content.includes('<pre'))
			
			if (isHtmlContent) {
				// HTML/SVG контент парсится через DOMParser (без innerHTML)
				const parsed = new DOMParser().parseFromString(state.content, 'text/html')
				const nodes = Array.from(parsed.body.childNodes).map((n) => document.importNode(n, true))
				contentRef.current.replaceChildren(...nodes)
				
			} else {
				// 如果是纯文本，创建预格式化文本元素
				const preElement = createEl('pre')
				preElement.className = 'icf-raw-content'
				preElement.textContent = state.content
				contentRef.current.appendChild(preElement)
			}
		}
	}, [state.content, state.file])

	return (
		<div id="icf-preview-view">
			<div className="view-header">
				<div className="view-header-left">
					<div className="view-header-nav-buttons"></div>
				</div>
				<div className="view-header-title-container mod-at-start">
					<div className="view-header-title">
						{state.title || (state.file ? state.file.name : 'Markdown Preview')}
					</div>
					<div className="view-actions">
						<button
							className="clickable-icon view-action icf-close-button"
							aria-label="Close preview"
							onClick={close}
						>
							{closeIcon && '✕'}
							{t('previewView.close')}
						</button>
					</div>
				</div>
			</div>

			<div className="view-content">
				<div className="markdown-preview-view is-readable-line-width">
					<div className="markdown-preview-sizer">
						<div className="icf-preview-title">
							{state.title || (state.file ? state.file.name.replace(/\.[^/.]+$/, '') : '')}
						</div>
						<div 
							ref={contentRef} 
							className="markdown-preview-section icf-preview-content"
						></div>
					</div>
				</div>
			</div>
			<style>{`
				#icf-preview-view {
					display: flex;
					flex-direction: column;
					height: 100%;
					background-color: var(--background-primary);
				}
				
				#icf-preview-view .view-content {
					flex-grow: 1;
					overflow: auto;
					padding: 0 20px;
				}
				
				.icf-preview-title {
					font-size: 1.8em;
					font-weight: bold;
					margin-bottom: 20px;
					padding-bottom: 10px;
					border-bottom: 1px solid var(--background-modifier-border);
				}
				
				.markdown-preview-section {
					padding: 10px 0;
				}
				
				.icf-preview-content {
					text-align: center;
				}
				
				.icf-preview-content svg {
					max-width: 100%;
					height: auto;
					display: block;
					margin: 0 auto;
					border-radius: var(--radius-s);
					box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
				}
				
				.icf-raw-content {
					white-space: pre-wrap;
					word-break: break-word;
					font-family: var(--font-monospace);
					padding: 10px;
					background-color: var(--background-secondary);
					border-radius: 4px;
					text-align: left;
				}
			`}</style>
		</div>
	)
} 
