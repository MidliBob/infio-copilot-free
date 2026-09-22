// @ts-expect-error
import { type PGliteWithLive } from '@electric-sql/pglite/live'
import { App } from 'obsidian'

import { createAndInitDb, PgliteAssets } from '../pgworker'

import { CommandManager } from './modules/command/command-manager'
import { ConversationManager } from './modules/conversation/conversation-manager'
import { InsightManager } from './modules/insight/insight-manager'
import { VectorManager } from './modules/vector/vector-manager'
import { logger } from '../utils/logger'

/**
 * Loads the PGlite runtime assets (postgres.wasm / postgres.data /
 * vector.tar.gz) shipped next to main.js in the plugin folder.
 * Returns undefined when the files are absent, so the worker can fall back
 * to the CDN mirrors instead.
 */
async function loadLocalPgliteAssets(
	app: App,
	pluginId: string,
): Promise<PgliteAssets | undefined> {
	try {
		const adapter = app.vault.adapter
		const dir = `${app.vault.configDir}/plugins/${pluginId}`
		const paths = {
			wasm: `${dir}/postgres.wasm`,
			data: `${dir}/postgres.data`,
			vector: `${dir}/vector.tar.gz`,
		}
		for (const path of Object.values(paths)) {
			if (!(await adapter.exists(path))) return undefined
		}
		const [wasm, data, vector] = await Promise.all([
			adapter.readBinary(paths.wasm),
			adapter.readBinary(paths.data),
			adapter.readBinary(paths.vector),
		])
		return { wasm, data, vector }
	} catch (error) {
		logger.warn(
			'[icf-copilot] could not read local PGlite assets, falling back to CDN',
			error,
		)
		return undefined
	}
}

export class DBManager {
	private app: App
	private db: PGliteWithLive | null = null
	private vectorManager: VectorManager
	private CommandManager: CommandManager
	private conversationManager: ConversationManager
	private insightManager: InsightManager

	constructor(app: App) {
		this.app = app
	}

	static async create(
		app: App,
		filesystem: string,
		pluginId = 'infio-copilot-free',
	): Promise<DBManager> {
		const dbManager = new DBManager(app)
		const assets = await loadLocalPgliteAssets(app, pluginId)
		dbManager.db = await createAndInitDb(filesystem, assets)

		dbManager.vectorManager = new VectorManager(app, dbManager)
		dbManager.CommandManager = new CommandManager(app, dbManager)
		dbManager.conversationManager = new ConversationManager(app, dbManager)
		dbManager.insightManager = new InsightManager(app, dbManager)

		return dbManager
	}

	getPgClient(): PGliteWithLive | null {
		return this.db
	}

	getVectorManager(): VectorManager {
		return this.vectorManager
	}

	getCommandManager(): CommandManager {
		return this.CommandManager
	}

	getConversationManager(): ConversationManager {
		return this.conversationManager
	}

	getInsightManager(): InsightManager {
		return this.insightManager
	}

	async cleanup() {
		this.db?.close()
		this.db = null
	}
}
