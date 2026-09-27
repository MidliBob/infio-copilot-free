/**
 * @jest-environment jsdom
 */

// The mocked Notice records every constructed instance so tests can assert
// on the fragment and timeout without reaching into Obsidian internals.
// (jest.mock factories may only reference out-of-scope variables whose name
// starts with "mock".)
type MockNoticeRecord = {
	message: unknown
	duration: unknown
	hide: jest.Mock
	setMessage: jest.Mock
}
const mockCreatedNotices: MockNoticeRecord[] = []

jest.mock('obsidian', () => {
	const Notice = jest.fn((message?: unknown, duration?: unknown) => {
		const instance: MockNoticeRecord = {
			message,
			duration,
			hide: jest.fn(),
			setMessage: jest.fn(),
		}
		mockCreatedNotices.push(instance)
		return instance
	})
	return {
		Notice,
		moment: { locale: jest.fn(() => 'en') },
	}
})

import {
	extractErrorMessage,
	resetAllShownErrorNotices,
	resetShownErrorNotice,
	retryAction,
	showErrorNotice,
	showErrorNoticeOnce,
} from './error-notice'
import { logger } from './logger'

jest.mock('./logger')

function lastNotice(): MockNoticeRecord {
	const record = mockCreatedNotices[mockCreatedNotices.length - 1]
	if (record === undefined) {
		throw new Error('no Notice was constructed')
	}
	return record
}

function noticeFragment(record: MockNoticeRecord): DocumentFragment {
	const message = record.message
	if (!(message instanceof DocumentFragment)) {
		throw new Error('Notice was not constructed with a DocumentFragment')
	}
	return message
}

function textOf(fragment: DocumentFragment, selector: string): string | null {
	return fragment.querySelector(selector)?.textContent ?? null
}

beforeEach(() => {
	mockCreatedNotices.length = 0
	resetAllShownErrorNotices()
	jest.clearAllMocks()
})

describe('extractErrorMessage', () => {
	it('extracts the message of an Error', () => {
		expect(extractErrorMessage(new Error('boom'))).toBe('boom')
	})

	it('passes strings through', () => {
		expect(extractErrorMessage('plain failure')).toBe('plain failure')
	})

	it('extracts a string message from message-shaped objects', () => {
		expect(extractErrorMessage({ message: 'from object' })).toBe('from object')
	})

	it('falls back to String() for primitives and message-less objects', () => {
		expect(extractErrorMessage(42)).toBe('42')
		expect(extractErrorMessage({ code: 7 })).toBe('[object Object]')
	})

	it('returns an empty string for null and undefined', () => {
		expect(extractErrorMessage(null)).toBe('')
		expect(extractErrorMessage(undefined)).toBe('')
	})
})

