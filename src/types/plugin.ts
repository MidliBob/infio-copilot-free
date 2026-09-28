import type { Plugin } from 'obsidian'

import type { ChatProps } from '../components/chat-view/ChatView'
import type { DiffStrategy } from '../core/diff/DiffStrategy'
import type { McpHub } from '../core/mcp/McpHub'
import type { RAGEngine } from '../core/rag/rag-engine'
import type { TransEngine } from '../core/transformations/trans-engine'
import type { DBManager } from '../database/database-manager'
import type { DataviewManager } from '../utils/dataview'
import type { InfioSettings } from './settings'

/**
 * Structural view of the members that `main.desktop.ts` installs onto the
 * bare Obsidian `Plugin` instance at load time.
 *
 * UI consumers (views, settings tab) must depend on this shape instead of the
 * concrete `InfioPlugin` class from `main.ts`: the class declares an async
 * `onload()` override, which makes the class type unassignable from `Plugin`
 * and used to force `as unknown as any` casts at every construction site.
 *
 * All imports here are type-only, so this module never contributes to runtime
 * import cycles.
 */
export type InfioPluginMembers = {
	settings: InfioSettings
	setSettings: (newSettings: InfioSettings) => Promise<void>
	addSettingsListener: (listener: (newSettings: InfioSettings) => void) => () => void
	initChatProps?: ChatProps
	diffStrategy?: DiffStrategy
	dataviewManager: DataviewManager | null
	getDbManager: () => Promise<DBManager>
	getMcpHub: () => Promise<McpHub | null>
	getRAGEngine: () => Promise<RAGEngine>
	getTransEngine: () => Promise<TransEngine>
}

/** A `Plugin` instance augmented with the Infio members (desktop build). */
export type InfioPluginLike = Plugin & InfioPluginMembers
