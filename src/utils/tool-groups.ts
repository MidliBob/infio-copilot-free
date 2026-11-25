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
	search_files: "search files",
	list_files: "list files",
	use_mcp_tool: "use mcp tools",
	access_mcp_resource: "access mcp resources",
	ask_followup_question: "ask questions",
	dataview_query: "query dataview",
	attempt_completion: "complete tasks",
	switch_mode: "switch modes",
  insights: "call insights",
	manage_files: "manage files",
} as const

// Define available tool groups
export const TOOL_GROUPS: Record<string, ToolGroupConfig> = {
	read: {
		tools: ["read_file", "list_files", "search_files", "dataview_query"],
	},
	edit: {
		tools: ["apply_diff", "write_to_file", "insert_content", "search_and_replace"],
	},
	manage_files: {
		tools: ["manage_files"],
	},
	research: {
		tools: ["search_web", "fetch_urls_content"],
	},
	insights: {
		tools: ["insights"],
	},
	mcp: {
		tools: ["use_mcp_tool", "access_mcp_resource"],
	},
	modes: {
		tools: ["switch_mode",],
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
 * `toolConfig as ToolName`: tool configs come from parsed JSON and may name a
 * tool this build does not know.
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
	manage_files: "Manage Files",
	research: "Research",
	browser: "Use Browser",
	command: "Run Commands",
	dataview_query: "Query Dataview",
	insights: "Call Insights",
	mcp: "Use MCP",
}
