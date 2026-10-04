
import * as path from "path";

// SDK / External Libraries
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
	CallToolResultSchema,
	ListResourceTemplatesResultSchema,
	ListResourcesResultSchema,
	ListToolsResultSchema,
	ReadResourceResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import chokidar, { FSWatcher } from "chokidar"; // Keep chokidar
import delay from "delay"; // Keep delay
import deepEqual from "fast-deep-equal"; // Keep fast-deep-equal
import { App, EventRef, Notice, Plugin, TFile, WorkspaceLeaf, normalizePath } from 'obsidian';
import ReconnectingEventSource from "reconnecting-eventsource"; // Keep reconnecting-eventsource
import { EnvironmentVariables, shellEnvSync } from 'shell-env';
import { z } from "zod"; // Keep zod

// Internal/Project imports
import { JSON_VIEW_TYPE } from '../../constants';
import { t } from "../../lang/helpers";
import { injectEnv } from "../../utils/config";
import { ROOT_DIR } from '../prompts/constants';

import {
	McpResource,
	McpResourceResponse,
	McpResourceTemplate,
	McpServer,
	McpTool,
	McpToolCallResponse,
} from "./type";
import {
	McpSettingsSchema,
	ServerConfigSchema,
	getRecordField,
	httpFieldsErrorMessage,
	isRecord,
	missingFieldsErrorMessage,
	mixedFieldsErrorMessage,
	readAlwaysAllowList,
	stdioFieldsErrorMessage,
	typeErrorMessage,
} from "./config-schema";
import { logger } from '../../utils/logger'

export type McpConnection = {
	server: McpServer
	client: Client
	transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport
}


export class McpHub {
	private app: App
	private plugin: Plugin
	private mcpSettingsFilePath: string | null = null
	// private globalMcpFilePath: string | null = null
	private fileWatchers: Map<string, FSWatcher[]> = new Map()
	private configFileChangeTimeout: NodeJS.Timeout | null = null
	private isDisposed: boolean = false
	connections: McpConnection[] = []
	isConnecting: boolean = false
	private refCount: number = 0 // Reference counter for active clients
	private eventRefs: EventRef[] = []; // For managing Obsidian event listeners
	// private providerRef: any; // TODO: Replace with actual type and initialize properly. Removed for now as it causes issues and its usage is unclear in the current scope.
	private shellEnv: EnvironmentVariables

	constructor(app: App, plugin: Plugin) {
		this.app = app
		this.plugin = plugin
		this.shellEnv = shellEnvSync()
		// Placeholder for providerRef initialization - this needs a proper solution if providerRef is essential.
		// if ((this.app as any).plugins?.plugins['obsidian-icf-copilot']) {
		// 	this.providerRef = (this.app as any).plugins.plugins['obsidian-icf-copilot'];
		// }
	}

	public async onload() {
		// Ensure the MCP configuration directory exists
		await this.ensureMcpFileExists()
		await this.watchMcpSettingsFile();
		// this.setupWorkspaceWatcher();
		await this.initializeGlobalMcpServers();
	}

	/**
	 * Registers a client (e.g., ClineProvider) using this hub.
	 * Increments the reference count.
	 */
	public registerClient(): void {
		this.refCount++
	}

	/**
	 * Unregisters a client. Decrements the reference count.
	 * If the count reaches zero, disposes the hub.
	 */
	public async unregisterClient(): Promise<void> {
		this.refCount--
		if (this.refCount <= 0) {
			await this.dispose()
		}
	}

	/**
	 * Validates and normalizes server configuration
	 * @param config The server configuration to validate
	 * @param serverName Optional server name for error messages
	 * @returns The validated configuration
	 * @throws Error if the configuration is invalid
	 */
	private validateServerConfig(config: unknown, serverName?: string): z.infer<typeof ServerConfigSchema> {
		// Type guard instead of an assertion: rejects null, arrays and primitives
		if (!isRecord(config)) {
			throw new Error("Server configuration must be an object.");
		}

		// Detect configuration issues before validation
		const hasStdioFields = config["command"] !== undefined
		const hasHttpFields = config["url"] !== undefined

		// Check for mixed fields
		if (hasStdioFields && hasHttpFields) {
			throw new Error(mixedFieldsErrorMessage)
		}

		const mutableConfig: Record<string, unknown> = { ...config } // Create a mutable copy with proper type

		// Check if it's a stdio or HTTP config and add type if missing.
		// URL-only configs default to Streamable HTTP (MCP spec 2025-03-26);
		// connectToServer retries over legacy SSE if the server refuses it.
		let serverType = mutableConfig["type"]
		if (serverType === undefined) {
			if (hasStdioFields) {
				serverType = "stdio"
			} else if (hasHttpFields) {
				serverType = "streamableHttp"
			} else {
				throw new Error(missingFieldsErrorMessage)
			}
			mutableConfig["type"] = serverType
		}
		if (serverType !== "stdio" && serverType !== "sse" && serverType !== "streamableHttp") {
			throw new Error(typeErrorMessage)
		}

		// Check for type/field mismatch
		if (serverType === "stdio" && !hasStdioFields) {
			throw new Error(stdioFieldsErrorMessage)
		}
		if ((serverType === "sse" || serverType === "streamableHttp") && !hasHttpFields) {
			throw new Error(httpFieldsErrorMessage)
		}

		// Validate the config against the schema
		try {
			return ServerConfigSchema.parse(mutableConfig) // Parse the mutable copy
		} catch (validationError) {
			if (validationError instanceof z.ZodError) {
				// Extract and format validation errors
				const errorMessages = validationError.errors
					.map((err) => `${err.path.join(".")}: ${err.message}`)
					.join("; ")
				throw new Error(
					serverName
						? `Invalid configuration for server "${serverName}": ${errorMessages}`
						: `Invalid server configuration: ${errorMessages}`,
				)
			}
			throw validationError
		}
	}

