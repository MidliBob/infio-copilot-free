import { Editor, MarkdownView, Modal, Notice, Plugin, TFile } from 'obsidian'

import { ApplyView } from './ApplyView'
import { ChatView } from './ChatView'
import { ChatProps } from './components/chat-view/ChatView'
import { APPLY_VIEW_TYPE, CHAT_VIEW_TYPE, JSON_VIEW_TYPE, PREVIEW_VIEW_TYPE } from './constants'
import { getDiffStrategy } from "./core/diff/DiffStrategy"
import { InlineEdit } from './core/edit/inline-edit-processor'
import { McpHub } from './core/mcp/McpHub'
import { RAGEngine } from './core/rag/rag-engine'
import { TransEngine } from './core/transformations/trans-engine'
import { DBManager } from './database/database-manager'
import { migrateToJsonDatabase } from './database/json/migrateToJsonDatabase'
import { EmbeddingManager } from './embedworker/EmbeddingManager'
import EventListener from "./event-listener"
import JsonView from './JsonFileView'
import { t } from './lang/helpers'
import { extractErrorMessage, retryAction, showErrorNotice } from './utils/error-notice'
import { logger, setDebugEnabled } from './utils/logger'
import { PreviewView } from './PreviewView'
import CompletionKeyWatcher from "./render-plugin/completion-key-watcher"
import DocumentChangesListener, {
	getPrefix, getSuffix,
	hasMultipleCursors,
	hasSelection
} from "./render-plugin/document-changes-listener"
import RenderSuggestionPlugin from "./render-plugin/render-surgestion-plugin"
import { InlineSuggestionState } from "./render-plugin/states"
import { InfioSettingTab } from './settings/SettingTab'
import StatusBar from "./status-bar"
import { InfioPluginMembers } from './types/plugin'
import {
	InfioSettings,
	parseInfioSettings,
} from './types/settings'
import { createDataviewManager } from './utils/dataview'
import { getEditorView, getMentionableBlockData } from './utils/obsidian'
import './utils/path'

/** Members the desktop bootstrap installs on top of `InfioPluginMembers`. */
type DesktopExtraMembers = {
	settingsListeners: ((newSettings: InfioSettings) => void)[]
	dbManagerInitPromise: Promise<DBManager> | null
	ragEngineInitPromise: Promise<RAGEngine> | null
	transEngineInitPromise: Promise<TransEngine> | null
	mcpHubInitPromise: Promise<McpHub> | null
	dbManager: DBManager | null
	mcpHub: McpHub | null
	ragEngine: RAGEngine | null
	transEngine: TransEngine | null
	embeddingManager: EmbeddingManager | null
	inlineEdit: InlineEdit | null
	openChatView: (openNewChat?: boolean) => Promise<void>
	activateChatView: (chatProps?: ChatProps, openNewChat?: boolean) => Promise<void>
	addSelectionToChat: (editor: Editor, view: MarkdownView) => Promise<void>
	migrateToJsonStorage: () => Promise<void>
	reloadChatView: () => Promise<void>
}

type DesktopAugmentedMembers = InfioPluginMembers & DesktopExtraMembers

/** The bare Obsidian plugin instance plus everything `loadDesktop` installs. */
type DesktopAugmented = Plugin & DesktopAugmentedMembers

/** Runtime check used by `unloadDesktop` to avoid a blind type assertion. */
function isDesktopAugmented(plugin: Plugin): plugin is DesktopAugmented {
	return 'settingsListeners' in plugin && 'getRAGEngine' in plugin
}

