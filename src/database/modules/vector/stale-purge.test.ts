import { collectStaleIndexedPaths } from './stale-purge'

describe('collectStaleIndexedPaths', () => {
	it('vault scope: reports indexed paths that are no longer eligible', () => {
		const stale = collectStaleIndexedPaths(
			['a.md', 'b.md', 'c.md'],
			['a.md', 'b.md'],
			null,
		)
		expect(stale).toEqual(['c.md'])
	})

	it('vault scope: undefined scope behaves like null scope', () => {
		const stale = collectStaleIndexedPaths(
			['a.md', 'private/x.md'],
			['a.md'],
		)
		expect(stale).toEqual(['private/x.md'])
	})

	it('vault scope: nothing stale yields empty list', () => {
		expect(collectStaleIndexedPaths(['a.md', 'b.md'], ['b.md', 'a.md'], null)).toEqual([])
	})

	it('vault scope: empty indexed list yields empty result', () => {
		expect(collectStaleIndexedPaths([], ['a.md'], null)).toEqual([])
	})

	it('vault scope: all files excluded purges everything', () => {
		const stale = collectStaleIndexedPaths(['a.md', 'b.md'], [], null)
		expect(stale).toEqual(['a.md', 'b.md'])
	})

	it('workspace scope: only purges paths inside the workspace', () => {
		const stale = collectStaleIndexedPaths(
			['ws/a.md', 'ws/b.md', 'outside/x.md'],
			['ws/a.md'],
			['ws/a.md', 'ws/b.md'],
		)
		expect(stale).toEqual(['ws/b.md'])
	})

	it('workspace scope: empty eligible set purges whole scoped index', () => {
		const stale = collectStaleIndexedPaths(
			['ws/a.md', 'other/b.md'],
			[],
			['ws/a.md'],
		)
		expect(stale).toEqual(['ws/a.md'])
	})

	it('workspace scope: empty workspace scope purges nothing', () => {
		expect(collectStaleIndexedPaths(['ws/a.md'], [], [])).toEqual([])
	})

	it('deduplicates repeated indexed paths', () => {
		const stale = collectStaleIndexedPaths(['a.md', 'a.md', 'b.md'], ['b.md'], null)
		expect(stale).toEqual(['a.md'])
	})

	it('preserves first-seen order of stale paths', () => {
		const stale = collectStaleIndexedPaths(
			['z.md', 'a.md', 'm.md'],
			[],
			null,
		)
		expect(stale).toEqual(['z.md', 'a.md', 'm.md'])
	})
})
