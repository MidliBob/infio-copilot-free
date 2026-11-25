import { isEditorStateEmpty } from './SearchInputWithActions'

function stateWith(children: unknown[]): unknown {
	return { root: { children } }
}

describe('isEditorStateEmpty', () => {
	it('reports an empty paragraph list as empty', () => {
		expect(isEditorStateEmpty(stateWith([]))).toBe(true)
	})

	it('reports a paragraph without children as empty', () => {
		expect(isEditorStateEmpty(stateWith([{ type: 'paragraph', children: [] }]))).toBe(true)
	})

	it('reports a paragraph with text as non-empty', () => {
		const state = stateWith([
			{ type: 'paragraph', children: [{ type: 'text', text: 'hello', format: 0 }] },
		])

		expect(isEditorStateEmpty(state)).toBe(false)
	})

	it('treats non-paragraph blocks as content', () => {
		expect(isEditorStateEmpty(stateWith([{ type: 'heading', children: [] }]))).toBe(false)
	})

	it('treats malformed input as empty instead of throwing', () => {
		expect(isEditorStateEmpty(null)).toBe(true)
		expect(isEditorStateEmpty(undefined)).toBe(true)
		expect(isEditorStateEmpty('not a state')).toBe(true)
		expect(isEditorStateEmpty({})).toBe(true)
		expect(isEditorStateEmpty({ root: {} })).toBe(true)
		expect(isEditorStateEmpty({ root: { children: 'nope' } })).toBe(true)
	})

	it('treats non-object children as content', () => {
		expect(isEditorStateEmpty(stateWith([42, null]))).toBe(false)
	})
})
