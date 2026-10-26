import {
	EditorPosition,
	ItemView,
	Notice,
	WorkspaceLeaf,
} from "obsidian";

import { copyLatexToClipboard } from "src/export_button";
import type { PseudocodeBlock } from "src/pseudocode_block";
import { applyPreviewCursor } from "src/preview_cursor";
import { renderPseudocodeBlock } from "src/render";
import type { RenderPseudocodeResult } from "src/render";

import type PseudocodePlugin from "main";

export const PSEUDOCODE_PREVIEW_VIEW_TYPE = "pseudocode-preview";

type EmptyReason = "none" | "unclosed";

export class PseudocodePreviewView extends ItemView {
	private metaEl!: HTMLElement;
	private renderEl!: HTMLElement;
	private emptyEl!: HTMLElement;
	private refreshAction: HTMLElement | null = null;
	private copyAction: HTMLElement | null = null;
	private lastResult: RenderPseudocodeResult | null = null;
	private lastSource: string | null = null;
	private lastSettingsKey: string | null = null;
	private lastPreamble: string | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: PseudocodePlugin) {
		super(leaf);
		this.navigation = false;
	}

	getViewType(): string {
		return PSEUDOCODE_PREVIEW_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Pseudocode preview";
	}

	getIcon(): string {
		return "code";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("pseudocode-preview-view");

		const headerEl = this.contentEl.createDiv({
			cls: "pseudocode-preview-header",
		});
		this.metaEl = headerEl.createDiv({ cls: "pseudocode-preview-meta" });

		const bodyEl = this.contentEl.createDiv({
			cls: "pseudocode-preview-content",
		});
		this.renderEl = bodyEl.createDiv({ cls: "pseudocode-preview-render" });
		this.emptyEl = bodyEl.createDiv({ cls: "pseudocode-preview-empty" });

		this.refreshAction = this.addAction(
			"refresh-cw",
			"Refresh preview",
			() => {
				this.plugin.previewController?.refresh(true);
			}
		);
		this.copyAction = this.addAction("copy", "Copy LaTeX", () => {
			void this.copyLatex();
		});

		this.showEmpty("none");
		this.plugin.previewController?.attachView(this);
		this.plugin.previewController?.refresh(true);
	}

	async onClose(): Promise<void> {
		this.plugin.previewController?.detachView(this);
		this.refreshAction?.remove();
		this.copyAction?.remove();
		this.refreshAction = null;
		this.copyAction = null;
		this.resetRenderCache();
		this.contentEl.empty();
	}

	renderBlock(
		block: PseudocodeBlock,
		filePath: string,
		cursor: EditorPosition,
		force = false
	): void {
		this.emptyEl.hide();
		this.renderEl.show();
		this.metaEl.setText(
			`${filePath} · lines ${block.startLine + 1}–${block.endLine + 1}`
		);

		const settingsKey = this.getSettingsKey();

		if (!force && this.matchesCachedRender(block, settingsKey)) {
			if (this.lastResult) {
				this.applyCursor(block, cursor, this.lastResult);
			}
			return;
		}

		this.lastResult = null;
		this.renderEl.empty();
		this.rememberCachedRender(block, settingsKey);

		try {
			const result = renderPseudocodeBlock(
				this.plugin,
				block.source,
				this.renderEl,
				{
					width: "100%",
					clickToEdit: false,
					exportButton: false,
				}
			);
			this.lastResult = result;
			this.applyCursor(block, cursor, result);
		} catch (error) {
			this.showError((error as Error).message);
		}
	}

	private getSettingsKey(): string {
		return JSON.stringify(this.plugin.settings.jsSettings) ?? "";
	}

	private matchesCachedRender(
		block: PseudocodeBlock,
		settingsKey: string
	): boolean {
		return (
			this.lastSource === block.source &&
			this.lastSettingsKey === settingsKey &&
			this.lastPreamble === this.plugin.preamble
		);
	}

	private rememberCachedRender(
		block: PseudocodeBlock,
		settingsKey: string
	): void {
		this.lastSource = block.source;
		this.lastSettingsKey = settingsKey;
		this.lastPreamble = this.plugin.preamble;
	}

	private resetRenderCache(): void {
		this.lastResult = null;
		this.lastSource = null;
		this.lastSettingsKey = null;
		this.lastPreamble = null;
	}

	private applyCursor(
		block: PseudocodeBlock,
		cursor: EditorPosition,
		result: RenderPseudocodeResult
	): void {
		try {
			applyPreviewCursor(
				this.renderEl,
				block,
				result,
				cursor,
				this.plugin.settings.jsSettings
			);
		} catch (error) {
			console.error("Failed to place preview cursor", error);
		}
	}

	showEmpty(reason: EmptyReason): void {
		this.resetRenderCache();
		this.metaEl.setText(
			reason === "unclosed"
				? "Unclosed pseudo block"
				: "No pseudo block selected"
		);
		this.renderEl.empty();
		this.renderEl.hide();
		this.emptyEl.show();
		this.emptyEl.setText(
			reason === "unclosed"
				? "Add a closing fence to preview this pseudo block."
				: "Place your cursor inside a pseudo code block."
		);
	}

	private showError(message: string): void {
		this.lastResult = null;
		this.renderEl.empty();
		this.renderEl.show();
		this.emptyEl.hide();

		const errorEl = this.renderEl.createDiv({
			cls: "pseudocode-preview-error",
		});
		errorEl.createDiv({
			cls: "pseudocode-preview-error-title",
			text: "Could not render pseudocode",
		});
		errorEl.createDiv({ text: message });
	}

	private async copyLatex(): Promise<void> {
		if (!this.lastResult) {
			new Notice("No pseudocode block to copy.");
			return;
		}

		try {
			await copyLatexToClipboard(
				this.plugin,
				this.lastResult.inlineMacros,
				this.lastResult.blockContent
			);
			new Notice("LaTeX copied to clipboard.");
		} catch (error) {
			new Notice(`Failed to copy LaTeX: ${(error as Error).message}`);
		}
	}
}
