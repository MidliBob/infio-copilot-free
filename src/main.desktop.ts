// @ts-nocheck
import { EditorView } from '@codemirror/view'
// import { PGlite } from '@electric-sql/pglite'
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
import { PreviewView } from './PreviewView'
import CompletionKeyWatcher from "./render-plugin/completion-key-watcher"
import DocumentChangesListener, {
	DocumentChanges,
	getPrefix, getSuffix,
	hasMultipleCursors,
	hasSelection
} from "./render-plugin/document-changes-listener"
import RenderSuggestionPlugin from "./render-plugin/render-surgestion-plugin"
import { InlineSuggestionState } from "./render-plugin/states"
import { InfioSettingTab } from './settings/SettingTab'
import StatusBar from "./status-bar"
import {
	InfioSettings,
	parseInfioSettings,
} from './types/settings'
import { createDataviewManager, DataviewManager } from './utils/dataview'
import { getMentionableBlockData } from './utils/obsidian'
import './utils/path'

type DesktopAugmented = Plugin & {
	metadataCacheUnloadFn: (() => void) | null
	activeLeafChangeUnloadFn: (() => void) | null
	dbManagerInitPromise: Promise<DBManager> | null
	ragEngineInitPromise: Promise<RAGEngine> | null
	transEngineInitPromise: Promise<TransEngine> | null
	mcpHubInitPromise: Promise<McpHub> | null
	settings: InfioSettings
	settingTab: InfioSettingTab
	settingsListeners: ((newSettings: InfioSettings) => void)[]
	initChatProps?: ChatProps
	dbManager: DBManager | null
	mcpHub: McpHub | null
	ragEngine: RAGEngine | null
	transEngine: TransEngine | null
	embeddingManager: EmbeddingManager | null
	inlineEdit: InlineEdit | null
	diffStrategy?: DiffStrategy
	dataviewManager: DataviewManager | null

	// methods (attached below)
	loadSettings: () => Promise<void>
	setSettings: (newSettings: InfioSettings) => Promise<void>
	addSettingsListener: (listener: (newSettings: InfioSettings) => void) => () => void
	openChatView: (openNewChat?: boolean) => Promise<void>
	activateChatView: (chatProps?: ChatProps, openNewChat?: boolean) => Promise<void>
	addSelectionToChat: (editor: Editor, view: MarkdownView) => Promise<void>
	getDbManager: () => Promise<DBManager>
	getMcpHub: () => Promise<McpHub | null>
	getRAGEngine: () => Promise<RAGEngine>
	getTransEngine: () => Promise<TransEngine>
	getEmbeddingManager: () => EmbeddingManager | null
	migrateToJsonStorage: () => Promise<void>
	reloadChatView: () => Promise<void>
}