	/**
	 * Formats and displays error messages to the user
	 * @param message The error message prefix
	 * @param error The error object
	 */
	private showErrorMessage(message: string, error: unknown): void {
		logger.error(`${message}:`, error)
		new Notice(`${message}: ${error instanceof Error ? error.message : String(error)}`);
	}

	public setupWorkspaceWatcher(): void {
		this.eventRefs.push(this.app.vault.on('modify', async (file) => {
			// Adjusted to use the new config file name and path logic
			const configFilePath = await this.getMcpSettingsFilePath();
			if (file instanceof TFile && file.path === configFilePath) {
				await this.handleConfigFileChange(file.path);
			}
		}));
	}

	private async handleConfigFileChange(filePath: string): Promise<void> {
		try {
			const content = await this.app.vault.adapter.read(filePath);
			const config: unknown = JSON.parse(content)
			const result = McpSettingsSchema.safeParse(config)

			if (!result.success) {
				const errorMessages = result.error.errors
					.map((err) => `${err.path.join(".")}: ${err.message}`)
					.join("\n")
				new Notice(String(t("common:errors.invalid_mcp_settings_validation")) + ": " + errorMessages)
				return
			}

			await this.updateServerConnections(result.data.mcpServers || {})
		} catch (error) {
			if (error instanceof SyntaxError) {
				new Notice(String(t("common:errors.invalid_mcp_settings_format")))
			} else {
				this.showErrorMessage(`Failed to process MCP settings change`, error)
			}
		}
	}

	// Removed watchProjectMcpFile, updateProjectMcpServers, cleanupProjectMcpServers, getProjectMcpPath, initializeProjectMcpServers
	// Removed getMcpServersPath as it's unused and problematic with providerRef

	getServers(): McpServer[] {
		// Only return enabled servers
		const standardServers = this.connections.filter((conn) => !conn.server.disabled).map((conn) => conn.server)

		return standardServers
	}

	getAllServers(): McpServer[] {
		// Return all servers regardless of state
		const standardServers = this.connections.map((conn) => conn.server)

		return standardServers
	}

	async ensureMcpFileExists(): Promise<void> {
		// 新的配置目录和文件路径
		const newMcpFolderPath = ROOT_DIR
		const newMcpSettingsFilePath = normalizePath(path.join(newMcpFolderPath, "mcp_settings.json"))
		
		// 老的配置目录和文件路径
		const oldMcpFolderPath = ".infio_json_db/mcp"
		const oldMcpSettingsFilePath = normalizePath(path.join(oldMcpFolderPath, "settings.json"))
		
		// 确保新的配置目录存在
		if (!await this.app.vault.adapter.exists(normalizePath(newMcpFolderPath))) {
			await this.app.vault.createFolder(normalizePath(newMcpFolderPath));
		}
		
		// 设置新的配置文件路径
		this.mcpSettingsFilePath = newMcpSettingsFilePath
		
		// 检查新的配置文件是否存在
		const newFileExists = await this.app.vault.adapter.exists(newMcpSettingsFilePath)
		const oldFileExists = await this.app.vault.adapter.exists(oldMcpSettingsFilePath)
		
		// 处理迁移逻辑
		if (oldFileExists && !newFileExists) {
			// 情况1：只有老配置文件存在，需要迁移
			try {
				const oldConfigContent = await this.app.vault.adapter.read(oldMcpSettingsFilePath)
				logger.debug("Found old MCP configuration file, migrating to new location...")
				
				// 创建新配置文件，使用老配置的内容
				await this.app.vault.create(newMcpSettingsFilePath, oldConfigContent)
				
				// 删除老配置文件
				await this.app.vault.adapter.remove(oldMcpSettingsFilePath)
				logger.debug("Successfully migrated MCP configuration and removed old file")
				
				// 尝试删除老的配置目录（如果为空）
				try {
					const oldFolderContents = await this.app.vault.adapter.list(normalizePath(oldMcpFolderPath))
					if (oldFolderContents.files.length === 0 && oldFolderContents.folders.length === 0) {
						await this.app.vault.adapter.rmdir(normalizePath(oldMcpFolderPath), false)
						logger.debug("Removed empty old MCP configuration directory")
					}
				} catch (error) {
					logger.warn("Could not remove old MCP configuration directory:", error)
				}
			} catch (error) {
				logger.error("Failed to migrate old MCP configuration file:", error)
				// 迁移失败时创建默认配置
				const defaultConfig = JSON.stringify({ mcpServers: {} }, null, 2)
				await this.app.vault.create(newMcpSettingsFilePath, defaultConfig)
			}
		} else if (oldFileExists && newFileExists) {
			// 情况2：两个配置文件都存在，优先保留新配置，删除老配置
			logger.debug("Both old and new MCP configuration files exist. Keeping new file and removing old file.")
			try {
				await this.app.vault.adapter.remove(oldMcpSettingsFilePath)
				logger.debug("Removed old MCP configuration file")
			} catch (error) {
				logger.error("Failed to remove old MCP configuration file:", error)
			}
		} else if (!newFileExists) {
			// 情况3：新配置文件不存在，老配置文件也不存在，创建默认配置
			logger.debug("No MCP configuration file found, creating default configuration...")
			const defaultConfig = JSON.stringify({ mcpServers: {} }, null, 2)
			await this.app.vault.create(newMcpSettingsFilePath, defaultConfig)
		}
		// 情况4：只有新配置文件存在，什么都不做
	}

	async getMcpSettingsFilePath(): Promise<string> {
		return this.mcpSettingsFilePath
	}

	private async watchMcpSettingsFile(): Promise<void> {
		this.eventRefs.push(this.app.vault.on('modify', async (file) => {
			if (file.path === this.mcpSettingsFilePath) {
				await this.handleConfigFileChange(this.mcpSettingsFilePath)
			}
		}));
	}

