/**
 * Contract tests for the manage_files executor (manage-files.ts).
 *
 * Extracted from ChatView.tsx in 1.6.22 after a field report: a model asked
 * to create a file emitted a manage_files block whose operations validated
 * to an empty list (manage_files has no content-creating action), the empty
 * loop then reported ApplyStatus.Applied and fed the model a success result,
 * so the model believed the file existed while the vault stayed unchanged.
 *
 * Pinned here:
 * 1. An empty operation list is a FAILURE with an explanatory result - it
 *    must never surface as a successful apply.
 * 2. Per-action vault semantics (create_folder/move/delete/copy/rename),
 *    including missing sources and the unimplemented folder copy.
 * 3. Vault exceptions degrade to a failed result instead of escaping.
 * 4. Vault path arithmetic is slash-only on every OS (Windows field bug
 *    1.6.23: the platform `path` module emitted backslashes).
 */
import { TAbstractFile, TFile, TFolder } from 'obsidian'

import { CUSTOM_MODE_SCHEMA_VERSION, CustomMode } from '../database/json/custom-mode/types'
import { t } from '../lang/helpers'

import { logger } from './logger'
import { ManageFilesApp, ManageFilesModeInfo, ManageFilesOperation, checkManageFilesPermission, hasParentTraversal, normalizeVaultPath, runManageFilesOperations, vaultDirname, vaultJoinPath } from './manage-files'

jest.mock('./logger')

const loggerMock = jest.mocked(logger)

beforeEach(() => {
	jest.clearAllMocks()
})

/**
 * In-memory vault fake. Instances are tracked in a side map because the
 * obsidian mock classes carry no fields, and a side map avoids both type
 * assertions and mutating readonly-looking class members.
 */
type FakeAppOptions = {
	/** expose FileManager.renameFile (the link-updating rename the executor prefers) */
	withRenameFile?: boolean
	/** expose the binary read/create APIs (attachment-safe copy) */
	withBinaryApis?: boolean
}

function makeFakeApp(options: FakeAppOptions = {}) {
	const folders = new Set<string>()
	const files = new Map<string, string>()
	const instancePath = new Map<TAbstractFile, string>()
	const trashed: string[] = []
	const calls: string[] = []

	const register = (instance: TAbstractFile, filePath: string): void => {
		instancePath.set(instance, filePath)
	}
	const pathOf = (instance: TAbstractFile): string => instancePath.get(instance) ?? ''

	const app: ManageFilesApp = {
		vault: {
			adapter: {
				exists: async (existsPath: string) => {
					calls.push(`exists:${existsPath}`)
					return folders.has(existsPath) || files.has(existsPath)
				},
				mkdir: async (mkdirPath: string) => {
					calls.push(`mkdir:${mkdirPath}`)
					folders.add(mkdirPath)
				},
			},
			getAbstractFileByPath: (lookup: string) => {
				for (const [instance, instanceFilePath] of instancePath) {
					if (instanceFilePath === lookup) {
						return instance
					}
				}
				return null
			},
			rename: async (file, newPath) => {
				calls.push(`rename:${pathOf(file)}->${newPath}`)
				const oldPath = pathOf(file)
				if (files.has(oldPath)) {
					const content = files.get(oldPath) ?? ''
					files.delete(oldPath)
					files.set(newPath, content)
				} else {
					folders.delete(oldPath)
					folders.add(newPath)
				}
				instancePath.set(file, newPath)
			},
			create: async (createPath: string, data: string) => {
				calls.push(`create:${createPath}`)
				files.set(createPath, data)
				const instance = new TFile()
				register(instance, createPath)
				return instance
			},
			read: async (file) => {
				calls.push(`read:${pathOf(file)}`)
				return files.get(pathOf(file)) ?? ''
			},
			...(options.withBinaryApis
				? {
					readBinary: async (file: TFile) => {
						calls.push(`readBinary:${pathOf(file)}`)
						return new TextEncoder().encode(files.get(pathOf(file)) ?? '').buffer
					},
					createBinary: async (createPath: string, data: ArrayBuffer) => {
						calls.push(`createBinary:${createPath}`)
						files.set(createPath, new TextDecoder().decode(data))
						const instance = new TFile()
						register(instance, createPath)
						return instance
					},
				}
				: {}),
		},
		fileManager: {
			trashFile: async (file) => {
				calls.push(`trash:${pathOf(file)}`)
				trashed.push(pathOf(file))
				files.delete(pathOf(file))
				folders.delete(pathOf(file))
				instancePath.delete(file)
			},
			...(options.withRenameFile
				? {
					renameFile: async (file: TAbstractFile, newPath: string) => {
						calls.push(`renameFile:${pathOf(file)}->${newPath}`)
						const oldPath = pathOf(file)
						if (files.has(oldPath)) {
							const content = files.get(oldPath) ?? ''
							files.delete(oldPath)
							files.set(newPath, content)
						} else {
							folders.delete(oldPath)
							folders.add(newPath)
						}
						instancePath.set(file, newPath)
					},
				}
				: {}),
		},
	}

	const seedFile = (filePath: string, content = ''): TFile => {
		files.set(filePath, content)
		const instance = new TFile()
		register(instance, filePath)
		return instance
	}
	const seedFolder = (folderPath: string): TFolder => {
		folders.add(folderPath)
		const instance = new TFolder()
		register(instance, folderPath)
		return instance
	}

	return { app, folders, files, trashed, calls, seedFile, seedFolder }
}

