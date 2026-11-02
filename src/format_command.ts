import { Editor, EditorChange, Notice } from "obsidian";

import {
	formatPseudocodeSource,
	getFormatIndentUnit,
} from "src/formatter";
import type { PseudocodeBlock } from "src/pseudocode_block";
import { findPseudocodeBlock } from "src/pseudocode_block";
import type { PseudocodeSettings } from "src/setting";

import type PseudocodePlugin from "main";

export function formatPseudocodeBlock(
	editor: Editor,
	block: PseudocodeBlock,
	settings: PseudocodeSettings
): number {
	if (!block.source) return 0;

	const sourceLines = block.source.split("\n");
	const formattedLines = formatPseudocodeSource(block.source, {
		indentUnit: getFormatIndentUnit(settings),
	}).split("\n");

	if (formattedLines.length !== sourceLines.length) return 0;

	const changes: EditorChange[] = [];

	for (let index = 0; index < sourceLines.length; index++) {
		const lineNumber = block.startLine + 1 + index;
		const originalLine = editor.getLine(lineNumber);
		const prefixLength = Math.min(
			block.columnOffsets[index] ?? 0,
			originalLine.length
		);
		const prefix = originalLine.slice(0, prefixLength);
		const formattedLine = prefix + formattedLines[index];

		if (formattedLine === originalLine) continue;

		changes.push({
			from: { line: lineNumber, ch: 0 },
			to: { line: lineNumber, ch: originalLine.length },
			text: formattedLine,
		});
	}

	if (changes.length === 0) return 0;

	editor.transaction({ changes });

	return changes.length;
}

export function registerFormatCommand(
	plugin: PseudocodePlugin
): void {
	plugin.addCommand({
		id: "format-pseudocode-block",
		name: "Format pseudocode block",
		hotkeys: [{ modifiers: ["Alt", "Shift"], key: "F" }],
		editorCheckCallback: (checking, editor) => {
			const lookup = findPseudocodeBlock(
				editor,
				editor.getCursor()
			);

			if (lookup.status !== "found") return false;
			if (checking) return true;

			try {
				formatPseudocodeBlock(
					editor,
					lookup.block,
					plugin.settings
				);
			} catch (error) {
				console.error(
					"Failed to format pseudocode block",
					error
				);
				new Notice(
					"Failed to format pseudocode block: " +
						(error as Error).message
				);
			}

			return true;
		},
	});
}