	/**
	* Opens the MCP settings file in Obsidian
	*/
	async openMcpSettingsFile(): Promise<void> {
		try {
			await this.ensureMcpFileExists();
			const filePath = this.mcpSettingsFilePath;

			logger.debug('Attempting to open MCP settings file:', filePath);

			// Check whether the settings file is already open in a JSON view
			let existingLeaf: WorkspaceLeaf | null = null;
			this.app.workspace.iterateAllLeaves((leaf) => {
				if (leaf.view.getViewType() === JSON_VIEW_TYPE) {
					// Match on the file path stored in the view state
					const viewState: unknown = leaf.view.getState();
					if (isRecord(viewState) && viewState["filePath"] === filePath) {
						existingLeaf = leaf;
					}
				}
			});

			if (existingLeaf) {
				// 如果文件已经打开，重新加载最新内容并激活 leaf
				await existingLeaf.setViewState({
					type: JSON_VIEW_TYPE,
					active: true,
					state: { filePath } // 重新设置状态以触发重新加载
				});
				this.app.workspace.setActiveLeaf(existingLeaf);
				void this.app.workspace.revealLeaf(existingLeaf);
				logger.debug('MCP settings file is already open, reloading content and activating existing view:', filePath);
			} else {
				// 如果文件没有打开，创建新的 leaf
				const leaf = this.app.workspace.getLeaf(true);

				if (leaf) {
					await leaf.setViewState({
						type: JSON_VIEW_TYPE,
						active: true,
						state: { filePath } // 传递文件路径到视图
					});

					void this.app.workspace.revealLeaf(leaf);
					logger.debug('Successfully opened MCP settings file in JSON view:', filePath);
				} else {
					logger.error('Failed to get workspace leaf for JSON view');
				}
			}
		} catch (error) {
			logger.error('Failed to open MCP settings file:', error);
		}
	}

	// Combined and simplified initializeMcpServers, only for global scope
	private async initializeGlobalMcpServers(): Promise<void> {
		try {
			if (!await this.app.vault.adapter.exists(this.mcpSettingsFilePath)) {
				// If config file doesn't exist after trying to create it in getMcpSettingsFilePath,
				// which should create it, then something is wrong.
				// However, getMcpSettingsFilePath should handle creation.
				// This check is more of a safeguard.
				// logger.debug("MCP config file does not exist, skipping initialization.");
				return;
			}

			const content = await this.app.vault.adapter.read(this.mcpSettingsFilePath);
			const config: unknown = JSON.parse(content);
			const result = McpSettingsSchema.safeParse(config);

			if (result.success) {
				await this.updateServerConnections(result.data.mcpServers || {});
			} else {
				const errorMessages = result.error.errors
					.map((err) => `${err.path.join(".")}: ${err.message}`)
					.join("\n");
				logger.error(`Invalid MCP settings format:`, errorMessages);
				new Notice(String(t("common:errors.invalid_mcp_settings_validation")) + ": " + errorMessages);
				// Still try to connect with the raw config for global, but show warnings
				try {
					// Safely handle the unvalidated config: per-server validation
					// happens in updateServerConnections anyway
					const serversToConnect = isRecord(config) ? getRecordField(config, "mcpServers") : undefined;
					await this.updateServerConnections(serversToConnect ?? {});
				} catch (error) {
					this.showErrorMessage(`Failed to initialize MCP servers with raw config`, error);
				}
			}
		} catch (error) {
			if (error instanceof SyntaxError) {
				const errorMessage = t("common:errors.invalid_mcp_settings_syntax");
				logger.error(errorMessage, error);
				new Notice(String(errorMessage));
			} else {
				this.showErrorMessage(`Failed to initialize MCP servers`, error);
			}
		}
	}

