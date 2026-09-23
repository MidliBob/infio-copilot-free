import { createHash } from 'crypto'

import { md5Hex } from './md5'

/** Deterministic PRNG (mulberry32) so fuzz cases are reproducible. */
function makeRandom(seed: number): () => number {
	let state = seed
	return () => {
		state |= 0
		state = (state + 0x6d2b79f5) | 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function nodeMd5(input: string): string {
	return createHash('md5').update(input, 'utf8').digest('hex')
}

describe('md5Hex', () => {
	it('matches the RFC 1321 test vectors', () => {
		expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
		expect(md5Hex('a')).toBe('0cc175b9c0f1b6a831c399e269772661')
		expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
		expect(md5Hex('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0')
		expect(md5Hex('abcdefghijklmnopqrstuvwxyz')).toBe('c3fcd3d76192e4007dfb496cca67e13b')
		expect(md5Hex('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')).toBe(
			'd174ab98d277d9f5a5611c2c9f419d9f',
		)
		expect(md5Hex('1234567890'.repeat(8))).toBe('57edf4a22be3c955ac49da2e2107b67a')
	})

	it('encodes non-ASCII input as UTF-8, like Node does', () => {
		for (const input of ['привет', '你好,世界', '🎉 emoji 🔥 test', 'umlauts äöü ß']) {
			expect(md5Hex(input)).toBe(nodeMd5(input))
		}
	})

	it('handles the block-padding boundary lengths', () => {
		// 55/56/63/64/65/119/120 bytes exercise the padding edge cases.
		for (const len of [55, 56, 63, 64, 65, 119, 120, 121, 1000]) {
			const input = 'a'.repeat(len)
			expect(md5Hex(input)).toBe(nodeMd5(input))
		}
	})

	it('matches Node crypto on random strings, including lone surrogates', () => {
		const random = makeRandom(42)
		for (let i = 0; i < 200; i++) {
			const len = Math.floor(random() * 300)
			let input = ''
			for (let j = 0; j < len; j++) {
				input += String.fromCharCode(Math.floor(random() * 0x10000))
			}
			expect(md5Hex(input)).toBe(nodeMd5(input))
		}
	})
})
