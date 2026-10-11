export function getSearchWebDescription(): string {
	return `## search_web
Description:
This tool allows you to search the web using internet search engines like Google to find relevant information on current events, facts, data, and other online content.
Parameters:
- query: (required) The search query to send to internet search engines. For best results, use concise, specific, and preferably English queries that would work well with search engines like Google.
Usage Tips:
- Use specific keywords rather than full sentences
- Include important context terms to narrow results
- Use quotes for exact phrases: "exact phrase"

Usage:
<search_web>
<query>Your search query here</query>
</search_web>

Example 1: 
<search_web>
<query>capital of France population statistics 2023</query>
</search_web>

Example 2:
<search_web>
<query>"renewable energy" growth statistics Europe</query>
</search_web>

Example 3:
<search_web>
<query>react vs angular vs vue.js comparison</query>
</search_web>`
} 