	private async connectToServer(
		name: string,
		config: z.infer<typeof ServerConfigSchema>,
		source: "global" | "project" = "global"
	): Promise<void> {
		// Remove existing connection if it exists
		await this.deleteConnection(name)

		try {
			// Each MCP server requires its own transport connection and has unique capabilities, configurations, and error handling. Having separate clients also allows proper scoping                                  of resources/tools and independent server management like reconnection.
			const client = new Client(
				{
					name: "Infio Copilot",
					// Advertise the plugin version from the manifest; the optional
					// chain keeps the dead McpServerManager path (no plugin arg) alive
					version: this.plugin?.manifest?.version ?? "1.0.0",
				},
				{
					capabilities: {},
				},
			)

			let transport: StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport
			// For streamableHttp configs: factory that retries a failed initial
			// connection over legacy HTTP+SSE (the documented MCP compatibility
			// pattern for servers predating the 2025-03-26 transport spec).
			let sseFallback: (() => SSEClientTransport) | null = null

			// Inject environment variables to the config
			let configInjected = { ...config };
			try {
							// injectEnv might return a modified structure, so we re-validate.
			const tempConfigAfterInject = await injectEnv(config);
				const validatedInjectedConfig = ServerConfigSchema.safeParse(tempConfigAfterInject);
				if (validatedInjectedConfig.success) {
					configInjected = validatedInjectedConfig.data;
				} else {
					logger.warn("Failed to validate server config after injecting env vars. Using original config.", validatedInjectedConfig.error);
					configInjected = config; // Fallback to original, already validated config
				}
			} catch (e) {
				logger.warn("Error injecting env vars. Using original config.", e);
				configInjected = config; // Fallback to original config
			}

			if (configInjected.type === "stdio") {
				// Ensure cwd is set, default to plugin's root directory if not provided
				// Obsidian's DataAdapter doesn't have a direct `basePath`.
				// For a general plugin context, `this.app.vault.getRoot().path` gives the vault root.
				// If a path relative to the plugin is needed, it's more complex.
				// For stdio commands, often they are system-wide or expect to be run from a specific project dir.
				// Defaulting to "." (current working directory, typically the vault root when Obsidian runs it) is a safe bet if not specified.
				const cwd = configInjected.cwd || ".";

				transport = new StdioClientTransport({
					command: configInjected.command,
					args: configInjected.args,
					cwd: cwd,
					env: {
						...(configInjected.env || {}),
						...(this.shellEnv.PATH ? { PATH: this.shellEnv.PATH } : {}),
						...(this.shellEnv.HOME ? { HOME: this.shellEnv.HOME } : {}),
					},
					stderr: "pipe",
				})

				// Set up stdio specific error handling
				transport.onerror = this.makeTransportErrorHandler(name, source)

				transport.onclose = () => {
					const connection = this.findConnection(name)
					if (connection) {
						connection.server.status = "disconnected"
					}
					// await this.notifyWebviewOfServerChanges()
				}

				// transport.stderr is only available after the process has been started. However we can't start it separately from the .connect() call because it also starts the transport. And we can't place this after the connect call since we need to capture the stderr stream before the connection is established, in order to capture errors during the connection process.
				// As a workaround, we start the transport ourselves, and then monkey-patch the start method to no-op so that .connect() doesn't try to start it again.
				await transport.start()
				const stderrStream = transport.stderr
				if (stderrStream) {
					stderrStream.on("data", (data: Buffer) => {
						const output = data.toString()
						// Check if output contains INFO level log
						const isInfoLog = /INFO/i.test(output)

						if (isInfoLog) {
							// Log normal informational messages
							logger.debug(`Server "${name}" info:`, output)
						} else {
							// Treat as error log
							logger.error(`Server "${name}" stderr:`, output)
							const connection = this.findConnection(name)
							if (connection) {
								this.appendErrorMessage(connection, output)
								if (connection.server.status === "disconnected") {
									// await this.notifyWebviewOfServerChanges()
								}
							}
						}
					})
				} else {
					logger.error(`No stderr stream for ${name}`)
				}
				transport.start = async () => { } // No-op now, .connect() won't fail
			} else {
				// HTTP-based connection: Streamable HTTP (current MCP transport)
				// or legacy HTTP+SSE (explicit type: "sse")
				const serverUrl = new URL(configInjected.url)
				const headers = configInjected.headers
				const onTransportError = this.makeTransportErrorHandler(name, source)
				if (configInjected.type === "streamableHttp") {
					transport = new StreamableHTTPClientTransport(serverUrl, {
						requestInit: {
							headers,
						},
					})
					transport.onerror = onTransportError
					// Legacy HTTP+SSE servers answer the Streamable HTTP initialize
					// POST with 4xx; that is the documented signal to retry over SSE.
					sseFallback = () => this.createSseTransport(serverUrl, headers, onTransportError)
				} else {
					transport = this.createSseTransport(serverUrl, headers, onTransportError)
				}
			}

			const connection: McpConnection = {
				server: {
					name,
					config: JSON.stringify(configInjected),
					status: "connecting",
					disabled: configInjected.disabled,
					source,
					projectPath: source === "project" ? this.app.vault.getRoot().path : undefined,
					errorHistory: [],
				},
				client,
				transport,
			}
			this.connections.push(connection)

			// Connect (this will automatically start the transport)
			try {
				await client.connect(transport)
			} catch (connectError) {
				if (!sseFallback) {
					throw connectError
				}
				// MCP backwards compatibility: a legacy HTTP+SSE server rejects the
				// Streamable HTTP handshake, so retry the same URL over SSE.
				logger.warn(
					`Streamable HTTP connection to "${name}" failed, falling back to legacy SSE transport:`,
					connectError,
				)
				try {
					await transport.close()
				} catch (closeError) {
					logger.debug(`Ignoring close error of the failed Streamable HTTP transport for "${name}":`, closeError)
				}
				transport = sseFallback()
				connection.transport = transport
				await client.connect(transport)
			}
			connection.server.status = "connected"
			connection.server.error = ""

			// Initial fetch of tools and resources
			connection.server.tools = await this.fetchToolsList(name, source)
			connection.server.resources = await this.fetchResourcesList(name, source)
			connection.server.resourceTemplates = await this.fetchResourceTemplatesList(name, source)
		} catch (error) {
			// Update status with error
			const connection = this.findConnection(name, source)
			if (connection) {
				connection.server.status = "disconnected"
				this.appendErrorMessage(connection, error instanceof Error ? error.message : `${error}`)
			}
			throw error
		}
	}

	/**
	 * Builds the shared transport error handler: marks the connection
	 * disconnected and records the message in the server error history.
	 */
	private makeTransportErrorHandler(name: string, source: "global" | "project"): (error: Error) => void {
		return (error) => {
			logger.error(`Transport error for "${name}":`, error)
			const connection = this.findConnection(name, source)
			if (connection) {
				connection.server.status = "disconnected"
				this.appendErrorMessage(connection, error instanceof Error ? error.message : String(error))
			}
			// await this.notifyWebviewOfServerChanges()
		}
	}

	/**
	 * Creates the legacy HTTP+SSE transport. ReconnectingEventSource keeps the
	 * stream alive across brief network drops; the SDK picks the global
	 * EventSource up when the transport starts. Streamable HTTP does not need
	 * this shim: the SDK parses SSE payloads with its own eventsource-parser.
	 */
	private createSseTransport(
		url: URL,
		headers: Record<string, string> | undefined,
		onerror: (error: Error) => void,
	): SSEClientTransport {
		// Configure ReconnectingEventSource options
		const reconnectingEventSourceOptions = {
			max_retry_time: 5000, // Maximum retry time in milliseconds
			withCredentials: headers?.["Authorization"] ? true : false, // Enable credentials if Authorization header exists
		}
		global.EventSource = ReconnectingEventSource
		const transport = new SSEClientTransport(url, {
			requestInit: {
				headers,
			},
			eventSourceInit: reconnectingEventSourceOptions,
		})
		transport.onerror = onerror
		return transport
	}

	private appendErrorMessage(connection: McpConnection, error: string, level: "error" | "warn" | "info" = "error") {
		const MAX_ERROR_LENGTH = 1000
		const truncatedError =
			error.length > MAX_ERROR_LENGTH
				? `${error.substring(0, MAX_ERROR_LENGTH)}...(error message truncated)`
				: error

		// Add to error history
		if (!connection.server.errorHistory) {
			connection.server.errorHistory = []
		}

		connection.server.errorHistory.push({
			message: truncatedError,
			timestamp: Date.now(),
			level,
		})

		// Keep only the last 100 errors
		if (connection.server.errorHistory.length > 100) {
			connection.server.errorHistory = connection.server.errorHistory.slice(-100)
		}

		// Update current error display
		connection.server.error = truncatedError
	}