const op = (operation: ManageFilesOperation): ManageFilesOperation[] => [operation]

describe('manage_files executor: empty operation list', () => {
	it('fails loudly instead of reporting a successful apply (field bug 1.6.22)', async () => {
		const fake = makeFakeApp()
		const result = await runManageFilesOperations(fake.app, [])
		expect(result.status).toBe('failed')
		expect(result.message).toContain('[manage_files]')
		expect(result.message).toContain('no valid file operations')
		// nothing may touch the vault on the failure path
		expect(fake.calls).toEqual([])
		expect(loggerMock.warn).toHaveBeenCalled()
	})
})

describe('manage_files executor: create_folder', () => {
	it('creates a missing folder', async () => {
		const fake = makeFakeApp()
		const result = await runManageFilesOperations(fake.app, op({ action: 'create_folder', path: 'Projects/New' }))
		expect(result.status).toBe('applied')
		expect(fake.folders.has('Projects/New')).toBe(true)
		expect(result.message).toBe(t('fileOps.resultHeader', { results: t('fileOps.createFolderOk', { path: 'Projects/New' }) }))
	})

	it('reports an existing folder without failing', async () => {
		const fake = makeFakeApp()
		fake.seedFolder('Projects')
		const result = await runManageFilesOperations(fake.app, op({ action: 'create_folder', path: 'Projects' }))
		expect(result.status).toBe('applied')
		expect(result.message).toContain(t('fileOps.folderExists', { path: 'Projects' }))
		expect(fake.calls.filter((call) => call.startsWith('mkdir:'))).toEqual([])
	})
})

describe('manage_files executor: move', () => {
	it('creates the destination directory and renames the item', async () => {
		const fake = makeFakeApp()
		fake.seedFile('draft.md', 'text')
		const result = await runManageFilesOperations(
			fake.app,
			op({ action: 'move', source_path: 'draft.md', destination_path: 'Archive/draft.md' }),
		)
		expect(result.status).toBe('applied')
		expect(fake.folders.has('Archive')).toBe(true)
		expect(fake.files.has('Archive/draft.md')).toBe(true)
		expect(fake.files.has('draft.md')).toBe(false)
	})

	it('reports a missing source as a failed operation instead of a silent success', async () => {
		const fake = makeFakeApp()
		const result = await runManageFilesOperations(
			fake.app,
			op({ action: 'move', source_path: 'ghost.md', destination_path: 'Archive/ghost.md' }),
		)
		// nothing was moved, so the model must not read this as an applied batch
		expect(result.status).toBe('failed')
		expect(result.ok).toBe(0)
		expect(result.failed).toBe(1)
		expect(result.message).toContain(t('fileOps.sourceMissing', { path: 'ghost.md' }))
	})
})

