import { ToolArgs } from "./types"

export function getInsertContentDescription(args: ToolArgs): string {
	return `## insert_content
Description: Inserts content at specific line positions in a file. This is the primary tool for adding new content (paragraphs, sections, headings, citations, etc.) as it allows for precise insertions without overwriting existing content. The tool uses an efficient line-based insertion system that maintains document integrity and proper ordering of multiple insertions. Beware to use the proper formatting and indentation. This tool is the preferred way to add new content to documents.
Parameters:
- path: (required) The path of the file to insert content into (relative to the current working directory ${args.cwd.toPosix()})
- operations: (required) A JSON array of insertion operations. Each operation is an object with:
    * start_line: (required) The line number where the content should be inserted.  The content currently at that line will end up below the inserted content.
    * content: (required) The content to insert at the specified position. IMPORTANT NOTE: If the content is a single line, it can be a string. If it's a multi-line content, it should be a string with newline characters (\n) for line breaks. Make sure to include the correct formatting and indentation for the content.
Usage:
<insert_content>
<path>File path here</path>
<operations>[
  {
    "start_line": 10,
    "content": "Your content here"
  }
]</operations>
</insert_content>

Example: Insert a new section heading and paragraph
<insert_content>
<path>chapter1.md</path>
<operations>[
  {
    "start_line": 5,
    "content": "## Historical Context\n\nIn the early 20th century, the literary landscape underwent significant changes as modernist writers began to experiment with new narrative techniques and thematic concerns. This shift was largely influenced by the cultural and societal transformations of the period."
  },
  {
    "start_line": 20,
    "content": "> "The purpose of literature is to turn blood into ink." - T.S. Eliot"
  },
	{
    "start_line": 1,
    "content": "\`\`\`mermaid\\nflowchart TD\\n    A[开始]-- > B[结束]\\n\`\`\`"
  },
]</operations>
</insert_content>`
}
