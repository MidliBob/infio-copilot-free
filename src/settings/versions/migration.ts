import { cloneDeep, get, has, set } from "../../utils/lodash-lite";

import { findEqualPaths, isRegexValid } from "../../utils/auto-complete";

import {
	DEFAULT_SETTINGS as DEFAULT_SETTINGS_V0,
	Settings as SettingsV0,
	Trigger,
	settingsSchema as settingsSchemaV0
} from "./v0/v0";
import {
	DEFAULT_SETTINGS as DEFAULT_SETTINGS_V1,
	Settings as SettingsV1,
	settingsSchema as settingsSchemaV1
} from "./v1/v1";

/** Marker written by this migration; v1's schema pins it to the literal "1". */
const SETTINGS_VERSION_V1 = "1";

export function migrateFromV0ToV1(settings: SettingsV0): SettingsV1 {
	const updatedSettings: SettingsV0 = cloneDeep(settings);
	migrateDefaultSettings(updatedSettings, DEFAULT_SETTINGS_V0, DEFAULT_SETTINGS_V1);

	// v1 requires regex triggers to end with '$' and to be parseable, and
	// rejects empty values: append the anchor, then drop empty triggers and
	// regexes that still do not compile.
	const triggers = updatedSettings.triggers
		.map((trigger: Trigger) =>
			trigger.type === "regex" && !trigger.value.endsWith("$")
				? { ...trigger, value: `${trigger.value}$` }
				: trigger
		)
		.filter((trigger: Trigger) => trigger.value.length > 0)
		.filter((trigger: Trigger) => trigger.type !== "regex" || isRegexValid(trigger.value));

	return settingsSchemaV1.parse({
		...updatedSettings,
		version: SETTINGS_VERSION_V1,
		triggers,
		// v1 rejects an unparseable regex, so fall back to the v1 default when
		// the user value (or the v0 default) does not compile.
		chainOfThoughRemovalRegex: isRegexValid(updatedSettings.chainOfThoughRemovalRegex)
			? updatedSettings.chainOfThoughRemovalRegex
			: DEFAULT_SETTINGS_V1.chainOfThoughRemovalRegex,
		ollamaApiSettings: DEFAULT_SETTINGS_V1.ollamaApiSettings,
		ignoredFilePatterns: DEFAULT_SETTINGS_V1.ignoredFilePatterns,
		ignoredTags: DEFAULT_SETTINGS_V1.ignoredTags,
		cacheSuggestions: DEFAULT_SETTINGS_V1.cacheSuggestions,
		debugMode: DEFAULT_SETTINGS_V1.debugMode,
	});
}

/**
 * Copies the current default over every path where the user's value still
 * equals the previous default (the user never customized it), so defaults
 * introduced or changed by a release reach existing installs without
 * clobbering real choices.
 *
 * Paths are dynamic (`modelOptions.max_tokens`, `triggers[0].value`, ...),
 * hence the lodash-style has/get/set trio: the copied value stays `unknown`
 * end to end instead of leaking `any` into the caller.
 */
function migrateDefaultSettings(
	setting: SettingsV0,
	previousDefault: SettingsV0,
	currentDefault: object,
): void {
	const unchangedDefaultProperties = findEqualPaths(setting, previousDefault);
	for (const path of unchangedDefaultProperties) {
		if (has(currentDefault, path)) {
			const newDefaultValue: unknown = get(currentDefault, path);
			set(setting, path, newDefaultValue);
		}
	}
}


export const isSettingsV0 = (settings: object): boolean => {
	const result = settingsSchemaV0.safeParse(settings);
	return result.success;
}


export const isSettingsV1 = (settings: object): boolean => {
	const result = settingsSchemaV1.safeParse(settings);
	return result.success;
}
