import { ApiProvider } from '../types/llm/model';

// Provider API Key获取地址映射
export const providerApiUrls: Record<ApiProvider, string> = {
	[ApiProvider.SiliconFlow]: 'https://cloud.siliconflow.cn/account/ak',
	[ApiProvider.AlibabaQwen]: 'https://help.aliyun.com/zh/dashscope/developer-reference/activate-dashscope-and-create-an-api-key',
	[ApiProvider.Deepseek]: 'https://platform.deepseek.com/api_keys/',
	[ApiProvider.Moonshot]: 'https://platform.moonshot.cn/console/api-keys',
	[ApiProvider.Ollama]: '', // Ollama 不需要API Key
	[ApiProvider.LocalProvider]: '', // 本地提供者，无固定URL
};

// 获取指定provider的API Key获取URL
export function getProviderApiUrl(provider: ApiProvider): string {
	return providerApiUrls[provider] || '';
}
