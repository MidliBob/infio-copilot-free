// Solution copied from obsidian-kanban: https://github.com/mgmeyers/obsidian-kanban/blob/44118e25661bff9ebfe54f71ae33805dc88ffa53/src/lang/helpers.ts

import { moment } from "obsidian";

import en from "./locale/en";
import ru from "./locale/ru";
import zhCN from "./locale/zh-cn";

// Supported UI languages (roadmap phase 0.4 policy): English, Russian and
// Simplified Chinese. Every other Obsidian language falls back to English
// silently - by design, not an error. Keep the three locale files in sync:
// src/lang/locale-completeness.test.ts enforces identical key sets and
// interpolation placeholders.
const localeMap: { [k: string]: Partial<typeof en> } = {
	en,
	ru,
	"zh-cn": zhCN,
};

// top-level lookup used as the per-segment fallback for partial translations
const enFlat: Record<string, unknown> = en;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function t(str: string, params?: Record<string, unknown>): string {
	// Resolve the current UI language at call time
	const currentLocale = moment.locale();
	const locale = localeMap[currentLocale] ?? en;

	const path = str.split('.');
	let result: unknown = locale;

	for (const key of path) {
		result = (isRecord(result) ? result[key] : undefined) ?? enFlat[key];
		if (result === undefined) return str;
	}

	// Handle parameter interpolation
	if (params && typeof result === 'string') {
		return result.replace(/\{([^}]+)\}/g, (match: string, key: string) => {
			return params[key] !== undefined ? String(params[key]) : match;
		});
	}

	// A key that resolves to a section (object) instead of a leaf string is a
	// caller mistake; returning the key path keeps it visible in the UI
	// instead of rendering "[object Object]".
	return typeof result === 'string' ? result : str;
}
