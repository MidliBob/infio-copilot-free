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

export function t(str: string, params?: Record<string, any>): any {
	// 动态获取当前语言
	const currentLocale = moment.locale();
	const locale = localeMap[currentLocale] ?? en;

	const path = str.split('.');
	let result: any = locale;

	for (const key of path) {
		result = result?.[key] ?? enFlat[key];
		if (result === undefined) return str;
	}

	// Handle parameter interpolation
	if (params && typeof result === 'string') {
		return result.replace(/\{([^}]+)\}/g, (match, key) => {
			return params[key] !== undefined ? String(params[key]) : match;
		});
	}

	return result;
}
