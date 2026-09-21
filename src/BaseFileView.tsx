import { EditorState, Extension } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { TFile, TextFileView, WorkspaceLeaf } from "obsidian";

import InfioPlugin from './main';

export default abstract class BaseView extends TextFileView {
	public plugin: InfioPlugin;
	protected cmEditor: EditorView;
	protected editorEl: HTMLElement;
	protected state: { filePath?: string } | null = null;
	protected isEditorLoaded: boolean = false;
	protected currentFilePath: string | null = null;
	protected isClosing: boolean = false;

	protected constructor(leaf: WorkspaceLeaf, plugin: InfioPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	onload(): void {
		super.onload();
		this.editorEl = this.contentEl.createDiv("datafile-source-view mod-cm6");

		this.cmEditor = new EditorView({
			state: this.createDefaultEditorState(),
			parent: this.editorEl,
		});

		this.app.workspace.trigger("codemirror", this.cmEditor);
		this.isEditorLoaded = true;

		// Load file content if state contains filePath and editor is now loaded
		if (this.state?.filePath) {
			void this.loadFileFromPath(this.state.filePath);
		}
	}

	async setState(state: { filePath?: string }): Promise<void> {
		this.state = state;		
		// If filePath is provided and editor is loaded, load the file immediately
		if (state.filePath && this.isEditorLoaded) {
			await this.loadFileFromPath(state.filePath);
		}
	}

	getState(): { filePath?: string } {
		return { filePath: this.currentFilePath };
	}

	private async loadFileFromPath(filePath: string): Promise<void> {		
		// Store the current file path for saving
		this.currentFilePath = filePath;
		
		// Try to get the file from vault first (for regular files)
		const file = this.app.vault.getAbstractFileByPath(filePath);
		
		if (file && file instanceof TFile) {
			// Regular file in vault
			this.file = file;
			await this.onLoadFile(file);
		} else {
			// File not in vault (hidden directory), read directly from filesystem
			console.log('File not in vault, reading directly from filesystem');
			await this.loadFileFromFilesystem(filePath);
		}
	}

	private async loadFileFromFilesystem(filePath: string): Promise<void> {
		try {
			// Use vault adapter to read file directly from filesystem
			const content = await this.app.vault.adapter.read(filePath);
			this.setViewData(content, true);
		} catch (error) {
			console.error('Failed to load file from filesystem:', error);
			// If file doesn't exist, create it with empty content
			this.setViewData('{}', true);
		}
	}

	async onLoadFile(file: TFile): Promise<void> {
		try {
			const content = await this.app.vault.cachedRead(file);
			this.setViewData(content, true);
		} catch (error) {
			console.error('Failed to load file content:', error);
		}
	}

	getViewData(): string {
		return this.cmEditor.state.doc.toString();
	}

	setViewData(data: string, clear: boolean): void {
		if (clear) {
			this.cmEditor.dispatch({ changes: { from: 0, to: this.cmEditor.state.doc.length, insert: data } });
		} else {
			this.cmEditor.dispatch({ changes: { from: 0, to: this.cmEditor.state.doc.length, insert: data } });
		}
	}

	clear(): void {
		this.setViewData('', true);
	}

	async save(clear?: boolean): Promise<void> {
		// Prevent saving if the view is closing
		if (this.isClosing) {
			console.log("save() called during close, skipping to prevent data loss");
			return;
		}

		const content = this.getViewData();
		
		// Additional safety check: don't save if content is empty and we had content before
		if (!content.trim() && this.currentFilePath) {
			console.log("Refusing to save empty content, potential data loss prevented");
			return;
		}
		
		if (this.file) {
			// Regular file in vault
			await this.app.vault.modify(this.file, content);
		} else if (this.currentFilePath) {
			// File in hidden directory, save directly to filesystem
			await this.app.vault.adapter.write(this.currentFilePath, content);
		}
		
		if (clear) {
			this.clear();
		}
	}

	// gets the title of the document
	getDisplayText(): string {
		if (this.file) {
			return this.file.basename;
		}
		if (this.currentFilePath) {
			return this.currentFilePath.split('/').pop() || "JSON File";
		}
		if (this.state?.filePath) {
			return this.state.filePath.split('/').pop() || "JSON File";
		}
		return "NOFILE";
	}

	onClose(): Promise<void> {
		this.isClosing = true;
		return super.onClose();
	}

	async reload(): Promise<void> {
		await this.save(false);

		const data = this.getViewData();
		this.cmEditor.setState(this.createDefaultEditorState());
		this.setViewData(data, false);
	}

	protected onEditorUpdate(update: ViewUpdate): void {
		if (update.docChanged && !this.isClosing) {
			this.requestSave();
		}
	}

	abstract getViewType(): string;

	protected abstract getEditorExtensions(): Extension[];

	private createDefaultEditorState(): EditorState {
		return EditorState.create({
			extensions: [...this.getCommonEditorExtensions(), ...this.getEditorExtensions()]
		});
	}

	private getCommonEditorExtensions(): Extension[] {
		const extensions: Extension[] = [];
		extensions.push(EditorView.lineWrapping);
		return extensions;
	}
}
