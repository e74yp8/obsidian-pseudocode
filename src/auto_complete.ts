import {
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	TFile,
} from "obsidian";

import { BLOCK_NAME } from "src/setting";
import { PAIR_SUGGESTIONS, PSEUDO_KEYWORDS } from "src/pseudocode_keywords";

import PseudocodePlugin from "main";

export class PseudocodeSuggestor extends EditorSuggest<string> {
	plugin: PseudocodePlugin;

	constructor(plugin: PseudocodePlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		file: TFile
	): EditorSuggestTriggerInfo | null {
		// perf: Use the "\" to tell whether to return.
		const currentLineToCursor = editor
			.getLine(cursor.line)
			.slice(0, cursor.ch);
		const currentLineLastWordStart = currentLineToCursor.lastIndexOf("\\");
		// if there is no word, return null
		if (currentLineLastWordStart === -1) return null;

		// If is within a LaTeX $$ wrap, return null
		const currentLineLastMoneyMark = currentLineToCursor.lastIndexOf("$");
		if (currentLineLastMoneyMark != -1) return null;

		const currentFileToCursor = editor.getRange({ line: 0, ch: 0 }, cursor);
		const indexOfLastCodeBlockStart =
			currentFileToCursor.lastIndexOf("```");

		// check if this is a pseudocode block
		const isPseudocode =
			currentFileToCursor.slice(
				indexOfLastCodeBlockStart + 3,
				indexOfLastCodeBlockStart + 3 + BLOCK_NAME.length
			) == BLOCK_NAME;

		if (!isPseudocode) return null;

		return {
			start: { line: cursor.line, ch: currentLineLastWordStart },
			end: cursor,
			query: currentLineToCursor.slice(currentLineLastWordStart),
		};
	}

	getSuggestions(
		context: EditorSuggestContext
	): string[] | Promise<string[]> {
		const query = context.query;

		const suggestions = PSEUDO_KEYWORDS.filter((value) =>
			value.toLowerCase().startsWith(query.toLowerCase())
		);

		return suggestions;
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.addClass("suggestion");
		const suggestContent = el.createDiv({ cls: "suggestion-content" });
		suggestContent.setText(value);
	}

	selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
		if (this.context) {
			const editor = this.context.editor;
			const suggestion = value;
			const start = this.context.start;
			const end = editor.getCursor();

			const pairSuggestion = PAIR_SUGGESTIONS[suggestion];
			let insertText = suggestion;
			if (pairSuggestion) {
				const line = editor.getLine(start.line);
				const indentMatch = line.match(/^(\s*)/)?.[0] ?? "";
				const indent = indentMatch.replace(/\t/g, "    "); // replace each tab with four spaces
				insertText += "\n" + indent + pairSuggestion;
			}

			editor.replaceRange(insertText, start, end);
			const newCursor = end;
			newCursor.ch = start.ch + suggestion.length;

			editor.setCursor(newCursor);

			this.close();
		}
	}
}
