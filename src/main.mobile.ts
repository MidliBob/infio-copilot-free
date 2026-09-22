// @ts-check

import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

import { t } from './lang/helpers';
import { setDebugEnabled } from './utils/logger';
import { InfioSettings, parseInfioSettings } from './types/settings-mobile';

export class MobileSettingTab extends PluginSettingTab {
	plugin: Plugin & { settings: InfioSettings; setSettings: (s: InfioSettings) => Promise<void> }

	constructor(app: App, plugin: Plugin & { settings: InfioSettings; setSettings: (s: InfioSettings) => Promise<void> }) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()

		new Setting(containerEl).setName(t('settings.Mobile.heading')).setHeading()

		// Mobile support lands with the phase-1 release; until then the
		// manifest declares isDesktopOnly and this tab is not reachable.
		const descEl = containerEl.createDiv()
		descEl.appendText(String(t('settings.Mobile.comingSoon')))
	}
}

export async function loadMobile(base: Plugin) {
 	const plugin = base as Plugin & {
 		settings: InfioSettings
 		loadSettings: () => Promise<void>
 		setSettings: (s: InfioSettings) => Promise<void>
 	}

 	plugin.loadSettings = async function () {
 		this.settings = parseInfioSettings(await this.loadData())
 		setDebugEnabled(this.settings.debugMode)
 		await this.saveData(this.settings)
 	}

 	plugin.setSettings = async function (newSettings: InfioSettings) {
 		this.settings = newSettings
 		await this.saveData(newSettings)
 	}

 	await plugin.loadSettings()

 	// Only settings tab
 	plugin.addSettingTab(new MobileSettingTab(plugin.app, plugin))
}

export function unloadMobile(_base: Plugin) {
 	// nothing to cleanup in lite mobile
}


