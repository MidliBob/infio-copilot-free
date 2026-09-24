import {
	parseOllamaTags,
	parseOpenRouterModels,
	parseYacyResults,
} from './provider-schemas'

describe('parseOllamaTags', () => {
	it('accepts a well-formed /api/tags response', () => {
		const models = parseOllamaTags({
			models: [
				{ name: 'llama3:latest', size: 1, digest: 'x' },
				{ name: 'nomic-embed-text', capabilities: ['embedding'] },
			],
		})
		expect(models).toHaveLength(2)
		expect(models[0].name).toBe('llama3:latest')
		expect(models[1].capabilities).toEqual(['embedding'])
	})

	it('strips unknown fields', () => {
		const models = parseOllamaTags({
			models: [{ name: 'a', details: { family: 'llama' }, modified_at: 'x' }],
		})
		expect(models[0]).toEqual({ name: 'a', capabilities: undefined })
	})

	it('returns [] when models is missing, null or malformed', () => {
		expect(parseOllamaTags({})).toEqual([])
		expect(parseOllamaTags({ models: null })).toEqual([])
		expect(parseOllamaTags({ models: 'oops' })).toEqual([])
		expect(parseOllamaTags({ models: [{ name: 42 }] })).toEqual([])
		expect(parseOllamaTags(null)).toEqual([])
		expect(parseOllamaTags('text')).toEqual([])
	})
})

describe('parseOpenRouterModels', () => {
	it('converts string pricing to numbers', () => {
		const models = parseOpenRouterModels({
			data: [
				{
					id: 'anthropic/claude-3.5-sonnet',
					description: 'Claude',
					context_length: 200000,
					top_provider: { max_completion_tokens: 8192 },
					architecture: { modality: 'text+image->text' },
					pricing: { prompt: '0.000003', completion: '0.000015' },
				},
			],
		})
		expect(models).toHaveLength(1)
		expect(models[0].pricing?.prompt).toBe(0.000003)
		expect(models[0].pricing?.completion).toBe(0.000015)
		expect(models[0].architecture?.modality).toBe('text+image->text')
	})

	it('accepts numeric pricing and null optional fields', () => {
		const models = parseOpenRouterModels({
			data: [
				{
					id: 'free/model',
					description: null,
					context_length: null,
					top_provider: null,
					architecture: null,
					pricing: { prompt: 0, completion: null },
				},
			],
		})
		expect(models[0].description).toBeUndefined()
		expect(models[0].context_length).toBeUndefined()
		expect(models[0].top_provider).toBeUndefined()
		expect(models[0].pricing?.prompt).toBe(0)
		expect(models[0].pricing?.completion).toBeUndefined()
	})

	it('returns [] on malformed responses', () => {
		expect(parseOpenRouterModels({})).toEqual([])
		expect(parseOpenRouterModels({ data: null })).toEqual([])
		expect(parseOpenRouterModels({ data: [{ id: 1 }] })).toEqual([])
		expect(parseOpenRouterModels({ data: [{ context_length: 'x' }] })).toEqual([])
		expect(parseOpenRouterModels(null)).toEqual([])
	})
})

describe('parseYacyResults', () => {
	it('normalizes items from the channels envelope', () => {
		expect(parseYacyResults({
			channels: [{
				items: [
					{ title: 'A', link: [{ href: 'https://a.example' }], description: 'snippet A' },
					{ title: 'B', link: { href: 'https://b.example' }, content: 'snippet B' },
					{ title: 'C', link: 'https://c.example' },
				],
			}],
		})).toEqual([
			{ title: 'A', link: 'https://a.example', snippet: 'snippet A' },
			{ title: 'B', link: 'https://b.example', snippet: 'snippet B' },
			{ title: 'C', link: 'https://c.example', snippet: undefined },
		])
	})

	it('accepts a single item object instead of an array', () => {
		expect(parseYacyResults({
			channels: [{ items: { title: 'Solo', link: [{ href: 'https://s.example' }], description: 'd' } }],
		})).toEqual([{ title: 'Solo', link: 'https://s.example', snippet: 'd' }])
	})

	it('returns [] on zero results and malformed input', () => {
		expect(parseYacyResults({ channels: [{ totalResults: '0' }] })).toEqual([])
		expect(parseYacyResults({})).toEqual([])
		expect(parseYacyResults({ channels: [{ items: [{ title: 'no link' }] }] })).toEqual([])
		expect(parseYacyResults('nope')).toEqual([])
	})
})
