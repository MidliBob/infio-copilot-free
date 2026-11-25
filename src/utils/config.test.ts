import { logger } from './logger'

import { injectEnv } from './config'

jest.mock('./logger')

const loggerMock = jest.mocked(logger)

beforeEach(() => {
	jest.clearAllMocks()
	delete process.env.ICF_TEST_INJECT_ENV
})

afterAll(() => {
	delete process.env.ICF_TEST_INJECT_ENV
})

describe('injectEnv', () => {
	it('substitutes a reference in an object config and keeps the object shape', async () => {
		process.env.ICF_TEST_INJECT_ENV = 'secret-value'

		const config = { command: 'npx', args: ['--token', '${env:ICF_TEST_INJECT_ENV}'] }
		const result = await injectEnv(config)

		expect(result).toEqual({ command: 'npx', args: ['--token', 'secret-value'] })
		expect(config.args[1]).toBe('${env:ICF_TEST_INJECT_ENV}')
	})

	it('substitutes a reference in a string config', async () => {
		process.env.ICF_TEST_INJECT_ENV = 'from-env'

		await expect(injectEnv('header=${env:ICF_TEST_INJECT_ENV}')).resolves.toBe('header=from-env')
	})

	it('falls back to an empty string and warns when the variable is missing', async () => {
		await expect(injectEnv({ url: 'https://x.test/?k=${env:ICF_TEST_INJECT_ENV}' })).resolves.toEqual({
			url: 'https://x.test/?k=',
		})
		expect(loggerMock.warn).toHaveBeenCalledTimes(1)
	})

	it('uses the explicit fallback for a missing variable', async () => {
		await expect(injectEnv('key=${env:ICF_TEST_INJECT_ENV}', 'MISSING')).resolves.toBe('key=MISSING')
	})

	it('leaves configs without references untouched', async () => {
		const config = { command: 'npx', args: ['-y'] }

		await expect(injectEnv(config)).resolves.toEqual(config)
		expect(loggerMock.warn).not.toHaveBeenCalled()
	})
})
