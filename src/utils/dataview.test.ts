import { DataviewPluginRegistry, getDataviewApi } from './dataview'

function registryWith(plugin: unknown): DataviewPluginRegistry {
	return { getPlugin: () => plugin }
}

const fakeApi = {
	queryMarkdown: jest.fn(async () => ({ successful: true, value: 'x' })),
	evaluate: jest.fn(async () => ({ successful: true, value: 'y' })),
}

describe('getDataviewApi', () => {
	it('returns null when dataview is not installed', () => {
		expect(getDataviewApi(registryWith(null))).toBeNull()
	})

	it('returns null when the plugin exposes no api field', () => {
		expect(getDataviewApi(registryWith({}))).toBeNull()
	})

	it('returns null when the api lacks the query surface', () => {
		expect(getDataviewApi(registryWith({ api: { queryMarkdown: jest.fn() } }))).toBeNull()
		expect(getDataviewApi(registryWith({ api: 42 }))).toBeNull()
		expect(getDataviewApi(registryWith({ api: 'dataview' }))).toBeNull()
	})

	it('returns the api object when the surface matches', () => {
		expect(getDataviewApi(registryWith({ api: fakeApi }))).toBe(fakeApi)
	})
})
