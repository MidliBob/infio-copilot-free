import { App, Modal, Setting } from 'obsidian'

import { t } from '../lang/helpers'

// Native window.confirm()/window.alert() are blocked by Obsidian's plugin
// guidelines (and look foreign inside the app). These helpers provide the
// same two flows on top of the Obsidian Modal API:
//   showConfirm(app, {...}) -> Promise<boolean>   (replaces confirm())
//   showMessage(app, {...}) -> Promise<void>      (replaces alert())

export type ConfirmOptions = {
	title?: string
	message: string
	confirmText?: string
	cancelText?: string
	danger?: boolean
}

class ConfirmModal extends Modal {
	private readonly options: ConfirmOptions
	private readonly onResult: (confirmed: boolean) => void
	private settled = false

	constructor(app: App, options: ConfirmOptions, onResult: (confirmed: boolean) => void) {
		super(app)
		this.options = options
		this.onResult = onResult
	}

	onOpen(): void {
		const { contentEl } = this
		if (this.options.title) {
			contentEl.createEl('h2', { text: this.options.title })
		}
		contentEl.createEl('p', { text: this.options.message })

		const buttons = new Setting(contentEl)
		buttons.addButton((button) => {
			button.setButtonText(this.options.cancelText ?? String(t('modals.cancel')))
			button.onClick(() => {
				this.close()
			})
		})
		buttons.addButton((button) => {
			button.setButtonText(this.options.confirmText ?? String(t('modals.confirm')))
			if (this.options.danger) {
				button.setWarning()
			}
			button.setCta()
			button.onClick(() => {
				this.settled = true
				this.onResult(true)
				this.close()
			})
		})
	}

	onClose(): void {
		if (!this.settled) {
			this.onResult(false)
		}
		this.contentEl.empty()
	}
}

export function showConfirm(app: App, options: ConfirmOptions): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		new ConfirmModal(app, options, resolve).open()
	})
}

export type MessageOptions = {
	title?: string
	message: string
	okText?: string
}

class MessageModal extends Modal {
	private readonly options: MessageOptions
	private readonly onDone: () => void

	constructor(app: App, options: MessageOptions, onDone: () => void) {
		super(app)
		this.options = options
		this.onDone = onDone
	}

	onOpen(): void {
		const { contentEl } = this
		if (this.options.title) {
			contentEl.createEl('h2', { text: this.options.title })
		}
		contentEl.createEl('p', { text: this.options.message })

		const buttons = new Setting(contentEl)
		buttons.addButton((button) => {
			button.setButtonText(this.options.okText ?? String(t('modals.ok')))
			button.setCta()
			button.onClick(() => {
				this.close()
			})
		})
	}

	onClose(): void {
		this.onDone()
		this.contentEl.empty()
	}
}

export function showMessage(app: App, options: MessageOptions): Promise<void> {
	return new Promise<void>((resolve) => {
		new MessageModal(app, options, resolve).open()
	})
}
