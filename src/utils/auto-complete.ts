import { cloneDeep, each, get, has, isArray, isEqual, isNumber, isObject, isString, set, unset } from "./lodash-lite";
import * as mm from "micromatch";
import { Result, err, ok } from "neverthrow";
import { ZodError, ZodIssueCode, ZodType } from 'zod';

import { DEFAULT_SETTINGS, PluginData, Settings, settingsSchema } from "../settings/versions";
import { isSettingsV0, isSettingsV1, migrateFromV0ToV1 } from "../settings/versions/migration";
import { InfioSettings, InfioSettingsSchema } from '../types/settings';

/**
 * Raw JSON-ish value: something that came out of `JSON.parse`, storage or a
 * schema. Values are `unknown` on purpose — every read has to be narrowed by
 * a schema (parseWithSchema) or a lodash-style guard (isObject & co).
 */
type JSONObject = Record<string, unknown>;

export function checkForErrors(settings: InfioSettings): Map<string, string> {
	const errors = new Map<string, string>();
	const parsingResult = parseWithSchema(InfioSettingsSchema, settings);

	if (parsingResult.isOk()) {
		return errors;
	}

	// Typed as ZodError, but the unknown hop keeps the defensive branch below
	// meaningful to the compiler instead of "always true".
	const error: unknown = parsingResult.error;
	if (error instanceof ZodError) {
		for (const issue of error.issues) {
			errors.set(issue.path.join('.'), issue.message);
		}
	} else {
		// statically unreachable: parseWithSchema types the error as ZodError.
		// Kept as a defensive wrap so nothing non-Error is ever thrown
		// (only-throw-error, burned in 1.7.11).
		throw new Error('Settings validation failed with an unexpected error shape');
	}

	return errors;
}


export function fixStructureAndValueErrors<T extends ZodType>(
	schema: T,
	value: unknown,
	defaultValue: object,
): Result<ReturnType<T["parse"]>, Error> {
	let current: unknown = value;
	if (current === null || current === undefined) {
		current = {};
	}
	let result = parseWithSchema(schema, current);

	if (result.isErr()) {
		current = addMissingKeys(current, result.error, defaultValue);
		current = removeUnrecognizedKeys(current, result.error);
		result = parseWithSchema(schema, current);
	}

	if (result.isErr()) {
		current = replaceValuesWithErrorsByDefaultValue(current, result.error, defaultValue);
		result = parseWithSchema(schema, current);
	}

	return result;
}

export function parseWithSchema<T extends ZodType>(
	schema: T,
	value: unknown
): Result<ReturnType<T["parse"]>, ZodError> {
	const parsingResult = schema.safeParse(value);
	return parsingResult.success ? ok(parsingResult.data) : err(parsingResult.error);
}

function addMissingKeys(value: unknown, error: ZodError, defaultValue: object): unknown {
	const invalidTypeIssues = error.issues.filter(issue => issue.code === ZodIssueCode.invalid_type);
	const errorPaths = invalidTypeIssues
		.map(issue => issue.path)
		.map(path => reduceArrayPathToFirstObjectPath(path))
		.map(path => path.join('.'));

	return replaceValueWithDefaultValue(value, errorPaths, defaultValue);
}

/**
 * Deep-copies `value` and stamps the current default at every `path`. A
 * primitive has nothing to stamp (`set` is a no-op on it), so it is returned
 * as-is, exactly like the previous implementation.
 */
function replaceValueWithDefaultValue(value: unknown, paths: string[], defaultValue: object): unknown {
	const result: unknown = isObject(value) ? cloneDeep(value) : value;
	for (const path of paths) {
		const originalValue = has(defaultValue, path) ? get(defaultValue, path) : undefined;
		set(result, path, originalValue);
	}

	return result;
}


function removeUnrecognizedKeys(value: unknown, error: ZodError): JSONObject {
	if (!isObject(value)) {
		return {};
	}
	// Zod unrecognized_keys issues consist of two parts:
	// - path to the nested object where the unrecognized key was found
	// - the key itself which is unrecognized
	//
	// Array paths are handled separately by the value replacement function.
	const unrecognizedPaths = error.issues.flatMap((issue) => {
		if (issue.code !== ZodIssueCode.unrecognized_keys) {
			return [];
		}
		if (isAnArrayPath(issue.path)) {
			return [];
		}
		return issue.keys.map(key => [...issue.path, key].join('.'));
	});

	unrecognizedPaths.forEach(path => {
		unset(value, path);
	});
	return value;
}


function replaceValuesWithErrorsByDefaultValue(
	value: unknown,
	error: ZodError,
	defaultValue: object
): unknown {
	const errorPaths = error.issues
		.map(issue => issue.path)
		.map(path => reduceArrayPathToFirstObjectPath(path))
		.map(path => path.join('.'));

	return replaceValueWithDefaultValue(value, errorPaths, defaultValue);
}

function reduceArrayPathToFirstObjectPath(path: (string | number)[]): (string | number)[] {
	const result: (string | number)[] = [];
	for (const key of path) {
		if (typeof key === 'number') {
			break;
		}
		result.push(key);
	}

	return result;
}

function isAnArrayPath(path: (string | number)[]): boolean {
	return path.some(key => typeof key === 'number');
}

export function serializeSettings(settings: Settings): PluginData {
	return { settings: settings };
}

export function deserializeSettings(data: JSONObject | null | undefined): Result<Settings, Error> {
	let settings: unknown;
	if (data === null || data === undefined || !Object.prototype.hasOwnProperty.call(data, "settings")) {
		settings = {};
	} else {
		settings = data.settings;
	}

	if (isSettingsV0(settings)) {
		settings = migrateFromV0ToV1(settings);
	}
	if (!isSettingsV1(settings)) {
		return fixStructureAndValueErrors(settingsSchema, settings, DEFAULT_SETTINGS);
	}

	return parseWithSchema(settingsSchema, settings);
}

export function isRegexValid(value: string): boolean {
	try {
		const regex = new RegExp(value);
		regex.test("");
		return true;
	} catch {
		return false;
	}
}

export function isValidIgnorePattern(value: string): boolean {
	try {
		mm.isMatch("", value);
		return true;
	} catch {
		return false;
	}
}

export function findEqualPaths(obj1: unknown, obj2: unknown, basePath = ''): string[] {
	let paths: string[] = [];

	if (
		basePath === ''
		&& (
			!isObject(obj1)
			|| !isObject(obj2)
			|| isArray(obj1)
			|| isArray(obj2)
			|| isNumber(obj1)
			|| isNumber(obj2)
			|| isString(obj1)
			|| isString(obj2)
		)
	) {
		return [];
	}

	// Function to iterate over keys and compare values
	function iterateKeys(value: unknown, key: string): void {
		const path = basePath ? `${basePath}.${key}` : key;
		if (isObject(value) && isObject(get(obj2, key))) {
			// Recursively find paths for nested objects
			paths = paths.concat(findEqualPaths(value, get(obj2, key), path));
		} else if (isEqual(value, get(obj2, key))) {
			// Add path to array if values are equal
			paths.push(path);
		}
	}

	// If both are arrays, iterate using each index
	if (isArray(obj1) && isArray(obj2)) {
		each(obj1, (value, index) => { iterateKeys(value, `[${String(index)}]`); });
	} else if (isObject(obj1)) {
		// Iterate over keys of the first object
		each(obj1, iterateKeys);
	}

	return paths;
}
