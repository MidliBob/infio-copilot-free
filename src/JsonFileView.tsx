
import { json } from "@codemirror/lang-json";
import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { Plugin, WorkspaceLeaf } from "obsidian";

import BaseView from "./BaseFileView";
import { JSON_VIEW_TYPE } from './constants';
import { getIndentByTabExtension } from "./utils/indentation-provider";

export default class JsonView extends BaseView {
	constructor(leaf: WorkspaceLeaf, plugin: Plugin) {
		super(leaf, plugin);
	}

	getViewType(): string {
		return JSON_VIEW_TYPE;
	}

	protected getEditorExtensions(): Extension[] {
		const extensions = [
			basicSetup,
			getIndentByTabExtension(),
			json(),
			// An arrow instead of `.bind(this)`: without strictBindCallApply the
			// lib typing of Function.bind degrades to `any` (lint debt).
			EditorView.updateListener.of((update) => { this.onEditorUpdate(update) })
		];

		return extensions;
	}
}
