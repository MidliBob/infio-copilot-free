/**
 * Contract tests for the ICF block parser (parse-icf-block.ts).
 *
 * The parser feeds BOTH the chat rendering (ReactMarkdown) and the
 * one-click Apply tool-args, so these tests pin:
 *
 * 1. Field extraction for every supported block tag, including the
 *    `finish` flag that drives streaming UI state.
 * 2. Raw-slice semantics for content payloads: nested markup (JSX, HTML,
 *    tag-looking diff lines) and entity-looking sequences must survive
 *    verbatim - the old text-node extraction silently dropped them, which
 *    corrupted files written through Apply.
 * 3. Runtime validation of JSON payloads: non-array `operations` (used to
 *    crash message rendering via `.map` on an object), non-object MCP
 *    `parameters`, non-string `urls` entries, NaN `line_count`, and
 *    string `start_line` (used to leak a string into line math).
 * 4. Tolerance of partially streamed input (unclosed tags, truncated
 *    JSON) - parsing must not throw and must not spam the console
 *    (the logger is mocked; diagnostics are asserted instead).
 */
import { ParsedMsgBlock, parseMsgBlocks } from './parse-icf-block'
import { logger } from './logger'

jest.mock('./logger')

const loggerMock = jest.mocked(logger)

beforeEach(() => {
	jest.clearAllMocks()
})

describe('plain text and unknown tags', () => {
	it('returns an empty list for empty input', () => {
		expect(parseMsgBlocks('')).toEqual([])
	})

	it('wraps plain markdown into a single string block', () => {
		expect(parseMsgBlocks('hello **world**')).toEqual([
			{ type: 'string', content: 'hello **world**' },
		])
	})

	it('passes unknown tags through as raw text', () => {
		expect(parseMsgBlocks('a <foo>b</foo> c')).toEqual([
			{ type: 'string', content: 'a <foo>b</foo> c' },
		])
	})
})

describe('reasoning and communication blocks', () => {
	it('extracts thinking with surrounding text and nested markup verbatim', () => {
		const blocks: ParsedMsgBlock[] = parseMsgBlocks(
			'before <thinking>plan <b>step</b></thinking> after',
		)
		expect(blocks).toEqual([
			{ type: 'string', content: 'before ' },
			{ type: 'thinking', content: 'plan <b>step</b>' },
			{ type: 'string', content: ' after' },
		])
	})

	it('extracts an empty thinking block', () => {
		expect(parseMsgBlocks('<thinking></thinking>')).toEqual([
			{ type: 'thinking', content: '' },
		])
	})

	it('extracts think blocks', () => {
		expect(parseMsgBlocks('<think>hmm</think>')).toEqual([
			{ type: 'think', content: 'hmm' },
		])
	})

	it('extracts communication blocks', () => {
		expect(parseMsgBlocks('<communication>hi there</communication>')).toEqual([
			{ type: 'communication', content: 'hi there' },
		])
	})

	it('extracts tool_result content verbatim (nested markup included)', () => {
		expect(parseMsgBlocks('<tool_result>line1<br>line2</tool_result>')).toEqual([
			{ type: 'tool_result', content: 'line1<br>line2' },
		])
	})

	it('extracts an empty tool_result block', () => {
		expect(parseMsgBlocks('<tool_result></tool_result>')).toEqual([
			{ type: 'tool_result', content: '' },
		])
	})
})

