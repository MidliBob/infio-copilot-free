import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Notice } from 'obsidian'
import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../contexts/AppContext'
import { useSettings } from '../../contexts/SettingsContext'
import { Workspace } from '../../database/json/workspace/types'
import { WorkspaceManager } from '../../database/json/workspace/WorkspaceManager'

interface WorkspaceInfo extends Workspace {
	isCurrent: boolean
}

const WorkspaceSelect = () => {
	const app = useApp()
	const { settings, setSettings } = useSettings()
	const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
	const [isOpen, setIsOpen] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [workspaceManager, setWorkspaceManager] = useState<WorkspaceManager | null>(null)

	// 初始化工作区管理器
	useEffect(() => {
		const manager = new WorkspaceManager(app)
		setWorkspaceManager(manager)
	}, [app])

	// 获取当前工作区名称
	const getCurrentWorkspaceName = () => {
		return settings.workspace || 'vault'
	}

	// 获取工作区列表
	const getWorkspaces = useCallback(async () => {
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
						isCurrent: workspace.name === currentWorkspaceName,
					})
				}
			}

			// 按名称排序，vault 排在最前面
			workspaceList.sort((a, b) => {
				if (a.name === 'vault') return -1
				if (b.name === 'vault') return 1
				return a.name.localeCompare(b.name)
			})

			return workspaceList
		} catch (error) {
			console.error('获取工作区列表失败:', error)
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
			console.error('刷新工作区列表失败:', error)
		} finally {
			setIsLoading(false)
		}
	}, [getWorkspaces])

	// 切换到指定工作区
	const switchToWorkspace = async (workspace: WorkspaceInfo) => {
		if (workspace.isCurrent) {
			setIsOpen(false)
			return
		}

		try {
			// 更新设置中的工作区
			setSettings({
				...settings,
				workspace: workspace.name
			})

			// 关闭下拉菜单
			setIsOpen(false)

			// 刷新工作区列表以更新状态
			await refreshWorkspaces()
		} catch (error) {
			console.error('切换工作区失败:', error)
			new Notice('切换工作区失败')
		}
	}

	// 初始化和设置变化时刷新
	useEffect(() => {
		refreshWorkspaces()
	}, [refreshWorkspaces])

	// 下拉菜单打开时刷新数据
	const handleOpenChange = (open: boolean) => {
		if (open && !isOpen) {
			refreshWorkspaces()
		}
		setIsOpen(open)
	}

	const currentWorkspace = workspaces.find(w => w.isCurrent)
	const displayName = currentWorkspace?.name || getCurrentWorkspaceName()

	return (
		<>
			<DropdownMenu.Root open={isOpen} onOpenChange={handleOpenChange}>
				<DropdownMenu.Trigger className="icf-workspace-select">
					<span className="icf-workspace-select__name">
						{displayName}
					</span>
					<div className="icf-workspace-select__icon">
						{isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
					</div>
				</DropdownMenu.Trigger>

				<DropdownMenu.Portal>
					<DropdownMenu.Content className="icf-popover icf-workspace-select-content">
						{isLoading ? (
							<div className="icf-workspace-loading">
								加载中...
							</div>
						) : workspaces.length === 0 ? (
							<div className="icf-workspace-empty">
								暂无工作区
							</div>
						) : (
							<ul>
								{workspaces.map((workspace) => (
									<DropdownMenu.Item
										key={workspace.id}
										onSelect={() => switchToWorkspace(workspace)}
										asChild
									>
										<li className={`icf-workspace-item`}>
											<span className="icf-workspace-item-name">
												{workspace.name}
											</span>
											{workspace.isCurrent && (
												<Check size={14} className="icf-workspace-check" />
											)}
										</li>
									</DropdownMenu.Item>
								))}
							</ul>
						)}
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>

			<style>{`
				button.icf-workspace-select {
					background-color: var(--background-modifier-hover);
					box-shadow: none;
					border: none;
					padding: var(--size-4-1) var(--size-4-3);
					font-size: var(--font-small);
					font-weight: var(--font-medium);
					color: var(--text-muted);
					display: flex;
					justify-content: flex-start;
					align-items: center;
					cursor: pointer;
					height: auto;
					max-width: 100%;
					gap: var(--size-2-2);
					border-radius: var(--radius-l);
					transition: all 0.15s ease-in-out;
				}

				button.icf-workspace-select:hover {
					color: var(--text-normal);
					background-color: var(--background-modifier-hover);
				}

				button.icf-workspace-select:disabled {
					opacity: 0.5;
					cursor: not-allowed;
				}

				.icf-workspace-select__name {
					flex-shrink: 1;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
					flex-grow: 1;
				}

				.icf-workspace-select__icon {
					flex-shrink: 0;
					display: flex;
					align-items: center;
					justify-content: center;
					margin-left: auto;
				}

				.icf-workspace-select-content {
					min-width: auto !important;
					width: fit-content !important;
					max-width: 200px;
					max-height: 200px;
					overflow-y: auto;
				}

				.icf-workspace-loading,
				.icf-workspace-empty {
					padding: var(--size-4-3) var(--size-4-2);
					color: var(--text-muted);
					font-size: var(--font-small);
					text-align: center;
				}

				.icf-workspace-item {
					display: flex;
					justify-content: space-between;
					align-items: center;
					width: 100%;
					padding: var(--size-4-2) var(--size-4-2);
					white-space: nowrap;
					cursor: pointer;
				}

				.icf-workspace-item-content {
					display: flex;
					flex-direction: column;
					gap: var(--size-2-1);
					flex: 1;
					min-width: 0;
				}

				.icf-workspace-item-name {
					font-size: var(--font-small);
					font-weight: 500;
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}

				.icf-workspace-item-info {
					font-size: var(--font-smallest);
					color: var(--text-muted);
					overflow: hidden;
					text-overflow: ellipsis;
					white-space: nowrap;
				}

				.icf-workspace-check {
					color: var(--text-accent);
					flex-shrink: 0;
				}

				/* 滚动条样式 */
				.icf-workspace-select-content::-webkit-scrollbar {
					width: 6px;
				}

				.icf-workspace-select-content::-webkit-scrollbar-track {
					background: transparent;
				}

				.icf-workspace-select-content::-webkit-scrollbar-thumb {
					background: var(--background-modifier-border);
					border-radius: 3px;
				}

				.icf-workspace-select-content::-webkit-scrollbar-thumb:hover {
					background: var(--background-modifier-border-hover);
				}
			`}</style>
		</>
	)
}

export default WorkspaceSelect
