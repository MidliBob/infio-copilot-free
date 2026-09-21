import * as Popover from "@radix-ui/react-popover";
import Fuse, { FuseResult } from "fuse.js";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { t } from "../../lang/helpers";
import { ApiProvider } from "../../types/llm/model";
import { InfioSettings } from "../../types/settings";
// import { PROVIDERS } from '../constants';
import { GetAllProviders, GetEmbeddingProviderModelIds, GetEmbeddingProviders, GetProviderModelIds } from "../../utils/api";

import { getProviderSettingKey } from "./ModelProviderSettings";

type TextSegment = {
	text: string;
	isHighlighted: boolean;
};

type SearchableItem = {
	id: string;
	html: string | TextSegment[];
};

type HighlightedItem = {
	id: string;
	html: TextSegment[];
	isCustom?: boolean;
};

// Type guard for Record<string, unknown>
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

// https://gist.github.com/evenfrost/1ba123656ded32fb7a0cd4651efd4db0
export const highlight = (fuseSearchResult: FuseResult<SearchableItem>[]): HighlightedItem[] => {
	const set = (obj: Record<string, unknown>, path: string, value: TextSegment[]): void => {
		const pathValue = path.split(".")
		let i: number
		let current = obj

		for (i = 0; i < pathValue.length - 1; i++) {
			const nextValue = current[pathValue[i]]
			if (isRecord(nextValue)) {
				current = nextValue
			} else {
				throw new Error(`Invalid path: ${path}`)
			}
		}

		current[pathValue[i]] = value
	}

	// Function to merge overlapping regions
	const mergeRegions = (regions: [number, number][]): [number, number][] => {
		if (regions.length === 0) return regions

		// Sort regions by start index
		regions.sort((a, b) => a[0] - b[0])

		const merged: [number, number][] = [regions[0]]

		for (let i = 1; i < regions.length; i++) {
			const last = merged[merged.length - 1]
			const current = regions[i]

			if (current[0] <= last[1] + 1) {
				// Overlapping or adjacent regions
				last[1] = Math.max(last[1], current[1])
			} else {
				merged.push(current)
			}
		}

		return merged
	}

	const generateHighlightedSegments = (inputText: string, regions: [number, number][] = []): TextSegment[] => {
		if (regions.length === 0) {
			return [{ text: inputText, isHighlighted: false }];
		}

		// Sort and merge overlapping regions
		const mergedRegions = mergeRegions(regions);
		const segments: TextSegment[] = [];
		let nextUnhighlightedRegionStartingIndex = 0;

		mergedRegions.forEach((region) => {
			const start = region[0];
			const end = region[1];
			const lastRegionNextIndex = end + 1;

			// Add unhighlighted segment before the highlight
			if (nextUnhighlightedRegionStartingIndex < start) {
				segments.push({
					text: inputText.substring(nextUnhighlightedRegionStartingIndex, start),
					isHighlighted: false,
				});
			}

			// Add highlighted segment
			segments.push({
				text: inputText.substring(start, lastRegionNextIndex),
				isHighlighted: true,
			});

			nextUnhighlightedRegionStartingIndex = lastRegionNextIndex;
		});

		// Add remaining unhighlighted text
		if (nextUnhighlightedRegionStartingIndex < inputText.length) {
			segments.push({
				text: inputText.substring(nextUnhighlightedRegionStartingIndex),
				isHighlighted: false,
			});
		}

		return segments;
	}

	return fuseSearchResult
		.filter(({ matches }) => matches && matches.length)
		.map(({ item, matches }): HighlightedItem => {
			const highlightedItem: HighlightedItem = {
				id: item.id,
				html: typeof item.html === 'string' ? [{ text: item.html, isHighlighted: false }] : [...item.html]
			}

			matches?.forEach((match) => {
				if (match.key && typeof match.value === "string" && match.indices) {
					const mergedIndices = mergeRegions([...match.indices])
					set(highlightedItem, match.key, generateHighlightedSegments(match.value, mergedIndices))
				}
			})

			return highlightedItem
		})
}