describe('file read and search blocks', () => {
	it('parses a closed read_file block with finish=true', () => {
		expect(parseMsgBlocks('<read_file><path>notes/a.md</path></read_file>')).toEqual([
			{ type: 'read_file', path: 'notes/a.md', finish: true },
		])
	})

	it('parses a streamed (unclosed) read_file block with finish=false', () => {
		expect(parseMsgBlocks('<read_file><path>notes/a.md')).toEqual([
			{ type: 'read_file', path: 'notes/a.md', finish: false },
		])
	})

	it('parses list_files with recursive=TRUE (case-insensitive)', () => {
		expect(parseMsgBlocks('<list_files><path>src</path><recursive>TRUE</recursive></list_files>')).toEqual([
			{ type: 'list_files', path: 'src', recursive: true, finish: true },
		])
	})

	it('parses list_files with recursive=false', () => {
		expect(parseMsgBlocks('<list_files><path>src</path><recursive>false</recursive></list_files>')).toEqual([
			{ type: 'list_files', path: 'src', recursive: false, finish: true },
		])
	})

	it('defaults list_files path to / and leaves recursive undefined', () => {
		expect(parseMsgBlocks('<list_files></list_files>')).toEqual([
			{ type: 'list_files', path: '/', finish: true },
		])
	})

	it('parses match_search_files fields', () => {
		expect(parseMsgBlocks('<match_search_files><path>src</path><query>TODO</query></match_search_files>')).toEqual([
			{ type: 'match_search_files', path: 'src', query: 'TODO', finish: true },
		])
	})

	it('parses regex_search_files fields', () => {
		expect(parseMsgBlocks('<regex_search_files><path>src</path><regex>\\bfix\\b</regex></regex_search_files>')).toEqual([
			{ type: 'regex_search_files', path: 'src', regex: '\\bfix\\b', finish: true },
		])
	})

	it('parses semantic_search_files fields', () => {
		expect(parseMsgBlocks('<semantic_search_files><path>src</path><query>parser</query></semantic_search_files>')).toEqual([
			{ type: 'semantic_search_files', path: 'src', query: 'parser', finish: true },
		])
	})
})

describe('write_to_file', () => {
	it('parses path and content', () => {
		expect(parseMsgBlocks('<write_to_file><path>a.md</path><content># Title\n</content></write_to_file>')).toEqual([
			{ type: 'write_to_file', path: 'a.md', content: '# Title\n' },
		])
	})

	it('preserves nested markup inside content verbatim (regression: text-node join dropped it)', () => {
		expect(parseMsgBlocks('<write_to_file><path>App.tsx</path><content>const a = <div>hi</div>\n</content></write_to_file>')).toEqual([
			{ type: 'write_to_file', path: 'App.tsx', content: 'const a = <div>hi</div>\n' },
		])
	})

	it('preserves self-closing JSX-looking tags (regression: unclosed element swallowed the tail)', () => {
		expect(
			parseMsgBlocks('<write_to_file><path>X.tsx</path><content>export const X = () => <Foo bar={1} />\n</content></write_to_file>'),
		).toEqual([
			{ type: 'write_to_file', path: 'X.tsx', content: 'export const X = () => <Foo bar={1} />\n' },
		])
	})

	it('keeps entity-looking sequences raw (regression: text nodes were entity-decoded)', () => {
		expect(parseMsgBlocks('<write_to_file><path>a.txt</path><content>a &amp; b</content></write_to_file>')).toEqual([
			{ type: 'write_to_file', path: 'a.txt', content: 'a &amp; b' },
		])
	})

	it('parses a numeric line_count', () => {
		expect(parseMsgBlocks('<write_to_file><path>a.md</path><content>x</content><line_count>42</line_count></write_to_file>')).toEqual([
			{ type: 'write_to_file', path: 'a.md', content: 'x', lineCount: 42 },
		])
	})

	it('leaves lineCount undefined for unparsable line_count (regression: NaN leaked through)', () => {
		expect(parseMsgBlocks('<write_to_file><path>a.md</path><content>x</content><line_count>abc</line_count></write_to_file>')).toEqual([
			{ type: 'write_to_file', path: 'a.md', content: 'x' },
		])
	})

	it('handles partially streamed content without a closing tag', () => {
		expect(parseMsgBlocks('<write_to_file><path>n.md</path><content>hel')).toEqual([
			{ type: 'write_to_file', path: 'n.md', content: 'hel' },
		])
	})
})