describe('manage_files executor: delete', () => {
	it('trashes an existing file', async () => {
		const fake = makeFakeApp()
		fake.seedFile('old.md', 'x')
		const result = await runManageFilesOperations(fake.app, op({ action: 'delete', path: 'old.md' }))
		expect(result.status).toBe('applied')
		expect(fake.trashed).toEqual(['old.md'])
		expect(fake.files.has('old.md')).toBe(false)
	})

	it('reports a missing path as a failed operation instead of a silent success', async () => {
		const fake = makeFakeApp()
		const result = await runManageFilesOperations(fake.app, op({ action: 'delete', path: 'ghost.md' }))
		expect(result.status).toBe('failed')
		expect(result.message).toContain(t('fileOps.notFound', { path: 'ghost.md' }))
	})
})

describe('manage_files executor: copy', () => {
	it('copies file content to the destination', async () => {
		const fake = makeFakeApp()
		fake.seedFile('src.md', 'payload')
		const result = await runManageFilesOperations(
			fake.app,
			op({ action: 'copy', source_path: 'src.md', destination_path: 'dup/src.md' }),
		)
		expect(result.status).toBe('applied')
		expect(fake.files.get('dup/src.md')).toBe('payload')
		expect(fake.files.has('src.md')).toBe(true)
	})

	it('reports folder copy as unsupported (and as a failure, not a success)', async () => {
		const fake = makeFakeApp()
		fake.seedFolder('Dir')
		const result = await runManageFilesOperations(
			fake.app,
			op({ action: 'copy', source_path: 'Dir', destination_path: 'Dir2' }),
		)
		expect(result.status).toBe('failed')
		expect(result.message).toContain(t('fileOps.copyFolderUnsupported', { path: 'Dir' }))
	})
})

describe('manage_files executor: rename', () => {
	it('renames within the same directory', async () => {
		const fake = makeFakeApp()
		fake.seedFile('Notes/a.md', 'x')
		const result = await runManageFilesOperations(fake.app, op({ action: 'rename', path: 'Notes/a.md', new_name: 'b.md' }))
		expect(result.status).toBe('applied')
		expect(fake.files.has('Notes/b.md')).toBe(true)
		expect(fake.files.has('Notes/a.md')).toBe(false)
	})
})

/**
 * Windows-only field bug (1.6.23): the executor used the platform `path`
 * module for vault path arithmetic. On Windows `path.join` emits backslashes,
 * so renaming `Notes/a.md` to `b.md` computed `Notes\b.md` - a path that
 * matches nothing in the vault (jest on Windows failed with
 * `files.has('Notes/b.md') === false`, and real vaults got wrong rename /
 * move / copy destinations). Obsidian vault paths always use forward
 * slashes; these tests pin slash-only computation on any OS.
 */
describe('manage_files executor: slash-only vault paths (Windows bug 1.6.23)', () => {
	it('vaultDirname returns the slash parent, empty for root-level paths', () => {
		expect(vaultDirname('Notes/a.md')).toBe('Notes')
		expect(vaultDirname('A/B/C.md')).toBe('A/B')
		expect(vaultDirname('a.md')).toBe('')
		expect(vaultDirname('')).toBe('')
	})

	it('vaultJoinPath always joins with forward slashes', () => {
		expect(vaultJoinPath('Notes', 'b.md')).toBe('Notes/b.md')
		expect(vaultJoinPath('Notes', 'Sub/b.md')).toBe('Notes/Sub/b.md')
		expect(vaultJoinPath('', 'b.md')).toBe('b.md')
		expect(vaultJoinPath('.', 'b.md')).toBe('b.md')
		expect(vaultJoinPath('Notes/', 'b.md')).toBe('Notes/b.md')
	})

	it('never produces platform separators in computed vault paths', () => {
		const computed = [vaultDirname('Notes/a.md'), vaultJoinPath('Notes', 'b.md'), vaultJoinPath('A/B', 'c.md')]
		for (const sample of computed) {
			expect(sample.includes('\\')).toBe(false)
		}
	})

	it('renames a root-level file without inventing a directory', async () => {
		const fake = makeFakeApp()
		fake.seedFile('a.md', 'x')
		const result = await runManageFilesOperations(fake.app, op({ action: 'rename', path: 'a.md', new_name: 'b.md' }))
		expect(result.status).toBe('applied')
		expect(fake.files.has('b.md')).toBe(true)
		expect(fake.files.has('a.md')).toBe(false)
	})

	it('renames into a nested new_name relative to the file directory', async () => {
		const fake = makeFakeApp()
		fake.seedFile('Notes/a.md', 'x')
		const result = await runManageFilesOperations(fake.app, op({ action: 'rename', path: 'Notes/a.md', new_name: 'Sub/b.md' }))
		expect(result.status).toBe('applied')
		expect(fake.files.has('Notes/Sub/b.md')).toBe(true)
		expect(fake.files.has('Notes/a.md')).toBe(false)
	})

	it('hands vault.rename only forward-slash paths (Windows pre-fix computed `Notes\\b.md`)', async () => {
		const fake = makeFakeApp()
		fake.seedFile('Notes/a.md', 'x')
		await runManageFilesOperations(fake.app, op({ action: 'rename', path: 'Notes/a.md', new_name: 'b.md' }))
		const renameCalls = fake.calls.filter((call) => call.startsWith('rename:'))
		expect(renameCalls).toEqual(['rename:Notes/a.md->Notes/b.md'])
	})
})

