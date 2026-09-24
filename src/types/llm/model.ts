export enum ApiProvider {
	SiliconFlow = "SiliconFlow",
	AlibabaQwen = "AlibabaQwen",
	Deepseek = "Deepseek",
	Moonshot = "Moonshot",
	Ollama = "Ollama",
	LocalProvider = "LocalProvider",
}

export type LLMModel = {
	provider: ApiProvider;
	modelId: string;
}

export type CustomLLMModel = {
  name: string;
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  enabled: boolean;
  isEmbeddingModel: boolean;
  isBuiltIn: boolean;
  dimension?: number;
}
