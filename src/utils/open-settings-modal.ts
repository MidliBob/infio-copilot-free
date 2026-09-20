import { App } from 'obsidian'

import { OpenSettingsModal } from '../open-settings-modal'

export function openSettingsModalWithError(app: App, errorMessage: string) {
	new OpenSettingsModal(app, errorMessage, () => {
		const setting = (app as unknown as { setting: { open: () => void; openTabById: (id: string) => void } }).setting
		setting.open()
		setting.openTabById('infio-copilot-free')
	}).open()
}