describe('manage_files executor: vault exceptions', () => {
	it('degrades a throwing vault to a failed result', async () => {
		const fake = makeFakeApp()
		fake.seedFile('a.md', 'x')
		const broken: ManageFilesApp = {
			vault: {
				adapter: fake.app.vault.adapter,
				getAbstractFileByPath: fake.app.vault.getAbstractFileByPath,
				rename: async () => {
					throw new Error('vault locked')
				},
				create: fake.app.vault.create,
				read: fake.app.vault.read,
			},
			fileManager: fake.app.fileManager,
		}
		const result = await runManageFilesOperations(broken, op({ action: 'move', source_path: 'a.md', destination_path: 'b.md' }))
		expect(result.status).toBe('failed')
		expect(result.message).toContain('vault locked')
		expect(loggerMock.error).toHaveBeenCalled()
	})
})

/**
 * Field report (1.6.23): a block whose operations all validated but whose
 * fields the model named differently (`from`/`to` instead of
 * `source_path`/`destination_path`) fell through the executor's
 * `if (operation.source_path && operation.destination_path)` guards: no
 * result line, an empty report and an `applied` status. The 1.6.22 fix only
 * covered the empty list; this pins the per-operation contract.
 */
describe('manage_files executor: per-operation honesty', () => {
	it('fails an operation that is missing its required fields instead of skipping it silently', async () => {
		const fake = makeFakeApp()
		fake.seedFile('Notes/a.md')
		// what the parser hands over for [{"action":"move","from":"Notes/a.md","to":"Notes/b.md"}]
		const result = await runManageFilesOperations(fake.app, op({ action: 'move' }))
		expect(result.status).toBe('failed')
		expect(result.failed).toBe(1)
		expect(result.message).toContain('source_path')
		expect(result.message).toContain('destination_path')
		expect(fake.calls).toEqual([])
		expect(loggerMock.warn).toHaveBeenCalled()
	})

	it('fails a rename without new_name', async () => {
		const fake = makeFakeApp()
		fake.seedFile('Notes/a.md')
		const result = await runManageFilesOperations(fake.app, op({ action: 'rename', path: 'Notes/a.md' }))
		expect(result.status).toBe('failed')
		expect(result.message).toContain('new_name')
		expect(fake.calls).toEqual([])
	})

	it('keeps the report of the operations that already ran when a later one throws', async () => {
		const fake = makeFakeApp()
		fake.seedFile('Notes/a.md')
		fake.seedFile('Notes/b.md')
		const broken: ManageFilesApp = {
			vault: {
				adapter: fake.app.vault.adapter,
				getAbstractFileByPath: fake.app.vault.getAbstractFileByPath,
				rename: async (file, newPath) => {
					if (newPath === 'Notes/x.md') {
						throw new Error('destination already exists')
					}
					return fake.app.vault.rename(file, newPath)
				},
				create: fake.app.vault.create,
				read: fake.app.vault.read,
			},
			fileManager: fake.app.fileManager,
		}
		const result = await runManageFilesOperations(broken, [
			{ action: 'rename', path: 'Notes/b.md', new_name: 'b2.md' },
			{ action: 'rename', path: 'Notes/a.md', new_name: 'x.md' },
			{ action: 'rename', path: 'Notes/b2.md', new_name: 'b3.md' },
		])
		expect(result.status).toBe('partial')
		expect(result.ok).toBe(2)
		expect(result.failed).toBe(1)
		// the model must be able to tell what already happened
		expect(result.message).toContain('Notes/b.md')
		expect(result.message).toContain('Notes/b3.md')
		expect(result.message).toContain('destination already exists')
	})

	it('reports an occupied move destination instead of letting the vault throw', async () => {
		const fake = makeFakeApp()
		fake.seedFile('Notes/a.md', 'new')
		fake.seedFile('Notes/b.md', 'existing')
		const result = await runManageFilesOperations(
			fake.app,
			op({ action: 'move', source_path: 'Notes/a.md', destination_path: 'Notes/b.md' }),
		)
		expect(result.status).toBe('failed')
		expect(result.message).toContain(t('fileOps.destinationExists', { path: 'Notes/b.md' }))
		expect(fake.files.get('Notes/b.md')).toBe('existing')
		expect(fake.files.has('Notes/a.md')).toBe(true)
	})

	it('reports an occupied copy destination instead of throwing mid-batch', async () => {
		const fake = makeFakeApp()
		fake.seedFile('Notes/a.md', 'new')
		fake.seedFile('Notes/b.md', 'existing')
		const result = await runManageFilesOperations(
			fake.app,
			op({ action: 'copy', source_path: 'Notes/a.md', destination_path: 'Notes/b.md' }),
		)
		expect(result.status).toBe('failed')
		expect(result.message).toContain(t('fileOps.destinationExists', { path: 'Notes/b.md' }))
		expect(fake.files.get('Notes/b.md')).toBe('existing')
	})

	it('treats a rename to the current name as a no-op success', async () => {
		const fake = makeFakeApp()
		fake.seedFile('Notes/a.md')
		const result = await runManageFilesOperations(fake.app, op({ action: 'rename', path: 'Notes/a.md', new_name: 'a.md' }))
		expect(result.status).toBe('applied')
		expect(result.message).toContain(t('fileOps.renameNoop', { path: 'Notes/a.md' }))
		expect(fake.calls).toEqual([])
	})
})