describe('insert_content', () => {
	it('parses the first operation (start_line + content)', () => {
		expect(
			parseMsgBlocks('<insert_content><path>a.md</path><operations>[{"start_line": 5, "content": "inserted"}]</operations></insert_content>'),
		).toEqual([
			{ type: 'insert_content', path: 'a.md', startLine: 5, content: 'inserted' },
		])
	})

	it('coerces a numeric-string start_line to a number (regression: string leaked into line math)', () => {
		expect(
			parseMsgBlocks('<insert_content><path>a.md</path><operations>[{"start_line": "7", "content": "y"}]</operations></insert_content>'),
		).toEqual([
			{ type: 'insert_content', path: 'a.md', startLine: 7, content: 'y' },
		])
	})

	it('defaults start_line to 1 when the operation omits it', () => {
		expect(parseMsgBlocks('<insert_content><operations>[{}]</operations></insert_content>')).toEqual([
			{ type: 'insert_content', startLine: 1, content: '' },
		])
	})

	it('ignores a non-object first operation without crashing', () => {
		expect(parseMsgBlocks('<insert_content><operations>[null]</operations></insert_content>')).toEqual([
			{ type: 'insert_content', startLine: 0, content: '' },
		])
		expect(loggerMock.error).not.toHaveBeenCalled()
	})

	it('logs and keeps defaults for malformed operations JSON', () => {
		expect(parseMsgBlocks('<insert_content><path>a.md</path><operations>[{"start_line":</operations></insert_content>')).toEqual([
			{ type: 'insert_content', path: 'a.md', startLine: 0, content: '' },
		])
		expect(loggerMock.error).toHaveBeenCalledTimes(1)
	})
})

describe('search_and_replace', () => {
	it('parses a full operation with every optional field', () => {
		const opsJson = '[{"search":"foo","replace":"bar","start_line":3,"end_line":9,"use_regex":true,"ignore_case":true,"regex_flags":"gi"}]'
		expect(parseMsgBlocks(`<search_and_replace><path>a.md</path><operations>${opsJson}</operations></search_and_replace>`)).toEqual([
			{
				type: 'search_and_replace',
				path: 'a.md',
				content: opsJson,
				operations: [{
					search: 'foo',
					replace: 'bar',
					start_line: 3,
					end_line: 9,
					use_regex: true,
					ignore_case: true,
					regex_flags: 'gi',
				}],
				finish: true,
			},
		])
	})

	it('drops malformed entries and mistyped optional fields', () => {
		const opsJson = '[{"search":"a","replace":"b","start_line":"x"},{"search":1,"replace":"b"},{"ok":true}]'
		expect(parseMsgBlocks(`<search_and_replace><path>a.md</path><operations>${opsJson}</operations></search_and_replace>`)).toEqual([
			{
				type: 'search_and_replace',
				path: 'a.md',
				content: opsJson,
				operations: [{ search: 'a', replace: 'b' }],
				finish: true,
			},
		])
	})

	it('degrades a non-array payload to empty operations (regression: object crashed operations.map in the renderer)', () => {
		const opsJson = '{"search":"a","replace":"b"}'
		expect(parseMsgBlocks(`<search_and_replace><path>a.md</path><operations>${opsJson}</operations></search_and_replace>`)).toEqual([
			{
				type: 'search_and_replace',
				path: 'a.md',
				content: opsJson,
				operations: [],
				finish: true,
			},
		])
		expect(loggerMock.debug).toHaveBeenCalled()
	})

	it('tolerates truncated operations JSON while streaming', () => {
		expect(parseMsgBlocks('<search_and_replace><path>p.md</path><operations>[{"search":"a"')).toEqual([
			{ type: 'search_and_replace', path: 'p.md', content: '[{"search":"a"', operations: [], finish: false },
		])
		expect(loggerMock.error).toHaveBeenCalledTimes(1)
	})
})

describe('apply_diff', () => {
	it('parses path and diff', () => {
		expect(parseMsgBlocks('<apply_diff><path>f.md</path><diff>--- a\n+++ b\n-old\n+new\n</diff></apply_diff>')).toEqual([
			{ type: 'apply_diff', path: 'f.md', diff: '--- a\n+++ b\n-old\n+new\n', finish: true },
		])
	})

	it('preserves tag-looking diff lines verbatim (regression: first-text-child extraction truncated the diff)', () => {
		expect(parseMsgBlocks('<apply_diff><path>f.md</path><diff>--- a\n+++ b\n-<old>\n+<new>\n</diff></apply_diff>')).toEqual([
			{ type: 'apply_diff', path: 'f.md', diff: '--- a\n+++ b\n-<old>\n+<new>\n', finish: true },
		])
	})

	it('marks an unclosed apply_diff as not finished', () => {
		expect(parseMsgBlocks('<apply_diff><path>f.md</path><diff>--- a')).toEqual([
			{ type: 'apply_diff', path: 'f.md', diff: '--- a', finish: false },
		])
	})
})

