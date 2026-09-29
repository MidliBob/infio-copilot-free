import * as path from 'path'

import { TAbstractFile, TFile, TFolder } from 'obsidian'

import { t } from '../lang/helpers'
import { ManageFilesToolArgs } from '../types/apply'

import { logger } from './logger'

/** One validated manage_files operation, as emitted by parse-icf-block. */
export type ManageFilesOperation = ManageFilesToolArgs['operations'][number]

/**
 * Minimal structural slice of the Obsidian App needed by the manage_files
 * executor. Kept deliberately narrow so unit tests can supply a hand-made
 * fake vault without type assertions.
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
		read: (file: TFile) => Promise<string>
	}
	fileManager: {
		trashFile: (file: TAbstractFile) => Promise<void>
	}
}

export type ManageFilesRunResult = {
	status: 'applied' | 'failed'
	message: string
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
 */
export async function runManageFilesOperations(
	app: ManageFilesApp,
	operations: readonly ManageFilesOperation[],
): Promise<ManageFilesRunResult> {
	if (operations.length === 0) {
		logger.warn('manage_files: no valid operations to execute')
		return { status: 'failed', message: t('fileOps.noValidOperations') }
	}

	const results: string[] = []
	try {
		for (const operation of operations) {
			switch (operation.action) {
				case 'create_folder':
					if (operation.path) {
						const folderExists = await app.vault.adapter.exists(operation.path)
						if (!folderExists) {
							await app.vault.adapter.mkdir(operation.path)
							results.push(t('fileOps.createFolderOk', { path: operation.path }))
						} else {
							results.push(t('fileOps.folderExists', { path: operation.path }))
						}
					}
					break

				case 'move':
					if (operation.source_path && operation.destination_path) {
						// getAbstractFileByPath (not getFileByPath) so folders resolve too
						const sourceFile = app.vault.getAbstractFileByPath(operation.source_path)
						if (sourceFile) {
							// make sure the destination directory exists
							const destDir = path.dirname(operation.destination_path)
							if (destDir && destDir !== '.' && destDir !== '/') {
								const dirExists = await app.vault.adapter.exists(destDir)
								if (!dirExists) {
									await app.vault.adapter.mkdir(destDir)
								}
							}
							await app.vault.rename(sourceFile, operation.destination_path)
							const itemType = sourceFile instanceof TFile ? t('fileOps.typeFile') : t('fileOps.typeFolder')
							results.push(
								t('fileOps.moveOk', {
									type: itemType,
									source: operation.source_path,
									destination: operation.destination_path,
								}),
							)
						} else {
							results.push(t('fileOps.sourceMissing', { path: operation.source_path }))
						}
					}
					break

				case 'delete':
					if (operation.path) {
						const fileOrFolder = app.vault.getAbstractFileByPath(operation.path)
						if (fileOrFolder) {
							try {
								const isFolder = fileOrFolder instanceof TFolder
								// trash (system trash when available) is safer than hard delete
								await app.fileManager.trashFile(fileOrFolder)
								const itemType = isFolder ? t('fileOps.typeFolder') : t('fileOps.typeFile')
								results.push(t('fileOps.trashOk', { type: itemType, path: operation.path }))
							} catch (error) {
								logger.error('Delete failed:', error)
								results.push(
									t('fileOps.deleteFailed', {
										path: operation.path,
										error: error instanceof Error ? error.message : String(error),
									}),
								)
							}
						} else {
							results.push(t('fileOps.notFound', { path: operation.path }))
						}
					}
					break

				case 'copy':
					if (operation.source_path && operation.destination_path) {
						const sourceFile = app.vault.getAbstractFileByPath(operation.source_path)
						if (sourceFile) {
							if (sourceFile instanceof TFile) {
								const destDir = path.dirname(operation.destination_path)
								if (destDir && destDir !== '.' && destDir !== '/') {
									const dirExists = await app.vault.adapter.exists(destDir)
									if (!dirExists) {
										await app.vault.adapter.mkdir(destDir)
									}
								}
								const content = await app.vault.read(sourceFile)
								await app.vault.create(operation.destination_path, content)
								results.push(
									t('fileOps.copyOk', {
										source: operation.source_path,
										destination: operation.destination_path,
									}),
								)
							} else if (sourceFile instanceof TFolder) {
								// recursive folder copy is not implemented yet
								results.push(t('fileOps.copyFolderUnsupported', { path: operation.source_path }))
							}
						} else {
							results.push(t('fileOps.sourceMissing', { path: operation.source_path }))
						}
					}
					break

				case 'rename':
					if (operation.path && operation.new_name) {
						const file = app.vault.getAbstractFileByPath(operation.path)
						if (file) {
							const newPath = path.join(path.dirname(operation.path), operation.new_name)
							await app.vault.rename(file, newPath)
							const itemType = file instanceof TFile ? t('fileOps.typeFile') : t('fileOps.typeFolder')
							results.push(t('fileOps.renameOk', { type: itemType, path: operation.path, newPath }))
						} else {
							results.push(t('fileOps.notFound', { path: operation.path }))
						}
					}
					break

				default:
					results.push(t('fileOps.opUnsupported', { action: String(operation.action) }))
			}
		}

		return {
			status: 'applied',
			message: t('fileOps.resultHeader', { results: results.join('\n') }),
		}
	} catch (error) {
		logger.error('File management operation failed:', error)
		return {
			status: 'failed',
			message: t('fileOps.resultFailed', {
				error: error instanceof Error ? error.message : String(error),
			}),
		}
	}
}
