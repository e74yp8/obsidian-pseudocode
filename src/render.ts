import * as pseudocode from "pseudocode";

import { createExportButton } from "src/export_button";
import { extractInlineMacros } from "src/inline_macro";

import type PseudocodePlugin from "main";

export interface RenderPseudocodeOptions {
	width?: string;
	clickToEdit?: boolean;
	exportButton?: boolean;
}

export interface RenderPseudocodeResult {
	inlineMacros: string;
	blockContent: string;
}

export function renderPseudocodeBlock(
	plugin: PseudocodePlugin,
	source: string,
	container: HTMLElement,
	options: RenderPseudocodeOptions = {}
): RenderPseudocodeResult {
	const width = options.width ?? `${plugin.settings.blockSize}em`;
	const clickToEdit = options.clickToEdit ?? true;
	const exportButton = options.exportButton ?? true;

	const blockDiv = container.createDiv({ cls: "pseudocode-block" });
	blockDiv.style.width = width;

	if (clickToEdit) {
		blockDiv.addEventListener("click", (event) => {
			const target = event.target as HTMLElement | null;
			if (!target || target.tagName === "BUTTON") return;

			(
				target
					.closest(".pseudocode-block")
					?.parentElement?.parentElement?.querySelector(
						".edit-block-button"
					) as HTMLElement | null
			)?.click();
		});
	}

	const [inlineMacros, nonMacroLines] = extractInlineMacros(source);
	const allPreamble = plugin.preamble + inlineMacros;
	const mathRegex = /\$(.*?)\$/g;
	const withPreamble = nonMacroLines.replace(
		mathRegex,
		(_, group1: string) => `$${allPreamble}${group1}$`
	);

	const preEl = blockDiv.createEl("pre", {
		cls: "code",
		text: withPreamble,
	});

	try {
		pseudocode.renderElement(preEl, plugin.settings.jsSettings);
		if (exportButton) {
			createExportButton(plugin, blockDiv, inlineMacros, nonMacroLines);
		}
	} catch (error) {
		blockDiv.remove();
		throw error;
	}

	return {
		inlineMacros,
		blockContent: nonMacroLines,
	};
}
