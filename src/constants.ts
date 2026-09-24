import { LLMModel } from './types/llm/model'
// import { ApiProvider } from './utils/api'
export const CHAT_VIEW_TYPE = 'icf-chat-view'
export const APPLY_VIEW_TYPE = 'icf-apply-view'
export const PREVIEW_VIEW_TYPE = 'icf-preview-view'
export const JSON_VIEW_TYPE = 'icf-json-view'

export const DEFAULT_MODELS: LLMModel[] = []

export const SUPPORT_EMBEDDING_SIMENTION: number[] = [
	384,
	512,
	768,
	1024,
	1536
]

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
export const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1'
export const ALIBABA_QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
export const MOONSHOT_BASE_URL = 'https://api.moonshot.cn/v1'
export const DEFAULT_YACY_BASE_URL = 'http://localhost:8090'
export const DEFAULT_SEARXNG_BASE_URL = 'http://localhost:8080'
export const PGLITE_DB_PATH = '.infio_pglite_db.tar.gz'