describe('attempt_completion / ask_followup_question / switch_mode', () => {
	it('extracts a result containing markup verbatim', () => {
		expect(parseMsgBlocks('<attempt_completion><result>Used <code>x</code></result></attempt_completion>')).toEqual([
			{ type: 'attempt_completion', result: 'Used <code>x</code>', finish: true },
		])
	})

	it('marks a streamed attempt_completion as not finished', () => {
		expect(parseMsgBlocks('<attempt_completion><result>partial')).toEqual([
			{ type: 'attempt_completion', result: 'partial', finish: false },
		])
	})

	it('extracts a follow-up question', () => {
		expect(parseMsgBlocks('<ask_followup_question><question>Continue?</question></ask_followup_question>')).toEqual([
			{ type: 'ask_followup_question', question: 'Continue?', finish: true },
		])
	})

	it('extracts switch_mode slug and reason (reason keeps markup)', () => {
		expect(parseMsgBlocks('<switch_mode><mode_slug>code</mode_slug><reason>Need <b>edits</b></reason></switch_mode>')).toEqual([
			{ type: 'switch_mode', mode: 'code', reason: 'Need <b>edits</b>', finish: true },
		])
	})

	it('defaults empty switch_mode fields to empty strings', () => {
		expect(parseMsgBlocks('<switch_mode></switch_mode>')).toEqual([
			{ type: 'switch_mode', mode: '', reason: '', finish: true },
		])
	})
})

describe('search_web / fetch_urls_content', () => {
	it('extracts the search query', () => {
		expect(parseMsgBlocks('<search_web><query>obsidian plugins</query></search_web>')).toEqual([
			{ type: 'search_web', query: 'obsidian plugins', finish: true },
		])
	})

	it('defaults a missing search query to an empty string', () => {
		expect(parseMsgBlocks('<search_web></search_web>')).toEqual([
			{ type: 'search_web', query: '', finish: true },
		])
	})

	it('parses a urls array', () => {
		expect(parseMsgBlocks('<fetch_urls_content><urls>["https://a.example","https://b.example"]</urls></fetch_urls_content>')).toEqual([
			{ type: 'fetch_urls_content', urls: ['https://a.example', 'https://b.example'], finish: true },
		])
	})

	it('drops non-string url entries (regression: they reached React as href values)', () => {
		expect(parseMsgBlocks('<fetch_urls_content><urls>[1,"https://a.example",{},null]</urls></fetch_urls_content>')).toEqual([
			{ type: 'fetch_urls_content', urls: ['https://a.example'], finish: true },
		])
	})

	it('degrades a non-array urls payload to an empty list', () => {
		expect(parseMsgBlocks('<fetch_urls_content><urls>{"a":1}</urls></fetch_urls_content>')).toEqual([
			{ type: 'fetch_urls_content', urls: [], finish: true },
		])
	})

	it('silently tolerates truncated urls JSON while streaming', () => {
		expect(parseMsgBlocks('<fetch_urls_content><urls>["a",')).toEqual([
			{ type: 'fetch_urls_content', urls: [], finish: false },
		])
		expect(loggerMock.error).not.toHaveBeenCalled()
	})
})

