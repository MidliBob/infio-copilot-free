// @ts-check

import { App, Plugin, PluginSettingTab, Setting, requestUrl } from 'obsidian';

import { InfioSettings, parseInfioSettings } from './types/settings-mobile';
import { getDeviceId, getOperatingSystem } from './utils/device-id';

const INFIO_BASE_URL = 'https://api.infio.app'

// API响应类型定义
export type CheckGeneralResponse = {
	success: boolean;
	message: string;
	dl_zip?: string;
};

export type CheckGeneralParams = {
	device_id: string;
	device_name: string;
};

/**
 * 检查设备一般状态
 * @param apiKey API密钥
 * @param deviceId 设备ID
 * @param deviceName 设备名称
 * @returns Promise<CheckGeneralResponse>
 */
export const checkGeneral = async (
	apiKey: string
): Promise<CheckGeneralResponse> => {
	try {
		if (!apiKey) {
			throw new Error('API密钥不能为空');
		}
		const deviceId = await getDeviceId();
		const deviceName = getOperatingSystem();
		if (!deviceId || !deviceName) {
			throw new Error('设备ID和设备名称不能为空');
		}

		const response = await requestUrl({
			url: `${INFIO_BASE_URL}/subscription/check_general`,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				device_id: deviceId,
				device_name: deviceName,
			}),
		});

		if (response.json.success) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return -- requestUrl json is untyped by design
			return response.json;
		} else {
			console.error('检查 gerenal 会员失败:', response.json.message);
			return {
				success: false,
				message: response.json.message || '检查设备一般状态失败',
			};
		}
	} catch (error) {
		console.error('检查 gerenal 会员失败:', error);

		// 返回错误响应格式
		return {
			success: false,
			message: error instanceof Error ? error.message : '检查设备状态时出现未知错误'
		};
	}
};

// API响应类型定义
export type UserPlanResponse = {
	plan: string;
	status: string;
	dl_zip?: string;
	[key: string]: unknown;
};

export type UpgradeResult = {
	success: boolean;
	message: string;
};

export const fetchUserPlan = async (apiKey: string): Promise<UserPlanResponse> => {
	const response = await requestUrl({
		url: `${INFIO_BASE_URL}/subscription/status`,
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
	});

	// eslint-disable-next-line @typescript-eslint/no-unsafe-return -- requestUrl json is untyped by design
	return response.json;
}

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


