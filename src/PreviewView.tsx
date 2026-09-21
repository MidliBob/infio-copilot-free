import { TFile, View, WorkspaceLeaf } from 'obsidian'
import { Root, createRoot } from 'react-dom/client'

import PreviewViewRoot from './components/preview-view/PreviewViewRoot'
import { PREVIEW_VIEW_TYPE } from './constants'
import { AppProvider } from './contexts/AppContext'

export type PreviewViewState = {
	content: string
	title?: string
	file?: TFile
	onClose?: () => void
}

export class PreviewView extends View {
	private root: Root | null = null
	state: PreviewViewState | null = null

	constructor(leaf: WorkspaceLeaf) {
		super(leaf)
	}

	getViewType() {
		return PREVIEW_VIEW_TYPE
	}

	getDisplayText() {
		if (this.state?.title) {
			return `Preview: ${this.state.title}`
		}
		return `Preview: ${this.state?.file?.name ?? 'Markdown'}`
	}

	async setState(state: PreviewViewState) {
		this.state = state
		// Should render here because onOpen is called before setState
		void this.render()
	}

	async onOpen() {
		this.root = createRoot(this.containerEl)
	}

	async onClose() {
		if (this.state?.onClose) {
			this.state.onClose()
		}
		this.root?.unmount()
	}

	async render() {
		if (!this.root || !this.state) return
		this.root.render(
			<AppProvider app={this.app}>
				<PreviewViewRoot 
					state={this.state} 
					close={() => this.leaf.detach()} 
				/>
			</AppProvider>,
		)
	}
} 
