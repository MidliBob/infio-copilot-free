import { PGliteInterface, Transaction } from '@electric-sql/pglite'
import { App } from 'obsidian'

import {
	InsertConversation,
	InsertMessage,
	SelectConversation,
	SelectMessage,
} from '../../schema'


export class ConversationRepository {
	private app: App
	private db: PGliteInterface

	constructor(app: App, db: PGliteInterface) {
		this.app = app
		this.db = db
	}

	async tx(callback: (tx: Transaction) => Promise<void>) {
		await this.db.transaction(async (tx) => {
			await callback(tx)
		});
	}

	async create(conversation: InsertConversation, tx?: Transaction): Promise<SelectConversation> {
		const result = await (tx ?? this.db).query<SelectConversation>(
			`INSERT INTO conversations (id, title, created_at, updated_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
			[
				conversation.id,
				conversation.title,
				conversation.createdAt || new Date(),
				conversation.updatedAt || new Date()
			]
		)
		return result.rows[0]
	}

	async createMessage(message: InsertMessage, tx?: Transaction): Promise<SelectMessage> {
		const result = await (tx ?? this.db).query<SelectMessage>(
			`INSERT INTO messages (
        id, conversation_id, apply_status, role, content, reasoning_content,
        prompt_content, metadata, mentionables, 
        similarity_search_results, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
			[
				message.id,
				message.conversationId,
				message.apply_status,
				message.role,
				message.content,
				message.reasoningContent,
				message.promptContent,
				message.metadata,
				message.mentionables,
				message.similaritySearchResults,
				message.createdAt || new Date()
			]
		)
		return result.rows[0]
	}

	async findById(id: string, tx?: Transaction): Promise<SelectConversation | undefined> {
		const result = await (tx ?? this.db).query<SelectConversation>(
			`SELECT * FROM conversations WHERE id = $1 LIMIT 1`,
			[id]
		)
		return result.rows[0]
	}

	async findMessagesByConversationId(conversationId: string, tx?: Transaction): Promise<SelectMessage[]> {
		const result = await (tx ?? this.db).query<SelectMessage>(
			`SELECT * FROM messages 
       WHERE conversation_id = $1 
       ORDER BY created_at`,
			[conversationId]
		)
		return result.rows
	}

	async findAll(tx?: Transaction): Promise<SelectConversation[]> {
		const result = await (tx ?? this.db).query<SelectConversation>(
			`SELECT * FROM conversations ORDER BY created_at DESC`
		)
		return result.rows
	}

	async update(id: string, data: Partial<InsertConversation>, tx?: Transaction): Promise<SelectConversation> {
		const setClauses: string[] = []
		const values: (string | Date)[] = []
		let paramIndex = 1

		if (data.title !== undefined) {
			setClauses.push(`title = $${String(paramIndex)}`)
			values.push(data.title)
			paramIndex++
		}

		// Always update updated_at
		setClauses.push(`updated_at = $${String(paramIndex)}`)
		values.push(new Date())
		paramIndex++

		// Add id as the last parameter
		values.push(id)

		const result = await (tx ?? this.db).query<SelectConversation>(
			`UPDATE conversations 
       SET ${setClauses.join(', ')} 
       WHERE id = $${String(paramIndex)}
       RETURNING *`,
			values
		)
		return result.rows[0]
	}

	async delete(id: string, tx?: Transaction): Promise<boolean> {
		const result = await (tx ?? this.db).query<SelectConversation>(
			`DELETE FROM conversations WHERE id = $1 RETURNING *`,
			[id]
		)
		return result.rows.length > 0
	}

	async deleteAllMessagesFromConversation(conversationId: string, tx?: Transaction): Promise<void> {
		await (tx ?? this.db).query(
			`DELETE FROM messages WHERE conversation_id = $1`,
			[conversationId]
		)
		return
	}
}