const HighlightedText: React.FC<{ segments: TextSegment[] }> = ({ segments }) => {
	return (
		<>
			{segments.map((segment, index) => (
				segment.isHighlighted ? (
					<span key={index} className="icf-llm-setting-model-item-highlight">{segment.text}</span>
				) : (
					<span key={index}>{segment.text}</span>
				)
			))}
		</>
	);
};

export type ComboBoxComponentProps = {
	name: string;
	provider: ApiProvider;
	modelId: string;
	settings?: InfioSettings | null;
	isEmbedding?: boolean,
	description?: string;
	updateModel: (provider: ApiProvider, modelId: string, isCustom?: boolean) => void;
};

export const ComboBoxComponent: React.FC<ComboBoxComponentProps> = ({
	name,
	provider,
	modelId,
	settings = null,
	isEmbedding = false,
	description,
	updateModel,
}) => {
	// provider state
	const [modelProvider, setModelProvider] = useState(provider);

	// search state
	const [searchTerm, setSearchTerm] = useState("");
	const [isOpen, setIsOpen] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(0);

	const providers = isEmbedding ? GetEmbeddingProviders() : GetAllProviders()

	const [modelIds, setModelIds] = useState<string[]>([]);

	// 统一处理模型选择和保存
	const handleModelSelect = (provider: ApiProvider, modelId: string, isCustom?: boolean) => {
		console.debug(`handleModelSelect: ${provider} -> ${modelId}`)

		// 检查是否是自定义模型（不在官方模型列表中）
		// const isCustomModel = !modelIds.includes(modelId);

		updateModel(provider, modelId, isCustom);
	};

	// Replace useMemo with useEffect for async fetching
	useEffect(() => {
		const fetchModelIds = async () => {
			const ids = isEmbedding
				? GetEmbeddingProviderModelIds(modelProvider)
				: await GetProviderModelIds(modelProvider, settings);
			console.debug(`📝 Fetched ${ids.length} official models for ${modelProvider}:`, ids);
			setModelIds(ids);
		};

		void fetchModelIds();
	}, [modelProvider, isEmbedding, settings]);

	const combinedModelIds = useMemo(() => {
		const providerKey = getProviderSettingKey(modelProvider);
		const providerModels = settings?.[providerKey]?.models;
		console.debug(`🔍 Custom models in settings for ${modelProvider}:`, providerModels || 'none')
		// Ensure providerModels is an array of strings
		if (!providerModels || !Array.isArray(providerModels)) {
			console.debug(`📋 Using only official models (${modelIds.length}):`, modelIds);
			return modelIds;
		}
		const additionalModels = providerModels.filter((model): model is string => typeof model === 'string');
		console.debug(`📋 Combined models: ${modelIds.length} official + ${additionalModels.length} custom`);
		return [...modelIds, ...additionalModels];
	}, [modelIds, settings, modelProvider]);

	const searchableItems = useMemo(() => {
		return combinedModelIds.map((id): SearchableItem => ({
			id: String(id),
			html: String(id),
		}))
	}, [combinedModelIds])

	// fuse, used for fuzzy search, simple configuration threshold can be adjusted as needed
	const fuse: Fuse<SearchableItem> = useMemo(() => {
		return new Fuse<SearchableItem>(searchableItems, {
			keys: ["html"],
			threshold: 1,
			shouldSort: true,
			isCaseSensitive: false,
			ignoreLocation: false,
			includeMatches: true,
			minMatchCharLength: 4,
		})
	}, [searchableItems])

	// 根据 searchTerm 得到过滤后的数据列表
	const filteredOptions = useMemo(() => {
		const results: HighlightedItem[] = searchTerm
			? highlight(fuse.search(searchTerm))
			: searchableItems.map(item => ({
				...item,
				html: typeof item.html === 'string' ? [{ text: item.html, isHighlighted: false }] : item.html
			}))

		// 如果有搜索词，添加自定义选项（如果不存在完全匹配的话）
		if (searchTerm && searchTerm.trim()) {
			const exactMatch = searchableItems.some(item => item.id === searchTerm);
			if (!exactMatch) {
				results.unshift({
					id: searchTerm,
					html: [{ text: `${modelIds.length > 0 ? t("settings.ModelProvider.custom") : ''}${searchTerm}`, isHighlighted: false }],
					isCustom: true
				});
			}
		}

		return results
	}, [searchableItems, searchTerm, fuse, modelIds.length])

	const listRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

	// when selected index changes, scroll to visible area
	useEffect(() => {
		if (itemRefs.current[selectedIndex]) {
			itemRefs.current[selectedIndex]?.scrollIntoView({
				block: "nearest",
				behavior: "smooth"
			});
		}
	}, [selectedIndex]);

	// Handle provider change
	const handleProviderChange = (newProvider: string) => {
		// Use proper type checking without type assertion
		const availableProviders = providers;
		const isValidProvider = (value: string): value is ApiProvider => {
			// @ts-expect-error - checking if providers array includes the value
			return availableProviders.includes(value);
		};

		if (isValidProvider(newProvider)) {
			setModelProvider(newProvider);
			// 当提供商变更时，清空模型选择让用户重新选择
			updateModel(newProvider, '', false);
		}
	};

	return (
		<div className="icf-llm-setting-item">
			<div className="icf-llm-setting-item-name">{name}</div>
			{description && (
				<div className="icf-llm-setting-item-description">{description}</div>
			)}
			<div className="icf-llm-setting-item-content">
				{/* Provider Selection - Now visible outside */}
				<div className="icf-llm-setting-provider-container">
					<label className="icf-llm-setting-provider-label">{t("settings.ModelProvider.provider")}</label>
					<select
						className="dropdown icf-llm-setting-provider-select"
						value={modelProvider}
						onChange={(e) => handleProviderChange(e.target.value)}
					>
						{providers.map((providerOption) => (
							<option
								key={providerOption}
								value={providerOption}
							>
								{providerOption}
							</option>
						))}
					</select>
				</div>

				{/* Model Selection */}
				<div className="icf-llm-setting-model-container">
					<label className="icf-llm-setting-model-label">{t("settings.ModelProvider.model")}</label>
					<Popover.Root modal={false} open={isOpen} onOpenChange={setIsOpen}>
						<Popover.Trigger asChild>
							<button className="icf-llm-setting-model-trigger clickable-icon" type="button">
								<span className="icf-llm-setting-model-display">
									{modelId || t("settings.ModelProvider.selectModel")}
								</span>
								<svg
									className="icf-llm-setting-model-arrow"
									width="12"
									height="12"
									viewBox="0 0 12 12"
									fill="none"
								>
									<path
										d="M3 4.5L6 7.5L9 4.5"
										stroke="currentColor"
										strokeWidth="1.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							</button>
						</Popover.Trigger>
						<Popover.Portal>
							<Popover.Content
								side="bottom"
								align="start"
								sideOffset={4}
								className="icf-model-picker-dropdown"
								avoidCollisions={true}
								collisionPadding={8}
								onOpenAutoFocus={(e) => {
									e.preventDefault();
									// Capture the target synchronously: React nulls out
									// e.currentTarget by the time the timeout fires.
									const target = e.currentTarget as HTMLElement | null;
									// 延迟聚焦到搜索输入框
									window.setTimeout(() => {
										const input = target?.querySelector('input');
										input?.focus();
									}, 0);
								}}
								onCloseAutoFocus={(e) => e.preventDefault()}
							>
							<div 
								ref={listRef}
								onMouseDown={(e) => {
									// 防止点击内容区域时关闭 Popover
									e.stopPropagation();
								}}
							>
								<div className="icf-llm-setting-search-container">
									<input
										type="text"
										className="icf-llm-setting-item-search"
										placeholder={modelIds.length > 0 ? t("settings.ModelProvider.searchOrEnterModelName") : t("settings.ModelProvider.enterCustomModelName")}
										value={searchTerm}
										onChange={(e) => {
											setSearchTerm(e.target.value);
											setSelectedIndex(0);
										}}
										onMouseDown={(e) => {
											// 防止点击输入框时关闭 Popover
											e.stopPropagation();
										}}
										onFocus={(e) => {
											// 防止聚焦时关闭 Popover
											e.stopPropagation();
										}}
										onKeyDown={(e) => {
											switch (e.key) {
												case "ArrowDown":
													e.preventDefault();
													setSelectedIndex((prev) =>
														Math.min(prev + 1, filteredOptions.length - 1)
													);
													break;
												case "ArrowUp":
													e.preventDefault();
													setSelectedIndex((prev) => Math.max(prev - 1, 0));
													break;
												case "Enter": {
													e.preventDefault();
													if (filteredOptions.length > 0) {
														const selectedOption = filteredOptions[selectedIndex];
														if (selectedOption) {
															handleModelSelect(modelProvider, selectedOption.id, selectedOption.isCustom);
														}
													} else if (searchTerm.trim()) {
														// If no options but there is input content, use the input content directly
														handleModelSelect(modelProvider, searchTerm.trim(), true);
													}
													setSearchTerm("");
													setIsOpen(false);
													break;
												}
												case "Escape":
													e.preventDefault();
													setIsOpen(false);
													setSearchTerm("");
													break;
											}
										}}
									/>
								</div>
								{filteredOptions.length > 0 ? (
									<div className="icf-llm-setting-options-list">
										{filteredOptions.map((option, index) => (
											<div
												key={option.id}
												ref={(el) => (itemRefs.current[index] = el)}
												onMouseEnter={() => setSelectedIndex(index)}
												onMouseDown={(e) => {
													// 防止事件冒泡
													e.preventDefault();
													e.stopPropagation();
													handleModelSelect(modelProvider, option.id, option.isCustom);
													setSearchTerm("");
													setIsOpen(false);
												}}
												className={`icf-llm-setting-combobox-option ${index === selectedIndex ? 'is-selected' : ''}`}
											>
												<HighlightedText segments={option.html} />
											</div>
										))}
									</div>
								) : null}
							</div>
							</Popover.Content>
						</Popover.Portal>
					</Popover.Root>
				</div>
			</div>
			<style>{`
				.icf-llm-setting-item {
					margin-bottom: 8px;
					padding: 12px;
					background: var(--background-secondary);
					border-radius: 6px;
					border: 1px solid var(--background-modifier-border);
				}

				.icf-llm-setting-item-name {
					font-size: 14px;
					font-weight: 500;
					color: var(--text-normal);
					margin-bottom: 8px;
					padding-bottom: 4px;
					border-bottom: 1px solid var(--background-modifier-border);
				}

				.icf-llm-setting-item-description {
					font-size: 12px;
					color: var(--text-muted);
					margin-bottom: 8px;
					line-height: 1.4;
				}

				.icf-llm-setting-item-content {
					display: flex;
					flex-direction: column;
					gap: 8px;
				}

				.icf-llm-setting-provider-container,
				.icf-llm-setting-model-container {
					display: flex;
					align-items: center;
					gap: 12px;
					position: relative;
				}

				.icf-llm-setting-provider-label,
				.icf-llm-setting-model-label {
					font-size: 13px;
					font-weight: 500;
					color: var(--text-muted);
					min-width: 50px;
					text-align: left;
				}

				.icf-llm-setting-provider-select {
					max-width: 200px;
					min-width: 120px;
					padding: 6px 8px;
					border: 1px solid var(--background-modifier-border);
					border-radius: 4px;
					background: var(--background-primary);
					color: var(--text-normal);
					font-size: 13px;
					transition: all 0.2s ease;
					appearance: none;
					background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e");
					background-repeat: no-repeat;
					background-position: right 8px center;
					background-size: 12px;
					padding-right: 28px;
				}

				.icf-llm-setting-provider-select:hover {
					border-color: var(--interactive-accent);
				}

				.icf-llm-setting-provider-select:focus {
					outline: none;
					border-color: var(--interactive-accent);
					box-shadow: 0 0 0 2px var(--interactive-accent-hover);
				}

				.icf-llm-setting-model-trigger {
					max-width: 300px;
					min-width: 150px;
					display: flex;
					align-items: center;
					justify-content: space-between;
					padding: 6px 8px;
					border: 1px solid var(--background-modifier-border);
					border-radius: 4px;
					background: var(--background-primary);
					color: var(--text-normal);
					font-size: 13px;
					cursor: pointer;
					transition: all 0.2s ease;
					min-height: 32px;
				}

				.icf-llm-setting-model-trigger:hover {
					border-color: var(--interactive-accent);
					background: var(--background-modifier-hover);
				}

				.icf-llm-setting-model-trigger:focus {
					outline: none;
					border-color: var(--interactive-accent);
					box-shadow: 0 0 0 2px var(--interactive-accent-hover);
				}

				.icf-llm-setting-model-display {
					flex: 1;
					text-align: left;
					color: var(--text-normal);
					font-family: var(--font-monospace);
					font-size: 12px;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}

				.icf-llm-setting-model-arrow {
					color: var(--text-muted);
					transition: transform 0.2s ease;
					flex-shrink: 0;
				}

				.icf-llm-setting-model-trigger[data-state="open"] .icf-llm-setting-model-arrow {
					transform: rotate(180deg);
				}

				.icf-model-picker-dropdown {
					background: var(--background-primary);
					border: 1px solid var(--background-modifier-border);
					border-radius: 6px;
					box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
					padding: 6px;
					min-width: 300px;
					max-width: 500px;
					z-index: 10000;
					max-height: 300px;
					overflow: hidden;
					transform-origin: var(--radix-popover-content-transform-origin);
					animation: popover-in 0.15s ease-out;
				}

				@keyframes popover-in {
					from {
						opacity: 0;
						transform: scale(0.95) translateY(-5px);
					}
					to {
						opacity: 1;
						transform: scale(1) translateY(0);
					}
				}

				.icf-llm-setting-search-container {
					margin-bottom: 6px;
				}

				.icf-llm-setting-item-search {
					width: 100%;
					padding: 6px 8px;
					border: 1px solid var(--background-modifier-border);
					border-radius: 4px;
					background: var(--background-primary);
					color: var(--text-normal);
					font-size: 13px;
					transition: all 0.2s ease;
				}

				.icf-llm-setting-item-search:focus {
					outline: none;
					border-color: var(--interactive-accent);
					box-shadow: 0 0 0 2px var(--interactive-accent-hover);
				}

				.icf-llm-setting-options-list {
					max-height: 240px;
					overflow-y: auto;
					overscroll-behavior: contain;
				}

				.icf-llm-setting-combobox-option {
					padding: 6px 8px;
					border-radius: 3px;
					cursor: pointer;
					font-family: var(--font-monospace);
					font-size: 12px;
					color: var(--text-normal);
					transition: all 0.15s ease;
					word-break: break-all;
				}

				.icf-llm-setting-combobox-option:hover,
				.icf-llm-setting-combobox-option.is-selected {
					background: var(--background-modifier-hover);
					color: var(--text-accent);
				}

				.icf-llm-setting-model-item-highlight {
					color: var(--text-accent);
				}

				.icf-llm-setting-no-results {
					padding: 12px 8px;
					text-align: center;
					color: var(--text-muted);
					font-size: 13px;
				}

				/* 滚动条样式 */
				.icf-llm-setting-options-list::-webkit-scrollbar {
					width: 4px;
				}

				.icf-llm-setting-options-list::-webkit-scrollbar-track {
					background: var(--background-secondary);
					border-radius: 2px;
				}

				.icf-llm-setting-options-list::-webkit-scrollbar-thumb {
					background: var(--background-modifier-border);
					border-radius: 2px;
				}

				.icf-llm-setting-options-list::-webkit-scrollbar-thumb:hover {
					background: var(--text-muted);
				}

				/* 响应式设计 */
				@media (max-width: 768px) {
					.icf-llm-setting-provider-container,
					.icf-llm-setting-model-container {
						flex-direction: column;
						align-items: flex-start;
						gap: 6px;
					}

					.icf-llm-setting-provider-label,
					.icf-llm-setting-model-label {
						min-width: auto;
					}

					.icf-llm-setting-provider-select,
					.icf-llm-setting-model-trigger {
						width: 100%;
						max-width: none;
					}
				}
			`}</style>
		</div>
	);
};
