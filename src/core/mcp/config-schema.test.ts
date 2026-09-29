/**
 * Contract tests for the MCP server config schema.
 *
 * The 1.6.19 transport migration made Streamable HTTP the inferred default
 * for URL-based servers (MCP spec 2025-03-26), with legacy HTTP+SSE kept as
 * an explicit opt-in (`"type": "sse"`) and as the runtime fallback inside
 * connectToServer. These tests pin the inference rules so a schema reorder
 * (z.union picks the first matching member) cannot silently flip user
 * configs back to SSE or break stdio.
 */
import { McpSettingsSchema, ServerConfigSchema } from './config-schema'

describe('ServerConfigSchema', () => {
	it('infers stdio for command-based configs', () => {
		const result = ServerConfigSchema.safeParse({ command: 'node', args: ['build/index.js'] })
		expect(result.success).toBe(true)
		if (!result.success) return
		expect(result.data.type).toBe('stdio')
		if (result.data.type !== 'stdio') return
		expect(result.data.command).toBe('node')
		expect(result.data.args).toEqual(['build/index.js'])
	})

	it('infers streamableHttp for url-only configs', () => {
		const result = ServerConfigSchema.safeParse({ url: 'http://localhost:3000/mcp' })
		expect(result.success).toBe(true)
		if (!result.success) return
		expect(result.data.type).toBe('streamableHttp')
	})

	it('keeps an explicit sse type as legacy SSE', () => {
		const result = ServerConfigSchema.safeParse({ type: 'sse', url: 'http://localhost:3000/sse' })
		expect(result.success).toBe(true)
		if (!result.success) return
		expect(result.data.type).toBe('sse')
		if (result.data.type !== 'sse') return
		expect(result.data.url).toBe('http://localhost:3000/sse')
	})

	it('preserves an explicit streamableHttp type and headers', () => {
		const result = ServerConfigSchema.safeParse({
			type: 'streamableHttp',
			url: 'https://example.com/mcp',
			headers: { Authorization: 'Bearer token' },
		})
		expect(result.success).toBe(true)
		if (!result.success) return
		expect(result.data.type).toBe('streamableHttp')
		if (result.data.type === 'stdio') return
		expect(result.data.headers).toEqual({ Authorization: 'Bearer token' })
	})

	it('applies base defaults (timeout 60, empty alwaysAllow)', () => {
		const result = ServerConfigSchema.safeParse({ url: 'http://localhost:3000/mcp' })
		expect(result.success).toBe(true)
		if (!result.success) return
		expect(result.data.timeout).toBe(60)
		expect(result.data.alwaysAllow).toEqual([])
	})

	it('rejects configs mixing stdio and HTTP fields', () => {
		const result = ServerConfigSchema.safeParse({ command: 'node', url: 'http://localhost:3000/mcp' })
		expect(result.success).toBe(false)
	})

	it('rejects unknown server types', () => {
		const result = ServerConfigSchema.safeParse({ type: 'websocket', url: 'http://localhost:3000/mcp' })
		expect(result.success).toBe(false)
	})

	it('rejects sse/streamableHttp configs without a url', () => {
		expect(ServerConfigSchema.safeParse({ type: 'sse' }).success).toBe(false)
		expect(ServerConfigSchema.safeParse({ type: 'streamableHttp' }).success).toBe(false)
	})

	it('rejects configs with neither command nor url', () => {
		const result = ServerConfigSchema.safeParse({ disabled: true })
		expect(result.success).toBe(false)
	})
})

describe('McpSettingsSchema', () => {
	it('parses a whole settings file and infers per-server types', () => {
		const result = McpSettingsSchema.safeParse({
			mcpServers: {
				filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
				remote: { url: 'https://example.com/mcp' },
				legacy: { type: 'sse', url: 'https://example.com/sse' },
			},
		})
		expect(result.success).toBe(true)
		if (!result.success) return
		expect(result.data.mcpServers['filesystem']?.type).toBe('stdio')
		expect(result.data.mcpServers['remote']?.type).toBe('streamableHttp')
		expect(result.data.mcpServers['legacy']?.type).toBe('sse')
	})

	it('fails the whole file when one server config is invalid', () => {
		// McpHub.initializeGlobalMcpServers relies on this: a failed safeParse
		// routes to the raw-config path where servers are validated one by one.
		const result = McpSettingsSchema.safeParse({
			mcpServers: {
				good: { url: 'https://example.com/mcp' },
				bad: { type: 'carrier-pigeon' },
			},
		})
		expect(result.success).toBe(false)
	})
})