	/**
	 * Helper method to find a connection by server name and source
	 * @param serverName The name of the server to find
	 * @param source Optional source to filter by (global or project)
	 * @returns The matching connection or undefined if not found
	 */
	private findConnection(serverName: string, source: "global" | "project" = "global"): McpConnection | undefined {
		// If source is specified, only find servers with that source
		if (source !== undefined) {
			return this.connections.find((conn) => conn.server.name === serverName && conn.server.source === source)
		}

		// If no source is specified, first look for project servers, then global servers
		// This ensures that when servers have the same name, project servers are prioritized
		const projectConn = this.connections.find(
			(conn) => conn.server.name === serverName && conn.server.source === "project",
		)
		if (projectConn) return projectConn

		// If no project server is found, look for global servers
		return this.connections.find(
			(conn) => conn.server.name === serverName && (conn.server.source === "global" || !conn.server.source),
		)
	}

	private async fetchToolsList(serverName: string, source: "global" | "project" = "global"): Promise<McpTool[]> {
		try {
			// Use the helper method to find the connection
			const connection = this.findConnection(serverName, source)

			if (!connection) {
				throw new Error(`Server ${serverName} not found`)
			}

			const response = await connection.client.request({ method: "tools/list" }, ListToolsResultSchema)

			// Determine the actual source of the server
			const actualSource = connection.server.source || "global"
			let configPath: string
			let alwaysAllowConfig: string[] = []

			// Read from the appropriate config file based on the actual source
			try {
				if (actualSource === "project") {
					// Get project MCP config path
					const projectMcpPath = normalizePath(path.join(ROOT_DIR, "mcp", "mcp_settings.json"))
					if (await this.app.vault.adapter.exists(projectMcpPath)) {
						configPath = projectMcpPath
						const content = await this.app.vault.adapter.read(configPath)
						alwaysAllowConfig = readAlwaysAllowList(JSON.parse(content), serverName)
					}
				} else {
					// Get global MCP settings path
					configPath = this.mcpSettingsFilePath
					const content = await this.app.vault.adapter.read(configPath)
					alwaysAllowConfig = readAlwaysAllowList(JSON.parse(content), serverName)
				}
			} catch (error) {
				logger.error(`Failed to read alwaysAllow config for ${serverName}:`, error)
				// Continue with empty alwaysAllowConfig
			}

			// Mark tools as always allowed based on settings
			const tools = (response?.tools || []).map((tool) => ({
				...tool,
				alwaysAllow: alwaysAllowConfig.includes(tool.name),
			}))

			return tools
		} catch (error) {
			logger.error(`Failed to fetch tools for ${serverName}:`, error)
			return []
		}
	}

	private async fetchResourcesList(serverName: string, source?: "global" | "project"): Promise<McpResource[]> {
		try {
			const connection = this.findConnection(serverName, source)
			if (!connection) {
				return []
			}
			const response = await connection.client.request({ method: "resources/list" }, ListResourcesResultSchema)
			return response?.resources || []
		} catch (error) {
			// logger.error(`Failed to fetch resources for ${serverName}:`, error)
			return []
		}
	}

	private async fetchResourceTemplatesList(
		serverName: string,
		source: "global" | "project" = "global",
	): Promise<McpResourceTemplate[]> {
		try {
			const connection = this.findConnection(serverName, source)
			if (!connection) {
				return []
			}
			const response = await connection.client.request(
				{ method: "resources/templates/list" },
				ListResourceTemplatesResultSchema,
			)
			return response?.resourceTemplates || []
		} catch (error) {
			// logger.error(`Failed to fetch resource templates for ${serverName}:`, error)
			return []
		}
	}

	async deleteConnection(name: string, source: "global" | "project" = "global"): Promise<void> {
		// If source is provided, only delete connections from that source
		const connections = source
			? this.connections.filter((conn) => conn.server.name === name && conn.server.source === source)
			: this.connections.filter((conn) => conn.server.name === name)

		for (const connection of connections) {
			// Close transport and client independently: a transport close failure
			// (e.g. an already-dead stdio child process) must not skip the client
			// teardown, or its session state leaks.
			try {
				await connection.transport.close()
			} catch (error) {
				logger.error(`Failed to close transport for ${name}:`, error)
			}
			try {
				await connection.client.close()
			} catch (error) {
				logger.error(`Failed to close client for ${name}:`, error)
			}
			this.connections = this.connections.filter((conn) => conn.server.name !== name)
		}

		// Remove the connections from the array
		this.connections = this.connections.filter((conn) => {
			if (conn.server.name !== name) return true
			if (source && conn.server.source !== source) return true
			return false
		})
	}

	async updateServerConnections(
		newServers: Record<string, unknown>,
		source: "global" | "project" = "global",
	): Promise<void> {
		this.isConnecting = true
		this.removeAllFileWatchers()
		// Filter connections by source
		const currentConnections = this.connections.filter(
			(conn) => conn.server.source === source || (!conn.server.source && source === "global"),
		)
		const currentNames = new Set(currentConnections.map((conn) => conn.server.name))
		const newNames = new Set(Object.keys(newServers))

		// Delete removed servers
		for (const name of currentNames) {
			if (!newNames.has(name)) {
				await this.deleteConnection(name, source)
			}
		}

		// Update or add servers·
		for (const [name, config] of Object.entries(newServers)) {
			// Only consider connections that match the current source
			const currentConnection = this.findConnection(name, source)

			// Validate and transform the config
			let validatedConfig: z.infer<typeof ServerConfigSchema>
			try {
				validatedConfig = this.validateServerConfig(config, name)
			} catch (error) {
				this.showErrorMessage(`Invalid configuration for MCP server "${name}"`, error)
				continue
			}

			if (!currentConnection) {
				// New server
				try {
					this.setupFileWatcher(name, validatedConfig, source)
					await this.connectToServer(name, validatedConfig, source)
				} catch (error) {
					this.showErrorMessage(`Failed to connect to new MCP server ${name}`, error)
				}
			} else if (!deepEqual(JSON.parse(currentConnection.server.config), config)) {
				// Existing server with changed config
				try {
					this.setupFileWatcher(name, validatedConfig, source)
					await this.deleteConnection(name, source)
					await this.connectToServer(name, validatedConfig, source)
				} catch (error) {
					this.showErrorMessage(`Failed to reconnect MCP server ${name}`, error)
				}
			}
			// If server exists with same config, do nothing
		}
		// await this.notifyWebviewOfServerChanges()
		this.isConnecting = false
	}