describe('manage_files executor: path normalization', () => {
	it('normalizes model paths to vault paths', () => {
		expect(normalizeVaultPath('Notes\\Inbox\\a.md')).toBe('Notes/Inbox/a.md')
		expect(normalizeVaultPath('/Notes/a.md')).toBe('Notes/a.md')
		expect(normalizeVaultPath('./Notes//a.md')).toBe('Notes/a.md')
		expect(normalizeVaultPath('  Notes/a.md  ')).toBe('Notes/a.md')
		expect(normalizeVaultPath('Notes/')).toBe('Notes')
	})

	it('renames a windows-style path the model emitted', async () => {
		const fake = makeFakeApp()
		fake.seedFile('Notes/a.md', 'x')
		const result = await runManageFilesOperations(
			fake.app,
			op({ action: 'rename', path: 'Notes\\a.md', new_name: 'b.md' }),
		)
		expect(result.status).toBe('applied')
		expect(fake.files.has('Notes/b.md')).toBe(true)
		expect(fake.files.has('Notes/a.md')).toBe(false)
	})
})

describe('manage_files executor: preferred Obsidian APIs', () => {
	it('renames through FileManager.renameFile when available so links are updated', async () => {
		const fake = makeFakeApp({ withRenameFile: true })
		fake.seedFile('Notes/a.md', 'x')
		const result = await runManageFilesOperations(fake.app, op({ action: 'rename', path: 'Notes/a.md', new_name: 'b.md' }))
		expect(result.status).toBe('applied')
		expect(fake.files.has('Notes/b.md')).toBe(true)
		// Vault.rename does not update links (obsidian.d.ts says so explicitly)
		expect(fake.calls).toContain('renameFile:Notes/a.md->Notes/b.md')
		expect(fake.calls.some((call) => call.startsWith('rename:'))).toBe(false)
	})

	it('moves through FileManager.renameFile too', async () => {
		const fake = makeFakeApp({ withRenameFile: true })
		fake.seedFile('draft.md', 'text')
		await runManageFilesOperations(fake.app, op({ action: 'move', source_path: 'draft.md', destination_path: 'Archive/draft.md' }))
		expect(fake.calls).toContain('renameFile:draft.md->Archive/draft.md')
	})

	it('copies through the binary APIs when available (attachments must not be mangled)', async () => {
		const fake = makeFakeApp({ withBinaryApis: true })
		fake.seedFile('img.png', 'binary-payload')
		const result = await runManageFilesOperations(
			fake.app,
			op({ action: 'copy', source_path: 'img.png', destination_path: 'dup/img.png' }),
		)
		expect(result.status).toBe('applied')
		expect(fake.calls).toContain('readBinary:img.png')
		expect(fake.calls).toContain('createBinary:dup/img.png')
		expect(fake.files.get('dup/img.png')).toBe('binary-payload')
		expect(fake.calls.some((call) => call.startsWith('read:'))).toBe(false)
	})
})

