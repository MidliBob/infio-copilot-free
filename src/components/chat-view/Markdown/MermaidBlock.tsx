import { CopyIcon } from "lucide-react"
import mermaid from "mermaid"
import { memo, useEffect, useRef, useState } from "react"
import styled from "styled-components"

import { PREVIEW_VIEW_TYPE } from "../../../constants"
import { useApp } from "../../../contexts/AppContext"
import { useDarkModeContext } from "../../../contexts/DarkModeContext"
import { t } from '../../../lang/helpers'
import { PreviewView, PreviewViewState } from "../../../PreviewView"
import { useCopyToClipboard } from "../../../utils/clipboard"
import { useDebounceEffect } from "../../../utils/useDebounceEffect"

// Obsidian 暗色主题配置
const OBSIDIAN_DARK_THEME = {
	background: "#202020",
	textColor: "#dcddde", 
	mainBkg: "#2f3136",
	nodeBorder: "#484b51",
	lineColor: "#8e9297",
	primaryColor: "#7289da",
	primaryTextColor: "#ffffff",
	primaryBorderColor: "#7289da",
	secondaryColor: "#2f3136",
	tertiaryColor: "#36393f",

	// Class diagram specific
	classText: "#dcddde",

	// State diagram specific  
	labelColor: "#dcddde",

	// Sequence diagram specific
	actorLineColor: "#8e9297",
	actorBkg: "#2f3136", 
	actorBorder: "#484b51",
	actorTextColor: "#dcddde",

	// Flow diagram specific
	fillType0: "#2f3136",
	fillType1: "#36393f", 
	fillType2: "#40444b",
}

// Obsidian 亮色主题配置  
const OBSIDIAN_LIGHT_THEME = {
	background: "#ffffff",
	textColor: "#2e3338",
	mainBkg: "#f6f6f6", 
	nodeBorder: "#d1d9e0",
	lineColor: "#747f8d",
	primaryColor: "#5865f2",
	primaryTextColor: "#ffffff",
	primaryBorderColor: "#5865f2", 
	secondaryColor: "#f6f6f6",
	tertiaryColor: "#e3e5e8",

	// Class diagram specific
	classText: "#2e3338",

	// State diagram specific
	labelColor: "#2e3338", 

	// Sequence diagram specific
	actorLineColor: "#747f8d",
	actorBkg: "#f6f6f6",
	actorBorder: "#d1d9e0", 
	actorTextColor: "#2e3338",

	// Flow diagram specific
	fillType0: "#f6f6f6",
	fillType1: "#e3e5e8",
	fillType2: "#dae0e6",
}

interface MermaidBlockProps {
	code: string
}

interface MermaidToolbarProps {
	code: string;
}

function MermaidToolbar({ code }: MermaidToolbarProps) {
	const { showCopyFeedback, copyWithFeedback } = useCopyToClipboard()

	const handleCopy = (e: React.MouseEvent) => {
		e.stopPropagation()
		// We wrap the code in a markdown block for easy pasting
		void copyWithFeedback("```mermaid\n" + code + "\n```")
	}

	return (
		<ToolbarContainer className="mermaid-toolbar">
			<ToolbarButton className="mermaid-toolbar-btn" onClick={handleCopy} aria-label={t("common:copy_code")}>
				<CopyIcon size={12} />
			</ToolbarButton>
		</ToolbarContainer>
	)
}

interface MermaidButtonProps {
	code: string
	children: React.ReactNode
}

function MermaidButton({ code, children }: MermaidButtonProps) {
	return (
		<MermaidWrapper>
			{children}
			<MermaidToolbar code={code} />
		</MermaidWrapper>
	)
}

