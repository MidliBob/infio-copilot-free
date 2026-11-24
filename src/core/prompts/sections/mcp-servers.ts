import type { z } from 'zod'

import { DiffStrategy } from "../../diff/DiffStrategy"
import { ServerConfigSchema } from "../../mcp/config-schema"
import { McpHub } from "../../mcp/McpHub"

type McpServerConfig = z.infer<typeof ServerConfigSchema>

/**
 * `McpServer.config` is the JSON string McpHub stored for the server. Here it is
 * re-validated with the same schema the hub uses, so this prompt section never
 * dereferences an unvalidated shape: an unparsable config renders the server
 * without a transport descriptor instead of throwing mid-prompt.
 */
function parseServerConfig(raw: string): McpServerConfig | null {
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return null
	}
	const result = ServerConfigSchema.safeParse(parsed)
	return result.success ? result.data : null
}

/**
 * One-line transport descriptor for the section heading: the command line for
 * stdio servers, the endpoint URL for the HTTP transports.
 */
function describeTransport(config: McpServerConfig | null): string {
	if (!config) {
		return ''
	}
	if (config.type === 'stdio') {
		return config.args && config.args.length > 0
			? `${config.command} ${config.args.join(' ')}`
			: config.command
	}
	return config.url
}

/**
 * Transport descriptor for a stored server config: the command line for stdio
 * servers, the endpoint URL for the HTTP transports, or an empty string when
 * the stored config is unparsable. Exported for tests — the section itself
 * only renders the result.
 */
export function describeMcpServerTransport(rawConfig: string): string {
	return describeTransport(parseServerConfig(rawConfig))
}

export async function getMcpServersSection(
	mcpHub?: McpHub,
	diffStrategy?: DiffStrategy,
	enableMcpServerCreation?: boolean,
): Promise<string> {
	if (!mcpHub) {
		return ""
	}

	const servers = mcpHub.getServers()
	const connectedServers =
		servers.length > 0
			? servers
				.filter((server) => server.status === "connected")
				.map((server) => {
					const tools = server.tools
						?.map((tool) => {
							const schemaStr = tool.inputSchema
								? `    Input Schema:
		${JSON.stringify(tool.inputSchema, null, 2).split("\n").join("\n    ")}`
								: ""

							return `- ${tool.name}: ${tool.description ?? ""}\n${schemaStr}`
						})
						.join("\n\n")

					const templates = server.resourceTemplates
						?.map((template) => `- ${template.uriTemplate} (${template.name}): ${template.description ?? ""}`)
						.join("\n")

					const resources = server.resources
						?.map((resource) => `- ${resource.uri} (${resource.name}): ${resource.description ?? ""}`)
						.join("\n")

					const transport = describeMcpServerTransport(server.config)
					const heading = transport
						? `## ${server.name} (\`${transport}\`)`
						: `## ${server.name}`

					return (
						heading +
						(tools ? `\n\n### Available Tools\n${tools}` : "") +
						(templates ? `\n\n### Resource Templates\n${templates}` : "") +
						(resources ? `\n\n### Direct Resources\n${resources}` : "")
					)
				})
				.join("\n\n")
			: "(No MCP servers currently connected)"

	const baseSection = `MCP SERVERS

The Model Context Protocol (MCP) enables communication between the system and MCP servers that provide additional tools and resources to extend your capabilities. MCP servers can be one of two types:

1. Local (Stdio-based) servers: These run locally on the user's machine and communicate via standard input/output
2. Remote (SSE-based) servers: These run on remote machines via Server-Sent Events (SSE) over HTTP/HTTPS

# Connected MCP Servers

When a server is connected, you can use the server's tools via the \`use_mcp_tool\` tool, and access the server's resources via the \`access_mcp_resource\` tool.

${connectedServers}`

	if (!enableMcpServerCreation) {
		return baseSection
	}

	return (
		baseSection +
		`
## Creating an MCP Server

The user may ask you something along the lines of "add a tool" that does some function, in other words to create an MCP server that provides tools and resources that may connect to external APIs for example. If they do, you should obtain detailed instructions on this topic using the fetch_instructions tool, like this:
<fetch_instructions>
<task>create_mcp_server</task>
</fetch_instructions>`
	)
}
