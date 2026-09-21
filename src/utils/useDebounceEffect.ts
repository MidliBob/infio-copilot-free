import { useEffect, useRef } from "react"

type VoidFn = () => void

/**
 * Runs `effectRef.current()` after `delay` ms whenever any of the `deps` change,
 * but cancels/re-schedules if they change again before the delay.
 */
export function useDebounceEffect(effect: VoidFn, delay: number, deps: any[]) {
	const callbackRef = useRef<VoidFn>(effect)
	const timeoutRef = useRef<number | null>(null)

	// Keep callbackRef current
	useEffect(() => {
		callbackRef.current = effect
	}, [effect])

	useEffect(() => {
		// Clear any queued call
		if (timeoutRef.current) {
			window.clearTimeout(timeoutRef.current)
		}

		// Schedule a new call
		timeoutRef.current = window.setTimeout(() => {
			// always call the *latest* version of effect
			callbackRef.current()
		}, delay)

		// Cleanup on unmount or next effect
		return () => {
			if (timeoutRef.current) {
				window.clearTimeout(timeoutRef.current)
			}
		}

		// We want to re‐schedule if any item in `deps` changed,
		// or if `delay` changed.

		// eslint-disable-next-line react-hooks/exhaustive-deps -- dependency list is intentionally narrow
	}, [delay, ...deps])
}
