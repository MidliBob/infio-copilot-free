/**
 * Pure-TypeScript MD5 (RFC 1321).
 *
 * Node's `crypto` module is not available on Obsidian mobile, so hashing
 * that must work on every platform (e.g. convert-data cache keys) uses this
 * implementation instead of `createHash('md5')`. Input strings are encoded
 * as UTF-8 first, exactly like Node's `createHash().update(string)` default,
 * so hashes are compatible with anything produced on desktop before.
 */

/* eslint-disable no-bitwise -- MD5 (RFC 1321) is defined entirely in terms of 32-bit rotate/shift/xor operations; the rule is re-enabled at the end of this file. */

// Per-round left rotation amounts (RFC 1321, section 3.4).
const S11 = 7, S12 = 12, S13 = 17, S14 = 22
const S21 = 5, S22 = 9, S23 = 14, S24 = 20
const S31 = 4, S32 = 11, S33 = 16, S34 = 23
const S41 = 6, S42 = 10, S43 = 15, S44 = 21

// T[i] = floor(abs(sin(i+1)) * 2^32), hardcoded for cross-engine stability.
const K = [
	0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
	0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
	0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
	0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
	0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
	0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
	0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
	0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
	0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
	0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
	0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
	0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
	0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
	0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
	0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
	0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]

function safeAdd(x: number, y: number): number {
	const lsw = (x & 0xffff) + (y & 0xffff)
	const msw = (x >> 16) + (y >> 16) + (lsw >> 16)
	return (msw << 16) | (lsw & 0xffff)
}

function rotateLeft(value: number, shift: number): number {
	return (value << shift) | (value >>> (32 - shift))
}

/** Encodes a string as UTF-8 bytes (no TextEncoder dependency). */
function utf8Bytes(input: string): number[] {
	const bytes: number[] = []
	for (let i = 0; i < input.length; i++) {
		let code = input.charCodeAt(i)
		// Combine UTF-16 surrogate pairs into a single code point.
		if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
			const next = input.charCodeAt(i + 1)
			if (next >= 0xdc00 && next <= 0xdfff) {
				code = (code - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000
				i++
			}
		}
		// Lone surrogates have no UTF-8 encoding; Node's Buffer replaces
		// them with U+FFFD - do the same to stay hash-compatible.
		if (code >= 0xd800 && code <= 0xdfff) {
			code = 0xfffd
		}
		if (code < 0x80) {
			bytes.push(code)
		} else if (code < 0x800) {
			bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
		} else if (code < 0x10000) {
			bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
		} else {
			bytes.push(
				0xf0 | (code >> 18),
				0x80 | ((code >> 12) & 0x3f),
				0x80 | ((code >> 6) & 0x3f),
				0x80 | (code & 0x3f),
			)
		}
	}
	return bytes
}

/** Packs bytes into little-endian 32-bit words. */
function bytesToWords(bytes: number[]): number[] {
	const words: number[] = []
	for (let i = 0; i < bytes.length; i++) {
		words[i >> 2] = (words[i >> 2] ?? 0) | (bytes[i] << ((i % 4) * 8))
	}
	return words
}

/** Core MD5 over a word array; returns the 4-word digest. */
function md5Words(input: number[], lengthBits: number): number[] {
	const x = input.slice()
	x[lengthBits >> 5] = (x[lengthBits >> 5] ?? 0) | (0x80 << (lengthBits % 32))
	const lengthWord = (((lengthBits + 64) >>> 9) << 4) + 14
	for (let i = x.length; i <= lengthWord; i++) {
		x[i] = 0
	}
	x[lengthWord] = lengthBits

	let a = 1732584193
	let b = -271733879
	let c = -1732584194
	let d = 271733878

	for (let chunk = 0; chunk < x.length; chunk += 16) {
		const oldA = a, oldB = b, oldC = c, oldD = d
		for (let i = 0; i < 64; i++) {
			let f: number
			let g: number
			let s: number
			if (i < 16) {
				f = (b & c) | (~b & d)
				g = i
				s = [S11, S12, S13, S14][i % 4]
			} else if (i < 32) {
				f = (d & b) | (~d & c)
				g = (5 * i + 1) % 16
				s = [S21, S22, S23, S24][i % 4]
			} else if (i < 48) {
				f = b ^ c ^ d
				g = (3 * i + 5) % 16
				s = [S31, S32, S33, S34][i % 4]
			} else {
				f = c ^ (b | ~d)
				g = (7 * i) % 16
				s = [S41, S42, S43, S44][i % 4]
			}
			const temp = d
			d = c
			c = b
			b = safeAdd(b, rotateLeft(safeAdd(safeAdd(a, f), safeAdd(K[i], x[chunk + g] ?? 0)), s))
			a = temp
		}
		a = safeAdd(a, oldA)
		b = safeAdd(b, oldB)
		c = safeAdd(c, oldC)
		d = safeAdd(d, oldD)
	}

	return [a, b, c, d]
}

/** Computes the MD5 hash of a UTF-8-encoded string, as lowercase hex. */
export function md5Hex(input: string): string {
	const bytes = utf8Bytes(input)
	const digest = md5Words(bytesToWords(bytes), bytes.length * 8)
	let hex = ''
	for (const word of digest) {
		for (let byteIndex = 0; byteIndex < 4; byteIndex++) {
			hex += ((word >>> (byteIndex * 8)) & 0xff).toString(16).padStart(2, '0')
		}
	}
	return hex
}

/* eslint-enable no-bitwise -- end of the pure-TS MD5 module; the rule stays active for the rest of the codebase. */
