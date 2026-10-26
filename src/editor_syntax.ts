import { App, MarkdownView } from "obsidian";

import { BLOCK_NAME } from "src/setting";
import { PSEUDO_KEYWORDS } from "src/pseudocode_keywords";

interface CM5StringStream {
	eatSpace(): boolean;
	match(pattern: RegExp): RegExpMatchArray | null;
	next(): string | void;
	skipToEnd(): void;
}

interface CM5Mode {
	token(stream: CM5StringStream): string | null;
}

type CM5ModeFactory = () => CM5Mode;

interface CM5 {
	modes: Record<string, CM5ModeFactory | undefined>;
	defineMode(name: string, factory: CM5ModeFactory): void;
}

const ESCAPED_CHAR = /^\\[%&$#_{}]/;
const COMMENT = /^%.*/;
const BLOCK_COMMENT = /^\\comment\{[^}]*\}/i;
const MATH = /^(?:\$\$.*?\$\$|\$[^$]*\$|\\\(.*?\\\)|\\\[.*?\\\])/;
const COMMAND = /^\\[a-zA-Z@]+\*?/;
const PLAIN_TEXT = /^[^\\$%{}[\]\d]+/;
const NUMBER = /^\d+(?:\.\d+)?/;
const BRACKET = /^[{}[\]]/;
const PSEUDO_FENCE = /^[ \t]*(?:>[ \t]*)*[ \t]*(?:`{3,}|~{3,})pseudo\b/m;

const KEYWORD_NAMES = new Set(
	PSEUDO_KEYWORDS.map((keyword) => {
		const match = /^\\([a-zA-Z@]+)/.exec(keyword);
		return match ? match[1].toLowerCase() : null;
	}).filter((name): name is string => name !== null)
);

const OPERATOR_NAMES = new Set([
	"gets",
	"to",
	"downto",
	"and",
	"or",
	"xor",
	"not",
	"true",
	"false",
]);

let previousMode: CM5ModeFactory | undefined;
let registeredMode: CM5ModeFactory | undefined;

function getCodeMirror(): CM5 | undefined {
	return (window as unknown as { CodeMirror?: CM5 }).CodeMirror;
}

function createMode(isEnabled: () => boolean): CM5Mode {
	return {
		token(stream) {
			if (!isEnabled()) {
				stream.skipToEnd();
				return null;
			}

			if (stream.eatSpace()) return null;
			if (stream.match(ESCAPED_CHAR)) return null;
			if (stream.match(COMMENT)) return "comment";
			if (stream.match(BLOCK_COMMENT)) return "comment";
			if (stream.match(MATH)) return "string";

			const command = stream.match(COMMAND);
			if (command) {
				const name = command[0]
					.slice(1)
					.replace(/\*$/, "")
					.toLowerCase();

				if (OPERATOR_NAMES.has(name)) return "operator";
				if (KEYWORD_NAMES.has(name)) return "keyword";
				return "builtin";
			}

			if (stream.match(PLAIN_TEXT)) return null;
			if (stream.match(NUMBER)) return "number";
			if (stream.match(BRACKET)) return "bracket";

			stream.next();
			return null;
		},
	};
}

export function registerPseudocodeEditorMode(
	isEnabled: () => boolean
): void {
	const cm = getCodeMirror();
	if (!cm) {
		console.warn(
			"Pseudocode Plugin: CodeMirror mode registry is unavailable; editor syntax highlighting is disabled."
		);
		return;
	}

	if (registeredMode) return;

	const factory: CM5ModeFactory = () => createMode(isEnabled);
	previousMode = cm.modes[BLOCK_NAME];
	cm.defineMode(BLOCK_NAME, factory);
	registeredMode = factory;
}

export function unregisterPseudocodeEditorMode(): void {
	const cm = getCodeMirror();
	if (!cm || !registeredMode) return;

	if (cm.modes[BLOCK_NAME] === registeredMode) {
		if (previousMode) {
			cm.modes[BLOCK_NAME] = previousMode;
		} else {
			delete cm.modes[BLOCK_NAME];
		}
	}

	previousMode = undefined;
	registeredMode = undefined;
}

export function refreshSyntaxHighlighting(app: App): void {
	app.workspace.iterateAllLeaves((leaf) => {
		if (!(leaf.view instanceof MarkdownView)) return;

		const editor = leaf.view.editor;
		if (!editor) return;

		const text = editor.getValue();
		if (!PSEUDO_FENCE.test(text)) return;

		const codePoint = text.codePointAt(0);
		if (codePoint === undefined) return;

		const firstChar = String.fromCodePoint(codePoint);

		try {
			editor.transaction(
				{
					changes: [
						{
							from: editor.offsetToPos(0),
							to: editor.offsetToPos(firstChar.length),
							text: firstChar,
						},
					],
				},
				"set"
			);
		} catch (error) {
			console.log(error);
		}
	});
}