function MermaidBlock({ code }: MermaidBlockProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isErrorExpanded, setIsErrorExpanded] = useState(false)
	const { showCopyFeedback, copyWithFeedback } = useCopyToClipboard()

	const { isDarkMode } = useDarkModeContext()
	const app = useApp()

	// 根据主题模式初始化Mermaid配置
	const initializeMermaid = (darkMode: boolean) => {
		const currentTheme = darkMode ? OBSIDIAN_DARK_THEME : OBSIDIAN_LIGHT_THEME
		
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: "loose",
			theme: darkMode ? "dark" : "default",
			themeVariables: {
				...currentTheme,
				fontSize: "16px",
				fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",

				// Additional styling
				noteTextColor: currentTheme.textColor,
				noteBkgColor: currentTheme.tertiaryColor,
				noteBorderColor: currentTheme.nodeBorder,

				// Improve contrast for special elements
				critBorderColor: darkMode ? "#ff9580" : "#dc2626",
				critBkgColor: darkMode ? "#803d36" : "#fef2f2",

				// Task diagram specific
				taskTextColor: currentTheme.textColor,
				taskTextOutsideColor: currentTheme.textColor,
				taskTextLightColor: currentTheme.textColor,

				// Numbers/sections
				sectionBkgColor: currentTheme.mainBkg,
				sectionBkgColor2: currentTheme.secondaryColor,

				// Alt sections in sequence diagrams
				altBackground: currentTheme.mainBkg,

				// Links
				linkColor: currentTheme.primaryColor,

				// Borders and lines
				compositeBackground: currentTheme.mainBkg,
				compositeBorder: currentTheme.nodeBorder,
				titleColor: currentTheme.textColor,
			},
		})
	}

	// 1) Whenever `code` or `isDarkMode` changes, mark that we need to re-render a new chart
	useEffect(() => {
		setIsLoading(true)
		setError(null)
	}, [code, isDarkMode])

	// 2) Debounce the actual parse/render
	useDebounceEffect(
		() => {
			if (containerRef.current) {
				containerRef.current.innerHTML = ""
			}

			// 根据当前主题重新初始化Mermaid
			initializeMermaid(isDarkMode)

			mermaid
				.parse(code)
				.then(() => {
					const id = `mermaid-${Math.random().toString(36).substring(2)}`
					return mermaid.render(id, code)
				})
				.then(({ svg }) => {
					if (containerRef.current) {
						const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
						const rendered = parsed.querySelector('svg')
						if (rendered) {
							containerRef.current.replaceChildren(document.importNode(rendered, true))
						}
					}
				})
				.catch((err: Error) => {
					console.warn("Mermaid parse/render failed:", err)
					setError(err.message || "Failed to render Mermaid diagram")
				})
				.finally(() => {
					setIsLoading(false)
				})
		},
		500, // Delay 500ms
		[code, isDarkMode], // Dependencies for scheduling
	)

	/**
	 * Called when user clicks the rendered diagram.
	 * Opens the Mermaid diagram in a new preview tab.
	 */
	const handleClick = async () => {
		if (!containerRef.current) return
		const svgEl = containerRef.current.querySelector("svg")
		if (!svgEl) return

		try {
			// 获取当前主题背景色
			const backgroundColor = isDarkMode ? OBSIDIAN_DARK_THEME.background : OBSIDIAN_LIGHT_THEME.background
			
			// 创建一个包装器来包含 SVG 和样式
			const svgHTML = `
				<div style="
					display: flex;
					justify-content: center;
					align-items: center;
					background-color: ${backgroundColor};
					max-width: 100%;
				">
					${svgEl.outerHTML}
				</div>
			`
			
			// 查找是否已经有相同内容的预览 tab
			const existingLeaf = app.workspace
				.getLeavesOfType(PREVIEW_VIEW_TYPE)
				.find(
					(leaf) =>
						leaf.view instanceof PreviewView && leaf.view.state?.title === t('mermaid.previewTitle')
				)
			
			if (existingLeaf) {
				// 如果已存在，关闭现有的然后重新创建以更新内容
				// existingLeaf.detach()
				return
			}
			
			// 创建新的预览 tab
			void app.workspace.getLeaf(true).setViewState({
				type: PREVIEW_VIEW_TYPE,
				active: true,
				state: {
					content: svgHTML,
					title: t('mermaid.previewTitle'),
				} satisfies PreviewViewState,
			})
		} catch (err) {
			console.error("Error opening Mermaid preview:", err)
		}
	}

	// Copy functionality handled directly through the copyWithFeedback utility

	return (
		<MermaidBlockContainer>
			{isLoading && <LoadingMessage>{t("common:mermaid.loading")}</LoadingMessage>}

			{error ? (
				<ErrorContainer>
					<ErrorHeader 
						$isExpanded={isErrorExpanded}
						onClick={() => setIsErrorExpanded(!isErrorExpanded)}>
						<ErrorHeaderContent>
							<WarningIcon className="codicon codicon-warning" />
							<ErrorTitle>{t("common:mermaid.render_error")}</ErrorTitle>
						</ErrorHeaderContent>
						<ErrorHeaderActions>
							<CopyButton
								onClick={(e) => {
									e.stopPropagation()
									const combinedContent = `Error: ${error}\n\n\`\`\`mermaid\n${code}\n\`\`\``
									void copyWithFeedback(combinedContent, e)
								}}>
								<span className={`codicon codicon-${showCopyFeedback ? "check" : "copy"}`}></span>
							</CopyButton>
							<span className={`codicon codicon-chevron-${isErrorExpanded ? "up" : "down"}`}></span>
						</ErrorHeaderActions>
					</ErrorHeader>
					{isErrorExpanded && (
						<ErrorContent>
							<ErrorMessage>{error}</ErrorMessage>
							<code className="language-mermaid">{code}</code>
						</ErrorContent>
					)}
				</ErrorContainer>
			) : (
				<MermaidButton code={code}>
					<SvgContainer onClick={handleClick} ref={containerRef} $isLoading={isLoading} />
				</MermaidButton>
			)}
		</MermaidBlockContainer>
	)
}

