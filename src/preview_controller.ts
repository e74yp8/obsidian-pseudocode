import {
	debounce,
	editorInfoField,
	MarkdownView,
	WorkspaceLeaf,
} from "obsidian";
import type { Debouncer, Editor, MarkdownFileInfo, TFile } from "obsidian";

import { EditorView } from "@codemirror/view";

import { findPseudocodeBlock } from "src/pseudocode_block";
import {
	PSEUDOCODE_PREVIEW_VIEW_TYPE,
	PseudocodePreviewView,
} from "src/preview_view";

import type PseudocodePlugin from "main";

export class PreviewController {
	private view: PseudocodePreviewView | null = null;
	private lastMarkdownView: MarkdownView | null = null;
	private lastEditor: Editor | null = null;
	private lastFilePath: string | null = null;
	private disposed = false;
	private refreshTimer: Debouncer<[], void>;

	constructor(private plugin: PseudocodePlugin) {
		this.refreshTimer = debounce(() => this.update(), 200, true);
	}

	register(): void {
		this.plugin.registerView(
			PSEUDOCODE_PREVIEW_VIEW_TYPE,
			(leaf) => new PseudocodePreviewView(leaf, this.plugin)
		);

		this.plugin.addCommand({
			id: "open-pseudocode-preview",
			name: "Open pseudocode preview",
			callback: () => {
				void this.open();
			},
		});

		this.plugin.addRibbonIcon(
			"code",
			"Open pseudocode preview",
			() => {
				void this.open();
			}
		);

		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", (leaf) => {
				this.handleActiveLeafChange(leaf);
			})
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("editor-change", (editor, info) => {
				this.handleEditorChange(editor, info);
			})
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("file-open", () => {
				this.schedule();
			})
		);

		this.plugin.registerEditorExtension(
			EditorView.updateListener.of((update) => {
				if (!update.docChanged && !update.selectionSet) return;

				const info = update.state.field(editorInfoField, false);
				if (!info?.editor) return;

				this.rememberEditor(info.editor, info.file);
				if (info instanceof MarkdownView) {
					this.lastMarkdownView = info;
				}
				this.schedule();
			})
		);

		this.plugin.app.workspace.onLayoutReady(() => {
			if (this.disposed) return;

			const active =
				this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (active) {
				this.rememberView(active);
			}
			this.schedule(true);
		});
	}

	async open(): Promise<void> {
		const active =
			this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (active) {
			this.rememberView(active);
		}

		const leaves = this.plugin.app.workspace.getLeavesOfType(
			PSEUDOCODE_PREVIEW_VIEW_TYPE
		);
		const leaf =
			leaves[0] ?? this.plugin.app.workspace.getRightLeaf(false);

		if (!leaves[0]) {
			await leaf.setViewState({
				type: PSEUDOCODE_PREVIEW_VIEW_TYPE,
				active: true,
			});
		}

		this.plugin.app.workspace.revealLeaf(leaf);
		this.schedule(true);
	}

	refresh(force = false): void {
		this.schedule(force, force);
	}

	attachView(view: PseudocodePreviewView): void {
		this.view = view;
	}

	detachView(view: PseudocodePreviewView): void {
		if (this.view === view) {
			this.view = null;
		}
	}

	dispose(): void {
		this.disposed = true;
		this.refreshTimer.cancel();
		this.plugin.app.workspace.detachLeavesOfType(
			PSEUDOCODE_PREVIEW_VIEW_TYPE
		);
		this.view = null;
	}

	private handleActiveLeafChange(leaf: WorkspaceLeaf | null): void {
		if (leaf?.view instanceof MarkdownView) {
			this.rememberView(leaf.view);
			this.schedule();
		}
	}

	private handleEditorChange(
		editor: Editor,
		info: MarkdownFileInfo
	): void {
		this.rememberEditor(editor, info.file);
		if (info instanceof MarkdownView) {
			this.lastMarkdownView = info;
		}
		this.schedule();
	}

	private rememberView(view: MarkdownView): void {
		this.lastMarkdownView = view;
		this.lastEditor = view.editor;
		this.lastFilePath = view.file?.path ?? null;
	}

	private rememberEditor(editor: Editor, file: TFile | null): void {
		this.lastEditor = editor;
		this.lastFilePath = file?.path ?? null;
	}

	private getEditor(): Editor | null {
		const active =
			this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (active) {
			this.rememberView(active);
			return active.editor;
		}

		if (this.lastMarkdownView) {
			const isOpen = this.plugin.app.workspace
				.getLeavesOfType("markdown")
				.some((leaf) => leaf.view === this.lastMarkdownView);
			return isOpen ? this.lastMarkdownView.editor : null;
		}

		return this.lastEditor;
	}

	private schedule(immediate = false, force = false): void {
		if (!this.view || this.disposed) return;

		if (immediate) {
			this.refreshTimer.cancel();
			this.update(force);
			return;
		}

		this.refreshTimer();
	}

	private update(force = false): void {
		if (!this.view || this.disposed) return;

		const editor = this.getEditor();
		if (!editor) {
			this.view.showEmpty("none");
			return;
		}

		const cursor = editor.getCursor();
		const lookup = findPseudocodeBlock(editor, cursor);
		if (lookup.status === "found") {
			this.view.renderBlock(
				lookup.block,
				this.lastFilePath ?? "Untitled",
				cursor,
				force
			);
		} else if (lookup.status === "unclosed") {
			this.view.showEmpty("unclosed");
		} else {
			this.view.showEmpty("none");
		}
	}
}