export async function loadDesktop(base: Plugin) {
	const plugin = base as DesktopAugmented
	// initialize fields
	plugin.metadataCacheUnloadFn = null
	plugin.activeLeafChangeUnloadFn = null
	plugin.dbManagerInitPromise = null
	plugin.ragEngineInitPromise = null
	plugin.transEngineInitPromise = null
	plugin.mcpHubInitPromise = null
	plugin.initChatProps = undefined
	plugin.dbManager = null
	plugin.mcpHub = null
	plugin.ragEngine = null
	plugin.transEngine = null
	plugin.embeddingManager = null
	plugin.inlineEdit = null
	plugin.diffStrategy = undefined
	plugin.dataviewManager = null
	plugin.settingsListeners = []

	// attach methods migrated from original class
	plugin.loadSettings = async function () {
		this.settings = parseInfioSettings(await this.loadData())
		await this.saveData(this.settings)
	}
	plugin.setSettings = async function (newSettings: InfioSettings) {
		this.settings = newSettings
		await this.saveData(newSettings)
		this.ragEngine?.setSettings(newSettings)
		this.transEngine?.setSettings(newSettings)
		this.settingsListeners.forEach((listener) => listener(newSettings))
	}
	plugin.addSettingsListener = function (listener: (ns: InfioSettings) => void) {
		this.settingsListeners.push(listener)
		return () => {
			this.settingsListeners = this.settingsListeners.filter((l) => l !== listener)
		}
	}
	plugin.openChatView = async function (openNewChat = false) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView)
		const editor = view?.editor
		if (!view || !editor) {
			await this.activateChatView(undefined, openNewChat)
			return
		}
		const selectedBlockData = await getMentionableBlockData(editor, view)
		await this.activateChatView({ selectedBlock: selectedBlockData ?? undefined }, openNewChat)
	}
	plugin.activateChatView = async function (chatProps?: ChatProps, openNewChat = false) {
		this.initChatProps = chatProps
		const leaf = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0]
		await (leaf ?? this.app.workspace.getRightLeaf(false))?.setViewState({ type: CHAT_VIEW_TYPE, active: true })
		if (openNewChat && leaf && leaf.view instanceof ChatView) {
			leaf.view.openNewChat(chatProps?.selectedBlock)
		}
		this.app.workspace.revealLeaf(this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0])
	}
	plugin.addSelectionToChat = async function (editor: Editor, view: MarkdownView) {
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
	}
	plugin.getDbManager = async function (): Promise<DBManager> {
		if (this.dbManager) return this.dbManager
		if (!this.dbManagerInitPromise) {
			this.dbManagerInitPromise = (async () => {
				this.dbManager = await DBManager.create(this.app, this.settings.ragOptions.filesystem, this.manifest?.id ?? 'infio-copilot-free')
				return this.dbManager
			})()
		}
		return this.dbManagerInitPromise
	}
	plugin.getMcpHub = async function (): Promise<McpHub | null> {
		if (!this.settings.mcpEnabled) return null
		if (this.mcpHub) return this.mcpHub
		if (!this.mcpHubInitPromise) {
			this.mcpHubInitPromise = (async () => {
				this.mcpHub = new McpHub(this.app, this as unknown as Plugin)
				await this.mcpHub.onload()
				return this.mcpHub
			})()
		}
		return this.mcpHubInitPromise
	}
	plugin.getRAGEngine = async function (): Promise<RAGEngine> {
		if (this.ragEngine) return this.ragEngine
		if (!this.ragEngineInitPromise) {
			this.ragEngineInitPromise = (async () => {
				const dbManager = await this.getDbManager()
				this.ragEngine = new RAGEngine(this.app, this.settings, dbManager, this.embeddingManager)
				return this.ragEngine
			})()
		}
		return this.ragEngineInitPromise
	}
	plugin.getTransEngine = async function (): Promise<TransEngine> {
		if (this.transEngine) return this.transEngine
		if (!this.transEngineInitPromise) {
			this.transEngineInitPromise = (async () => {
				const dbManager = await this.getDbManager()
				this.transEngine = new TransEngine(this.app, this.settings, dbManager, this.embeddingManager)
				return this.transEngine
			})()
		}
		return this.transEngineInitPromise
	}
	plugin.getEmbeddingManager = function (): EmbeddingManager | null {
		return this.embeddingManager
	}
	plugin.migrateToJsonStorage = async function () {
		try {
			const dbManager = await this.getDbManager()
			await migrateToJsonDatabase(this.app, dbManager, async () => {
				await this.reloadChatView()
				console.log('Migration to JSON storage completed successfully')
			})
		} catch (error) {
			console.error('Failed to migrate to JSON storage:', error)
			new Notice(t('notifications.migrationFailed'))
		}
	}
	plugin.reloadChatView = async function () {
		const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)
		if (leaves.length === 0 || !(leaves[0].view instanceof ChatView)) return
		new Notice(t('notifications.reloadingInfio'), 1000)
		leaves[0].detach()
		await this.activateChatView()
	}

	// ==== Original onload body starts here (adapted) ====
	await plugin.loadSettings()

	window.setTimeout(() => {
		void plugin.migrateToJsonStorage().then(() => { })
	}, 100)

	plugin.settingTab = new InfioSettingTab(plugin.app, plugin as unknown as any)
	plugin.addSettingTab(plugin.settingTab)

	plugin.dataviewManager = createDataviewManager(plugin.app)

	plugin.embeddingManager = new EmbeddingManager()
	console.log('EmbeddingManager initialized')

	plugin.addRibbonIcon('wand-sparkles', t('main.openInfioCopilot'), () => plugin.openChatView())

	plugin.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, plugin as unknown as any))
	plugin.registerView(APPLY_VIEW_TYPE, (leaf) => new ApplyView(leaf))
	plugin.registerView(PREVIEW_VIEW_TYPE, (leaf) => new PreviewView(leaf))
	plugin.registerView(JSON_VIEW_TYPE, (leaf) => new JsonView(leaf, plugin as unknown as any))

	plugin.inlineEdit = new InlineEdit(plugin as unknown as any, plugin.settings);
	plugin.registerMarkdownCodeBlockProcessor("infioedit", (source, el, ctx) => {
		plugin.inlineEdit?.Processor(source, el, ctx);
	});

	const statusBar = StatusBar.fromApp(plugin as unknown as any);
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
		plugin.inlineEdit = new InlineEdit(plugin as unknown as any, newSettings);
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
			eventListener.handleAcceptKeyPressed.bind(eventListener) as () => boolean,
			eventListener.handlePartialAcceptKeyPressed.bind(eventListener) as () => boolean,
			eventListener.handleCancelKeyPressed.bind(eventListener) as () => boolean,
		),
		DocumentChangesListener(
			eventListener.handleDocumentChange.bind(eventListener) as (documentChange: DocumentChanges) => Promise<void>
		),
		RenderSuggestionPlugin(),
	]);

	plugin.app.workspace.onLayoutReady(() => {
		const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			// @ts-expect-error, not typed
			const editorView = view.editor.cm as EditorView;
			eventListener.onViewUpdate(editorView);
		}
	});

	plugin.registerEvent(
		plugin.app.workspace.on("active-leaf-change", (leaf) => {
			if (leaf?.view instanceof MarkdownView) {
				// @ts-expect-error, not typed
				const editorView = leaf.view.editor.cm as EditorView;
				eventListener.onViewUpdate(editorView);
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

	plugin.addCommand({
		id: 'rebuild-vault-index',
		name: t('main.rebuildVaultIndex'),
		callback: async () => {
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
			} catch (error) {
				console.error(error)
				notice.setMessage(t('notifications.rebuildFailed'))
			} finally {
				window.setTimeout(() => { notice.hide() }, 1000)
			}
		},
	})

	plugin.addCommand({
		id: 'update-vault-index',
		name: t('main.updateVaultIndex'),
		callback: async () => {
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
			} catch (error) {
				console.error(error)
				notice.setMessage(t('notifications.updateFailed'))
			} finally {
				window.setTimeout(() => { notice.hide() }, 1000)
			}
		},
	})

	plugin.addCommand({
		id: 'autocomplete-accept',
		name: t('main.autocompleteAccept'),
		editorCheckCallback: (
			checking: boolean,
			editor: Editor,
			view: MarkdownView
		) => {
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
		editorCheckCallback: (
			checking: boolean,
			editor: Editor,
			view: MarkdownView
		) => {
			// @ts-expect-error, not typed
			const editorView = editor.cm as EditorView;
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
			console.log('开始测试 Dataview...');
			if (!plugin.dataviewManager) { new Notice(t('notifications.dataviewNotInitialized')); return; }
			if (!plugin.dataviewManager.isDataviewAvailable()) {
				new Notice(t('notifications.dataviewNotInstalled'));
				console.log('Dataview API 不可用');
				return;
			}
			console.log('Dataview API 可用，执行简单查询...');
			try {
				const result = await plugin.dataviewManager.executeQuery('LIST FROM ""');
				if (result.success) {
					new Notice(t('notifications.dataviewQuerySuccess'));
				} else {
					new Notice(t('notifications.dataviewQueryFailed', { error: result.error }));
					console.error('查询错误:', result.error);
				}
			} catch (error) {
				console.error('执行测试查询失败:', error);
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
				console.log('本地嵌入测试结果:', result);
				const modal = new Modal(plugin.app);
				modal.titleEl.setText(t('notifications.embeddingTestTitle'));
				modal.contentEl.createEl('pre', { text: resultMessage });
				modal.open();
			} catch (error) {
				console.error('嵌入测试失败:', error);
				new Notice(t('notifications.embeddingTestFailed', { error: error.message }), 5000);
			}
		},
	});
}

export function unloadDesktop(base: Plugin) {
	const plugin = base as DesktopAugmented
	plugin.dbManagerInitPromise = null
	plugin.ragEngineInitPromise = null
	plugin.transEngineInitPromise = null
	plugin.mcpHubInitPromise = null
	plugin.ragEngine?.cleanup()
	plugin.ragEngine = null
	plugin.transEngine?.cleanup()
	plugin.transEngine = null
	void plugin.dbManager?.cleanup()
	plugin.dbManager = null
	void plugin.mcpHub?.dispose()
	plugin.mcpHub = null
	plugin.embeddingManager?.terminate()
	plugin.embeddingManager = null
	plugin.dataviewManager = null
}


