/**
 * Minimal lodash-compatible helpers.
 *
 * The plugin only used a handful of lodash utilities; keeping the whole
 * package (plus lodash.debounce / lodash.isequal) needlessly grew the bundle
 * and pulled deprecated dependencies into package.json. These implementations
 * cover exactly the semantics the codebase relies on, including lodash's
 * `isObject` treating arrays as objects and string paths like `a.b[0].c`.
 */

export function cloneDeep<T>(value: T): T {
	return structuredClone(value)
}

function toPath(path: string): string[] {
	return path
		.replace(/\[(\d+)\]/g, '.$1')
		.split('.')
		.filter((part) => part.length > 0)
}

type Obj = Record<string, unknown>

export function has(object: unknown, path: string): boolean {
	let current: unknown = object
	for (const key of toPath(path)) {
		if (current === null || typeof current !== 'object' || !(key in (current as Obj))) {
			return false
		}
		current = (current as Obj)[key]
	}
	return true
}

export function get<T = unknown>(object: unknown, path: string): T {
	let current: unknown = object
	for (const key of toPath(path)) {
		if (current === null || typeof current !== 'object') {
			return undefined
		}
		current = (current as Obj)[key]
	}
	return current as T
}

export function set(object: unknown, path: string, value: unknown): void {
	const keys = toPath(path)
	if (keys.length === 0 || object === null || typeof object !== 'object') {
		return
	}
	let current = object as Obj
	for (const key of keys.slice(0, -1)) {
		const next: unknown = current[key]
		if (next === null || typeof next !== 'object') {
			current[key] = {}
		}
		current = current[key] as Obj
	}
	current[keys[keys.length - 1]] = value
}

export function unset(object: unknown, path: string): void {
	const keys = toPath(path)
	if (keys.length === 0) {
		return
	}
	let current: unknown = object
	for (const key of keys.slice(0, -1)) {
		if (current === null || typeof current !== 'object') {
			return
		}
		current = (current as Obj)[key]
	}
	if (current !== null && typeof current === 'object') {
		delete (current as Obj)[keys[keys.length - 1]]
	}
}

type Iteratee<T> = { bivariantHack(value: T, key: string | number): void }['bivariantHack']

export function each<T>(collection: T[] | Record<string, T>, iteratee: Iteratee<T>): void {
	if (Array.isArray(collection)) {
		collection.forEach((value, index) => iteratee(value, index))
		return
	}
	for (const [key, value] of Object.entries(collection)) {
		iteratee(value, key)
	}
}

export function isArray(value: unknown): value is unknown[] {
	return Array.isArray(value)
}

export function isNumber(value: unknown): value is number {
	return typeof value === 'number'
}

export function isString(value: unknown): value is string {
	return typeof value === 'string'
}

/** Lodash semantics: arrays and plain objects both count as objects. */
export function isObject(value: unknown): value is Obj {
	return value !== null && typeof value === 'object'
}

export function isEqual(a: unknown, b: unknown): boolean {
	if (a === b) {
		return true
	}
	if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
		// NaN equality, mirroring lodash
		return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)
	}
	const aIsArray = Array.isArray(a)
	const bIsArray = Array.isArray(b)
	if (aIsArray !== bIsArray) {
		return false
	}
	if (aIsArray && bIsArray) {
		const left = a as unknown[]
		const right = b as unknown[]
		return left.length === right.length && left.every((item, i) => isEqual(item, right[i]))
	}
	const leftKeys = Object.keys(a as Obj)
	const rightKeys = Object.keys(b as Obj)
	if (leftKeys.length !== rightKeys.length) {
		return false
	}
	return leftKeys.every(
		(key) =>
			Object.prototype.hasOwnProperty.call(b, key) &&
			isEqual((a as Obj)[key], (b as Obj)[key]),
	)
}

export interface DebounceOptions {
	maxWait?: number
}

/**
 * Trailing-edge debounce with optional maxWait, mirroring the lodash API
 * surface used by the plugin (call + cancel).
 */
export function debounce<A extends unknown[], R>(
	func: (...args: A) => R,
	timeout = 300,
	options: DebounceOptions = {},
): ((...args: A) => R | undefined) & { cancel: () => void } {
	let timer: ReturnType<typeof setTimeout> | undefined
	let maxTimer: ReturnType<typeof setTimeout> | undefined
	let pending: { args: A; resolve: (value: R | undefined) => void } | undefined

	const invoke = (): void => {
		if (timer !== undefined) clearTimeout(timer)
		if (maxTimer !== undefined) clearTimeout(maxTimer)
		timer = undefined
		maxTimer = undefined
		const current = pending
		pending = undefined
		if (!current) return
		let result: R | undefined
		try {
			result = func(...current.args)
		} catch {
			result = undefined
		}
		current.resolve(result)
	}

	const debounced = (...args: A): Promise<R | undefined> => {
		return new Promise<R | undefined>((resolve) => {
			pending = { args, resolve }
			if (timer !== undefined) clearTimeout(timer)
			timer = setTimeout(invoke, timeout)
			if (options.maxWait !== undefined && maxTimer === undefined) {
				maxTimer = setTimeout(invoke, options.maxWait)
			}
		})
	}

	// Lodash types declare the debounced call as returning R | undefined
	// (the promise is implicit); keep the same contract for compatibility.
	const wrapped = debounced as unknown as ((...args: A) => R | undefined) & { cancel: () => void }
	wrapped.cancel = (): void => {
		if (timer !== undefined) clearTimeout(timer)
		if (maxTimer !== undefined) clearTimeout(maxTimer)
		timer = undefined
		maxTimer = undefined
		const current = pending
		pending = undefined
		if (current) current.resolve(undefined)
	}
	return wrapped
}
