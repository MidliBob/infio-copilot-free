import { TAbstractFile, TFile, TFolder } from 'obsidian'

import { t } from '../lang/helpers'
import { ManageFilesToolArgs } from '../types/apply'

import { logger } from './logger'
import { GroupEntry, ModeConfig, isToolAllowedForMode } from './modes'

/**
 * Result of the runtime mode check that guards the manage_files Apply button.
 *
 * A flat shape on purpose: the project compiles with `strictNullChecks: false`,
 * where TypeScript does not narrow a discriminated union on a boolean literal,
 * so `{ allowed: true } | { allowed: false; ... }` would force casts at every
 * call site. `message` is empty when the call is allowed.
 */
export type ManageFilesPermission = {
	allowed: boolean
	mode: string
	/** tool_result text handed back to the model; empty when allowed */
	message: string
}

/**
 * The slice of a stored mode the gate needs.
 *
 * `CustomMode` (zod-inferred, so every property is optional under this
 * tsconfig) is not assignable to `ModeConfig`, whose slug/name/roleDefinition
 * are required - passing the stored list straight through does not type-check
 * and the fix would be a cast. This structural type accepts both.
 */
export type ManageFilesModeInfo = {
	slug?: string
	/**
	 * Left as `unknown` entries on purpose: the stored CustomMode schema infers
	 * group tuples with a variadic tail (`[name, options, ...unknown[]]`), which
	 * TypeScript refuses to assign to the fixed-length `GroupEntry` tuple. The
	 * gate rebuilds the entries at runtime instead of casting at the call site.
	 */
	groups?: readonly unknown[]
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
	return Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined
}

/** Plain-object guard: keeps the group-options rebuild free of type assertions. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Rebuilds stored group entries (`"read"` or `["edit", { fileRegex }]`) as parser-side GroupEntry values. */
function toGroupEntries(groups: readonly unknown[] | undefined): GroupEntry[] {
	if (groups === undefined) {
		return []
	}
	const entries: GroupEntry[] = []
	for (const item of groups) {
		if (typeof item === 'string') {
			entries.push(item)
			continue
		}
		if (isUnknownArray(item) && typeof item[0] === 'string') {
			const options: unknown = item[1]
			entries.push(
				isPlainRecord(options)
					? [item[0], {
						fileRegex: optionalString(options.fileRegex),
						description: optionalString(options.description),
					}]
					: [item[0], {}],
			)
		}
	}
	return entries
}

/**
 * Runtime gate for the manage_files Apply button.
 *
 * `isToolAllowedForMode` was otherwise consulted only while the system prompt
 * was assembled, so the mode restriction lived in the prompt alone: a block the
 * model emitted anyway (CAPABILITIES used to advertise manage_files in every
 * mode), or a block left in a conversation that was started in Write mode and
 * continued after switching to Ask, could still be executed against the vault
 * with one click in a read-only mode. The gate returns the tool_result text the
 * model must receive, so it stops re-emitting the block and can tell the user
 * why nothing happened.
 */
export function checkManageFilesPermission(
	mode: string,
	customModes: readonly ManageFilesModeInfo[],
): ManageFilesPermission {
	const knownModes: ModeConfig[] = customModes.map((custom) => ({
		slug: custom.slug ?? '',
		name: custom.slug ?? '',
		roleDefinition: '',
		groups: toGroupEntries(custom.groups),
	}))
	if (isToolAllowedForMode('manage_files', mode, knownModes)) {
		return { allowed: true, mode, message: '' }
	}
	logger.warn('manage_files: blocked, the tool is not part of mode', mode)
	return { allowed: false, mode, message: t('fileOps.modeNotAllowed', { mode }) }
}

/** One validated manage_files operation, as emitted by parse-icf-block. */
export type ManageFilesOperation = ManageFilesToolArgs['operations'][number]

/**
 * Parent directory of an Obsidian vault path.
 *
 * Vault paths are vault-relative and always use forward slashes on every
 * platform, so the platform `path` module must not be used for vault path
 * arithmetic: on Windows `path.join` emits backslashes, which produced
 * destinations like `Notes\b.md` that match nothing in the vault (field bug
 * 1.6.23: rename/move/copy computed wrong vault paths on Windows). Returns
 * an empty string for root-level paths.
 */
export function vaultDirname(vaultPath: string): string {
	const lastSlash = vaultPath.lastIndexOf('/')
	return lastSlash === -1 ? '' : vaultPath.slice(0, lastSlash)
}

/**
 * Joins a vault directory and a trailing segment into a single vault path,
 * always with forward slashes. An empty directory (or `.`/`/`) means the
 * vault root, so the segment alone is the result.
 */