	private setupFileWatcher(
		name: string,
		config: z.infer<typeof ServerConfigSchema>,
		source: "global" | "project" = "global",
	) {
		// Initialize an empty array for this server if it doesn't exist
		if (!this.fileWatchers.has(name)) {
			this.fileWatchers.set(name, [])
		}

		const watchers = this.fileWatchers.get(name) || []

		// Only stdio type has args
		if (config.type === "stdio") {
			// Setup watchers for custom watchPaths if defined
			if (config.watchPaths && config.watchPaths.length > 0) {
				const watchPathsWatcher = chokidar.watch(config.watchPaths, {
					// persistent: true,
					// ignoreInitial: true,
					// awaitWriteFinish: true,
				})

				watchPathsWatcher.on("change", (changedPath) => {
					// Pass the source from the config to restartConnection
					void this.restartConnection(name, source).catch((error: unknown) => {
						logger.error(`Failed to restart server ${name} after change in ${changedPath}:`, error)
					})
				})

				watchers.push(watchPathsWatcher)
			}

			// Also setup the fallback build/index.js watcher if applicable
			const filePath = config.args?.find((arg: string) => arg.includes("build/index.js"))
			if (filePath) {
				// we use chokidar instead of onDidSaveTextDocument because it doesn't require the file to be open in the editor
				const indexJsWatcher = chokidar.watch(filePath, {
					// persistent: true,
					// ignoreInitial: true,
					// awaitWriteFinish: true, // This helps with atomic writes
				})

				indexJsWatcher.on("change", () => {
					// Pass the source from the config to restartConnection
					void this.restartConnection(name, source).catch((error: unknown) => {
						logger.error(`Failed to restart server ${name} after change in ${filePath}:`, error)
					})
				})

				watchers.push(indexJsWatcher)
			}

			// Update the fileWatchers map with all watchers for this server
			if (watchers.length > 0) {
				this.fileWatchers.set(name, watchers)
			}
		}
	}

	private removeAllFileWatchers() {
		this.fileWatchers.forEach((watchers) => watchers.forEach((watcher) => { void watcher.close() }))
		this.fileWatchers.clear()
	}

	async restartConnection(serverName: string, source?: "global" | "project"): Promise<void> {
		this.isConnecting = true
		// const provider = this.providerRef.deref()
		// if (!provider) {
		// 	return
		// }

		// Get existing connection and update its status
		const connection = this.findConnection(serverName, source)
		const config = connection?.server.config
		if (config) {
			// vscode.window.showInformationMessage(t("common:info.mcp_server_restarting", { serverName }))
			connection.server.status = "connecting"
			connection.server.error = ""
			// await this.notifyWebviewOfServerChanges()
			await delay(500) // artificial delay to show user that server is restarting
			try {
				await this.deleteConnection(serverName, connection.server.source)
				// Parse the config to validate it
				const parsedConfig: unknown = JSON.parse(config)
				try {
					// Validate the config
					const validatedConfig = this.validateServerConfig(parsedConfig, serverName)

					// Try to connect again using validated config
					await this.connectToServer(serverName, validatedConfig)
					// vscode.window.showInformationMessage(t("common:info.mcp_server_connected", { serverName }))
				} catch (validationError) {
					this.showErrorMessage(`Invalid configuration for MCP server "${serverName}"`, validationError)
				}
			} catch (error) {
				this.showErrorMessage(`Failed to restart ${serverName} MCP server connection`, error)
			}
		}

		// await this.notifyWebviewOfServerChanges()
		this.isConnecting = false
	}

	

	public async toggleServerDisabled(
		serverName: string,
		disabled: boolean,
		source: "global" | "project" = "global",
	): Promise<void> {
		try {
			// Find the connection to determine if it's a global or project server
			const connection = this.findConnection(serverName, source)
			if (!connection) {
				throw new Error(`Server ${serverName}${source ? ` with source ${source}` : ""} not found`)
			}

			const serverSource = connection.server.source
			// Update the server config in the appropriate file
			await this.updateServerConfig(serverName, { disabled }, serverSource)

			// Update the connection object
			if (connection) {
				try {
					connection.server.disabled = disabled

					// Only refresh capabilities if connected
					if (connection.server.status === "connected") {
						connection.server.tools = await this.fetchToolsList(serverName, serverSource)
						connection.server.resources = await this.fetchResourcesList(serverName, serverSource)
						connection.server.resourceTemplates = await this.fetchResourceTemplatesList(
							serverName,
							serverSource,
						)
					}
				} catch (error) {
					logger.error(`Failed to refresh capabilities for ${serverName}:`, error)
				}
			}
		} catch (error) {
			this.showErrorMessage(`Failed to update server ${serverName} state`, error)
			throw error
		}
	}

