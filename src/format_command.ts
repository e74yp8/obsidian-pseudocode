import { Editor, EditorChange, Notice } from "obsidian";

import {
	formatPseudocodeSource,
	getFormatIndentUnit,
} from "src/formatter";
import type { PseudocodeBlock } from "src/pseudocode_block";
import { findPseudocodeBlock } from "src/pseudocode_block";
import type { PseudocodeSettings } from "src/setting";

import type PseudocodePlugin from "main";

const BLOCK_QUOTE_PREFIX = /^(?:[ \t]{0,3}>[ \t]?)+/;

export function formatPseudocodeBlock(
	editor: Editor,
	block: PseudocodeBlock,
	settings: PseudocodeSettings
): number {
	if (!block.source) return 0;

	const formattedLines = formatPseudocodeSource(block.source, {
		indentUnit: getFormatIndentUnit(settings),
	}).split("\n");

	const openingLine = editor.getLine(block.startLine);
	const quoteMatch = BLOCK_QUOTE_PREFIX.exec(openingLine);
	const prefix = quoteMatch ? quoteMatch[0] : "";
	const formattedText = formattedLines
		.map((line) => (line ? prefix + line : prefix.trimEnd()))
		.join("\n");

	const originalLines: string[] = [];

	for (let line = block.startLine + 1; line < block.endLine; line++) {
		originalLines.push(editor.getLine(line));
	}

	if (formattedText === originalLines.join("\n")) return 0;

	const lastContentLine = block.endLine - 1;
	const changes: EditorChange[] = [
		{
			from: { line: block.startLine + 1, ch: 0 },
			to: {
				line: lastContentLine,
				ch: editor.getLine(lastContentLine).length,
			},
			text: formattedText,
		},
	];

	editor.transaction({ changes });

	return formattedLines.length;
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