export function vaultJoinPath(dir: string, segment: string): string {
	const trimmedDir = dir === '.' || dir === '/' ? '' : dir.replace(/\/+$/, '')
	const trimmedSegment = segment.replace(/^\/+/, '')
	if (!trimmedDir) {
		return trimmedSegment
	}
	return `${trimmedDir}/${trimmedSegment}`
}

/**
 * Normalizes a path that came from the model into a vault path.
 *
 * The model writes paths the way the user's OS does, so a Windows session
 * regularly produces `Notes\Inbox\a.md`; `getAbstractFileByPath` matches
 * nothing for that and the operation used to fail with "file does not
 * exist" while the batch still reported success. Vault paths are
 * vault-relative, forward-slash only, without a leading `./` or `/`, and
 * without duplicated separators.
 */
export function normalizeVaultPath(value: string): string {
	return value
		.trim()
		.replace(/\\/g, '/')
		.replace(/\/{2,}/g, '/')
		.replace(/^\.\//, '')
		.replace(/^\/+/, '')
		.replace(/\/+$/, '')
}

/**
 * `..` segments let a path escape its folder (and, from a vault-relative
 * path, the vault itself). A note the model read can talk it into such a
 * path, so every path coming out of the model is rejected here instead of
 * being handed to the vault API.
 */
export function hasParentTraversal(vaultPath: string): boolean {
	return vaultPath.split('/').includes('..')
}

/** First path of an operation that must be rejected, `undefined` when all are safe. */
function unsafePathOf(operation: ManageFilesOperation): string | undefined {
	for (const candidate of [operation.path, operation.source_path, operation.destination_path, operation.new_name]) {
		if (typeof candidate === 'string' && hasParentTraversal(normalizeVaultPath(candidate))) {
			return candidate
		}
	}
	return undefined
}

/**
 * Minimal structural slice of the Obsidian App needed by the manage_files
 * executor. Kept deliberately narrow so unit tests can supply a hand-made
 * fake vault without type assertions.
 *
 * The optional members are the APIs the executor prefers when they exist:
 * `fileManager.renameFile` (unlike `vault.rename` it updates every link in
 * the vault, which is the whole point of renaming a note) and
 * `readBinary`/`createBinary` (a text round-trip corrupts attachments such
 * as images or PDFs). They are optional so a fake vault that only models the
 * text APIs still type-checks.
 */
export type ManageFilesApp = {
	vault: {
		adapter: {
			exists: (path: string) => Promise<boolean>
			mkdir: (path: string) => Promise<void>
		}
		getAbstractFileByPath: (path: string) => TAbstractFile | null
		rename: (file: TAbstractFile, normalizedPath: string) => Promise<void>
		create: (path: string, data: string) => Promise<TFile>
		createBinary?: (path: string, data: ArrayBuffer) => Promise<TFile>
		read: (file: TFile) => Promise<string>
		readBinary?: (file: TFile) => Promise<ArrayBuffer>
	}
	fileManager: {
		trashFile: (file: TAbstractFile) => Promise<void>
		renameFile?: (file: TAbstractFile, newPath: string) => Promise<void>
	}
}

export type ManageFilesRunResult = {
	/**
	 * `applied`   - every requested operation succeeded
	 * `partial`   - some succeeded, some did not (the report says which)
	 * `failed`    - nothing succeeded
	 * Anything but `applied` must reach the model as a failure: reporting a
	 * no-op as success is what made the model believe a file existed after an
	 * empty manage_files call (field bug 1.6.22).
	 */
	status: 'applied' | 'partial' | 'failed'
	ok: number
	failed: number
	message: string
}

/** One operation's outcome: the line shown to the user and fed back to the model. */
type OperationOutcome = { ok: boolean; line: string }

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

/**
 * Required fields per action. An entry that validated as a known action but
 * lost its fields (the model wrote `from`/`to` instead of
 * `source_path`/`destination_path`, for example) used to fall through the
 * `if (operation.path)` guards silently: no result line at all, an empty
 * report and an `applied` status - a successful-looking no-op.
 */
function missingFields(operation: ManageFilesOperation): string[] {
	const missing: string[] = []
	switch (operation.action) {
		case 'create_folder':
		case 'delete':
			if (!operation.path) {
				missing.push('path')
			}
			break
		case 'rename':
			if (!operation.path) {
				missing.push('path')
			}
			if (!operation.new_name) {
				missing.push('new_name')
			}
			break
		case 'move':
		case 'copy':
			if (!operation.source_path) {
				missing.push('source_path')
			}
			if (!operation.destination_path) {
				missing.push('destination_path')
			}
			break
	}
	return missing
}

/** Narrows the optional FileManager.renameFile member without a type assertion. */
function hasRenameFile(
	fileManager: ManageFilesApp['fileManager'],
): fileManager is ManageFilesApp['fileManager'] & {
	renameFile: (file: TAbstractFile, newPath: string) => Promise<void>
} {
	return typeof fileManager.renameFile === 'function'
}

/**
 * Renames/moves through FileManager when available: obsidian.d.ts documents
 * `Vault.rename` as "To ensure links are automatically renamed, use
 * FileManager.renameFile instead", and a vault where renaming a note leaves
 * every `[[wikilink]]` pointing at the old name is worse than a failed rename.
 */
async function renameItem(app: ManageFilesApp, file: TAbstractFile, newPath: string): Promise<void> {
	if (hasRenameFile(app.fileManager)) {
		await app.fileManager.renameFile(file, newPath)
		return
	}
	await app.vault.rename(file, newPath)
}

/** Makes sure the parent folder of a vault path exists. */
async function ensureParentFolder(app: ManageFilesApp, vaultPath: string): Promise<void> {
	const dir = vaultDirname(vaultPath)
	if (!dir) {
		return
	}
	if (!(await app.vault.adapter.exists(dir))) {
		await app.vault.adapter.mkdir(dir)
	}
}

async function destinationIsFree(app: ManageFilesApp, destination: string): Promise<boolean> {
	if (app.vault.getAbstractFileByPath(destination) !== null) {
		return false
	}
	return !(await app.vault.adapter.exists(destination))
}

/**
 * Copies file bytes. `Vault.read`/`create` are the plaintext APIs: routing an
 * attachment (png, pdf, ...) through them writes a mangled copy, so the
 * binary APIs are preferred whenever the host exposes them.
 */
/** Narrows the optional binary vault members without a type assertion. */
function hasBinaryApis(
	vault: ManageFilesApp['vault'],
): vault is ManageFilesApp['vault'] & {
	readBinary: (file: TFile) => Promise<ArrayBuffer>
	createBinary: (path: string, data: ArrayBuffer) => Promise<TFile>
} {
	return typeof vault.readBinary === 'function' && typeof vault.createBinary === 'function'
}

async function copyFileBytes(app: ManageFilesApp, source: TFile, destination: string): Promise<void> {
	if (hasBinaryApis(app.vault)) {
		const bytes = await app.vault.readBinary(source)
		await app.vault.createBinary(destination, bytes)
		return
	}
	const content = await app.vault.read(source)
	await app.vault.create(destination, content)
}

/** Executes a single validated operation; every failure mode returns a line instead of throwing. */
async function runOneOperation(app: ManageFilesApp, operation: ManageFilesOperation): Promise<OperationOutcome> {
	switch (operation.action) {
		case 'create_folder': {
			const path = normalizeVaultPath(operation.path ?? '')
			if (await app.vault.adapter.exists(path)) {
				return { ok: true, line: t('fileOps.folderExists', { path }) }
			}
			await app.vault.adapter.mkdir(path)
			return { ok: true, line: t('fileOps.createFolderOk', { path }) }
		}

		case 'move': {
			const source = normalizeVaultPath(operation.source_path ?? '')
			const destination = normalizeVaultPath(operation.destination_path ?? '')
			const sourceFile = app.vault.getAbstractFileByPath(source)
			if (!sourceFile) {
				return { ok: false, line: t('fileOps.sourceMissing', { path: source }) }
			}
			if (!(await destinationIsFree(app, destination))) {
				return { ok: false, line: t('fileOps.destinationExists', { path: destination }) }
			}
			await ensureParentFolder(app, destination)
			await renameItem(app, sourceFile, destination)
			const itemType = sourceFile instanceof TFile ? t('fileOps.typeFile') : t('fileOps.typeFolder')
			return { ok: true, line: t('fileOps.moveOk', { type: itemType, source, destination }) }
		}

		case 'delete': {
			const path = normalizeVaultPath(operation.path ?? '')
			const target = app.vault.getAbstractFileByPath(path)
			if (!target) {
				return { ok: false, line: t('fileOps.notFound', { path }) }
			}
			const isFolder = target instanceof TFolder
			// trash (system trash when available) is safer than hard delete
			await app.fileManager.trashFile(target)
			const itemType = isFolder ? t('fileOps.typeFolder') : t('fileOps.typeFile')
			return { ok: true, line: t('fileOps.trashOk', { type: itemType, path }) }
		}

		case 'copy': {
			const source = normalizeVaultPath(operation.source_path ?? '')
			const destination = normalizeVaultPath(operation.destination_path ?? '')
			const sourceFile = app.vault.getAbstractFileByPath(source)
			if (!sourceFile) {
				return { ok: false, line: t('fileOps.sourceMissing', { path: source }) }
			}
			if (!(sourceFile instanceof TFile)) {
				// recursive folder copy is not implemented yet
				return { ok: false, line: t('fileOps.copyFolderUnsupported', { path: source }) }
			}
			if (!(await destinationIsFree(app, destination))) {
				return { ok: false, line: t('fileOps.destinationExists', { path: destination }) }
			}
			await ensureParentFolder(app, destination)
			await copyFileBytes(app, sourceFile, destination)
			return { ok: true, line: t('fileOps.copyOk', { source, destination }) }
		}

		case 'rename': {
			const path = normalizeVaultPath(operation.path ?? '')
			const newName = (operation.new_name ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
			const file = app.vault.getAbstractFileByPath(path)
			if (!file) {
				return { ok: false, line: t('fileOps.notFound', { path }) }
			}
			// slash-only arithmetic: path.join would emit `Notes\b.md` on Windows
			const newPath = vaultJoinPath(vaultDirname(path), newName)
			if (newPath === path) {
				return { ok: true, line: t('fileOps.renameNoop', { path }) }
			}
			if (!(await destinationIsFree(app, newPath))) {
				return { ok: false, line: t('fileOps.destinationExists', { path: newPath }) }
			}
			await ensureParentFolder(app, newPath)
			await renameItem(app, file, newPath)
			const itemType = file instanceof TFile ? t('fileOps.typeFile') : t('fileOps.typeFolder')
			return { ok: true, line: t('fileOps.renameOk', { type: itemType, path, newPath }) }
		}

		default:
			return { ok: false, line: t('fileOps.opUnsupported', { action: String(operation.action) }) }
	}
}

/**
 * Executes a validated manage_files operation list against the vault.
 *
 * Extracted from ChatView.tsx in 1.6.22 so the tool result semantics are
 * unit-testable. Field bug: a block whose operations validated to an empty
 * list used to run the (empty) loop, report ApplyStatus.Applied ("done") and
 * feed the model a success result, so the model believed the requested file
 * existed. Nothing executed must always surface as a failure, both in the UI
 * and in the tool result returned to the model.
 *
 * The same principle now holds per operation:
 * - one throwing operation no longer aborts the batch and no longer erases
 *   the report of the operations that already ran (the model used to learn
 *   only "failed: <error>" and could not tell what had been renamed, so it
 *   happily repeated those steps);
 * - an operation skipped for missing fields, a missing source or an occupied
 *   destination counts as a failure, so a batch where nothing happened can
 *   never be reported as `applied`.
 */
export async function runManageFilesOperations(
	app: ManageFilesApp,
	operations: readonly ManageFilesOperation[],
): Promise<ManageFilesRunResult> {
	if (operations.length === 0) {
		logger.warn('manage_files: no valid operations to execute')
		return { status: 'failed', ok: 0, failed: 0, message: t('fileOps.noValidOperations') }
	}

	const outcomes: OperationOutcome[] = []
	for (const operation of operations) {
		const unsafe = unsafePathOf(operation)
		if (unsafe !== undefined) {
			logger.warn('manage_files: rejecting a path with parent traversal', unsafe)
			outcomes.push({ ok: false, line: t('fileOps.unsafePath', { path: unsafe }) })
			continue
		}
		const missing = missingFields(operation)
		if (missing.length > 0) {
			logger.warn('manage_files: operation is missing required fields', operation.action, missing.join(', '))
			outcomes.push({
				ok: false,
				line: t('fileOps.skippedMissingFields', { action: operation.action, fields: missing.join(', ') }),
			})
			continue
		}
		try {
			outcomes.push(await runOneOperation(app, operation))
		} catch (error) {
			// a vault exception fails this operation only: the batch keeps
			// going and the report keeps the lines collected so far
			logger.error(`manage_files: ${operation.action} failed`, error)
			outcomes.push({ ok: false, line: t('fileOps.opFailed', { action: operation.action, error: errorMessage(error) }) })
		}
	}

	const ok = outcomes.filter((outcome) => outcome.ok).length
	const failed = outcomes.length - ok
	const results = outcomes.map((outcome) => outcome.line).join('\n')

	if (failed === 0) {
		return { status: 'applied', ok, failed, message: t('fileOps.resultHeader', { results }) }
	}
	return {
		status: ok === 0 ? 'failed' : 'partial',
		ok,
		failed,
		message: t('fileOps.resultWithFailures', { ok, failed, total: outcomes.length, results }),
	}
}
