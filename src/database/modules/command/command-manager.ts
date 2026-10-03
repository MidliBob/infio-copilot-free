import fuzzysort from 'fuzzysort'
import { App } from 'obsidian'

import { DBManager } from '../../database-manager'
import { DuplicateCommandException } from '../../exception'
import { InsertTemplate, SelectTemplate, UpdateTemplate } from '../../schema'

import { CommandRepository } from './command-repository'

export class CommandManager {
	private app: App
	private repository: CommandRepository
	private dbManager: DBManager

	constructor(app: App, dbManager: DBManager) {
		this.app = app
		this.dbManager = dbManager
		this.repository = new CommandRepository(app, dbManager.getPgClient())
	}

	async createCommand(command: InsertTemplate): Promise<SelectTemplate> {
		const existingTemplate = await this.repository.findByName(command.name)
		if (existingTemplate) {
			throw new DuplicateCommandException(command.name)
		}
		const created = await this.repository.create(command)
		return created
	}

	async updateCommand(id: string, template: UpdateTemplate): Promise<SelectTemplate> {
		const updated = await this.repository.update(id, template)
		return updated
	}

	async findAllCommands(): Promise<SelectTemplate[]> {
		return await this.repository.findAll()
	}

	getAllCommands(callback: (templates: SelectTemplate[]) => void): void {
		const db = this.dbManager.getPgClient()
		// fire-and-forget live subscription (PGlite resolves it once and then
		// pushes updates into the callback); explicitly void-marked since
		// 1.7.10 (no-floating-promises is enabled)
		void db?.live.query('SELECT * FROM template ORDER BY updated_at DESC', [], (results: { rows: Array<SelectTemplate> }) => {
			callback(results.rows.map(row => ({
				id: row.id,
				name: row.name,
				content: row.content,
				createdAt: row.createdAt,
				updatedAt: row.updatedAt,
			})))
		})
	}

	async searchCommands(query: string): Promise<SelectTemplate[]> {
		const commands = await this.findAllCommands()
		const results = fuzzysort.go(query, commands, {
			keys: ['name'],
			threshold: 0.2,
			limit: 20,
			all: true,
		})
		return results.map((result) => result.obj)
	}

	async deleteCommand(id: string): Promise<boolean> {
		const deleted = await this.repository.delete(id)
		return deleted
	}
}
