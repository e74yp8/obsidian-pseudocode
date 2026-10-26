import {
	Editor,
	MarkdownPostProcessorContext,
	MarkdownView,
	Plugin,
	Notice,
} from "obsidian";

import { PseudocodeSettingTab } from "src/setting_tab";
import { PseudocodeSuggestor } from "src/auto_complete";
import {
	PseudocodeSettings,
	DEFAULT_SETTINGS,
	PseudocodeBlockInit,
	BLOCK_NAME,
} from "src/setting";
import {
	translateUnsupportedMacrosPerf,
	checkTranslatedMacros,
} from "src/latex_translator";
import { PreviewController } from "src/preview_controller";
import { renderPseudocodeBlock } from "src/render";

export default class PseudocodePlugin extends Plugin {
	settings: PseudocodeSettings;
	preamble: string = "";
	previewController: PreviewController | null = null;

	async pseudocodeHandler(
		source: string,
		el: HTMLElement,
		_ctx: MarkdownPostProcessorContext
	): Promise<void> {
		try {
			renderPseudocodeBlock(this, source, el, {
				width: `${this.settings.blockSize}em`,
				clickToEdit: true,
				exportButton: true,
			});
		} catch (error) {
			console.log(error);
			el.empty();
			const errorSpan = el.createEl("span", {
				text: "\u274C " + (error as Error).message,
			});
			errorSpan.classList.add("error-message");
		}
	}

	async onload() {
		await this.loadSettings();

		this.previewController = new PreviewController(this);
		this.previewController.register();

		if (this.settings.preambleEnabled) {
			console.log("Preamble is enabled.");
			await this.loadPreamble();
		}

		this.registerMarkdownCodeBlockProcessor(
			BLOCK_NAME,
			this.pseudocodeHandler.bind(this)
		);

		// Register suggest
		this.registerEditorSuggest(new PseudocodeSuggestor(this));

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new PseudocodeSettingTab(this.app, this));

		// Auto-gen pseudocode block command.
		this.addCommand({
			id: "pseudocode-in-obs",
			name: "Insert a new pseudocode block",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				editor.replaceSelection(PseudocodeBlockInit);
			},
		});
	}

	onunload() {
		this.previewController?.dispose();
		this.previewController = null;
	}

	async loadPreamble() {
		try {
			this.preamble = await this.app.vault.adapter.read(
				this.settings.preamblePath
			);
		} catch (error) {
			console.log(error);
			// Extract the search path from the error message.
			const searchPath = error.message.match(/'(.*?)'/g)[0];
			new Notice(
				"Pseudocode Plugin: Preamble file not found at " +
					searchPath +
					"."
			);
			this.preamble = "";
			return;
		}

		try {
			this.preamble = translateUnsupportedMacrosPerf(this.preamble);
			this.preamble = checkTranslatedMacros(this.preamble);
			console.log("Loaded preamble:\n" + this.preamble);
			console.log(
				"Preamble file loaded. You can check the detail in console."
			);
			if (this.settings.preambleLoadedNotice) {
				new Notice("Pseudocode Plugin: Preamble file loaded.");
			}
		} catch (error) {
			console.log(error);
			new Notice(
				"Pseudocode Plugin: Preamble file contains invalid LaTeX. " +
					"Please refer to console for details."
			);
			this.preamble = "";
		}
	}

	async loadSettings() {
		const data = (await this.loadData()) ?? {};
		delete data.followSystemTheme;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.previewController?.refresh(true);
	}
}
