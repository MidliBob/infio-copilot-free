import { t } from '../lang/helpers'
import { App } from "obsidian";
import { DataviewApi, getAPI } from "obsidian-dataview";

export interface DataviewQueryResult {
	success: boolean;
	data?: string;
	error?: string;
}

export class DataviewManager {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 获取 Dataview API 实例（动态获取，确保插件已加载）
	 */
	private getAPI(): DataviewApi | null {
		try {
			const api = getAPI(this.app) as DataviewApi | null;
			return api;
		} catch (error) {
			console.error('获取 Dataview API 失败:', error);
			return null;
		}
	}

	/**
	 * 检查 Dataview 插件是否可用
	 */
	isDataviewAvailable(): boolean {
		const api = this.getAPI();
		return api !== null && api !== undefined;
	}

	/**
	 * 执行 Dataview 查询
	 */
	async executeQuery(query: string): Promise<DataviewQueryResult> {
		const api = this.getAPI();
		if (!api) {
			return {
				success: false,
				error: t('notifications.dataviewNotInstalled')
			};
		}

		try {
			// 使用 Dataview 的查询引擎
			const result = await api.queryMarkdown(query, "", {});
			
			// 检查 Result 对象的结构
			if (result && typeof result === 'object' && 'successful' in result) {
				if (result.successful) {
					return {
						success: true,
						data: String(result.value || '')
					};
				} else {
					return {
						success: false,
						error: String(result.error || t('chat.dataview.queryFailedShort'))
					};
				}
			}
			
			// 如果不是 Result 对象，直接处理
			return {
				success: true,
				data: this.formatQueryResult(result)
			};

		} catch (error) {
			console.error('Dataview 查询执行失败:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : t('chat.dataview.unknownError')
			};
		}
	}

	/**
	 * 执行 Dataview JS
	 */
	async executeJs(js: string): Promise<DataviewQueryResult> {
		const api = this.getAPI();
		if (!api) {
			return {
				success: false,
				error: t('notifications.dataviewNotInstalled')
			};
		}

		try {
			const result = await api.evaluate(js);
			if (result.successful) {
				return {
					success: true,
					data: result.value
				};
			} else {
				return {
					success: false,
					error: String(result.error || t('chat.dataview.jsQueryFailedShort'))
				};
			}
		} catch (error) {
			console.error('Dataview JS 执行失败:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : t('chat.dataview.unknownError')
			};
		}
	}

	/**
	 * 格式化查询结果（备用方法）
	 */
	private formatQueryResult(result: unknown): string {
		if (result === null || result === undefined) {
			return t('chat.dataview.emptyResult');
		}

		// 如果是字符串，直接返回
		if (typeof result === 'string') {
			return result;
		}

		// 尝试 JSON 序列化
		if (typeof result === 'object') {
			try {
				return JSON.stringify(result, null, 2);
			} catch (e) {
				return t('chat.dataview.objectResult', { repr: Object.prototype.toString.call(result) });
			}
		}

		// 其他类型，转换为字符串
		return String(result);
	}
}

// 导出一个全局实例创建函数
export function createDataviewManager(app: App): DataviewManager {
	return new DataviewManager(app);
}
