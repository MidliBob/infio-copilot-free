import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, FileText, Folder, Power, RotateCcw, Trash2, Wrench } from 'lucide-react'
import { Notice } from 'obsidian'
import React, { useEffect, useState } from 'react'

import { useMcpHub } from '../../contexts/McpHubContext'
import { useSettings } from '../../contexts/SettingsContext'
import { McpErrorEntry, McpResource, McpResourceTemplate, McpServer, McpTool } from '../../core/mcp/type'
import { t } from '../../lang/helpers'

const McpHubView = () => {
	const { settings, setSettings } = useSettings()
	const { getMcpHub } = useMcpHub()
	const [mcpServers, setMcpServers] = useState<McpServer[]>([])
	const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({});
	const [activeServerDetailTab, setActiveServerDetailTab] = useState<Record<string, 'tools' | 'resources' | 'errors'>>({});

	// 新增状态变量用于创建新服务器
	const [newServerName, setNewServerName] = useState('')
	const [newServerConfig, setNewServerConfig] = useState('')
	const [isCreateSectionExpanded, setIsCreateSectionExpanded] = useState(false)

	const fetchServers = async () => {
		const hub = await getMcpHub()
		if (hub) {
			const serversData = hub.getAllServers()
			setMcpServers(serversData)
		}
	}

	useEffect(() => {
		fetchServers()
	}, [getMcpHub])

	const switchMcp = React.useCallback(() => {
		setSettings({
			...settings,
			mcpEnabled: !settings.mcpEnabled,
		})
	}, [settings, setSettings])

	// const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
	// 	setSearchTerm(e.target.value)
	// }

	const handleRestart = async (serverName: string) => {
		const hub = await getMcpHub();
		if (hub) {
			await hub.restartConnection(serverName, "global")
			const updatedServers = hub.getAllServers()
			setMcpServers(updatedServers)
		}
	}

	const handleToggle = async (serverName: string, disabled: boolean) => {
		const hub = await getMcpHub();
		if (hub) {
			await hub.toggleServerDisabled(serverName, !disabled)
			const updatedServers = hub.getAllServers()
			setMcpServers(updatedServers)
		}
	}

	const handleDelete = async (serverName: string) => {
		const hub = await getMcpHub();
		if (hub) {
			if (confirm(t('mcpHub.deleteConfirm').replace('{name}', serverName) as string)) {
				await hub.deleteServer(serverName, "global")
				const updatedServers = hub.getAllServers()
				setMcpServers(updatedServers)
			}
		}
	}

	const handleCreate = async () => {
		// 验证输入
		if (newServerName.trim().length === 0) {
			new Notice(t('mcpHub.serverNameRequired'))
			return
		}

		if (newServerConfig.trim().length === 0) {
			new Notice(t('mcpHub.configRequired'))
			return
		}

		// check config is valid json
		try {
			JSON.parse(newServerConfig)
		} catch (error) {
			new Notice(t('mcpHub.invalidConfig'))
			return
		}

		const hub = await getMcpHub();
		if (hub) {
			try {
				await hub.createServer(newServerName, newServerConfig, "global")
				const updatedServers = hub.getAllServers()
				setMcpServers(updatedServers)

				// 清空表单
				setNewServerName('')
				setNewServerConfig('')
				new Notice(t('mcpHub.createSuccess').replace('{name}', newServerName) as string)
			} catch (error) {
				new Notice(t('mcpHub.createFailed').replace('{error}', error.message) as string)
			}
		}
	}

	const handleOpenConfigFile = async () => {
		const hub = await getMcpHub();
		if (hub) {
			try {
				await hub.openMcpSettingsFile();
			} catch (error) {
				console.error('Failed to open config file:', error)
			}
		}
	}

	const toggleServerExpansion = (serverKey: string) => {
		setExpandedServers(prev => ({ ...prev, [serverKey]: !prev[serverKey] }));
		if (!expandedServers[serverKey] && !activeServerDetailTab[serverKey]) {
			setActiveServerDetailTab(prev => ({ ...prev, [serverKey]: 'tools' }));
		}
	};

	const handleDetailTabChange = (serverKey: string, tab: 'tools' | 'resources' | 'errors') => {
		setActiveServerDetailTab(prev => ({ ...prev, [serverKey]: tab }));
	};

	const toggleCreateSectionExpansion = () => {
		setIsCreateSectionExpanded(prev => !prev)
	}

	const ToolRow = ({ tool }: { tool: McpTool }) => {
		return (
			<div className="icf-mcp-tool-row">
				<div className="icf-mcp-tool-row-header">
					<div className="icf-mcp-tool-name-section">
						<span className="icf-mcp-tool-name">{tool.name}</span>
					</div>
				</div>
				{tool.description && (
					<p className="icf-mcp-item-description">{tool.description}</p>
				)}
				{(tool.inputSchema && (() => {
					const schema = tool.inputSchema;
					const properties = schema && typeof schema === 'object' && 'properties' in schema ? schema.properties : undefined;
					const required = schema && typeof schema === 'object' && 'required' in schema ? schema.required : undefined;

					if (properties && typeof properties === 'object' && Object.keys(properties).length > 0) {
						return (
							<div className="icf-mcp-tool-parameters">
								<h5 className="icf-mcp-parameters-title">{t('mcpHub.parameters')}</h5>
								{Object.entries(properties).map(
									([paramName, paramSchemaUntyped]) => {
										const paramSchema = paramSchemaUntyped && typeof paramSchemaUntyped === 'object' ? paramSchemaUntyped : {};
										const paramDescription = 'description' in paramSchema && typeof paramSchema.description === 'string' ? paramSchema.description : undefined;
										const isRequired = required && Array.isArray(required) && required.includes(paramName);
										return (
											<div key={paramName} className="icf-mcp-parameter-item">
												<code className="icf-mcp-parameter-name">
													{paramName}
													{isRequired && <span className="icf-mcp-parameter-required">*</span>}
												</code>
												<span className="icf-mcp-parameter-description">
													{paramDescription || t('mcpHub.toolNoDescription')}
												</span>
											</div>
										);
									}
								)}
							</div>
						);
					}
					return null;
				})())}
			</div>
		);
	};

	const ResourceRow = ({ resource }: { resource: McpResource | McpResourceTemplate }) => (
		<div className="icf-mcp-resource-row">
			<div className="icf-mcp-resource-header">
				<FileText size={16} className="icf-mcp-resource-icon" />
				<strong>{'uri' in resource ? resource.uri : resource.uriTemplate}</strong>
			</div>
			{resource.description && <p className="icf-mcp-item-description">{resource.description}</p>}
		</div>
	);

	const ErrorRow = ({ error }: { error: McpErrorEntry }) => (
		<div className="icf-mcp-error-row">
			<div className="icf-mcp-error-header">
				<AlertTriangle size={16} className="icf-mcp-error-icon" />
				<p style={{ color: error.level === 'error' ? 'var(--text-error)' : error.level === 'warn' ? 'var(--text-warning)' : 'var(--text-normal)' }}>
					{error.message}
				</p>
			</div>
			<p className="icf-mcp-item-timestamp">{new Date(error.timestamp).toLocaleString()}</p>
		</div>
	);

	return (
		<div className="icf-mcp-hub-container">
			{/* Header Section */}
			<div className="icf-mcp-hub-header">
				<h3 className="icf-mcp-hub-title">{t('mcpHub.title')}</h3>
				<div className="icf-mcp-hub-actions">
					<button
						onClick={fetchServers}
						className="obsidian-insight-refresh-btn"
					>
						<RotateCcw size={16} />
					</button>
				</div>
			</div>

			{/* MCP Settings */}
			<div className="icf-mcp-settings-section">
				<div className="icf-mcp-setting-item">
					<label className="icf-mcp-setting-label">
						<input
							type="checkbox"
							checked={settings.mcpEnabled}
							onChange={switchMcp}
							className="icf-mcp-setting-checkbox"
						/>
						<span className="icf-mcp-setting-text">{t('mcpHub.enableMcp')}</span>
					</label>
					<p className="icf-mcp-setting-description">
						{t('mcpHub.enableMcpDescription')}
						<a href="https://modelcontextprotocol.io/introduction" target="_blank" rel="noopener noreferrer">
							{t('mcpHub.learnMore')}
						</a>
					</p>
				</div>
				
				{/* Configuration File Access */}
				<button
					onClick={handleOpenConfigFile}
					className="icf-mcp-config-button"
				>
					<ExternalLink size={16} />
					<span>{t('mcpHub.openConfigFile')}</span>
				</button>
			</div>

			{/* Create New Server Section */}
			{settings.mcpEnabled && (
				<div className="icf-mcp-create-section">
					<div className="icf-mcp-create-item">
						<div className="icf-mcp-create-item-header" onClick={toggleCreateSectionExpansion}>
							<div className="icf-mcp-create-item-info">
								<div className="icf-mcp-hub-expander">
									{isCreateSectionExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
								</div>
								<h3 className="icf-mcp-create-title">{t('mcpHub.addNewServer')}</h3>
							</div>
						</div>

						{isCreateSectionExpanded && (
							<div className="icf-mcp-create-expanded">
								<div className="icf-mcp-create-label">{t('mcpHub.serverName')}</div>
								<input
									type="text"
									value={newServerName}
									onChange={(e) => setNewServerName(e.target.value)}
									placeholder={t('mcpHub.serverNamePlaceholder')}
									className="icf-mcp-create-input"
								/>
								<div className="icf-mcp-create-label">{t('mcpHub.config')}</div>
								<textarea
									value={newServerConfig}
									onChange={(e) => setNewServerConfig(e.target.value)}
									placeholder={t('mcpHub.configPlaceholder')}
									className="icf-mcp-create-textarea"
									rows={4}
								/>
								<button
									onClick={handleCreate}
									className="icf-mcp-create-btn"
									disabled={!newServerName.trim() || !newServerConfig.trim()}
								>
									<span>{t('mcpHub.createServer')}</span>
								</button>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Servers List */}
			{settings.mcpEnabled && (
				<div className="icf-mcp-hub-list">
					{mcpServers.length === 0 ? (
						<div className="icf-mcp-hub-empty">
							<p>{t('mcpHub.noServersFound')}</p>
						</div>
					) : (
						mcpServers.map(server => {
							// Add null check for server object
							if (!server || !server.name) {
								return null;
							}
							
							const serverKey = `${server.name}-${server.source || 'global'}`;
							const isExpanded = !!expandedServers[serverKey];
							const currentDetailTab = activeServerDetailTab[serverKey] || 'tools';

							return (
								<div key={serverKey} className={`icf-mcp-hub-item ${server.disabled ? 'disabled' : ''}`}>
									<div className={`icf-mcp-hub-item-header ${server.disabled ? 'disabled' : ''}`}>
										<div className="icf-mcp-hub-item-info" onClick={() => toggleServerExpansion(serverKey)}>
											<div className="icf-mcp-hub-expander">
												{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
											</div>
											<span className={`icf-mcp-hub-status-indicator ${server.status === 'connected' ? 'connected' : server.status === 'connecting' ? 'connecting' : 'disconnected'} ${server.disabled ? 'disabled' : ''}`}></span>
											<h3 className="icf-mcp-hub-name">{server.name ? server.name.replace('icf-builtin-server', 'builtin') : 'Unknown Server'}</h3>
										</div>

										<div className="icf-mcp-hub-actions" onClick={(e) => e.stopPropagation()}>
											<button
												className={`icf-section-btn ${server.disabled ? 'disabled' : 'enabled'}`}
												onClick={() => handleToggle(server.name, server.disabled)}
												title={server.disabled ? t('mcpHub.enable') : t('mcpHub.disable')}
											>
												<Power size={16} />
											</button>

											<button
												className="icf-section-btn"
												onClick={() => handleRestart(server.name)}
												title={t('mcpHub.restart')}
											>
												<RotateCcw size={16} />
											</button>

											<button
												className="icf-section-btn"
												onClick={() => handleDelete(server.name)}
												title={t('mcpHub.delete')}
											>
												<Trash2 size={16} />
											</button>
										</div>
									</div>

									<div className="icf-mcp-hub-status-info">
										<span className="icf-mcp-status-text">
											{t('mcpHub.status')}: <span className={`status-value ${server.status}`}>
												{server.status === 'connected' ? t('mcpHub.statusConnected') :
													server.status === 'connecting' ? t('mcpHub.statusConnecting') :
														t('mcpHub.statusDisconnected')}
											</span>
										</span>
									</div>

									{isExpanded && server.status === 'connected' && (
										<div className="icf-mcp-server-details-expanded">
											<div className="icf-mcp-tabs">
												{(['tools', 'resources', 'errors'] as const).map(tabName => {
													const count = tabName === 'tools'
														? server.tools?.length || 0
														: tabName === 'resources'
															? (server.resources?.length || 0) + (server.resourceTemplates?.length || 0)
															: server.errorHistory?.length || 0;

													return (
														<button
															key={tabName}
															className={`icf-mcp-tab-button ${currentDetailTab === tabName ? 'active' : ''}`}
															onClick={(e) => { e.stopPropagation(); handleDetailTabChange(serverKey, tabName); }}
														>
															{tabName === 'tools' && <Wrench size={14} />}
															{tabName === 'resources' && <Folder size={14} />}
															{tabName === 'errors' && <AlertTriangle size={14} />}
															{t(`mcpHub.${tabName}`)} ({count})
														</button>
													);
												})}
											</div>
											<div className="icf-mcp-tab-content">
												{currentDetailTab === 'tools' && (
													<div className="icf-mcp-tools-list">
														{(server.tools && server.tools.length > 0) ? server.tools.filter(tool => tool && tool.name).map(tool => <ToolRow key={tool.name} tool={tool} />) : <p className="icf-mcp-empty-message">{t('mcpHub.noTools')}</p>}
													</div>
												)}
												{currentDetailTab === 'resources' && (
													<div className="icf-mcp-resources-list">
														{((server.resources && server.resources.length > 0) || (server.resourceTemplates && server.resourceTemplates.length > 0))
															? [...(server.resources || []), ...(server.resourceTemplates || [])].map(res => <ResourceRow key={'uri' in res ? res.uri : res.uriTemplate} resource={res} />)
															: <p className="icf-mcp-empty-message">{t('mcpHub.noResources')}</p>}
													</div>
												)}
												{currentDetailTab === 'errors' && (
													<div className="icf-mcp-errors-list">
														{(server.errorHistory && server.errorHistory.length > 0)
															? [...server.errorHistory].sort((a, b) => b.timestamp - a.timestamp).map((err, idx) => <ErrorRow key={`${err.timestamp}-${idx}`} error={err} />)
															: <p className="icf-mcp-empty-message">{t('mcpHub.noErrors')}</p>}
													</div>
												)}
											</div>
										</div>
									)}
									{isExpanded && server.status !== 'connected' && (
										<div className="icf-mcp-server-details-expanded">
											<p className="icf-mcp-server-error-message">
												{t('mcpHub.serverNotConnectedError')}
												{server.error && <pre>{server.error}</pre>}
											</p>
										</div>
									)}
								</div>
							);
						})
					)}
				</div>
			)}

			<style>{`
				.icf-mcp-hub-container {
					display: flex;
					flex-direction: column;
					padding: 16px;
					gap: 16px;
					color: var(--text-normal);
					scroll-behavior: smooth;
				}

				/* Header Styles */
				.icf-mcp-hub-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
				}

				.icf-mcp-hub-title {
					margin: 0;
					font-size: 24px;
				}

				/* Settings Section */
				.icf-mcp-settings-section {
					background-color: var(--background-secondary);
					border-radius: var(--radius-s);
				}

				.icf-mcp-setting-item {
					margin-bottom: 12px;
				}

				.icf-mcp-setting-label {
					display: flex;
					align-items: flex-start;
					gap: 8px;
					cursor: pointer;
				}

				.icf-mcp-setting-checkbox {
					margin-top: 2px;
					cursor: pointer;
				}

				.icf-mcp-setting-text {
					font-weight: 500;
					color: var(--text-normal);
				}

				.icf-mcp-setting-description {
					margin: 8px 0 0 24px;
					font-size: 14px;
					color: var(--text-muted);
					line-height: 1.4;
				}

				.icf-mcp-hub-actions {
					display: flex;
					gap: var(--size-2-2);
				}

				.obsidian-insight-refresh-btn {
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

				.obsidian-insight-refresh-btn:hover:not(:disabled) {
					background-color: var(--interactive-hover);
				}

				.icf-mcp-config-button {
					display: flex;
					align-items: center;
					gap: 8px;
					background-color: var(--interactive-normal);
					color: var(--text-normal);
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					padding: 8px 16px;
					font-size: 14px;
					font-weight: 500;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.icf-mcp-config-button:hover {
					background-color: var(--interactive-hover);
					border-color: var(--interactive-accent);
				}

				.icf-mcp-config-button:active {
					transform: translateY(1px);
				}

				/* Search Section */
				.icf-mcp-search-section {
					margin-bottom: 16px;
				}

				.icf-mcp-search-input {
					background-color: var(--background-primary) !important;
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					color: var(--text-normal);
					padding: var(--size-4-2);
					font-size: var(--font-ui-small);
					width: 100%;
					box-sizing: border-box;
				}

				.icf-mcp-search-input:focus {
					outline: none;
					border-color: var(--interactive-accent);
				}

				/* Server Item Styles */
				.icf-mcp-hub-item {
					background-color: var(--background-primary);
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					margin-bottom: 16px;
				}

				.icf-mcp-hub-item-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding: 8px;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.icf-mcp-hub-item-header:hover {
					background-color: var(--background-modifier-hover);
				}

				.icf-mcp-hub-item-header.disabled {
					opacity: 0.6;
					background-color: var(--background-modifier-border-hover);
				}

				.icf-mcp-hub-item-header.disabled:hover {
					background-color: var(--background-modifier-border-hover);
					opacity: 0.7;
				}

				.icf-mcp-hub-item-header.disabled .icf-mcp-hub-name,
				.icf-mcp-hub-item-header.disabled .icf-mcp-hub-expander {
					color: var(--text-faint);
				}

				.icf-mcp-hub-item-header.disabled .icf-mcp-hub-source-badge {
					background-color: var(--text-faint);
					color: var(--background-primary);
					opacity: 0.7;
				}

				.icf-mcp-hub-item-info {
					display: flex;
					align-items: center;
					gap: 12px;
					flex: 1;
				}

				.icf-mcp-hub-expander {
					color: var(--text-muted);
					font-size: 0.9em;
					width: 16px;
					height: 16px;
					display: flex;
					align-items: center;
					justify-content: center;
					flex-shrink: 0;
				}

				.icf-mcp-hub-status-indicator {
					width: 8px;
					height: 8px;
					border-radius: 50%;
					flex-shrink: 0;
					transition: all 0.2s ease;
				}

				.icf-mcp-hub-status-indicator.connected {
					background-color: #10b981;
				}

				.icf-mcp-hub-status-indicator.connecting {
					background-color: #f59e0b;
					animation: pulse 1.5s infinite;
				}

				.icf-mcp-hub-status-indicator.disconnected {
					background-color: #ef4444;
				}

				@keyframes pulse {
					0% {
						opacity: 1;
					}
					50% {
						opacity: 0.5;
					}
					100% {
						opacity: 1;
					}
				}

				.icf-mcp-hub-status-indicator.disabled.connected {
					background-color: #10b981;
					opacity: 0.4;
					filter: saturate(0.6);
				}

				.icf-mcp-hub-status-indicator.disabled.connecting {
					background-color: #f59e0b;
					opacity: 0.4;
					filter: saturate(0.6);
				}

				.icf-mcp-hub-status-indicator.disabled.disconnected {
					background-color: #ef4444;
					opacity: 0.4;
					filter: saturate(0.6);
				}

				.icf-mcp-hub-name {
					font-size: 16px;
					font-weight: 600;
					color: var(--text-normal);
					margin: 0;
				}

				.icf-mcp-hub-source-badge {
					background-color: var(--interactive-accent);
					color: var(--text-on-accent);
					padding: 2px 8px;
					border-radius: var(--radius-s);
					font-size: 12px;
					font-weight: 500;
					text-transform: uppercase;
				}

				.icf-mcp-hub-actions {
					display: flex;
					gap: 8px;
					align-items: center;
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

				.icf-section-btn:hover {
					color: var(--text-normal);
				}

				.icf-section-btn.enabled {
					color: var(--interactive-accent);
				}

				.icf-section-btn.disabled {
					color: var(--text-muted);
				}

				.icf-mcp-hub-status-info {
					padding: 8px;
					font-size: 14px;
					color: var(--text-muted);
				}

				.icf-mcp-hub-item.disabled .icf-mcp-hub-status-info {
					color: var(--text-faint);
				}

				.status-value.connected {
					color: #10b981;
					font-weight: 500;
				}

				.status-value.connecting {
					color: #f59e0b;
					font-weight: 500;
				}

				.status-value.disconnected {
					color: #ef4444;
					font-weight: 500;
				}

				.icf-mcp-hub-item.disabled .status-value.connected {
					color: #10b981;
					opacity: 0.5;
					filter: saturate(0.6);
				}

				.icf-mcp-hub-item.disabled .status-value.connecting {
					color: #f59e0b;
					opacity: 0.5;
					filter: saturate(0.6);
				}

				.icf-mcp-hub-item.disabled .status-value.disconnected {
					color: #ef4444;
					opacity: 0.5;
					filter: saturate(0.6);
				}

				/* Expanded Content Styles */
				.icf-mcp-server-details-expanded {
					border-top: 1px solid var(--background-modifier-border);
					background-color: var(--background-secondary);
					padding-top: 8px;
					padding-bottom: 16px;
					animation: expandContent 0.3s ease-out;
					border-bottom-left-radius: var(--radius-s);
					border-bottom-right-radius: var(--radius-s);
				}

				@keyframes expandContent {
					from {
						opacity: 0;
						transform: translateY(-10px);
					}
					to {
						opacity: 1;
						transform: translateY(0);
					}
				}

				.icf-mcp-tabs {
					display: flex;
					border-bottom: 1px solid var(--background-modifier-border);
					gap: 0;
				}

				.icf-mcp-tab-button {
					background: transparent;
					border: none;
					padding: 12px 20px;
					cursor: pointer;
					color: var(--text-muted);
					border-bottom: 2px solid transparent;
					font-size: 14px;
					font-weight: 500;
					transition: all 0.2s ease;
					border-radius: 0;
					display: flex;
					align-items: center;
					gap: 8px;
				}

				.icf-mcp-tab-button:hover {
					color: var(--text-normal);
					background-color: var(--background-modifier-hover);
				}

				.icf-mcp-tab-button.active {
					color: var(--interactive-accent);
					border-bottom-color: var(--interactive-accent);
					background-color: transparent;
				}

				.icf-mcp-tab-content {
					background-color: var(--background-primary);
					border-radius: var(--radius-s);
					padding: 8px;
					border: 1px solid var(--background-modifier-border);
				}

				.icf-mcp-empty-message {
					text-align: center;
					color: var(--text-muted);
					font-style: italic;
					padding: 20px;
				}

				/* Tool/Resource/Error Row Styles */
				.icf-mcp-tool-row, .icf-mcp-resource-row, .icf-mcp-error-row {
					padding: 12px;
					border-bottom: 1px solid var(--background-modifier-border);
					background-color: var(--background-primary);
					border-radius: var(--radius-s);
					margin-bottom: 8px;
				}

				.icf-mcp-tool-row:last-child,
				.icf-mcp-resource-row:last-child,
				.icf-mcp-error-row:last-child {
					border-bottom: none;
					margin-bottom: 0;
				}

				.icf-mcp-tool-row-header, .icf-mcp-resource-header, .icf-mcp-error-header {
					display: flex;
					align-items: center;
					gap: 8px;
					margin-bottom: 8px;
				}

				.icf-mcp-tool-name {
					font-weight: 600;
					color: var(--text-normal);
					font-size: 14px;
				}

				.icf-mcp-item-description {
					font-size: 14px;
					color: var(--text-muted);
					line-height: 1.4;
					margin: 8px 0 0 0;
				}

				/* Tool Parameters */
				.icf-mcp-tool-parameters {
					margin-top: 8px;
					padding: 8px;
					background-color: var(--background-secondary);
					border-radius: var(--radius-s);
					border: 1px solid var(--background-modifier-border);
				}

				.icf-mcp-parameters-title {
					font-size: 12px;
					font-weight: 600;
					text-transform: uppercase;
					color: var(--text-muted);
					margin: 0 0 8px 0;
				}

				.icf-mcp-parameter-item {
					margin-bottom: 8px;
					padding: 6px 0;
				}

				.icf-mcp-parameter-name {
					display: inline-block;
					background-color: var(--background-modifier-border);
					color: var(--text-accent);
					padding: 2px 6px;
					border-radius: 3px;
					font-family: var(--font-monospace);
					font-size: 12px;
					font-weight: 500;
					margin-bottom: 4px;
				}

				.icf-mcp-parameter-required {
					color: var(--text-error);
					margin-left: 2px;
				}

				.icf-mcp-parameter-description {
					display: block;
					color: var(--text-normal);
					font-size: 14px;
					line-height: 1.4;
					margin-top: 4px;
				}

				/* Error Messages */
				.icf-mcp-server-error-message {
					background-color: var(--background-modifier-error);
					border-left: 3px solid var(--text-error);
					padding: 12px;
					border-radius: var(--radius-s);
				}

				.icf-mcp-server-error-message pre {
					white-space: pre-wrap;
					word-break: break-all;
					margin-top: 8px;
					padding: 8px;
					background-color: var(--background-primary);
					border-radius: var(--radius-s);
					font-size: 12px;
				}

				.icf-mcp-item-timestamp {
					font-size: 12px;
					color: var(--text-faint);
					margin-top: 4px;
				}

				/* Empty State */
				.icf-mcp-hub-empty {
					text-align: center;
					padding: 40px 20px;
					color: var(--text-muted);
				}

				/* Create New Server Section */
				.icf-mcp-create-section {
					background-color: var(--background-primary);
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					margin-bottom: 16px;
				}

				.icf-mcp-create-item {
					/* Remove background and padding since we're restructuring */
				}

				.icf-mcp-create-item-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding: 8px;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.icf-mcp-create-item-header:hover {
					background-color: var(--background-modifier-hover);
				}

				.icf-mcp-create-item-info {
					display: flex;
					align-items: center;
					gap: 12px;
					flex: 1;
				}

				.icf-mcp-create-title {
					margin: 0;
					font-size: 16px;
					font-weight: 600;
					color: var(--text-normal);
				}

				.icf-mcp-create-expanded {
					border-top: 1px solid var(--background-modifier-border);
					background-color: var(--background-secondary);
					padding: 16px;
					display: flex;
					flex-direction: column;
					gap: 12px;
					animation: expandContent 0.3s ease-out;
					border-bottom-left-radius: var(--radius-s);
					border-bottom-right-radius: var(--radius-s);
				}

				.icf-mcp-create-new {
					display: flex;
					flex-direction: column;
					gap: 12px;
				}

				.icf-mcp-create-label {
					font-size: 14px;
					font-weight: 500;
					color: var(--text-normal);
					margin-bottom: 4px;
				}

				.icf-mcp-create-input {
					background-color: var(--background-primary);
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					color: var(--text-normal);
					padding: 8px 12px;
					font-size: 14px;
					width: 100%;
					box-sizing: border-box;
					transition: border-color 0.2s ease;
				}

				.icf-mcp-create-input:focus {
					outline: none;
					border-color: var(--interactive-accent);
				}

				.icf-mcp-create-textarea {
					background-color: var(--background-primary);
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					color: var(--text-normal);
					padding: 8px 12px;
					font-size: 14px;
					width: 100%;
					box-sizing: border-box;
					font-family: var(--font-monospace);
					resize: vertical;
					min-height: 140px;
					transition: border-color 0.2s ease;
				}

				.icf-mcp-create-textarea:focus {
					outline: none;
					border-color: var(--interactive-accent);
				}

				.icf-mcp-create-btn {
					background-color: var(--interactive-accent);
					color: var(--text-on-accent);
					border: none;
					border-radius: var(--radius-s);
					padding: 10px 16px;
					font-size: 14px;
					font-weight: 500;
					cursor: pointer;
					transition: all 0.2s ease;
					align-self: flex-start;
				}

				.icf-mcp-create-btn:hover:not(:disabled) {
					background-color: var(--interactive-accent-hover);
					transform: translateY(-1px);
				}

				.icf-mcp-create-btn:disabled {
					opacity: 0.5;
					cursor: not-allowed;
					transform: none;
				}

				/* Servers List */
				.icf-mcp-hub-list {
					display: flex;
					flex-direction: column;
					gap: 0;
					margin-bottom: 20px;
				}
			`}</style>
		</div>
	)
}

export default McpHubView