describe('manage_files executor: path traversal guard', () => {
	it('flags ".." segments', () => {
		expect(hasParentTraversal('Notes/../secret.md')).toBe(true)
		expect(hasParentTraversal('../outside.md')).toBe(true)
		expect(hasParentTraversal('Notes/a..b.md')).toBe(false)
		expect(hasParentTraversal('Notes/a.md')).toBe(false)
	})

	it('rejects an operation whose new_name escapes the folder', async () => {
		const fake = makeFakeApp()
		fake.seedFile('Notes/a.md', 'x')
		const result = await runManageFilesOperations(
			fake.app,
			op({ action: 'rename', path: 'Notes/a.md', new_name: '../../outside.md' }),
		)
		expect(result.status).toBe('failed')
		expect(result.message).toContain(t('fileOps.unsafePath', { path: '../../outside.md' }))
		expect(fake.files.has('Notes/a.md')).toBe(true)
		expect(fake.calls).toEqual([])
	})
})

/**
 * The mode restriction used to live in the system prompt only
 * (isToolAllowedForMode was consulted just by getToolDescriptionsForMode), so
 * any manage_files block that reached the chat could be executed with one
 * click - including in Ask, which is read-only. The gate is a pure function so
 * the ChatView branch stays thin and the contract is testable.
 */
describe('manage_files runtime mode gate', () => {
	it('allows Write mode (groups: read, edit, mcp, manage_files)', () => {
		const gate = checkManageFilesPermission('write', [])
		expect(gate.allowed).toBe(true)
		expect(gate.message).toBe('')
		expect(loggerMock.warn).not.toHaveBeenCalled()
	})

	it.each(['ask', 'learn', 'research'])('blocks %s mode and explains it to the model', (mode) => {
		const gate = checkManageFilesPermission(mode, [])
		expect(gate.allowed).toBe(false)
		expect(gate.mode).toBe(mode)
		expect(gate.message).toContain('[manage_files]')
		expect(gate.message).toContain(mode)
		expect(gate.message).toContain('switch_mode')
		expect(gate.message).toContain('nothing was changed')
		expect(loggerMock.warn).toHaveBeenCalled()
	})

	it('allows a custom mode that has the manage_files group', () => {
		const customModes: ManageFilesModeInfo[] = [{ slug: 'librarian', groups: ['read', 'manage_files'] }]
		expect(checkManageFilesPermission('librarian', customModes).allowed).toBe(true)
	})

	it('accepts the stored CustomMode shape (all properties optional)', () => {
		// CustomMode comes out of zod with optional members; the gate must take it
		// as-is, without a cast at the call site
		const stored: CustomMode[] = [
			{
				id: '11111111-1111-1111-1111-111111111111',
				slug: 'librarian',
				name: 'Librarian',
				roleDefinition: 'You organize the vault.',
				groups: ['read'],
				updatedAt: 1,
				schemaVersion: CUSTOM_MODE_SCHEMA_VERSION,
			},
		]
		const gate = checkManageFilesPermission('librarian', stored)
		expect(gate.allowed).toBe(false)
		expect(gate.message).toContain('librarian')
	})

	it('blocks a custom mode without the group, and an unknown slug', () => {
		const customModes: ManageFilesModeInfo[] = [{ slug: 'librarian', groups: ['read'] }]
		expect(checkManageFilesPermission('librarian', customModes).allowed).toBe(false)
		expect(checkManageFilesPermission('does-not-exist', customModes).allowed).toBe(false)
	})
})
