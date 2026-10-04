import { App } from 'obsidian'
import { v4 as uuidv4 } from 'uuid'

import { AbstractJsonRepository } from '../base'
import { ROOT_DIR, WORKSPACE_DIR } from '../constants'

import {
	WORKSPACE_SCHEMA_VERSION,
	Workspace,
	WorkspaceMetadata
} from './types'

export class WorkspaceManager extends AbstractJsonRepository<
	Workspace,
	WorkspaceMetadata
> {
	constructor(app: App) {
		super(app, `${ROOT_DIR}/${WORKSPACE_DIR}`)
	}

	protected generateFileName(workspace: Workspace): string {
		// Format: v{schemaVersion}_{name}_{updatedAt}_{id}.json
		const encodedName = encodeURIComponent(workspace.name)
		return `v${String(workspace.schemaVersion)}_${encodedName}_${String(workspace.updatedAt)}_${workspace.id}.json`
	}

	protected parseFileName(fileName: string): WorkspaceMetadata | null {
		// Parse: v{schemaVersion}_{name}_{updatedAt}_{id}.json
		const regex = new RegExp(
			`^v${String(WORKSPACE_SCHEMA_VERSION)}_(.+)_(\\d+)_([0-9a-f-]+)\\.json$`,
		)
		const match = fileName.match(regex)
		if (!match) return null

		const name = decodeURIComponent(match[1])
		const updatedAt = parseInt(match[2], 10)
		const id = match[3]

		return {
			id,
			name,
			updatedAt,
			createdAt: 0,
			schemaVersion: WORKSPACE_SCHEMA_VERSION,
		}
	}

	public async createWorkspace(
		initialData: Partial<Workspace>,
	): Promise<Workspace> {
		const now = Date.now()
		const newWorkspace: Workspace = {
			id: uuidv4(),
			name: 'New Workspace',
			content: [],
			chatHistory: [],
			metadata: {},
			createdAt: now,
			updatedAt: now,
			schemaVersion: WORKSPACE_SCHEMA_VERSION,
			...initialData,
		}

		await this.create(newWorkspace)
		return newWorkspace
	}

	public async findById(id: string): Promise<Workspace | null> {
		const allMetadata = await this.listMetadata()
		const targetMetadata = allMetadata.find((meta) => meta.id === id)

		if (!targetMetadata) return null

		return this.read(targetMetadata.fileName)
	}

	public async findByName(name: string): Promise<Workspace | null> {
		const allMetadata = await this.listMetadata()
		const targetMetadata = allMetadata.find((meta) => meta.name === name)

		if (!targetMetadata) return null

		return this.read(targetMetadata.fileName)
	}

	public async updateWorkspace(
		id: string,
		updates: Partial<
			Omit<Workspace, 'id' | 'createdAt' | 'updatedAt' | 'schemaVersion'>
		>,
	): Promise<Workspace | null> {
		const workspace = await this.findById(id)
		if (!workspace) return null

		const updatedWorkspace: Workspace = {
			...workspace,
			...updates,
			updatedAt: Date.now(),
		}

		await this.update(workspace, updatedWorkspace)
		return updatedWorkspace
	}

	public async deleteWorkspace(id: string): Promise<boolean> {
		const allMetadata = await this.listMetadata()
		const targetMetadata = allMetadata.find((meta) => meta.id === id)
		if (!targetMetadata) return false

		await this.delete(targetMetadata.fileName)
		return true
	}

	public async listWorkspaces(): Promise<WorkspaceMetadata[]> {
		const metadata = await this.listMetadata()
		const sorted = metadata.sort((a, b) => b.updatedAt - a.updatedAt)
		return sorted
	}

	public async addChatToWorkspace(
		workspaceName: string,
		chatId: string,
		chatTitle: string
	): Promise<Workspace | null> {
		const workspace = await this.findByName(workspaceName)
		if (!workspace) return null

		const existingChatIndex = workspace.chatHistory.findIndex(
			chat => chat.id === chatId
		)

		if (existingChatIndex >= 0) {
			// 更新已存在的聊天标题
			workspace.chatHistory[existingChatIndex].title = chatTitle
		} else {
			// 添加新聊天
			workspace.chatHistory.push({ id: chatId, title: chatTitle })
		}

		return this.updateWorkspace(workspace.id, {
			chatHistory: workspace.chatHistory
		})
	}

	public async removeChatFromWorkspace(
		workspaceId: string,
		chatId: string
	): Promise<Workspace | null> {
		const workspace = await this.findById(workspaceId)
		if (!workspace) return null

		workspace.chatHistory = workspace.chatHistory.filter(
			chat => chat.id !== chatId
		)

		return this.updateWorkspace(workspaceId, {
			chatHistory: workspace.chatHistory
		})
	}

	public async ensureDefaultVaultWorkspace(): Promise<Workspace> {
		// 检查是否已存在默认的 vault 工作区
		const existingVault = await this.findByName('vault')
		if (existingVault) {
			return existingVault
		}

		// 创建默认的 vault 工作区
		const defaultWorkspace = await this.createWorkspace({
			name: 'vault',
			content: [
				{
					type: 'folder',
					content: '/' // 整个 vault 根目录
				}
			],
			metadata: {
				isDefault: true,
				description: 'all vault as workspace'
			}
		})

		return defaultWorkspace
	}
} 