	/**
	 * Helper method to update a server's configuration in the appropriate settings file
	 * @param serverName The name of the server to update
	 * @param configUpdate The configuration updates to apply
	 * @param source Whether to update the global or project config
	 */
	private async updateServerConfig(
		serverName: string,
		configUpdate: Record<string, unknown>,
		source: "global" | "project" = "global",
	): Promise<void> {
		// Determine which config file to update
		let configPath: string
		if (source === "project") {
			const projectMcpPath = normalizePath(path.join(ROOT_DIR, "mcp", "mcp_settings.json"))
			if (!await this.app.vault.adapter.exists(projectMcpPath)) {
				throw new Error("Project MCP configuration file not found")
			}
			configPath = projectMcpPath
		} else {
			configPath = await this.getMcpSettingsFilePath()
		}

		// Read and parse the config file
		const content = await this.app.vault.adapter.read(configPath)
		const parsed: unknown = JSON.parse(content)

		// Validate the config structure
		if (!isRecord(parsed)) {
			throw new Error("Invalid config structure")
		}

		let servers = getRecordField(parsed, "mcpServers")
		if (!servers) {
			servers = {}
			parsed["mcpServers"] = servers
		}

		// Create a new server config object to ensure clean structure
		const existingServerConfig = getRecordField(servers, serverName)
		const serverConfig: Record<string, unknown> = {
			...(existingServerConfig ?? {}),
			...configUpdate,
		}

		// Ensure required fields exist
		if (!Array.isArray(serverConfig["alwaysAllow"])) {
			serverConfig["alwaysAllow"] = []
		}

		servers[serverName] = serverConfig

		// Write the entire config back
		const updatedConfig = {
			mcpServers: servers,
		}

		await this.app.vault.adapter.write(configPath, JSON.stringify(updatedConfig, null, 2))
	}

	public async updateServerTimeout(
		serverName: string,
		timeout: number,
		source: "global" | "project" = "global",
	): Promise<void> {
		try {
			// Find the connection to determine if it's a global or project server
			const connection = this.findConnection(serverName, source)
			if (!connection) {
				throw new Error(`Server ${serverName}${source ? ` with source ${source}` : ""} not found`)
			}

			// Update the server config in the appropriate file
			await this.updateServerConfig(serverName, { timeout }, connection.server.source || "global")

			// await this.notifyWebviewOfServerChanges()
		} catch (error) {
			this.showErrorMessage(`Failed to update server ${serverName} timeout settings`, error)
			throw error
		}
	}

	public async deleteServer(serverName: string, source?: "global" | "project"): Promise<void> {
		try {
			// Find the connection to determine if it's a global or project server
			const connection = this.findConnection(serverName, source)
			if (!connection) {
				throw new Error(`Server ${serverName}${source ? ` with source ${source}` : ""} not found`)
			}

			const serverSource = connection.server.source || "global"
			// Determine config file based on server source
			const isProjectServer = serverSource === "project"
			let configPath: string

			if (isProjectServer) {
				// Get project MCP config path
				const projectMcpPath = normalizePath(path.join(ROOT_DIR, "mcp", "mcp_settings.json"))
				if (!await this.app.vault.adapter.exists(projectMcpPath)) {
					throw new Error("Project MCP configuration file not found")
				}
				configPath = projectMcpPath
			} else {
				// Get global MCP settings path
				configPath = await this.getMcpSettingsFilePath()
			}

			const content = await this.app.vault.adapter.read(configPath)
			const parsed: unknown = JSON.parse(content)

			// Validate the config structure
			if (!isRecord(parsed)) {
				throw new Error("Invalid config structure")
			}

			const servers = getRecordField(parsed, "mcpServers") ?? {}

			// Remove the server from the settings
			if (servers[serverName]) {
				// Rebuild the record without the deleted key: computed `delete`
				// is banned by the lint gate (no-dynamic-delete)
				const remainingServers: Record<string, unknown> = {}
				for (const [key, value] of Object.entries(servers)) {
					if (key !== serverName) {
						remainingServers[key] = value
					}
				}

				// Write the entire config back
				const updatedConfig = {
					mcpServers: remainingServers,
				}

				await this.app.vault.adapter.write(configPath, JSON.stringify(updatedConfig, null, 2))

				// Update server connections with the correct source
				await this.updateServerConnections(remainingServers, serverSource)

				// vscode.window.showInformationMessage(t("common:info.mcp_server_deleted", { serverName }))
			} else {
				// vscode.window.showWarningMessage(t("common:info.mcp_server_not_found", { serverName }))
			}
		} catch (error) {
			this.showErrorMessage(`Failed to delete MCP server ${serverName}`, error)
			throw error
		}
	}

	/**
	 * Creates a new MCP server with the given name and configuration
	 * @param name The name of the server to create
	 * @param config JSON string containing the server configuration
	 * @param source Whether to create in global or project scope (defaults to global)
	 */
	public async createServer(
		name: string,
		config: string,
		source: "global" | "project" = "global"
	): Promise<void> {
		try {
			// Parse the JSON config string
			let parsedConfig: unknown
			try {
				parsedConfig = JSON.parse(config)
			} catch (error) {
				throw new Error(`Invalid JSON format in config: ${error instanceof Error ? error.message : String(error)}`)
			}

			// Validate the parsed config
			const validatedConfig = this.validateServerConfig(parsedConfig, name)

			// Determine which config file to update
			let configPath: string
			if (source === "project") {
				const projectMcpPath = normalizePath(path.join(ROOT_DIR, "mcp", "mcp_settings.json"))
				if (!await this.app.vault.adapter.exists(projectMcpPath)) {
					// Create project config file if it doesn't exist
					await this.app.vault.adapter.write(
						projectMcpPath,
						JSON.stringify({ mcpServers: {} }, null, 2)
					)
				}
				configPath = projectMcpPath
			} else {
				configPath = await this.getMcpSettingsFilePath()
			}

			// Read current config
			const content = await this.app.vault.adapter.read(configPath)
			const parsed: unknown = JSON.parse(content)

			// Validate the config structure
			if (!isRecord(parsed)) {
				throw new Error("Invalid config file structure")
			}

			// Ensure mcpServers object exists
			const servers = getRecordField(parsed, "mcpServers") ?? {}

			// Check if server already exists
			if (servers[name]) {
				throw new Error(`Server "${name}" already exists. Use updateServerConfig to modify existing servers.`)
			}

			// Add the new server to the config
			servers[name] = validatedConfig

			// Write the updated config back to file
			const updatedConfig = {
				mcpServers: servers,
			}

			await this.app.vault.adapter.write(configPath, JSON.stringify(updatedConfig, null, 2))

			// Update server connections to connect to the new server
			await this.updateServerConnections(servers, source)

			logger.debug(`Successfully created and connected to MCP server: ${name}`)
		} catch (error) {
			this.showErrorMessage(`Failed to create MCP server "${name}"`, error)
			throw error
		}
	}

