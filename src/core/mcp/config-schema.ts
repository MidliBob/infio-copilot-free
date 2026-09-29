import { z } from "zod";

/**
 * MCP server configuration schemas and JSON guards.
 *
 * Split out of McpHub.ts so the inference contract can be unit-tested
 * (McpHub.ts transitively imports the ESM-only `delay` package, which the
 * CJS jest runtime cannot parse) and to keep the zod schemas next to the
 * structural guards that validate raw `mcp_settings.json` content.
 *
 * Transport inference rules (pinned by McpHub contract tests):
 * - `command` present            -> stdio
 * - `url` present, no type       -> streamableHttp (MCP spec 2025-03-26;
 *                                   connectToServer retries over legacy SSE
 *                                   for servers that reject the handshake)
 * - explicit `type: "sse"`       -> legacy HTTP+SSE (opt-in escape hatch)
 */

// Base configuration schema for common settings
const BaseConfigSchema = z.object({
	disabled: z.boolean().optional(),
	timeout: z.number().min(1).max(3600).optional().default(60),
	alwaysAllow: z.array(z.string()).default([]),
	watchPaths: z.array(z.string()).optional(), // paths to watch for changes and restart server
})

// Custom error messages for better user feedback
export const typeErrorMessage = "Server type must be 'stdio', 'sse' or 'streamableHttp'"
export const stdioFieldsErrorMessage =
	"For 'stdio' type servers, you must provide a 'command' field and can optionally include 'args' and 'env'"
export const httpFieldsErrorMessage =
	"For 'sse' or 'streamableHttp' type servers, you must provide a 'url' field and can optionally include 'headers'"
export const mixedFieldsErrorMessage =
	"Cannot mix 'stdio' and HTTP fields. For 'stdio' use 'command', 'args', and 'env'. For 'sse'/'streamableHttp' use 'url' and 'headers'"
export const missingFieldsErrorMessage =
	"Server configuration must include either 'command' (for stdio) or 'url' (for sse/streamableHttp)"

// Helper function to create a refined schema with better error messages
const createServerTypeSchema = () => {
	return z.union([
		// Stdio config (has command field)
		BaseConfigSchema.extend({
			type: z.enum(["stdio"]).optional(),
			command: z.string().min(1, "Command cannot be empty"),
			args: z.array(z.string()).optional(),
			// cwd: z.string().default(() => { // `this` is not available in this context
			// 	// TODO: Find a better way to set default CWD, perhaps during server initialization
			// 	// For now, let's make it optional or require it explicitly.
			// 	// const basePath = this.app?.vault?.adapter?.basePath; // this.app is not defined here
			// 	// return basePath || process.cwd();
			// }),
			cwd: z.string().optional(), // Made optional, to be handled during connection
			env: z.record(z.string()).optional(),
			// Ensure no SSE fields are present
			url: z.undefined().optional(),
			headers: z.undefined().optional(),
		})
			.transform((data) => ({
				...data,
				type: "stdio" as const,
			}))
			.refine((data) => data.type === undefined || data.type === "stdio", { message: typeErrorMessage }),
		// Streamable HTTP config (has url field). Listed before the legacy SSE
		// member on purpose: z.union picks the first match, so a url-only
		// config without an explicit type infers "streamableHttp" (the current
		// MCP transport; connectToServer falls back to SSE for legacy servers).
		BaseConfigSchema.extend({
			type: z.enum(["streamableHttp"]).optional(),
			url: z.string().url("URL must be a valid URL format"),
			headers: z.record(z.string()).optional(),
			// Ensure no stdio fields are present
			command: z.undefined().optional(),
			args: z.undefined().optional(),
			env: z.undefined().optional(),
		})
			.transform((data) => ({
				...data,
				type: "streamableHttp" as const,
			}))
			.refine((data) => data.type === undefined || data.type === "streamableHttp", { message: typeErrorMessage }),
		// Legacy SSE config (explicit type: "sse" only)
		BaseConfigSchema.extend({
			type: z.enum(["sse"]).optional(),
			url: z.string().url("URL must be a valid URL format"),
			headers: z.record(z.string()).optional(),
			// Ensure no stdio fields are present
			command: z.undefined().optional(),
			args: z.undefined().optional(),
			env: z.undefined().optional(),
		})
			.transform((data) => ({
				...data,
				type: "sse" as const,
			}))
			.refine((data) => data.type === undefined || data.type === "sse", { message: typeErrorMessage }),
	])
}

// Server configuration schema with automatic type inference and validation
export const ServerConfigSchema = createServerTypeSchema()

// Settings schema
export const McpSettingsSchema = z.object({
	mcpServers: z.record(ServerConfigSchema),
})

/**
 * Structural guards for JSON-parsed config files. `JSON.parse` returns `any`;
 * routing it through `unknown` plus these guards keeps the lint gate
 * (no-unsafe-*) at zero without a single type assertion.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function getRecordField(source: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
	const value = source[key]
	return isRecord(value) ? value : undefined
}

/** Reads `mcpServers[serverName].alwaysAllow` out of a raw parsed settings file. */
export function readAlwaysAllowList(root: unknown, serverName: string): string[] {
	const servers = isRecord(root) ? getRecordField(root, "mcpServers") : undefined
	const serverEntry = servers ? getRecordField(servers, serverName) : undefined
	const alwaysAllow = serverEntry ? serverEntry["alwaysAllow"] : undefined
	return Array.isArray(alwaysAllow)
		? alwaysAllow.filter((value: unknown): value is string => typeof value === "string")
		: []
}