describe('showErrorNotice', () => {
	it('renders title, message and error detail into the notice fragment', () => {
		showErrorNotice({
			title: 'Index rebuild failed',
			message: 'The vault index could not be rebuilt.',
			error: new Error('PGlite: out of memory'),
		})

		const fragment = noticeFragment(lastNotice())
		expect(textOf(fragment, '.icf-error-notice-title')).toBe('Index rebuild failed')
		expect(textOf(fragment, '.icf-error-notice-message')).toBe('The vault index could not be rebuilt.')
		expect(textOf(fragment, '.icf-error-notice-detail')).toBe('PGlite: out of memory')
	})

	it('omits empty sections', () => {
		showErrorNotice({ title: 'Failed' })

		const fragment = noticeFragment(lastNotice())
		expect(textOf(fragment, '.icf-error-notice-title')).toBe('Failed')
		expect(fragment.querySelector('.icf-error-notice-message')).toBeNull()
		expect(fragment.querySelector('.icf-error-notice-detail')).toBeNull()
		expect(fragment.querySelector('.icf-error-notice-actions')).toBeNull()
	})

	it('truncates very long error details', () => {
		showErrorNotice({ title: 'Failed', error: new Error('x'.repeat(400)) })

		const detail = textOf(noticeFragment(lastNotice()), '.icf-error-notice-detail') ?? ''
		expect(detail.length).toBe(301) // 300 chars + ellipsis
		expect(detail.endsWith('…')).toBe(true)
	})

	it('logs through the logging facade with the error object', () => {
		const error = new Error('logged failure')
		showErrorNotice({ title: 'Some failure', error, logMessage: 'context prefix:' })

		expect(jest.mocked(logger.error)).toHaveBeenCalledWith('context prefix:', error)
	})

	it('falls back to the title for logging and keeps the default timeout', () => {
		showErrorNotice({ title: 'Untitled failure', message: 'details here' })

		expect(jest.mocked(logger.error)).toHaveBeenCalledWith('Untitled failure', 'details here')
		expect(lastNotice().duration).toBe(10000)
	})

	it('renders action buttons, hides the notice and runs the action on click', () => {
		const onRetry = jest.fn()
		showErrorNotice({
			title: 'Failed',
			actions: [{ label: 'Do it again', onClick: onRetry }],
		})

		const record = lastNotice()
		// notices with actions stay until dismissed
		expect(record.duration).toBe(0)

		const button = noticeFragment(record).querySelector('.icf-error-notice-action')
		expect(button).not.toBeNull()
		expect(button?.textContent).toBe('Do it again')

		button?.dispatchEvent(new Event('click'))
		expect(onRetry).toHaveBeenCalledTimes(1)
		expect(record.hide).toHaveBeenCalledTimes(1)
	})

	it('honors an explicit timeout even with actions', () => {
		showErrorNotice({ title: 'Failed', timeout: 4242, actions: [retryAction(jest.fn())] })
		expect(lastNotice().duration).toBe(4242)
	})
})

describe('retryAction', () => {
	it('uses the localized retry label', () => {
		const action = retryAction(jest.fn())
		expect(action.label).toBe('Retry') // moment.locale() is mocked to 'en'
	})
})

describe('showErrorNoticeOnce', () => {
	it('shows the first notice and suppresses repeats for the same key', () => {
		const shown = showErrorNoticeOnce('embedding-down', {
			title: 'Semantic search is unavailable',
			error: new Error('Cannot reach Ollama'),
		})
		expect(shown).not.toBeNull()
		expect(mockCreatedNotices.length).toBe(1)

		const suppressed = showErrorNoticeOnce('embedding-down', {
			title: 'Semantic search is unavailable',
			error: new Error('Cannot reach Ollama'),
		})
		expect(suppressed).toBeNull()
		expect(mockCreatedNotices.length).toBe(1)
	})

	it('still logs every suppressed occurrence', () => {
		showErrorNoticeOnce('embedding-down', { title: 'Failed', error: new Error('boom') })
		showErrorNoticeOnce('embedding-down', { title: 'Failed', error: new Error('boom') })
		expect(jest.mocked(logger.error)).toHaveBeenCalledTimes(2)
	})

	it('tracks different keys independently', () => {
		showErrorNoticeOnce('a', { title: 'First' })
		showErrorNoticeOnce('b', { title: 'Second' })
		expect(mockCreatedNotices.length).toBe(2)
	})

	it('resetShownErrorNotice lets the user-triggered retry surface a new failure', () => {
		showErrorNoticeOnce('embedding-down', { title: 'Failed' })
		resetShownErrorNotice('embedding-down')
		showErrorNoticeOnce('embedding-down', { title: 'Failed' })
		expect(mockCreatedNotices.length).toBe(2)
	})

	it('resetAllShownErrorNotices clears every key', () => {
		showErrorNoticeOnce('a', { title: 'First' })
		resetAllShownErrorNotices()
		showErrorNoticeOnce('a', { title: 'First' })
		expect(mockCreatedNotices.length).toBe(2)
	})
})