	async readResource(serverName: string, uri: string, source: "global" | "project" = "global"): Promise<McpResourceResponse> {
		const connection = this.findConnection(serverName, source)
		if (!connection) {
			throw new Error(`No connection found for server: ${serverName}${source ? ` with source ${source}` : ""}`)
		}
		if (connection.server.disabled) {
			throw new Error(`Server "${serverName}" is disabled`)
		}
		return await connection.client.request(
			{
				method: "resources/read",
				params: {
					uri,
				},
			},
			ReadResourceResultSchema,
		)
	}

	async callTool(
		serverName: string,
		toolName: string,
		toolArguments?: Record<string, unknown>,
		source: "global" | "project" = "global",
	): Promise<McpToolCallResponse> {
		const connection = this.findConnection(serverName, source)
		if (!connection) {
			throw new Error(
				`No connection found for server: ${serverName}${source ? ` with source ${source}` : ""}. Please make sure to use MCP servers available under 'Connected MCP Servers'.`,
			)
		}
		if (connection.server.disabled) {
			throw new Error(`Server "${serverName}" is disabled and cannot be used`)
		}

		let timeout: number
		try {
			const parsedConfig = ServerConfigSchema.parse(JSON.parse(connection.server.config))
			timeout = (parsedConfig.timeout ?? 60) * 1000
		} catch (error) {
			logger.error("Failed to parse server config for timeout:", error)
			// Default to 60 seconds if parsing fails
			timeout = 60 * 1000
		}

		// @ts-expect-error - MCP SDK response union is narrower than McpToolCallResponse (resource_link payloads lack audio data fields)
		return await connection.client.request(
			{
				method: "tools/call",
				params: {
					name: toolName,
					arguments: toolArguments,
				},
			},
			CallToolResultSchema,
			{
				timeout,
			},
		)
	}

	async toggleToolAlwaysAllow(
		serverName: string,
		source: "global" | "project" = "global",
		toolName: string,
		shouldAllow: boolean,
	): Promise<void> {
		try {
			// Find the connection with matching name and source
			const connection = this.findConnection(serverName, source)

			if (!connection) {
				throw new Error(`Server ${serverName} with source ${source} not found`)
			}

			// Determine the correct config path based on the source
			let configPath: string
			if (source === "project") {
				// Get project MCP config path
				const projectMcpPath = normalizePath(path.join(ROOT_DIR, "mcp", "mcp_settings.json"))
				if (!await this.app.vault.adapter.exists(projectMcpPath)) {
					throw new Error("Project MCP configuration file not found")
				}
				configPath = projectMcpPath
			} else {
				// Get global MCP settings path
				configPath = await this.getMcpSettingsFilePath()
			}

			// Normalize path for cross-platform compatibility
			// Use a consistent path format for both reading and writing
			// const normalizedPath = configPath

			// Read the appropriate config file
			const content = await this.app.vault.adapter.read(configPath)
			const parsed: unknown = JSON.parse(content)
			if (!isRecord(parsed)) {
				throw new Error("Invalid config file structure")
			}

			// Initialize mcpServers if it doesn't exist
			let servers = getRecordField(parsed, "mcpServers")
			if (!servers) {
				servers = {}
				parsed["mcpServers"] = servers
			}

			// Initialize server config if it doesn't exist
			let serverEntry = getRecordField(servers, serverName)
			if (!serverEntry) {
				serverEntry = {
					type: "stdio",
					command: "node",
					args: [], // Default to an empty array; can be set later if needed
				}
				servers[serverName] = serverEntry
			}

			// Normalize alwaysAllow to a string array (raw JSON may hold anything)
			const rawAlwaysAllow = serverEntry["alwaysAllow"]
			const alwaysAllow: string[] = Array.isArray(rawAlwaysAllow)
				? rawAlwaysAllow.filter((value: unknown): value is string => typeof value === "string")
				: []
			serverEntry["alwaysAllow"] = alwaysAllow

			const toolIndex = alwaysAllow.indexOf(toolName)

			if (shouldAllow && toolIndex === -1) {
				// Add tool to always allow list
				alwaysAllow.push(toolName)
			} else if (!shouldAllow && toolIndex !== -1) {
				// Remove tool from always allow list
				alwaysAllow.splice(toolIndex, 1)
			}

			// Write updated config back to file
			await this.app.vault.adapter.write(configPath, JSON.stringify(parsed, null, 2))

			// Update the tools list to reflect the change
			if (connection) {
				// Explicitly pass the source to ensure we're updating the correct server's tools
				connection.server.tools = await this.fetchToolsList(serverName, source)
				// await this.notifyWebviewOfServerChanges()
			}
		} catch (error) {
			this.showErrorMessage(`Failed to update always allow settings for tool ${toolName}`, error)
			throw error // Re-throw to ensure the error is properly handled
		}
	}

	async dispose(): Promise<void> {
		// Prevent multiple disposals
		if (this.isDisposed) {
			logger.debug("McpHub: Already disposed.")
			return
		}
		logger.debug("McpHub: Disposing...")
		this.isDisposed = true
		this.removeAllFileWatchers()
		for (const connection of this.connections) {
			try {
				await this.deleteConnection(connection.server.name, connection.server.source)
			} catch (error) {
				logger.error(`Failed to close connection for ${connection.server.name}:`, error)
			}
		}
		this.connections = []

		this.eventRefs.forEach((ref) => this.app.vault.offref(ref))
		this.eventRefs = []
	}

}