const MermaidWrapper = styled.div`
	position: relative;
	margin: 8px 0;

	&:hover .mermaid-toolbar {
		opacity: 1;
	}

	.mermaid-toolbar-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: transparent !important;
		border: none !important;
		box-shadow: none !important;
		color: var(--text-muted);
		padding: 0 !important;
		margin: 0 !important;
		width: 24px !important;
		height: 24px !important;

		&:hover {
			background-color: var(--background-modifier-hover) !important;
		}
	}
`

const ToolbarContainer = styled.div`
	position: absolute;
	top: 8px;
	right: 8px;
	z-index: 10;
	opacity: 0;
	transition: opacity 0.2s ease-in-out;
	background-color: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 6px;
	padding: 2px;
	display: flex;
	align-items: center;

	&:hover {
		opacity: 1; /* Keep it visible when hovering over the toolbar itself */
	}
`

const ToolbarButton = styled.button`
	padding: 4px;
	color: var(--text-muted);
	background: transparent;
	border: none;
	cursor: pointer;
	display: flex;
	align-items: center;
	border-radius: 4px;

	&:hover {
		color: var(--text-normal);
		background-color: var(--background-modifier-hover);
	}
`

const MermaidBlockContainer = styled.div`
	position: relative;
`

const LoadingMessage = styled.div`
	padding: 8px 0;
	color: var(--text-muted);
	font-style: italic;
	font-size: 0.9em;
`

const ErrorContainer = styled.div`
	margin-top: 0px;
	overflow: hidden;
	margin-bottom: 8px;
`

interface ErrorHeaderProps {
	$isExpanded: boolean
}

const ErrorHeader = styled.div<ErrorHeaderProps>`
	border-bottom: ${(props) => (props.$isExpanded ? "1px solid var(--background-modifier-border)" : "none")};
	font-weight: normal;
	font-size: var(--font-ui-small);
	color: var(--text-normal);
	display: flex;
	align-items: center;
	justify-content: space-between;
	cursor: pointer;
`

const ErrorHeaderContent = styled.div`
	display: flex;
	align-items: center;
	gap: 10px;
	flex-grow: 1;
`

const WarningIcon = styled.span`
	color: var(--text-warning);
	opacity: 0.8;
	font-size: 16px;
	margin-bottom: -1.5px;
`

const ErrorTitle = styled.span`
	font-weight: bold;
`

const ErrorHeaderActions = styled.div`
	display: flex;
	align-items: center;
`

const ErrorContent = styled.div`
	padding: 8px;
	background-color: var(--background-primary);
	border-top: none;
`

const ErrorMessage = styled.div`
	margin-bottom: 8px;
	color: var(--text-muted);
`

const CopyButton = styled.button`
	padding: 3px;
	height: 24px;
	margin-right: 4px;
	color: var(--text-normal);
	display: flex;
	align-items: center;
	justify-content: center;
	background: transparent;
	border: none;
	cursor: pointer;

	&:hover {
		opacity: 0.8;
	}
`

interface SvgContainerProps {
	$isLoading: boolean
}

const SvgContainer = styled.div<SvgContainerProps>`
	opacity: ${(props) => (props.$isLoading ? 0.3 : 1)};
	min-height: 20px;
	transition: opacity 0.2s ease;
	cursor: pointer;
	display: flex;
	justify-content: center;
	max-height: 600px;

	/* Ensure the SVG fills the container width and maintains aspect ratio */
	& > svg {
		display: block; /* Ensure block layout */
		width: 100%;
		max-height: 100%; /* Respect container's max-height */
	}

	/* Hover effect to indicate clickability */
	&:hover {
		opacity: 0.8;
		transform: scale(1.02);
		transition: all 0.2s ease;
	}

	/* Click hint overlay */
	&:hover::after {
		content: t('mermaid.clickToEnlarge');
		position: absolute;
		bottom: 8px;
		right: 8px;
		background: rgba(0, 0, 0, 0.7);
		color: white;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 12px;
		pointer-events: none;
		opacity: 0.9;
		z-index: 10;
	}
`

export const MemoizedMermaidBlock = memo(MermaidBlock)