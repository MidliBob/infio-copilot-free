// @ts-check

import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';

import { InfioSettings, parseInfioSettings } from './types/settings-mobile';

/**
 * 清理临时目录
 */
export class MobileSettingTab extends PluginSettingTab {
	plugin: Plugin & { settings: InfioSettings; setSettings: (s: InfioSettings) => Promise<void> }

	constructor(app: App, plugin: Plugin & { settings: InfioSettings; setSettings: (s: InfioSettings) => Promise<void> }) {
		super(app, plugin)
		this.plugin = plugin
 	}

	display(): void {
		const { containerEl } = this
		containerEl.empty()

		// Title
		new Setting(containerEl).setName('Infio Mobile').setHeading()

 		// Description
		const descEl = containerEl.createDiv()
		descEl.appendText('移动端需要会员才能使用，需要填入 API Key 然后点击升级Pro按钮 ')
		descEl.createEl('a', { text: '获取 API Key', href: 'https://infio.app/keys', attr: { target: '_blank' } })

 		new Setting(containerEl)
 			.setName('Infio API Key')
 			.setDesc('用于验证并下载移动端正式版本')
 			.addText((text) => {
 				text
 					.setPlaceholder('sk-...')
 					.setValue(this.plugin.settings?.infioProvider?.apiKey || '')
 					.onChange(async (value) => {
 						await this.plugin.setSettings({
 							...this.plugin.settings,
 							infioProvider: {
 								...(this.plugin.settings?.infioProvider || { name: 'Infio', apiKey: '', baseUrl: '', useCustomUrl: false, models: [] }),
 								apiKey: value,
 							},
 							// 兼容字段
 							infioApiKey: value,
 						})
 					})
 			})

		// 升级到 Pro 按钮
; // keep style
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


