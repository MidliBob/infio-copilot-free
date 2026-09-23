import {
	ArrowRight,
	Box,
	ChevronDown,
	ChevronRight,
	FolderOpen,
	MessageSquare,
	Pencil,
	Plus,
	RotateCcw,
	Tag,
	Trash2
} from 'lucide-react'
import { Notice } from 'obsidian'
import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../contexts/AppContext'
import { showConfirm } from '../../utils/modal-dialogs'
import { useSettings } from '../../contexts/SettingsContext'
import { Workspace, WorkspaceContent } from '../../database/json/workspace/types'
import { WorkspaceManager } from '../../database/json/workspace/WorkspaceManager'
import { t } from '../../lang/helpers'

import WorkspaceEditModal from './WorkspaceEditModal'
import { logger } from '../../utils/logger'

interface WorkspaceInfo extends Workspace {
	isCurrent: boolean
}

const WorkspaceView = () => {
	const app = useApp()
	const { settings, setSettings } = useSettings()
	const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [workspaceManager, setWorkspaceManager] = useState<WorkspaceManager | null>(null)
	const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null)
	const [isEditModalOpen, setIsEditModalOpen] = useState(false)
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

	// 初始化工作区管理器
	useEffect(() => {
		const manager = new WorkspaceManager(app)
		setWorkspaceManager(manager)
	}, [app])

	// 获取当前工作区名称
	const getCurrentWorkspaceName = (): string => {
		return settings.workspace || 'vault'
	}

	// 获取工作区列表
	const getWorkspaces = useCallback(async (): Promise<WorkspaceInfo[]> => {
		if (!workspaceManager) return []

		try {
			// 确保默认 vault 工作区存在
			await workspaceManager.ensureDefaultVaultWorkspace()
			
			// 获取所有工作区
			const workspaceMetadata = await workspaceManager.listWorkspaces()
			
			const workspaceList: WorkspaceInfo[] = []
			const currentWorkspaceName = getCurrentWorkspaceName()
			
			for (const meta of workspaceMetadata) {
				const workspace = await workspaceManager.findById(meta.id)
				if (workspace) {
					workspaceList.push({
						...workspace,
						isCurrent: workspace.name === currentWorkspaceName
					})
				}
			}
			
			return workspaceList
		} catch (error) {
			logger.error('Failed to fetch the workspace list:', error)
			return []
		}
	}, [workspaceManager, settings.workspace])

	// 刷新工作区列表
	const refreshWorkspaces = useCallback(async () => {
		setIsLoading(true)
		try {
			const workspaceList = await getWorkspaces()
			setWorkspaces(workspaceList)
		} catch (error) {
			logger.error('Failed to refresh the workspace list:', error)
			new Notice(String(t('workspace.notices.refreshFailed')))
		} finally {
			setIsLoading(false)
		}
	}, [getWorkspaces])

	// 切换到指定工作区
	const switchToWorkspace = async (workspace: WorkspaceInfo) => {
		if (workspace.isCurrent) {
			new Notice(String(t('workspace.notices.alreadyInWorkspace')))
			return
		}

		try {
			// 更新设置中的工作区
			setSettings({
				...settings,
				workspace: workspace.name
			})

			// 刷新工作区列表以更新状态
			await refreshWorkspaces()
		} catch (error) {
			logger.error('Failed to switch workspace:', error)
			new Notice(String(t('workspace.notices.switchFailed')))
		}
	}

	// 删除工作区
	const deleteWorkspace = async (workspace: WorkspaceInfo) => {
		if (!workspaceManager) return

		if (workspace.isCurrent) {
			new Notice(String(t('workspace.notices.cannotDeleteCurrent')))
			return
		}

		if (workspace.name === 'vault') {
			new Notice(String(t('workspace.notices.cannotDeleteDefault')))
			return
		}

		try {
			const success = await workspaceManager.deleteWorkspace(workspace.id)
			if (success) {
				new Notice(String(t('workspace.notices.deleted', { name: workspace.name })))
				await refreshWorkspaces()
			} else {
				new Notice(String(t('workspace.notices.deleteFailed')))
			}
		} catch (error) {
			logger.error('Failed to delete workspace:', error)
			new Notice(String(t('workspace.notices.deleteFailed')))
		}
	}

	// 创建新工作区
	const createNewWorkspace = () => {
		setIsCreateModalOpen(true)
	}

	// 关闭创建模态框
	const closeCreateModal = () => {
		setIsCreateModalOpen(false)
	}

	// 保存新工作区
	const saveNewWorkspace = async (workspaceData: Partial<Workspace>) => {
		if (!workspaceManager) return

		try {
			const newWorkspace = await workspaceManager.createWorkspace({
				name: workspaceData.name || String(t('workspace.newWorkspace')),
				content: workspaceData.content || [],
				metadata: {
					description: workspaceData.metadata?.description || String(t('workspace.newWorkspace'))
				}
			})

			new Notice(String(t('workspace.notices.created', { name: newWorkspace.name })))
			await refreshWorkspaces()
			closeCreateModal()
		} catch (error) {
			logger.error('Failed to create workspace:', error)
			throw error
		}
	}

	// 打开编辑工作区模态框
	const openEditModal = (workspace: WorkspaceInfo) => {
		setEditingWorkspace(workspace)
		setIsEditModalOpen(true)
	}

	// 关闭编辑模态框
	const closeEditModal = () => {
		setIsEditModalOpen(false)
		setEditingWorkspace(null)
	}

	// 保存工作区编辑
	const saveWorkspaceEdit = async (updates: Partial<Workspace>) => {
		if (!workspaceManager || !editingWorkspace) return

		try {
			await workspaceManager.updateWorkspace(editingWorkspace.id, updates)
			new Notice(String(t('workspace.notices.updated', { name: updates.name || editingWorkspace.name })))
			await refreshWorkspaces()
		} catch (error) {
			logger.error('Failed to update workspace:', error)
			throw error
		}
	}

	// 格式化工作区内容
	const formatWorkspaceContent = (content: WorkspaceContent[]): string => {
		if (content.length === 0) return String(t('workspace.empty'))
		
		const folders = content.filter(c => c.type === 'folder').length
		const tags = content.filter(c => c.type === 'tag').length
		
		const parts = []
		if (folders > 0) parts.push(`${folders} ${String(t('workspace.folders'))}`)
		if (tags > 0) parts.push(`${tags} ${String(t('workspace.tags'))}`)
		
		return parts.join(', ') || String(t('workspace.noContent'))
	}

	// 展开状态管理
	const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set())
	const [expandedChats, setExpandedChats] = useState<Set<string>>(new Set())

	// 切换工作区内容展开状态
	const toggleWorkspaceExpanded = (workspaceId: string) => {
		const newExpanded = new Set(expandedWorkspaces)
		if (newExpanded.has(workspaceId)) {
			newExpanded.delete(workspaceId)
		} else {
			newExpanded.add(workspaceId)
		}
		setExpandedWorkspaces(newExpanded)
	}

	// 切换对话历史展开状态
	const toggleChatExpanded = (workspaceId: string) => {
		const newExpanded = new Set(expandedChats)
		if (newExpanded.has(workspaceId)) {
			newExpanded.delete(workspaceId)
		} else {
			newExpanded.add(workspaceId)
		}
		setExpandedChats(newExpanded)
	}

	// 格式化时间
	const formatLastOpened = (timestamp?: number) => {
		if (!timestamp) return t('workspace.timeUnknown')
		
		const now = Date.now()
		const diff = now - timestamp
		const minutes = Math.floor(diff / 60000)
		const hours = Math.floor(diff / 3600000)
		const days = Math.floor(diff / 86400000)
		
		if (minutes < 1) return t('workspace.timeJustNow')
		if (minutes < 60) return t('workspace.timeMinutesAgo', { n: minutes })
		if (hours < 24) return t('workspace.timeHoursAgo', { n: hours })
		if (days < 7) return t('workspace.timeDaysAgo', { n: days })
		
		return new Date(timestamp).toLocaleDateString('zh-CN', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		})
	}

	// 组件初始化
	useEffect(() => {
		refreshWorkspaces().catch((error) => {
			logger.error('Failed to initialize the workspace list:', error)
		})
	}, [refreshWorkspaces])

	return (
		<div className="icf-workspace-view-container">
			{/* 头部 */}
			<div className="icf-workspace-view-header">
				<div className="icf-workspace-view-title">
					<h2>{t('workspace.title')}</h2>
				</div>
				<div className="icf-workspace-view-header-actions">
					<button
						onClick={refreshWorkspaces}
						className="icf-workspace-view-refresh-btn"
						disabled={isLoading}
						title={t('workspace.refreshTooltip')}
					>
						<RotateCcw size={16} className={isLoading ? 'spinning' : ''} />
					</button>
				</div>
			</div>

			{/* 描述 */}
			<div className="icf-workspace-view-tip">
				{t('workspace.description')}
			</div>

			{/* 创建新工作区按钮 */}
			<div className="icf-workspace-view-create-action">
				<button
					className="icf-workspace-view-create-btn"
					onClick={createNewWorkspace}
					disabled={isLoading}
				>
					<Plus size={16} />
					<span>{t('workspace.createNew')}</span>
				</button>
			</div>

			{/* 工作区列表 */}
			<div className="icf-workspace-view-list">
				<div className="icf-workspace-view-list-header">
					<h3>{t('workspace.recentWorkspaces')}</h3>
				</div>
				
				{isLoading ? (
					<div className="icf-workspace-view-loading">
						{t('workspace.loading')}
					</div>
				) : workspaces.length === 0 ? (
					<div className="icf-workspace-view-empty">
						<Box size={48} className="icf-workspace-view-empty-icon" />
						<p>{t('workspace.noWorkspaces')}</p>
					</div>
				) : (
					<div className="icf-workspace-view-items">
						{workspaces.map((workspace, index) => (
							<div 
								key={workspace.id || index} 
								className={`icf-workspace-view-item ${workspace.isCurrent ? 'current' : ''}`}
							>
								<div className="icf-workspace-view-item-header">
									<div className="icf-workspace-view-item-icon">
										{workspace.isCurrent ? (
											<Box size={20} />
										) : (
											<Box size={20} />
										)}
									</div>
									<div className="icf-workspace-view-item-name">
										{workspace.name}
										{workspace.isCurrent && (
											<span className="icf-workspace-view-current-badge">{String(t('workspace.current'))}</span>
										)}
									</div>
									<div className="icf-workspace-view-item-actions">
										{!workspace.isCurrent && (
											<button
												onClick={() => switchToWorkspace(workspace)}
												className="icf-workspace-view-action-btn switch-btn"
												title={t('workspace.switchToTooltip')}
											>
												<ArrowRight size={16} />
											</button>
										)}
										{workspace.name !== 'vault' && (
											<button
												onClick={() => openEditModal(workspace)}
												className="icf-workspace-view-action-btn"
												title={String(t('workspace.editTooltip'))}
											>
												<Pencil size={16} />
											</button>
										)}
										{!workspace.isCurrent && workspace.name !== 'vault' && (
											<button
												onClick={async () => {
													const confirmed = await showConfirm(app, {
														message: String(t('workspace.deleteConfirm', { name: workspace.name })),
														danger: true,
													})
													if (confirmed) {
														void deleteWorkspace(workspace)
													}
												}}
												className="icf-workspace-view-action-btn danger"
												title={String(t('workspace.deleteTooltip'))}
											>
												<Trash2 size={16} />
											</button>
										)}
									</div>
								</div>
								<div className="icf-workspace-view-item-content">
									{/* 工作区内容 */}
									<div 
										className="icf-workspace-view-item-path clickable"
										onClick={() => toggleWorkspaceExpanded(workspace.id)}
									>
										<div className="icf-workspace-view-item-path-info">
											<FolderOpen size={12} />
											{formatWorkspaceContent(workspace.content)}
										</div>
										{workspace.content.length > 0 && (
											<div className="icf-workspace-view-expand-icon">
												{expandedWorkspaces.has(workspace.id) ? (
													<ChevronDown size={14} />
												) : (
													<ChevronRight size={14} />
												)}
											</div>
										)}
									</div>
									
									{/* 展开的内容详情 */}
									{expandedWorkspaces.has(workspace.id) && workspace.content.length > 0 && (
										<div className="icf-workspace-view-content-details">
											<div className="icf-workspace-view-content-list">
												{workspace.content.map((item, itemIndex) => (
													<div key={itemIndex} className="icf-workspace-view-content-item">
														{item.type === 'folder' ? (
															<FolderOpen size={14} />
														) : (
															<Tag size={14} />
														)}
														<span className="icf-workspace-view-content-text">
															{item.content}
														</span>
														<span className="icf-workspace-view-content-type">
															{item.type === 'folder' ? t('workspace.itemTypeFolder') : t('workspace.itemTypeTag')}
														</span>
													</div>
												))}
											</div>
										</div>
									)}

									{/* 对话历史 */}
									<div 
										className="icf-workspace-view-chat-info clickable"
										onClick={() => toggleChatExpanded(workspace.id)}
									>
										<div className="icf-workspace-view-chat-info-content">
											<MessageSquare size={12} />
											<span>{workspace.chatHistory.length} {String(t('workspace.conversations'))}</span>
										</div>
										{workspace.chatHistory.length > 0 && (
											<div className="icf-workspace-view-expand-icon">
												{expandedChats.has(workspace.id) ? (
													<ChevronDown size={14} />
												) : (
													<ChevronRight size={14} />
												)}
											</div>
										)}
									</div>

									{/* 展开的对话历史详情 */}
									{expandedChats.has(workspace.id) && workspace.chatHistory.length > 0 && (
										<div className="icf-workspace-view-chat-details">
											<div className="icf-workspace-view-chat-list">
												{workspace.chatHistory.slice(-5).reverse().map((chat, chatIndex) => (
													<div key={chatIndex} className="icf-workspace-view-chat-item">
														<MessageSquare size={14} />
														<span className="icf-workspace-view-chat-title">
															{chat.title || t('workspace.untitledChat', { id: chat.id.slice(0, 8) })}
														</span>
													</div>
												))}
											</div>
										</div>
									)}
									
									<div className="icf-workspace-view-item-meta">
										{String(t('workspace.created'))}: {new Date(workspace.createdAt).toLocaleDateString('zh-CN')} | 
										{String(t('workspace.updated'))}: {formatLastOpened(workspace.updatedAt)}
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* 编辑模态框 */}
			{editingWorkspace && (
				<WorkspaceEditModal
					workspace={editingWorkspace}
					app={app}
					isOpen={isEditModalOpen}
					onClose={closeEditModal}
					onSave={saveWorkspaceEdit}
				/>
			)}

			{/* 创建工作区模态框 */}
			<WorkspaceEditModal
				workspace={undefined}
				app={app}
				isOpen={isCreateModalOpen}
				onClose={closeCreateModal}
				onSave={saveNewWorkspace}
			/>

			{/* 样式 */}
			<style>
				{`
				.icf-workspace-view-container {
					display: flex;
					flex-direction: column;
					padding: 16px;
					gap: 16px;
					color: var(--text-normal);
					height: 100%;
					overflow-y: auto;
					scrollbar-width: none;
					-ms-overflow-style: none;
				}

				.icf-workspace-view-container::-webkit-scrollbar {
					display: none;
				}

				.icf-workspace-view-header {
					display: flex;
					justify-content: space-between;
					align-items: center;
					width: 100%;
					min-height: 40px;
					margin-bottom: 8px;
				}

				.icf-workspace-view-title h2 {
					margin: 0;
					font-size: 24px;
					flex: 1;
				}

				.icf-workspace-view-header-actions {
					display: flex;
					gap: 8px;
					flex-shrink: 0;
				}

				.icf-workspace-view-refresh-btn {
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

				.spinning {
					animation: spin 1s linear infinite;
				}

				@keyframes spin {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}

				.icf-workspace-view-tip {
					color: var(--text-muted);
					font-size: 14px;
					margin-bottom: 8px;
				}

				.icf-workspace-view-create-action {
					margin-bottom: 16px;
				}

				.icf-workspace-view-create-btn {
					display: flex;
					align-items: center;
					gap: 8px;
					background-color: var(--background-primary);
					border: 1px solid var(--background-modifier-border);
					color: var(--text-normal);
					padding: 12px 16px;
					border-radius: var(--radius-m);
					cursor: pointer;
					transition: all 0.2s ease;
					font-size: 14px;
					font-weight: 500;
					width: 100%;
					justify-content: center;
				}

				.icf-workspace-view-create-btn:hover:not(:disabled) {
					background-color: var(--background-modifier-hover);
					border-color: var(--text-accent);
					color: var(--text-accent);
				}

				.icf-workspace-view-create-btn:disabled {
					opacity: 0.6;
					cursor: not-allowed;
				}

				.icf-workspace-view-current {
					background-color: var(--background-secondary);
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-m);
					padding: 16px;
					margin-bottom: 8px;
				}

				.icf-workspace-view-current-header {
					display: flex;
					align-items: center;
					gap: 8px;
					font-weight: 500;
					color: var(--text-normal);
					margin-bottom: 8px;
				}

				.icf-workspace-view-current-info {
					margin-left: 26px;
				}

				.icf-workspace-view-current-name {
					font-size: 16px;
					font-weight: 500;
					margin-bottom: 4px;
				}

				.icf-workspace-view-current-status {
					color: var(--text-muted);
					font-size: 14px;
				}

				.icf-workspace-view-list {
					flex: 1;
					display: flex;
					flex-direction: column;
				}

				.icf-workspace-view-list-header h3 {
					margin: 0 0 12px 0;
					font-size: 16px;
					font-weight: 500;
				}

				.icf-workspace-view-loading {
					padding: 20px;
					text-align: center;
					color: var(--text-muted);
				}

				.icf-workspace-view-empty {
					display: flex;
					flex-direction: column;
					align-items: center;
					padding: 40px 20px;
					color: var(--text-muted);
				}

				.icf-workspace-view-empty-icon {
					margin-bottom: 16px;
					opacity: 0.5;
				}

				.icf-workspace-view-items {
					display: flex;
					flex-direction: column;
					gap: 8px;
				}

				.icf-workspace-view-item {
					display: flex;
					flex-direction: column;
					background-color: var(--background-primary);
					border: 1px solid var(--background-modifier-border);
					border-radius: var(--radius-s);
					padding: 12px;
					transition: all 0.2s ease;
				}

				.icf-workspace-view-item:hover {
					background-color: var(--background-modifier-hover);
				}

				.icf-workspace-view-item.current {
					border-color: var(--background-modifier-border);
					background-color: var(--background-primary);
				}

				.icf-workspace-view-item-header {
					display: flex;
					align-items: center;
					justify-content: space-between;
					width: 100%;
					margin-bottom: 8px;
				}

				.icf-workspace-view-item-icon {
					color: var(--text-muted);
					flex-shrink: 0;
					order: 1;
				}

				.icf-workspace-view-item-name {
					display: flex;
					align-items: center;
					gap: 8px;
					font-weight: 500;
					flex: 1;
					margin-left: 8px;
					margin-bottom: 4px;
					justify-content: flex-start;
					order: 2;
				}

				.icf-workspace-view-item-actions {
					display: flex;
					gap: 4px;
					flex-shrink: 0;
					order: 3;
				}

				.icf-workspace-view-item.current .icf-workspace-view-item-icon {
					color: var(--text-accent);
				}

				.icf-workspace-view-item-content {
					display: flex;
					flex-direction: column;
					gap: 4px;
				}

				.icf-workspace-view-current-badge {
					background-color: var(--text-accent);
					color: var(--text-on-accent);
					font-size: 12px;
					padding: 3px 8px;
					border-radius: 12px;
					font-weight: 500;
					box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
				}

				.icf-workspace-view-item-path {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 6px;
					color: var(--text-muted);
					font-size: 12px;
					margin-bottom: 2px;
					padding: 4px 0;
					border-radius: var(--radius-s);
					transition: all 0.2s ease;
				}

				.icf-workspace-view-item-path.clickable {
					cursor: pointer;
					padding: 6px 8px;
					margin: -2px -4px;
				}

				.icf-workspace-view-item-path.clickable:hover {
					background-color: var(--background-modifier-hover);
				}

				.icf-workspace-view-item-path-info {
					display: flex;
					align-items: center;
					gap: 6px;
					flex: 1;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}

				.icf-workspace-view-expand-icon {
					display: flex;
					align-items: center;
					color: var(--text-muted);
					flex-shrink: 0;
					transition: transform 0.2s ease;
				}

				.icf-workspace-view-content-details {
					margin-top: 8px;
					padding: 8px 0;
					border-top: 1px solid var(--background-modifier-border);
				}

				.icf-workspace-view-content-list {
					display: flex;
					flex-direction: column;
					gap: 4px;
				}

				.icf-workspace-view-content-item {
					display: flex;
					align-items: center;
					gap: 8px;
					padding: 4px 8px;
					background-color: var(--background-secondary);
					border-radius: var(--radius-s);
					font-size: 12px;
				}

				.icf-workspace-view-content-text {
					flex: 1;
					color: var(--text-normal);
					font-weight: 500;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}

				.icf-workspace-view-content-type {
					color: var(--text-muted);
					font-size: 11px;
					background-color: var(--background-modifier-border);
					padding: 2px 6px;
					border-radius: 10px;
					flex-shrink: 0;
				}

				.icf-workspace-view-chat-info {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 6px;
					color: var(--text-muted);
					font-size: 12px;
					margin-top: 4px;
					padding: 4px 0;
					border-radius: var(--radius-s);
					transition: all 0.2s ease;
				}

				.icf-workspace-view-chat-info.clickable {
					cursor: pointer;
					padding: 6px 8px;
					margin: 2px -4px;
				}

				.icf-workspace-view-chat-info.clickable:hover {
					background-color: var(--background-modifier-hover);
				}

				.icf-workspace-view-chat-info-content {
					display: flex;
					align-items: center;
					gap: 6px;
					flex: 1;
				}

				.icf-workspace-view-chat-details {
					margin-top: 8px;
					padding: 8px 0;
					border-top: 1px solid var(--background-modifier-border);
				}

				.icf-workspace-view-chat-list {
					display: flex;
					flex-direction: column;
					gap: 4px;
				}

				.icf-workspace-view-chat-item {
					display: flex;
					align-items: center;
					gap: 8px;
					padding: 4px 8px;
					background-color: var(--background-secondary);
					border-radius: var(--radius-s);
					font-size: 12px;
				}

				.icf-workspace-view-chat-title {
					flex: 1;
					color: var(--text-normal);
					font-weight: 500;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}

				.icf-workspace-view-item-meta {
					color: var(--text-muted);
					font-size: 12px;
					margin-top: 4px;
				}

				.icf-workspace-view-action-btn {
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
					border-radius: var(--radius-s);

					&:hover {
						background-color: var(--background-modifier-hover) !important;
					}
				}
				`}
			</style>
		</div>
	)
}

export default WorkspaceView
