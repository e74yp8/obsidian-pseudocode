import { ItemView, Notice, WorkspaceLeaf } from "obsidian";

import { copyLatexToClipboard } from "src/export_button";
import type { PseudocodeBlock } from "src/pseudocode_block";
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
		this.contentEl.empty();
	}

	renderBlock(block: PseudocodeBlock, filePath: string): void {
		this.lastResult = null;
		this.emptyEl.hide();
		this.renderEl.show();
		this.renderEl.empty();
		this.metaEl.setText(
			`${filePath} · lines ${block.startLine + 1}–${block.endLine + 1}`
		);

		try {
			this.lastResult = renderPseudocodeBlock(
				this.plugin,
				block.source,
				this.renderEl,
				{
					width: "100%",
					clickToEdit: false,
					exportButton: false,
				}
			);
		} catch (error) {
			this.showError((error as Error).message);
		}
	}

	showEmpty(reason: EmptyReason): void {
		this.lastResult = null;
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
