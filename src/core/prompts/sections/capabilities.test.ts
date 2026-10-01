/**
 * CAPABILITIES must describe the toolset of the mode that receives it.
 *
 * Field report (Ask mode): the section advertised `manage_files` for every
 * mode, including Ask, whose groups are read/insights/mcp. The model then
 * emitted a <manage_files> block with a schema it had invented (the tool
 * description is only injected for modes that have the tool), the parser
 * dropped every entry and the chat showed "File operations (0)" with nothing
 * to execute.
 */
import { getCapabilitiesSection } from './capabilities'

describe('capabilities section', () => {
	it('advertises manage_files in Write mode (group: manage_files)', () => {
		const section = getCapabilitiesSection('write', '/vault', 'semantic')
		expect(section).toContain('`manage_files` tool for comprehensive file and folder management')
	})

	it('does not advertise manage_files in Ask mode (groups: read/insights/mcp)', () => {
		const section = getCapabilitiesSection('ask', '/vault', 'semantic')
		expect(section).not.toContain('`manage_files` tool for comprehensive file and folder management')
		expect(section).toContain('You have no tool that moves, renames, copies or deletes files in this mode')
	})

	it('keeps the bullets of the tools the mode has', () => {
		const ask = getCapabilitiesSection('ask', '/vault', 'semantic')
		expect(ask).toContain('`insights` tool') // ask has the insights group
		expect(ask).toContain('`semantic_search_files`')
		expect(ask).toContain('`dataview_query`') // part of the read group
		// the MCP bullet was dead code before (enableMcpHub was never passed
		// down): it now follows the mode's mcp group
		expect(ask).toContain('MCP servers')
	})

	it('omits the MCP bullet for a mode without the mcp group', () => {
		const section = getCapabilitiesSection('librarian', '/vault', 'match', [
			{ slug: 'librarian', name: 'Librarian', roleDefinition: 'You organize the vault.', groups: ['read'] },
		])
		expect(section).not.toContain('MCP servers')
	})

	it('does not advertise manage_files in Learn mode either', () => {
		const learn = getCapabilitiesSection('learn', '/vault', 'match')
		expect(learn).toContain('This mode cannot move, rename, copy or delete files')
		expect(learn).not.toContain('You have access to file management tools')
	})

	it('honours a custom mode that adds the manage_files group', () => {
		const section = getCapabilitiesSection('librarian', '/vault', 'match', [
			{
				slug: 'librarian',
				name: 'Librarian',
				roleDefinition: 'You organize the vault.',
				groups: ['read', 'manage_files'],
			},
		])
		expect(section).toContain('`manage_files` tool for comprehensive file and folder management')
		expect(section).not.toContain('`insights` tool')
	})

	it('research mode keeps its own section', () => {
		const section = getCapabilitiesSection('research', '/vault', 'match')
		expect(section).toContain('search_web')
		expect(section).not.toContain('manage_files')
	})

	it('has no empty bullet lines', () => {
		for (const mode of ['ask', 'write', 'learn']) {
			const body = getCapabilitiesSection(mode, '/vault', 'none').split('CAPABILITIES')[1] ?? ''
			for (const line of body.split('\n')) {
				expect(line.trim().length === 0 && line.length > 0).toBe(false)
			}
		}
	})
})
