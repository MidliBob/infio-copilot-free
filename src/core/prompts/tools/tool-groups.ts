// Define tool group configuration
export type ToolGroupConfig = {
	tools: readonly string[]
	alwaysAvailable?: boolean // Whether this group is always available and shouldn't show in prompts view
}

// Map of tool slugs to their display names
export const TOOL_DISPLAY_NAMES = {
	execute_command: "run commands",
	read_file: "read files",
	write_to_file: "write files",
	apply_diff: "apply changes",
	list_files: "list files",
	search_files: "search files",
	dataview_query: "query dataview",
	use_mcp_tool: "use mcp tools",
	access_mcp_resource: "access mcp resources",
	insights: "call insights",
	ask_followup_question: "ask questions",
	attempt_completion: "complete tasks",
	switch_mode: "switch modes",
} as const

// Define available tool groups
export const TOOL_GROUPS: Record<string, ToolGroupConfig> = {
	read: {
		tools: ["read_file", "list_files", "search_files", "dataview_query"],
	},
	edit: {
		tools: ["apply_diff", "write_to_file", "insert_content", "search_and_replace"],
	},
	research: {
		tools: ["search_web", "fetch_urls_content"],
	},
	insights: {
		tools: ["insights"],
	},
	manage_files: {
		tools: ["manage_files"],
	},
	mcp: {
		tools: ["use_mcp_tool", "access_mcp_resource"],
	},
	modes: {
		tools: ["switch_mode"],
		alwaysAvailable: true,
	},
}

export type ToolGroup = keyof typeof TOOL_GROUPS

// Tools that are always available to all modes
export const ALWAYS_AVAILABLE_TOOLS = [
	"ask_followup_question",
	"attempt_completion",
	"switch_mode",
] as const

// Tool name types for type safety
export type ToolName = keyof typeof TOOL_DISPLAY_NAMES

// Tool helper functions

/**
 * `TOOL_DISPLAY_NAMES` is the tool registry, so a string is a tool name only
 * when it is one of its keys. Checked at runtime instead of asserting
 * `toolConfig as ToolName` (same helper as utils/tool-groups.ts).
 */
export function isToolName(value: string): value is ToolName {
	// hasOwnProperty.call is typed ny; Boolean() keeps the contract boolean.
	return Boolean(Object.prototype.hasOwnProperty.call(TOOL_DISPLAY_NAMES, value))
}

export function getToolName(toolConfig: string | readonly [ToolName, ...unknown[]]): ToolName | undefined {
	const name = typeof toolConfig === "string" ? toolConfig : toolConfig[0]
	return isToolName(name) ? name : undefined
}

export function getToolOptions(toolConfig: string | readonly [ToolName, ...unknown[]]): unknown {
	return typeof toolConfig === "string" ? undefined : toolConfig[1]
}

// Display names for groups in UI
export const GROUP_DISPLAY_NAMES: Record<ToolGroup, string> = {
	read: "Read Files",
	edit: "Edit Files",
	research: "Research",
	insights: "insights",
	mcp: "MCP Tools",
	modes: "Modes",
}
