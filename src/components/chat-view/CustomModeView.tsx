import { ChevronDown, ChevronRight, Plus, Trash2, Undo2 } from 'lucide-react';
import { getLanguage } from 'obsidian';
import React, { useEffect, useMemo, useState } from 'react';

import { PREVIEW_VIEW_TYPE } from '../../constants';
import { useApp } from '../../contexts/AppContext';
import { useDiffStrategy } from '../../contexts/DiffStrategyContext';
import { useRAG } from '../../contexts/RAGContext';
import { useSettings } from '../../contexts/SettingsContext';
import { CustomMode, GroupEntry, ToolGroup } from '../../database/json/custom-mode/types';
import { useCustomModes } from '../../hooks/use-custom-mode';
import { t } from '../../lang/helpers';
import { PreviewView, PreviewViewState } from '../../PreviewView';
import { defaultModes as buildinModes } from '../../utils/modes';
import { openOrCreateMarkdownFile } from '../../utils/obsidian';
import { PromptGenerator, getFullLanguageName } from '../../utils/prompt-generator';

const CustomModeView = () => {
	const app = useApp()

	const {
		createCustomMode,
		deleteCustomMode,
		updateCustomMode,
		customModeList,
		customModePrompts
	} = useCustomModes()
	const { settings } = useSettings()
	const { getRAGEngine } = useRAG()
	const diffStrategy = useDiffStrategy()

	const promptGenerator = useMemo(() => {
		// @ts-expect-error PromptGenerator constructor parameter types need to be reviewed
		return new PromptGenerator(getRAGEngine, app, settings, diffStrategy, customModePrompts, customModeList)
	}, [app, settings, diffStrategy, customModePrompts, customModeList])

	// Currently selected mode
	const [selectedMode, setSelectedMode] = useState<string>('ask')
	const [isBuiltinMode, setIsBuiltinMode] = useState<boolean>(true)
	const [isAdvancedCollapsed, setIsAdvancedCollapsed] = useState(true);

	const isNewMode = React.useMemo(() => selectedMode === "add_new_mode", [selectedMode])

	// New mode configuration
	const [newMode, setNewMode] = useState<CustomMode>({
		id: '',
		slug: '',
		name: '',
		roleDefinition: '',
		customInstructions: '',
		groups: [],
		source: 'global',
		updatedAt: 0,
	})

	// Custom mode ID
	const [customModeId, setCustomModeId] = useState<string>('')

	// Mode name
	const [modeName, setModeName] = useState<string>('')

	// Role definition
	const [roleDefinition, setRoleDefinition] = useState<string>('')

	// Selected tool groups
	const [selectedTools, setSelectedTools] = useState<GroupEntry[]>([]);

	// Custom instructions
	const [customInstructions, setCustomInstructions] = useState<string>('')

	// Update form data when mode changes
	useEffect(() => {
		//  new mode
		if (isNewMode) {
			setIsBuiltinMode(false);
			setModeName(newMode.name);
			setRoleDefinition(newMode.roleDefinition);
			setCustomInstructions(newMode.customInstructions || '');
			setSelectedTools(newMode.groups);
			setCustomModeId('');
			return;
		}

		const builtinMode = buildinModes.find(m => m.slug === selectedMode);
		if (builtinMode) {
			setIsBuiltinMode(true);
			setModeName(builtinMode.slug);
			setRoleDefinition(builtinMode.roleDefinition);
			setCustomInstructions(builtinMode.customInstructions || '');
			setSelectedTools(builtinMode.groups as GroupEntry[]);
			setCustomModeId(''); // Built-in modes don't have custom IDs
		} else {
			setIsBuiltinMode(false);
			const customMode = customModeList.find(m => m.slug === selectedMode);
			if (customMode) {
				setCustomModeId(customMode.id || '');
				setModeName(customMode.name);
				setRoleDefinition(customMode.roleDefinition);
				setCustomInstructions(customMode.customInstructions || '');
				setSelectedTools(customMode.groups);
			} else {
				console.error("custom mode not found")
			}
		}
	}, [selectedMode, customModeList]);


	// Handle tool group selection change
	const handleToolChange = React.useCallback((tool: ToolGroup) => {
		if (isNewMode) {
			setNewMode((prev) => ({
				...prev,
				groups: prev.groups.includes(tool) ? prev.groups.filter(t => t !== tool) : [...prev.groups, tool]
			}))
		}
		setSelectedTools(prev => {
			if (prev.includes(tool)) {
				return prev.filter(t => t !== tool);
			} else {
				return [...prev, tool];
			}
		});
	}, [isNewMode])

	// Update mode configuration
	const handleUpdateMode = React.useCallback(async () => {
		if (!isBuiltinMode) {
			await updateCustomMode(
				customModeId,
				modeName,
				roleDefinition,
				customInstructions,
				selectedTools
			);
		}
	}, [isBuiltinMode, customModeId, modeName, roleDefinition, customInstructions, selectedTools])

	// Create new mode
	const createNewMode = React.useCallback(async () => {
		if (!isNewMode) return;
		await createCustomMode(
			modeName,
			roleDefinition,
			customInstructions,
			selectedTools
		);
		// reset
		setNewMode({
			id: '',
			slug: '',
			name: '',
			roleDefinition: '',
			customInstructions: '',
			groups: [],
			source: 'global',
			updatedAt: 0,
		})
		setSelectedMode("add_new_mode")
	}, [isNewMode, modeName, roleDefinition, customInstructions, selectedTools])

	// Delete mode
	const deleteMode = React.useCallback(async () => {
		if (isNewMode || isBuiltinMode) return;
		await deleteCustomMode(customModeId);
		setModeName('')
		setRoleDefinition('')
		setCustomInstructions('')
		setSelectedTools([])
		setSelectedMode('add_new_mode')
	}, [isNewMode, isBuiltinMode, customModeId])

	return (
		<div className="icf-custom-modes-container">
			{/* Mode configuration title and buttons */}
			<div className="icf-custom-modes-header">
				<div className="icf-custom-modes-title">
					<h2>{t('prompt.title')}</h2>
				</div>
				{/* <div className="icf-custom-modes-actions">
					<button className="icf-custom-modes-btn">
						<PlusCircle size={18} />
					</button>
					<button className="icf-custom-modes-btn">
						<Settings size={18} />
					</button>
				</div> */}
			</div>

			{/* Create mode tip */}
			<div className="icf-custom-modes-tip">
				{t('prompt.description')}
			</div>

			{/* Mode selection area */}
			<div className="icf-custom-modes-builtin">
				{[...buildinModes, ...customModeList].map(mode => (
					<button
						key={mode.slug}
						className={`icf-mode-btn ${selectedMode === mode.slug ? 'active' : ''}`}
						onClick={() => { setSelectedMode(mode.slug) }}
					>
						{mode.name}
					</button>
				))}
				<button
					key={"add_new_mode"}
					className={`icf-mode-btn ${selectedMode === "add_new_mode" ? 'active' : ''}`}
					onClick={() => setSelectedMode("add_new_mode")}
				>
					<Plus size={18} />
				</button>
			</div>

			{/* Mode name */}
			<div className="icf-custom-modes-section">
				<div className="icf-section-header">
					<h3>{t('prompt.modeName')}</h3>
					{!isBuiltinMode && !isNewMode && (
						<button className="icf-section-btn" onClick={deleteMode}>
							<Trash2 size={16} />
						</button>
					)}
				</div>
				{
					isBuiltinMode ? (
						<p className="icf-section-subtitle">{t('prompt.builtinModeNameWarning')}</p>
					) : (
						<p className="icf-section-subtitle">
							{t('prompt.modeNameRequirements')}
						</p>
					)
				}
				<input
					type="text"
					value={modeName}
					onChange={(e) => {
						if (isNewMode) {
							setNewMode((prev) => ({ ...prev, name: e.target.value }))
						}
						setModeName(e.target.value)
					}}
					className="icf-custom-modes-input"
					placeholder={t('prompt.modeNamePlaceholder')}
					disabled={isBuiltinMode}
				/>
			</div>

			{/* Role definition */}
			<div className="icf-custom-modes-section">
				<div className="icf-section-header">
					<h3>{t('prompt.roleDefinition')}</h3>
					{isBuiltinMode && (
						<button className="icf-section-btn">
							<Undo2 size={16} />
						</button>
					)}
				</div>
				<p className="icf-section-subtitle">{t('prompt.roleDefinitionDescription')}</p>
				<textarea
					className="icf-custom-textarea"
					value={roleDefinition}
					onChange={(e) => {
						if (isNewMode) {
							setNewMode((prev) => ({ ...prev, roleDefinition: e.target.value }))
						}
						setRoleDefinition(e.target.value)
					}}
					placeholder={t('prompt.roleDefinitionPlaceholder')}
				/>
			</div>

			{/* Available features */}
			<div className="icf-custom-modes-section">
				<div className="icf-section-header">
					<h3>{t('prompt.availableFeatures')}</h3>
					{/* {!isBuiltinMode && (
					<button className="icf-section-btn">
						<Undo2 size={16} />
						</button>
					)} */}
				</div>
				{
					isBuiltinMode && (
						<p className="icf-section-subtitle">{t('prompt.builtinFeaturesWarning')}</p>
					)
				}
				<div className="icf-tools-list">
					<div className="icf-tool-item">
						<label>
							<input
								type="checkbox"
								disabled={isBuiltinMode}
								checked={selectedTools.includes('read')}
								onChange={() => handleToolChange('read')}
							/>
							{t('prompt.readFiles')}
						</label>
					</div>
					<div className="icf-tool-item">
						<label>
							<input
								type="checkbox"
								disabled={isBuiltinMode}
								checked={selectedTools.includes('edit')}
								onChange={() => handleToolChange('edit')}
							/>
							{t('prompt.editFiles')}
						</label>
					</div>
					<div className="icf-tool-item">
						<label>
							<input
								type="checkbox"
								disabled={isBuiltinMode}
								checked={selectedTools.includes('research')}
								onChange={() => handleToolChange('research')}
							/>
							{t('prompt.webSearch')}
						</label>
					</div>
				</div>
			</div>

			{/* Mode-specific rules */}
			<div className="icf-custom-modes-section">
				<div className="icf-section-header">
					<h3>{t('prompt.modeSpecificRules')}</h3>
					{isBuiltinMode && (
						<button className="icf-section-btn">
							<Undo2 size={16} />
						</button>
					)}
				</div>
				<p className="icf-section-subtitle">{t('prompt.modeSpecificRulesDescription')}</p>
				<textarea
					className="icf-custom-textarea"
					value={customInstructions}
					onChange={(e) => {
						if (isNewMode) {
							setNewMode((prev) => ({ ...prev, customInstructions: e.target.value }))
						}
						setCustomInstructions(e.target.value)
					}}
					placeholder={t('prompt.modeSpecificRulesPlaceholder')}
				/>
				<p className="icf-section-footer">
					{t('prompt.supportReadingConfig')}<a href="#" className="icf-link" onClick={() => openOrCreateMarkdownFile(app, `_infio_prompts/${modeName}/rules.md`, 0)}>_infio_prompts/{modeName}/rules</a> {t('prompt.file')}
				</p>
			</div>

			{/* Advanced, override system prompt */}
			<div className="icf-custom-modes-section">
				<div
					className="icf-section-header icf-section-header-collapsible"
					onClick={() => setIsAdvancedCollapsed(!isAdvancedCollapsed)}
				>
					<div className="icf-section-header-title-container">
						{isAdvancedCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
						<h6 className="icf-section-header-title">{t('prompt.overrideSystemPrompt')}</h6>
					</div>
				</div>
				{!isAdvancedCollapsed && (
					<>
						<p className="icf-section-subtitle">
							{t('prompt.overrideDescription')}
							<a href="#" className="icf-link" onClick={() => openOrCreateMarkdownFile(app, `_infio_prompts/${modeName}/system_prompt.md`, 0)}>_infio_prompts/{modeName}/system_prompt</a>
							{t('prompt.overrideWarning')}						<button
								className="icf-preview-btn"
								onClick={async () => {
									let filesSearchMethod = settings.filesSearchSettings.method
									if (filesSearchMethod === 'auto' && settings.embeddingModelId && settings.embeddingModelId !== '') {
										filesSearchMethod = 'semantic'
									}

									const userLanguage = getFullLanguageName(getLanguage())
									const systemPrompt = await promptGenerator.getSystemMessageNew(modeName, filesSearchMethod, userLanguage)
									const existingLeaf = app.workspace
										.getLeavesOfType(PREVIEW_VIEW_TYPE)
										.find(
											(leaf) =>
												leaf.view instanceof PreviewView && leaf.view.state.title === `${modeName} system prompt`
										)
									if (existingLeaf) {
										app.workspace.setActiveLeaf(existingLeaf, { focus: true })
									} else {
										app.workspace.getLeaf(true).setViewState({
											type: PREVIEW_VIEW_TYPE,
											active: true,
											state: {
												content: typeof systemPrompt.content === 'string' ? systemPrompt.content : '',
												title: `${modeName} system prompt`,
											} satisfies PreviewViewState,
										})
									}
								}
								}
							>
								{t('prompt.previewSystemPrompt')}
							</button>
						</p></>
				)}
			</div>

			{/* Save */}
			<div className="icf-custom-modes-actions">
				<button
					className="icf-preview-btn"
					onClick={() => {
						if (isNewMode) {
							createNewMode()
						} else {
							handleUpdateMode()
						}
					}}
				>
					{t('prompt.save')}
				</button>
			</div>

			{/* Styles */}
			<style>
				{`
				.icf-custom-modes-container {
					display: flex;
					flex-direction: column;
					padding: 16px;
					gap: 16px;
  				color: var(--text-normal);
					height: 100%;
					overflow-y: auto;
				}

				.icf-custom-modes-input {
				  background-color: var(--background-primary) !important;
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					color: var(--text-normal);
					padding: var(--size-4-2);
					font-size: var(--font-ui-small);
					width: 100%;
					box-sizing: border-box;
					margin-bottom: var(--size-4-2);
				}
				
				.icf-custom-modes-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
				}
				
				.icf-custom-modes-title h2 {
					margin: 0;
					font-size: 24px;
				}
				
				.icf-custom-modes-actions {
					display: flex;
					gap: 8px;
				}
				
				.icf-custom-modes-btn {
					display: flex;
					align-items: center;
					justify-content: center;
					background: transparent;
					border: 1px solid #444;
					color: var(--text-normal)
					border-radius: 4px;
					padding: 6px;
					cursor: pointer;
				}
				
				.icf-custom-modes-tip {
					color: #888;
					font-size: 14px;
					margin-bottom: 8px;
				}
				
				.icf-custom-modes-builtin {
					display: flex;
					flex-wrap: wrap;
					gap: 10px;
					margin-bottom: 10px;
				}
				
				.icf-mode-btn {
					display: flex;
					align-items: center;
					justify-content: center;
					gap: var(--size-2-2);
					background-color: var(--interactive-accent);
					color: var(--text-on-accent);
					border: none;
					border-radius: var(--radius-s);
					padding: var(--size-2-3) var(--size-4-3);
					cursor: pointer;
					font-size: var(--font-ui-small);
					align-self: flex-start;
					margin-top: var(--size-4-2);
				}
				
				.icf-mode-btn.active {
					background-color: var(--text-accent);
				}
				
				.icf-custom-modes-custom {
					display: flex;
					flex-wrap: wrap;
					gap: 10px;
					margin-bottom: 16px;
				}
				
				.icf-mode-btn-custom {
					background-color: transparent;
					border: 1px solid #444;
					border-radius: 4px;
					padding: 6px 12px;
					color: #888;
					cursor: pointer;
					font-size: 14px;
				}
				
				.icf-mode-btn-custom.active {
					background-color: var(--text-accent);
					border-color: var(--text-accent);
					color: var(--text-normal);
				}
				
				.icf-custom-modes-section {
					margin-bottom: 16px;
				}
				
				.icf-section-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 4px;
				}
				
				.icf-section-header h3 {
					margin: 0;
					font-size: 16px;
				}
				
				.icf-section-btn {
					display: flex;
					align-items: center;
					justify-content: center;
					background-color: transparent !important;
					border: none !important;
					box-shadow: none !important;
					color: var(--text-muted);
					padding: 0 !important;
					margin: 0 !important;
					width: 24px !important;
					height: 24px !important;

					&:hover {
						background-color: var(--background-modifier-hover) !important;
					}
				}
				
				.icf-section-subtitle {
					color: #888;
					font-size: 14px;
					margin: 4px 0 12px;
				}
				
				.icf-custom-textarea {
					background-color: var(--background-primary) !important;
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					color: var(--text-normal);
					padding: var(--size-4-2);
					font-size: var(--font-ui-small);
					width: 100%;
					min-height: 160px;
					resize: vertical;
					box-sizing: border-box;
				}
				
				.icf-select {
					width: 100%;
					border: 1px solid #444;
					border-radius: 4px;
					color: var(--text-normal);
					padding: 8px 12px;
					margin-bottom: 8px;
				}
				
				.icf-tools-list {
					display: flex;
					flex-direction: column;
					gap: 10px;
				}
				
				.icf-tool-item {
					display: flex;
					align-items: center;
				}
				
				.icf-tool-item label {
					display: flex;
					align-items: center;
					gap: 8px;
					cursor: pointer;
				}
				
				.icf-code-section {
					border: 1px solid #444;
					border-radius: 4px;
					padding: 8px;
					margin-bottom: 12px;
				}
				
				.icf-code-header {
					display: flex;
					align-items: center;
					gap: 8px;
					margin-bottom: 8px;
					color: #888;
				}
				
				.icf-section-footer {
					margin-top: 0px;
					font-size: 14px;
					color: #888;
				}
				
				.icf-link {
					color: var(--text-accent);
					text-decoration: none;
				}
				
				.icf-preview-btn {
					border: 1px solid #444;
					color: var(--text-normal);
					padding: 8px 16px;
					border-radius: 4px;
					cursor: pointer;
					display: flex;
					align-items: center;
					justify-content: center;
					width: fit-content;
				}

				.icf-section-header-collapsible {
					cursor: pointer;
					user-select: none;
				}

				.icf-section-header-title-container {
					display: flex;
					align-items: center;
					gap: 4px;
				}

				.icf-section-header-title {
					margin: 0;
				}
				`}
			</style>
		</div>
	)
}

export default CustomModeView
