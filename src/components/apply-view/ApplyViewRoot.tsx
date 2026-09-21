import { Change, diffLines } from 'diff'
import { Platform, getIcon } from 'obsidian'
import { useEffect, useState } from 'react'
import ContentEditable from 'react-contenteditable'

import { ApplyViewState } from '../../ApplyView'
import { useApp } from '../../contexts/AppContext'
import { t } from '../../lang/helpers'

export default function ApplyViewRoot({ state, close }: {
	state: ApplyViewState
	close: () => void
}) {
	const acceptIcon = getIcon('check')
	const rejectIcon = getIcon('x')
	const excludeIcon = getIcon('x')

	const getShortcutText = (shortcut: 'accept' | 'reject') => {
		const isMac = Platform.isMacOS
		if (shortcut === 'accept') {
			return isMac ? '(⌘⏎)' : '(Ctrl+⏎)'
		}
		return isMac ? '(⌘⌫)' : '(Ctrl+⌫)'
	}

	const app = useApp()

	// Track which lines have been accepted or excluded
	const [diffStatus, setDiffStatus] = useState<Array<'active' | 'accepted' | 'excluded'>>([])

	const [diff] = useState<Change[]>(() => {
		const initialDiff = diffLines(state.oldContent, state.newContent)
		// Initialize all lines as 'active'
		setDiffStatus(initialDiff.map(() => 'active'))
		return initialDiff
	})

	// Store edited content for each diff part
	const [editedContents, setEditedContents] = useState<string[]>(
		diff.map(part => part.value)
	)

	const handleAccept = async () => {
		// Filter and process content based on diffStatus
		const newContent = diff.reduce((result, change, index) => {
			// Keep unchanged content, non-excluded additions, or excluded removals
			if ((!change.added && !change.removed) ||
				(change.added && diffStatus[index] !== 'excluded') ||
				(change.removed && diffStatus[index] === 'excluded')) {
				return result + editedContents[index];
			}
			return result;
		}, '')
		const file = app.vault.getFileByPath(state.file)
		if (!file) {
			throw new Error(String(t('applyView.fileNotFound')))
		}
		await app.vault.modify(file, newContent)
		if (state.onClose) {
			state.onClose(true)
		}
		close()
	}

	const handleReject = async () => {
		if (state.onClose) {
			state.onClose(false)
		}
		close()
	}

	const excludeDiffLine = (index: number) => {
		setDiffStatus(prevStatus => {
			const newStatus = [...prevStatus]
			// Mark line as excluded
			newStatus[index] = 'excluded'
			return newStatus
		})
	}

	const acceptDiffLine = (index: number) => {
		setDiffStatus(prevStatus => {
			const newStatus = [...prevStatus]
			// Mark line as accepted
			newStatus[index] = 'accepted'
			return newStatus
		})
	}

	const handleKeyDown = (event: KeyboardEvent) => {
		const modifierKey = Platform.isMacOS ? event.metaKey : event.ctrlKey;
		if (modifierKey) {
			if (event.key === 'Enter') {
				event.preventDefault();
				event.stopPropagation();
				void handleAccept();
			} else if (event.key === 'Backspace') {
				event.preventDefault();
				event.stopPropagation();
				void handleReject();
			}
		}
	}

	// Handle content editing changes
	const handleContentChange = (index: number, evt: { target: { value: string } }) => {
		const newEditedContents = [...editedContents];
		newEditedContents[index] = evt.target.value;
		setEditedContents(newEditedContents);
	}

	// Add event listeners on mount and remove on unmount
	useEffect(() => {
		const handler = (e: KeyboardEvent) => handleKeyDown(e);
		window.addEventListener('keydown', handler, true);
		return () => {
			window.removeEventListener('keydown', handler, true);
		}
	}, [handleAccept, handleReject]) // Dependencies for the effect

	return (
		<div id="icf-apply-view">
			<div className="view-header">
				<div className="view-header-left">
					<div className="view-header-nav-buttons"></div>
				</div>
				<div className="view-header-title-container mod-at-start">
					<div className="view-header-title">
						{t('applyView.applyingFile').replace('{{file}}', state?.file ?? '')}
					</div>
					<div className="view-actions">
						<button
							className="clickable-icon view-action icf-approve-button"
							aria-label={t('applyView.acceptChanges')}
							onClick={handleAccept}
						>
							{acceptIcon && '✓'}
							{t('applyView.acceptAll').replace('{{shortcut}}', getShortcutText('accept'))}
						</button>
						<button
							className="clickable-icon view-action icf-reject-button"
							aria-label={t('applyView.rejectChanges')}
							onClick={handleReject}
						>
							{rejectIcon && '✗'}
							{t('applyView.rejectAll').replace('{{shortcut}}', getShortcutText('reject'))}
						</button>
					</div>
				</div>
			</div>

			<div className="view-content">
				<div className="markdown-source-view cm-s-obsidian mod-cm6 node-insert-event is-readable-line-width is-live-preview is-folding show-properties">
					<div className="cm-editor">
						<div className="cm-scroller">
							<div className="cm-sizer">
								<div className="icf-inline-title">
									{state?.file
										? state.file.replace(/\.[^/.]+$/, '')
										: ''}
								</div>

								{diff.map((part, index) => {
									// Determine line display status based on diffStatus
									const status = diffStatus[index]
									const isHidden =
										(part.added && status === 'excluded') ||
										(part.removed && status === 'accepted')

									if (isHidden) return null

									return (
										<div
											key={index}
											className={`icf-diff-line ${part.added ? 'added' : part.removed ? 'removed' : ''} ${status !== 'active' ? status : ''}`}
										>
											<div className="icf-diff-content-wrapper">
												<ContentEditable
													html={editedContents[index]}
													onChange={(evt) => handleContentChange(index, evt)}
													className="icf-editable-content"
												/>
												{(part.added || part.removed) && status === 'active' && (
													<div className="icf-diff-line-actions">
														<button
															aria-label={t('applyView.acceptLine')}
															onClick={() => acceptDiffLine(index)}
															className="icf-accept"
														>
															{acceptIcon && '✓'}
														</button>
														<button
															aria-label={t('applyView.excludeLine')}
															onClick={() => excludeDiffLine(index)}
															className="icf-exclude"
														>
															{excludeIcon && '✗'}
														</button>
													</div>
												)}
											</div>
										</div>
									)
								})}
							</div>
						</div>
					</div>
				</div>
			</div>
			<style>{`
        .icf-diff-content-wrapper {
          position: relative;
          width: 100%;
        }
        
        .icf-editable-content {
          width: 100%;
          min-height: 1.2em;
          padding: 4px;
          padding-right: 60px;
          border: 1px solid transparent;
          box-sizing: border-box;
        }

        .icf-editable-content:focus {
          outline: none;
          border-color: var(--interactive-accent);
          background-color: var(--background-primary);
        }
        
        .icf-diff-line-actions {
          position: absolute;
          right: 4px;
          top: 4px;
          display: flex;
          gap: 4px;
        }
        
        .icf-diff-line-actions button {
          padding: 2px 6px;
          border-radius: 4px;
          background: var(--background-secondary);
          border: 1px solid var(--background-modifier-border);
          cursor: pointer;
          opacity: 0.7;
          transition: opacity 0.2s;
        }
        
        .icf-diff-line-actions button:hover {
          opacity: 1;
        }
        
        .icf-accept {
          color: #26a69a;
        }
        
        .icf-exclude {
          color: #ef5350;
        }

        .icf-diff-line.added .icf-editable-content {
          background-color: rgba(0, 255, 0, 0.1);
          border-left: 3px solid #26a69a;
        }

        .icf-diff-line.removed .icf-editable-content {
          background-color: rgba(255, 0, 0, 0.1);
          border-left: 3px solid #ef5350;
          text-decoration: line-through;
        }

        .icf-diff-line.accepted .icf-editable-content {
          opacity: 0.7;
        }
      `}</style>
		</div>
	)
}
