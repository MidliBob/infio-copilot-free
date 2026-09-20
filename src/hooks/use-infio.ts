/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { requestUrl } from "obsidian";

import { INFIO_BASE_URL } from "../constants";
import { getDeviceId, getOperatingSystem } from "../utils/device-id";

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

	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return response.json;
}

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
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
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

/**
 * 检查用户是否为Pro用户
 */
// export const checkIsProUser = async (apiKey: string): Promise<boolean> => {
// 	try {
// 		if (!apiKey) {
// 			return false;
// 		}
		
// 		const userPlan = await fetchUserPlan(apiKey);
// 		return userPlan.plan?.toLowerCase().startsWith('pro') || false;
// 	} catch (error) {
// 		// eslint-disable-next-line no-console
// 		console.error('检查Pro用户状态失败:', error);
// 		return false;
// 	}
// }