export async function loadDesktop(base: Plugin) {
	// Settings are loaded first so the members object below can carry them
	// from the start (same sequence the old `plugin.loadSettings()` boot call
	// performed: parse -> debug flag -> persist normalized settings).
	const storedData: unknown = await base.loadData()
	const initialSettings = parseInfioSettings(storedData)
	setDebugEnabled(initialSettings.debugMode)
	await base.saveData(initialSettings)

	// `Object.assign` gives the augmented plugin its type without a single
	// `as` assertion, and `ThisType` types `this` inside every method.
	const members: DesktopAugmentedMembers & ThisType<DesktopAugmented> = {
		settings: initialSettings,
		settingsListeners: [],
		initChatProps: undefined,
		diffStrategy: undefined,
		dataviewManager: null,
		dbManager: null,
		mcpHub: null,
		ragEngine: null,
		transEngine: null,
		embeddingManager: null,
		inlineEdit: null,
		dbManagerInitPromise: null,
		ragEngineInitPromise: null,
		transEngineInitPromise: null,
		mcpHubInitPromise: null,

		async setSettings(newSettings) {
			this.settings = newSettings
			setDebugEnabled(newSettings.debugMode)
			await this.saveData(newSettings)
			this.ragEngine?.setSettings(newSettings)
			this.transEngine?.setSettings(newSettings)
			this.settingsListeners.forEach((listener) => listener(newSettings))
		},
		addSettingsListener(listener) {
			this.settingsListeners.push(listener)
			return () => {
				this.settingsListeners = this.settingsListeners.filter((l) => l !== listener)
			}
		},
		async openChatView(openNewChat = false) {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView)
			const editor = view?.editor
			if (!view || !editor) {
				await this.activateChatView(undefined, openNewChat)
				return
			}
			const selectedBlockData = await getMentionableBlockData(editor, view)
			await this.activateChatView({ selectedBlock: selectedBlockData ?? undefined }, openNewChat)
		},
		async activateChatView(chatProps, openNewChat = false) {
			this.initChatProps = chatProps
			const leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]
			await (leaf ?? this.app.workspace.getRightLeaf(false))?.setViewState({ type: CHAT_VIEW_TYPE, active: true })
			if (openNewChat && leaf && leaf.view instanceof ChatView) {
				leaf.view.openNewChat(chatProps?.selectedBlock)
			}
			this.app.workspace.revealLeaf(this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0])
		},
		async addSelectionToChat(editor, view) {
			const data = await getMentionableBlockData(editor, view)
			if (!data) return
			const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
			if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) {
				await this.activateChatView({ selectedBlock: data })
				return
			}
			await this.app.workspace.revealLeaf(leaves[0])
			const chatView = leaves[0].view
			chatView.addSelectionToChat(data)
			chatView.focusMessage()
		},
		async getDbManager() {
			if (this.dbManager) return this.dbManager
			if (!this.dbManagerInitPromise) {
				this.dbManagerInitPromise = (async () => {
					this.dbManager = await DBManager.create(this.app, this.settings.ragOptions.filesystem, this.manifest?.id ?? 'infio-copilot-free')
					return this.dbManager
				})()
			}
			return this.dbManagerInitPromise
		},
		async getMcpHub() {
			if (!this.settings.mcpEnabled) return null
			if (this.mcpHub) return this.mcpHub
			if (!this.mcpHubInitPromise) {
				this.mcpHubInitPromise = (async () => {
					this.mcpHub = new McpHub(this.app, this)
					await this.mcpHub.onload()
					return this.mcpHub
				})()
			}
			return this.mcpHubInitPromise
		},
		async getRAGEngine() {
			if (this.ragEngine) return this.ragEngine
			if (!this.ragEngineInitPromise) {
				this.ragEngineInitPromise = (async () => {
					const dbManager = await this.getDbManager()
					this.ragEngine = new RAGEngine(this.app, this.settings, dbManager, this.embeddingManager)
					return this.ragEngine
				})()
			}
			return this.ragEngineInitPromise
		},
		async getTransEngine() {
			if (this.transEngine) return this.transEngine
			if (!this.transEngineInitPromise) {
				this.transEngineInitPromise = (async () => {
					const dbManager = await this.getDbManager()
					this.transEngine = new TransEngine(this.app, this.settings, dbManager, this.embeddingManager)
					return this.transEngine
				})()
			}
			return this.transEngineInitPromise
		},
		async migrateToJsonStorage() {
			try {
				const dbManager = await this.getDbManager()
				await migrateToJsonDatabase(this.app, dbManager, async () => {
					await this.reloadChatView()
					logger.debug('Migration to JSON storage completed successfully')
				})
			} catch (error: unknown) {
				showErrorNotice({
					title: t('notifications.migrationFailed'),
					error,
					logMessage: 'Failed to migrate to JSON storage:',
				})
			}
		},
		async reloadChatView() {
			const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
			if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) return
			new Notice(t('notifications.reloadingInfio'), 1000)
			leaves[0].detach()
			await this.activateChatView()
		},
	}
	const plugin: DesktopAugmented = Object.assign(base, members)

	// ==== Original onload body starts here (adapted) ====
	window.setTimeout(() => {
		void plugin.migrateToJsonStorage().then(() => { })
	}, 100)

	plugin.addSettingTab(new InfioSettingTab(plugin.app, plugin))

	plugin.dataviewManager = createDataviewManager(plugin.app)

	plugin.embeddingManager = new EmbeddingManager()
	logger.debug('EmbeddingManager initialized')

	plugin.addRibbonIcon('wand-sparkles', t('main.openInfioCopilot'), () => plugin.openChatView())

	plugin.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, plugin))
	plugin.registerView(APPLY_VIEW_TYPE, (leaf) => new ApplyView(leaf))
	plugin.registerView(PREVIEW_VIEW_TYPE, (leaf) => new PreviewView(leaf))
	plugin.registerView(JSON_VIEW_TYPE, (leaf) => new JsonView(leaf, plugin))

	plugin.inlineEdit = new InlineEdit(plugin, plugin.settings);
	plugin.registerMarkdownCodeBlockProcessor("infioedit", (source, el, ctx) => {
		plugin.inlineEdit?.Processor(source, el, ctx);
	});

	const statusBar = StatusBar.fromApp(plugin);
	const eventListener = EventListener.fromSettings(
		plugin.settings,
		statusBar,
		plugin.app
	);

	plugin.diffStrategy = getDiffStrategy(
		plugin.settings.chatModelId || "",
		plugin.app,
		plugin.settings.fuzzyMatchThreshold,
		plugin.settings.experimentalDiffStrategy,
		plugin.settings.multiSearchReplaceDiffStrategy,
	)

	plugin.addSettingsListener((newSettings) => {
		plugin.inlineEdit = new InlineEdit(plugin, newSettings);
		eventListener.handleSettingChanged(newSettings)
		plugin.diffStrategy = getDiffStrategy(
			plugin.settings.chatModelId || "",
			plugin.app,
			plugin.settings.fuzzyMatchThreshold,
			plugin.settings.experimentalDiffStrategy,
			plugin.settings.multiSearchReplaceDiffStrategy,
		)
		if (plugin.settings.mcpEnabled && !plugin.mcpHub) {
			void plugin.getMcpHub()
		} else if (!plugin.settings.mcpEnabled && plugin.mcpHub) {
			void plugin.mcpHub.dispose()
			plugin.mcpHub = null
			plugin.mcpHubInitPromise = null
		}
	});

	plugin.registerEditorExtension([
		InlineSuggestionState,
		CompletionKeyWatcher(
			() => eventListener.handleAcceptKeyPressed(),
			() => eventListener.handlePartialAcceptKeyPressed(),
			() => eventListener.handleCancelKeyPressed(),
		),
		DocumentChangesListener(
			(documentChange) => eventListener.handleDocumentChange(documentChange)
		),
		RenderSuggestionPlugin(),
	]);

	plugin.app.workspace.onLayoutReady(() => {
		const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			const editorView = getEditorView(view.editor);
			if (editorView) {
				eventListener.onViewUpdate(editorView);
			}
		}
	});

	plugin.registerEvent(
		plugin.app.workspace.on("active-leaf-change", (leaf) => {
			if (leaf?.view instanceof MarkdownView) {
				const editorView = getEditorView(leaf.view.editor);
				if (editorView) {
					eventListener.onViewUpdate(editorView);
				}
				if (leaf.view.file) {
					eventListener.handleFileChange(leaf.view.file);
				}
			}
		})
	);

	plugin.registerEvent(
		plugin.app.metadataCache.on("changed", (file: TFile) => {
			if (file) {
				eventListener.handleFileChange(file);
				// is not worth it to update the file index on every file change
				// plugin.ragEngine?.updateFileIndex(file);
			}
		})
	);

	plugin.registerEvent(
		plugin.app.metadataCache.on("deleted", (file: TFile) => {
			if (file) {
				void plugin.ragEngine?.deleteFileIndex(file);
			}
		})
	);

	plugin.addCommand({
		id: 'open-new-chat',
		name: t('main.openNewChat'),
		callback: () => plugin.openChatView(true),
	})

	plugin.addCommand({
		id: 'add-selection-to-chat',
		name: t('main.addSelectionToChat'),
		editorCallback: (editor: Editor, view: MarkdownView) => {
			void plugin.addSelectionToChat(editor, view)
		},
	})

	const rebuildVaultIndex = async (): Promise<void> => {
		const notice = new Notice(t('notifications.rebuildingIndex'), 0)
		try {
			const ragEngine = await plugin.getRAGEngine()
			await ragEngine.updateVaultIndex(
				{ reindexAll: true },
				(queryProgress) => {
					if (queryProgress.type === 'indexing') {
						const { completedChunks, totalChunks } =
							queryProgress.indexProgress
						notice.setMessage(
							t('notifications.indexingChunks', { completedChunks, totalChunks }),
						)
					}
				},
			)
			notice.setMessage(t('notifications.rebuildComplete'))
			window.setTimeout(() => { notice.hide() }, 1000)
		} catch (error: unknown) {
			notice.hide()
			showErrorNotice({
				title: t('notifications.rebuildFailed'),
				error,
				logMessage: 'Failed to rebuild vault index:',
				actions: [retryAction(() => { void rebuildVaultIndex() })],
			})
		}
	}

	plugin.addCommand({
		id: 'rebuild-vault-index',
		name: t('main.rebuildVaultIndex'),
		callback: () => {
			void rebuildVaultIndex()
		},
	})

	const updateVaultIndex = async (): Promise<void> => {
		const notice = new Notice(t('notifications.updatingIndex'), 0)
		try {
			const ragEngine = await plugin.getRAGEngine()
			await ragEngine.updateVaultIndex(
				{ reindexAll: false },
				(queryProgress) => {
					if (queryProgress.type === 'indexing') {
						const { completedChunks, totalChunks } =
							queryProgress.indexProgress
						notice.setMessage(
							t('notifications.indexingChunks', { completedChunks, totalChunks }),
						)
					}
				},
			)
			notice.setMessage(t('notifications.updateComplete'))
			window.setTimeout(() => { notice.hide() }, 1000)
		} catch (error: unknown) {
			notice.hide()
			showErrorNotice({
				title: t('notifications.updateFailed'),
				error,
				logMessage: 'Failed to update vault index:',
				actions: [retryAction(() => { void updateVaultIndex() })],
			})
		}
	}

	plugin.addCommand({
		id: 'update-vault-index',
		name: t('main.updateVaultIndex'),
		callback: () => {
			void updateVaultIndex()
		},
	})

	plugin.addCommand({
		id: 'autocomplete-accept',
		name: t('main.autocompleteAccept'),
		editorCheckCallback: (checking: boolean) => {
			if (checking) {
				return (
					eventListener.isSuggesting()
				);
			}
			eventListener.handleAcceptCommand();
			return true;
		},
	})

	plugin.addCommand({
		id: 'autocomplete-predict',
		name: t('main.autocompletePredict'),
		editorCheckCallback: (checking: boolean, editor: Editor) => {
			const editorView = getEditorView(editor);
			if (!editorView) {
				return false;
			}
			const state = editorView.state;
			if (checking) {
				return eventListener.isIdle() && !hasMultipleCursors(state) && !hasSelection(state);
			}
			const prefix = getPrefix(state)
			const suffix = getSuffix(state)
			eventListener.handlePredictCommand(prefix, suffix);
			return true;
		},
	});

	plugin.addCommand({
		id: "autocomplete-toggle",
		name: t('main.autocompleteToggle'),
		callback: () => {
			const newValue = !plugin.settings.autocompleteEnabled;
			void plugin.setSettings({
				...plugin.settings,
				autocompleteEnabled: newValue,
			})
		},
	});

	plugin.addCommand({
		id: "autocomplete-enable",
		name: t('main.autocompleteEnable'),
		checkCallback: (checking) => {
			if (checking) {
				return !plugin.settings.autocompleteEnabled;
			}
			void plugin.setSettings({
				...plugin.settings,
				autocompleteEnabled: true,
			})
			return true;
		},
	});

	plugin.addCommand({
		id: "autocomplete-disable",
		name: t('main.autocompleteDisable'),
		checkCallback: (checking) => {
			if (checking) {
				return plugin.settings.autocompleteEnabled;
			}
			void plugin.setSettings({
				...plugin.settings,
				autocompleteEnabled: false,
			})
			return true;
		},
	});

	plugin.addCommand({
		id: "ai-inline-edit",
		name: t('main.inlineEditCommand'),
		editorCallback: (editor: Editor) => {
			const selection = editor.getSelection();
			if (!selection) {
				new Notice(t('notifications.selectTextFirst'));
				return;
			}
			const from = editor.getCursor("from");
			const insertPos = { line: from.line, ch: 0 };
			const customBlock = "```infioedit\n```\n";
			editor.replaceRange(customBlock, insertPos);
		},
	});

	plugin.addCommand({
		id: 'test-dataview-simple',
		name: t('main.testDataview'),
		callback: async () => {
			logger.debug('Testing Dataview...');
			if (!plugin.dataviewManager) { new Notice(t('notifications.dataviewNotInitialized')); return; }
			if (!plugin.dataviewManager.isDataviewAvailable()) {
				new Notice(t('notifications.dataviewNotInstalled'));
				logger.debug('Dataview API is not available');
				return;
			}
			logger.debug('Dataview API is available, running a simple query...');
			try {
				const result = await plugin.dataviewManager.executeQuery('LIST FROM ""');
				if (result.success) {
					new Notice(t('notifications.dataviewQuerySuccess'));
				} else {
					new Notice(t('notifications.dataviewQueryFailed', { error: result.error }));
					logger.error('Query error:', result.error);
				}
			} catch (error: unknown) {
				logger.error('Failed to execute the test query:', error);
				new Notice(t('notifications.dataviewQueryError'));
			}
		},
	});

	plugin.addCommand({
		id: 'test-local-embed',
		name: t('main.testLocalEmbeddings'),
		callback: async () => {
			try {
				if (!plugin.embeddingManager) { new Notice(t('notifications.embeddingNotInitialized'), 5000); return; }
				await plugin.embeddingManager.loadModel("Xenova/all-MiniLM-L6-v2", true);
				const testText = "hello world";
				const result = await plugin.embeddingManager.embed(testText);
				const resultMessage = t('notifications.embeddingTestResult', {
					text: testText,
					tokens: result.tokens,
					dims: result.vec.length,
					values: result.vec.slice(0, 4).map(v => v.toFixed(4)).join(', '),
				});
				logger.debug('Local embedding test result:', result);
				const modal = new Modal(plugin.app);
				modal.titleEl.setText(t('notifications.embeddingTestTitle'));
				modal.contentEl.createEl('pre', { text: resultMessage });
				modal.open();
			} catch (error: unknown) {
				logger.error('Embedding test failed:', error);
				new Notice(t('notifications.embeddingTestFailed', { error: extractErrorMessage(error) }), 5000);
			}
		},
	});
}

export function unloadDesktop(base: Plugin) {
	if (!isDesktopAugmented(base)) {
		logger.debug('unloadDesktop: desktop members are not installed, nothing to release')
		return
	}
	base.dbManagerInitPromise = null
	base.ragEngineInitPromise = null
	base.transEngineInitPromise = null
	base.mcpHubInitPromise = null
	base.ragEngine?.cleanup()
	base.ragEngine = null
	base.transEngine?.cleanup()
	base.transEngine = null
	void base.dbManager?.cleanup()
	base.dbManager = null
	void base.mcpHub?.dispose()
	base.mcpHub = null
	base.embeddingManager?.terminate()
	base.embeddingManager = null
	base.dataviewManager = null
}
