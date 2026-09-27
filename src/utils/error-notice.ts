import { Notice } from 'obsidian'

import { t } from '../lang/helpers'
import { logger } from './logger'

/**
 * Unified "error -> actionable notice" layer (ROADMAP phase 2, item 5).
 *
 * Replaces ad-hoc `new Notice(...)` calls in catch paths: the user sees a
 * styled, localized error notice with the failure detail and (optionally)
 * action buttons such as "Retry", while the full error object still goes
 * to the logging facade. Callers keep control of the actions, so the layer
 * stays free of app/plugin references and is unit-testable in jsdom.
 *
 * Styles: .icf-error-notice-* in styles.css.
 */

export type ErrorNoticeAction = {
	label: string
	onClick: () => void
}

export type ErrorNoticeOptions = {
	/** Short localized headline, e.g. t('notifications.rebuildFailed'). */
	title: string
	/** Optional longer explanation shown under the title. */
	message?: string
	/** Caught value; its message is extracted for the detail line and it is logged in full. */
	error?: unknown
	/** Action buttons; a notice with actions stays until dismissed (timeout 0) by default. */
	actions?: ErrorNoticeAction[]
	/** Notice lifetime in ms; 0 = persistent. Default: 0 with actions, 10000 without. */
	timeout?: number
	/** Prefix for logger.error instead of the user-facing title. */
	logMessage?: string
}

const DETAIL_MAX_LENGTH = 300
const DEFAULT_TIMEOUT = 10000

/**
 * Best-effort human-readable message from a caught value:
 * Error.message, plain strings, `{ message }`-shaped objects, String()
 * for primitives, empty string for null/undefined.
 */
export function extractErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message
	}
	if (typeof error === 'string') {
		return error
	}
	if (typeof error === 'object' && error !== null && 'message' in error) {
		const message: unknown = error.message
		if (typeof message === 'string') {
			return message
		}
	}
	if (error === undefined || error === null) {
		return ''
	}
	return String(error)
}

/** Standard "Retry" action with the localized label. */
export function retryAction(onRetry: () => void): ErrorNoticeAction {
	return { label: t('errors.retry'), onClick: onRetry }
}

/**
 * Session-scoped registry of notices already shown via
 * showErrorNoticeOnce: an automatic background failure (e.g. statistics
 * loaded on view mount while the embedding server is down) should tell
 * the user once, not on every mount/effect re-run. The registry is only
 * reset by an explicit action (the standard retry pattern below) or a
 * plugin/app reload.
 */
const shownOnceKeys = new Set<string>()

/** Allow the once-per-session notice with this key to be shown again. */
export function resetShownErrorNotice(key: string): void {
	shownOnceKeys.delete(key)
}

/** Test helper: forget every once-per-session key. */
export function resetAllShownErrorNotices(): void {
	shownOnceKeys.clear()
}

/**
 * showErrorNotice, but only the first call per key per session; later
 * calls with the same key only log. Pair with retryAction +
 * resetShownErrorNotice(key) so a user-triggered retry always gets
 * fresh feedback:
 *
 *   showErrorNoticeOnce('search-statistics', {
 *     title: ..., error,
 *     actions: [retryAction(() => {
 *       resetShownErrorNotice('search-statistics')
 *       void reload()
 *     })],
 *   })
 *
 * Returns the Notice, or null when it was suppressed as a duplicate.
 */
export function showErrorNoticeOnce(key: string, options: ErrorNoticeOptions): Notice | null {
	if (shownOnceKeys.has(key)) {
		logger.error(options.logMessage ?? options.title, options.error ?? options.message ?? '')
		return null
	}
	shownOnceKeys.add(key)
	return showErrorNotice(options)
}

export function showErrorNotice(options: ErrorNoticeOptions): Notice {
	const { title, message, error, actions, timeout } = options

	logger.error(options.logMessage ?? title, error ?? message ?? '')

	const fragment = document.createDocumentFragment()
	const container = document.createElement('div')
	container.className = 'icf-error-notice'

	const titleEl = document.createElement('div')
	titleEl.className = 'icf-error-notice-title'
	titleEl.textContent = title
	container.appendChild(titleEl)

	if (message !== undefined && message !== '') {
		const messageEl = document.createElement('div')
		messageEl.className = 'icf-error-notice-message'
		messageEl.textContent = message
		container.appendChild(messageEl)
	}

	const detail = extractErrorMessage(error)
	if (detail !== '') {
		const detailEl = document.createElement('div')
		detailEl.className = 'icf-error-notice-detail'
		detailEl.textContent =
			detail.length > DETAIL_MAX_LENGTH
				? `${detail.slice(0, DETAIL_MAX_LENGTH)}…`
				: detail
		container.appendChild(detailEl)
	}

	const hasActions = actions !== undefined && actions.length > 0
	const notice = new Notice(fragment, timeout ?? (hasActions ? 0 : DEFAULT_TIMEOUT))

	if (actions !== undefined && actions.length > 0) {
		const actionsEl = document.createElement('div')
		actionsEl.className = 'icf-error-notice-actions'
		for (const action of actions) {
			const button = document.createElement('button')
			button.className = 'icf-error-notice-action'
			button.textContent = action.label
			button.addEventListener('click', () => {
				notice.hide()
				action.onClick()
			})
			actionsEl.appendChild(button)
		}
		container.appendChild(actionsEl)
	}

	fragment.appendChild(container)
	return notice
}
