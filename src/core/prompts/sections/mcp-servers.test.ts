import { describeMcpServerTransport } from './mcp-servers'

describe('describeMcpServerTransport', () => {
	it('renders the command of a stdio server without args', () => {
		expect(describeMcpServerTransport(JSON.stringify({ command: 'npx' }))).toBe('npx')
	})

	it('renders command plus args of a stdio server', () => {
		const config = {
			command: 'npx',
			args: ['-y', '@modelcontextprotocol/server-filesystem', '/vault'],
		}

		expect(describeMcpServerTransport(JSON.stringify(config))).toBe(
			'npx -y @modelcontextprotocol/server-filesystem /vault',
		)
	})

	it('renders the endpoint URL of the HTTP transports', () => {
		expect(
			describeMcpServerTransport(JSON.stringify({ url: 'https://mcp.example.com/sse' })),
		).toBe('https://mcp.example.com/sse')
		expect(
			describeMcpServerTransport(
				JSON.stringify({ type: 'sse', url: 'https://mcp.example.com/legacy' }),
			),
		).toBe('https://mcp.example.com/legacy')
	})

	it('returns an empty descriptor for an unparsable config', () => {
		expect(describeMcpServerTransport('{not json')).toBe('')
		expect(describeMcpServerTransport('null')).toBe('')
	})

	it('returns an empty descriptor for a config the schema rejects', () => {
		// Neither a command nor a url: McpHub would reject this row too.
		expect(describeMcpServerTransport(JSON.stringify({ disabled: true }))).toBe('')
		// stdio requires a non-empty command.
		expect(describeMcpServerTransport(JSON.stringify({ command: '' }))).toBe('')
	})
})
