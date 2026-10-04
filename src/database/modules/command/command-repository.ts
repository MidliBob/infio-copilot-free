import { PGliteInterface } from '@electric-sql/pglite'
import { App } from 'obsidian'

import { DatabaseNotInitializedException } from '../../exception'
import { type InsertTemplate, type SelectTemplate, type UpdateTemplate } from '../../schema'

export class CommandRepository {
	private app: App
	private db: PGliteInterface | null

	constructor(app: App, pgClient: PGliteInterface | null) {
		this.app = app
		this.db = pgClient
	}

	async create(command: InsertTemplate): Promise<SelectTemplate> {
		if (!this.db) {
			throw new DatabaseNotInitializedException()
		}

		const result = await this.db.query<SelectTemplate>(
			`INSERT INTO "template" (name, content)
       VALUES ($1, $2)
       RETURNING *`,
			[command.name, command.content]
		)
		return result.rows[0]
	}

	async findAll(): Promise<SelectTemplate[]> {
		if (!this.db) {
			throw new DatabaseNotInitializedException()
		}
		const result = await this.db.query<SelectTemplate>(
			`SELECT * FROM "template" ORDER BY created_at DESC`
		)
		return result.rows
	}

	async findByName(name: string): Promise<SelectTemplate | null> {
		if (!this.db) {
			throw new DatabaseNotInitializedException()
		}
		const result = await this.db.query<SelectTemplate>(
			`SELECT * FROM "template" WHERE name = $1`,
			[name]
		)
		return result.rows[0] ?? null
	}

	async update(
		id: string,
		command: UpdateTemplate,
	): Promise<SelectTemplate | null> {
		if (!this.db) {
			throw new DatabaseNotInitializedException()
		}

		const setClauses: string[] = []
		const params: any[] = []
		let paramIndex = 1

		if (command.name !== undefined) {
			setClauses.push(`name = $${String(paramIndex)}`)
			params.push(command.name)
			paramIndex++
		}

		if (command.content !== undefined) {
			setClauses.push(`content = $${String(paramIndex)}`)
			params.push(command.content)
			paramIndex++
		}

		setClauses.push(`updated_at = now()`)
		params.push(id)

		const result = await this.db.query<SelectTemplate>(
			`UPDATE "template"
       SET ${setClauses.join(', ')}
       WHERE id = $${String(paramIndex)}
       RETURNING *`,
			params
		)
		return result.rows[0] ?? null
	}

	async delete(id: string): Promise<boolean> {
		if (!this.db) {
			throw new DatabaseNotInitializedException()
		}
		const result = await this.db.query<SelectTemplate>(
			`DELETE FROM "template" WHERE id = $1 RETURNING *`,
			[id]
		)
		return result.rows.length > 0
	}
}