describe('use_mcp_tool', () => {
	it('parses server, tool and object parameters', () => {
		expect(
			parseMsgBlocks('<use_mcp_tool><server_name>fetch</server_name><tool_name>get</tool_name><parameters>{"url":"https://a.example"}</parameters></use_mcp_tool>'),
		).toEqual([
			{
				type: 'use_mcp_tool',
				server_name: 'fetch',
				tool_name: 'get',
				parameters: { url: 'https://a.example' },
				finish: true,
			},
		])
	})

	it('accepts the arguments alias for parameters', () => {
		expect(parseMsgBlocks('<use_mcp_tool><server_name>s</server_name><tool_name>t</tool_name><arguments>{"k":2}</arguments></use_mcp_tool>')).toEqual([
			{ type: 'use_mcp_tool', server_name: 's', tool_name: 't', parameters: { k: 2 }, finish: true },
		])
	})

	it('cannot read an <input> alias payload: input is a VOID html element (pre-existing parse5 limitation, pinned)', () => {
		// parse5 never gives <input> children, so the JSON lands as a sibling
		// text node and the alias yields {}. The system prompt instructs
		// models to emit <arguments>; <input>/<parameters> are tolerance
		// aliases. Behavior is unchanged from the pre-typing implementation.
		expect(parseMsgBlocks('<use_mcp_tool><server_name>s</server_name><tool_name>t</tool_name><input>{"k":1}</input></use_mcp_tool>')).toEqual([
			{ type: 'use_mcp_tool', server_name: 's', tool_name: 't', parameters: {}, finish: true },
		])
	})

	it('keeps markup inside parameter strings intact (regression: first-text-child truncated the JSON)', () => {
		expect(
			parseMsgBlocks('<use_mcp_tool><server_name>s</server_name><tool_name>t</tool_name><parameters>{"html":"<div>x</div>"}</parameters></use_mcp_tool>'),
		).toEqual([
			{ type: 'use_mcp_tool', server_name: 's', tool_name: 't', parameters: { html: '<div>x</div>' }, finish: true },
		])
	})

	it('ignores a non-object parameters payload (regression: arrays/primitives were forwarded to the MCP call)', () => {
		expect(parseMsgBlocks('<use_mcp_tool><server_name>s</server_name><tool_name>t</tool_name><parameters>[1,2]</parameters></use_mcp_tool>')).toEqual([
			{ type: 'use_mcp_tool', server_name: 's', tool_name: 't', parameters: {}, finish: true },
		])
		expect(loggerMock.debug).toHaveBeenCalled()
	})

	it('ignores a scalar parameters payload', () => {
		expect(parseMsgBlocks('<use_mcp_tool><server_name>s</server_name><tool_name>t</tool_name><parameters>"just a string"</parameters></use_mcp_tool>')).toEqual([
			{ type: 'use_mcp_tool', server_name: 's', tool_name: 't', parameters: {}, finish: true },
		])
	})

	it('logs a debug line and keeps {} for malformed parameters JSON', () => {
		expect(parseMsgBlocks('<use_mcp_tool><server_name>s</server_name><tool_name>t</tool_name><parameters>{"k":</parameters></use_mcp_tool>')).toEqual([
			{ type: 'use_mcp_tool', server_name: 's', tool_name: 't', parameters: {}, finish: true },
		])
		expect(loggerMock.debug).toHaveBeenCalledTimes(1)
	})
})

describe('dataview_query / insights', () => {
	it('parses query and output format', () => {
		expect(parseMsgBlocks('<dataview_query><query>LIST FROM "notes"</query><output_format>list</output_format></dataview_query>')).toEqual([
			{ type: 'dataview_query', query: 'LIST FROM "notes"', outputFormat: 'list', finish: true },
		])
	})

	it('defaults the output format to table', () => {
		expect(parseMsgBlocks('<dataview_query><query>LIST</query></dataview_query>')).toEqual([
			{ type: 'dataview_query', query: 'LIST', outputFormat: 'table', finish: true },
		])
	})

	it('maps the insights tag onto call_transformations', () => {
		expect(parseMsgBlocks('<insights><path>p.md</path><transformation>summarize</transformation></insights>')).toEqual([
			{ type: 'call_transformations', path: 'p.md', transformation: 'summarize', finish: true },
		])
	})

	it('defaults missing insights fields to empty strings', () => {
		expect(parseMsgBlocks('<insights></insights>')).toEqual([
			{ type: 'call_transformations', path: '', transformation: '', finish: true },
		])
	})
})

