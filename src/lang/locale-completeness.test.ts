import en from './locale/en'
import ru from './locale/ru'
import zhCN from './locale/zh-cn'

type LocaleTree = Record<string, unknown>

const LOCALES: Record<string, LocaleTree> = {
	en,
	ru,
	'zh-cn': zhCN,
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function leafKeys(tree: LocaleTree, prefix = ''): string[] {
	const out: string[] = []
	for (const key of Object.keys(tree)) {
		const value = tree[key]
		const path = prefix ? `${prefix}.${key}` : key
		if (isRecord(value)) {
			out.push(...leafKeys(value, path))
		} else {
			out.push(path)
		}
	}
	return out
}

function leafValue(tree: LocaleTree, path: string): unknown {
	let node: unknown = tree
	for (const key of path.split('.')) {
		if (!isRecord(node)) {
			return undefined
		}
		node = node[key]
	}
	return node
}

function placeholders(value: unknown): string[] {
	if (typeof value !== 'string') {
		return []
	}
	const found: string[] = []
	const pattern = /\{([^}]+)\}/g
	let match = pattern.exec(value)
	while (match !== null) {
		found.push(match[1])
		match = pattern.exec(value)
	}
	return found.sort()
}

const enKeys = leafKeys(en).sort()

describe('locale completeness (en/ru/zh-cn)', () => {
	it('has a non-trivial number of keys', () => {
		expect(enKeys.length).toBeGreaterThan(500)
	})

	for (const name of ['ru', 'zh-cn']) {
		it(`${name} has exactly the same key set as en`, () => {
			const keys = leafKeys(LOCALES[name]).sort()
			const missing = enKeys.filter((k) => !keys.includes(k))
			const extra = keys.filter((k) => !enKeys.includes(k))
			expect({ missing, extra }).toEqual({ missing: [], extra: [] })
		})

		it(`${name} values are all non-empty strings`, () => {
			const bad: string[] = []
			for (const key of enKeys) {
				const value = leafValue(LOCALES[name], key)
				if (typeof value !== 'string' || value.trim() === '') {
					bad.push(key)
				}
			}
			expect(bad).toEqual([])
		})

		it(`${name} keeps en interpolation placeholders per key`, () => {
			const mismatched: string[] = []
			for (const key of enKeys) {
				const expected = placeholders(leafValue(en, key))
				if (expected.length === 0) {
					continue
				}
				const actual = placeholders(leafValue(LOCALES[name], key))
				if (JSON.stringify(actual) !== JSON.stringify(expected)) {
					mismatched.push(`${key}: en={${expected.join(',')}} ${name}={${actual.join(',')}}`)
				}
			}
			expect(mismatched).toEqual([])
		})
	}

	it('en values are all non-empty strings', () => {
		const bad = enKeys.filter((key) => {
			const value = leafValue(en, key)
			return typeof value !== 'string' || value.trim() === ''
		})
		expect(bad).toEqual([])
	})
})