describe('manage_files', () => {
	it('parses operations from the operations sub-tag', () => {
		const opsJson = '[{"action":"delete","path":"a.md"},{"action":"move","source_path":"x.md","destination_path":"y.md"},{"action":"rename","path":"z.md","new_name":"w.md"}]'
		expect(parseMsgBlocks(`<manage_files><operations>${opsJson}</operations></manage_files>`)).toEqual([
			{
				type: 'manage_files',
				operations: [
					{ action: 'delete', path: 'a.md' },
					{ action: 'move', source_path: 'x.md', destination_path: 'y.md' },
					{ action: 'rename', path: 'z.md', new_name: 'w.md' },
				],
				droppedOperations: 0,
				finish: true,
			},
		])
	})

	it('parses a JSON array written directly as the tag body', () => {
		expect(parseMsgBlocks('<manage_files>\n[{"action":"create_folder","path":"dir"}]\n</manage_files>')).toEqual([
			{ type: 'manage_files', operations: [{ action: 'create_folder', path: 'dir' }], droppedOperations: 0, finish: true },
		])
	})

	it('drops entries with unknown actions or non-object shape', () => {
		const opsJson = '[{"action":"destroy","path":"a"},{"action":"copy","source_path":"s","destination_path":"d"},42]'
		expect(parseMsgBlocks(`<manage_files><operations>${opsJson}</operations></manage_files>`)).toEqual([
			{
				type: 'manage_files',
				operations: [{ action: 'copy', source_path: 's', destination_path: 'd' }],
				droppedOperations: 2,
				finish: true,
			},
		])
		expect(loggerMock.debug).toHaveBeenCalled()
	})

	it('degrades a non-array body to empty operations (regression: non-arrays crashed the renderer)', () => {
		expect(parseMsgBlocks('<manage_files>{"action":"delete"}</manage_files>')).toEqual([
			{ type: 'manage_files', operations: [], droppedOperations: 1, finish: true },
		])
	})

	it('logs and degrades malformed operations JSON', () => {
		expect(parseMsgBlocks('<manage_files><operations>[{bad</operations></manage_files>')).toEqual([
			{ type: 'manage_files', operations: [], droppedOperations: 1, finish: true },
		])
		expect(loggerMock.error).toHaveBeenCalledTimes(1)
	})

	it('reports a content-creation attempt as a dropped operation (field bug 1.6.22)', () => {
		// manage_files has no content-creating action: a model asked to create
		// a file emits e.g. action "create_file", the validator rejects it and
		// the block must carry the reason instead of silently showing zero
		// operations with a clickable Execute button.
		const opsJson = '[{"action":"create_file","path":"test.tsx","content":"const a = <div>hi</div>"}]'
		expect(parseMsgBlocks(`<manage_files><operations>${opsJson}</operations></manage_files>`)).toEqual([
			{ type: 'manage_files', operations: [], droppedOperations: 1, finish: true },
		])
	})

	it('counts dropped entries alongside accepted ones', () => {
		const opsJson = '[{"action":"create_file","path":"a.md"},{"action":"delete","path":"b.md"}]'
		expect(parseMsgBlocks(`<manage_files><operations>${opsJson}</operations></manage_files>`)).toEqual([
			{
				type: 'manage_files',
				operations: [{ action: 'delete', path: 'b.md' }],
				droppedOperations: 1,
				finish: true,
			},
		])
	})

	it('reports zero dropped operations for an empty array and an empty block', () => {
		expect(parseMsgBlocks('<manage_files><operations>[]</operations></manage_files>')).toEqual([
			{ type: 'manage_files', operations: [], droppedOperations: 0, finish: true },
		])
		expect(parseMsgBlocks('<manage_files></manage_files>')).toEqual([
			{ type: 'manage_files', operations: [], droppedOperations: 0, finish: true },
		])
	})
})

describe('mixed messages', () => {
	it('keeps block order and interleaved text', () => {
		const blocks = parseMsgBlocks(
			'Intro text\n<read_file><path>a.md</path></read_file>\nMiddle\n<attempt_completion><result>done</result></attempt_completion>tail',
		)
		expect(blocks).toEqual([
			{ type: 'string', content: 'Intro text\n' },
			{ type: 'read_file', path: 'a.md', finish: true },
			{ type: 'string', content: '\nMiddle\n' },
			{ type: 'attempt_completion', result: 'done', finish: true },
			{ type: 'string', content: 'tail' },
		])
	})

	it('parses a think + tool_result + write_to_file sequence', () => {
		const blocks = parseMsgBlocks(
			'<think>plan</think><tool_result>ok</tool_result><write_to_file><path>b.md</path><content>B</content></write_to_file>',
		)
		expect(blocks).toEqual([
			{ type: 'think', content: 'plan' },
			{ type: 'tool_result', content: 'ok' },
			{ type: 'write_to_file', path: 'b.md', content: 'B' },
		])
	})

	it('does not log anything on a well-formed message', () => {
		parseMsgBlocks('<read_file><path>a.md</path></read_file><search_web><query>q</query></search_web>')
		expect(loggerMock.error).not.toHaveBeenCalled()
		expect(loggerMock.debug).not.toHaveBeenCalled()
	})
})
