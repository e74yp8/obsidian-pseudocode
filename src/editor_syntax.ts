import { App, MarkdownView } from "obsidian";

import { BLOCK_NAME } from "src/setting";
import { PSEUDO_KEYWORDS } from "src/pseudocode_keywords";

interface CM5StringStream {
	eatSpace(): boolean;
	match(pattern: RegExp): RegExpMatchArray | null;
	match(pattern: string): string | null;
	next(): string | void;
	skipToEnd(): void;
	pos: number;
	string: string;
}

interface CM5Mode {
	token(stream: CM5StringStream, state: unknown): string | null;
	startState?(): unknown;
	copyState?(state: unknown): unknown;
	blankLine?(state: unknown): string | null;
	name?: string;
}

type CM5ModeFactory = () => CM5Mode;

interface CM5 {
	modes: Record<string, CM5ModeFactory | undefined>;
	defineMode(name: string, factory: CM5ModeFactory): void;
	getMode(config: unknown, spec: string | { name: string }): CM5Mode;
}

interface MathOpening {
	open: string;
	close: string;
	inline: boolean;
}

interface PseudoModeState {
	inMath: boolean;
	mathClose: string;
	stexState: unknown;
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

function getStexMode(cm: CM5): CM5Mode | undefined {
	try {
		const mode = cm.getMode({}, { name: "stex" });
		if (mode.name === "stex" && mode.startState && mode.copyState) {
			return mode;
		}
	} catch (error) {
		console.log(error);
	}

	return undefined;
}

function createModeState(stexMode?: CM5Mode): PseudoModeState {
	return {
		inMath: false,
		mathClose: "",
		stexState: stexMode?.startState ? stexMode.startState() : null,
	};
}

function isEscapedAt(line: string, position: number): boolean {
	let index = position - 1;
	let backslashes = 0;

	while (index >= 0 && line.charAt(index) === "\\") {
		backslashes++;
		index--;
	}

	return backslashes % 2 === 1;
}

function getMathOpening(stream: CM5StringStream): MathOpening | null {
	if (isEscapedAt(stream.string, stream.pos)) return null;

	const rest = stream.string.slice(stream.pos);
	if (rest.startsWith("$$")) {
		return { open: "$$", close: "$$", inline: false };
	}
	if (rest.startsWith("$")) {
		return { open: "$", close: "$", inline: true };
	}
	if (rest.startsWith("\\(")) {
		return { open: "\\(", close: "\\)", inline: true };
	}
	if (rest.startsWith("\\[")) {
		return { open: "\\[", close: "\\]", inline: false };
	}

	return null;
}

function hasClosingOnLine(
	stream: CM5StringStream,
	opening: MathOpening
): boolean {
	const line = stream.string;
	let index = stream.pos + opening.open.length;

	while (index < line.length) {
		if (
			line.startsWith(opening.close, index) &&
			!isEscapedAt(line, index)
		) {
			return true;
		}

		const char = line.charAt(index);
		if (char === "%" && !isEscapedAt(line, index)) return false;

		index += char === "\\" ? 2 : 1;
	}

	return false;
}

function isMathClosing(
	stream: CM5StringStream,
	mathClose: string
): boolean {
	return (
		stream.string.startsWith(mathClose, stream.pos) &&
		!isEscapedAt(stream.string, stream.pos)
	);
}

function enterMath(
	stream: CM5StringStream,
	state: PseudoModeState,
	stexMode: CM5Mode,
	opening: MathOpening
): string | null {
	state.inMath = true;
	state.mathClose = opening.close;
	state.stexState = stexMode.startState ? stexMode.startState() : null;

	return stexMode.token(stream, state.stexState);
}

function createMode(
	isEnabled: () => boolean,
	stexMode?: CM5Mode
): CM5Mode {
	return {
		startState() {
			return createModeState(stexMode);
		},
		copyState(rawState) {
			const state = rawState as PseudoModeState;
			return {
				inMath: state.inMath,
				mathClose: state.mathClose,
				stexState:
					stexMode && stexMode.copyState
						? stexMode.copyState(state.stexState)
						: state.stexState,
			};
		},
		blankLine(rawState) {
			const state = rawState as PseudoModeState;
			if (state.inMath) {
				state.inMath = false;
				state.mathClose = "";
				if (stexMode && stexMode.blankLine) {
					stexMode.blankLine(state.stexState);
				}
			}
			return null;
		},
		token(stream, rawState) {
			const state = rawState as PseudoModeState;

			if (!isEnabled()) {
				state.inMath = false;
				state.mathClose = "";
				stream.skipToEnd();
				return null;
			}

			if (stexMode && state.inMath) {
				if (isMathClosing(stream, state.mathClose)) {
					stream.match(state.mathClose);
					state.inMath = false;
					state.mathClose = "";
					return "keyword";
				}
				return stexMode.token(stream, state.stexState);
			}

			if (stream.eatSpace()) return null;
			if (stream.match(ESCAPED_CHAR)) return null;
			if (stream.match(COMMENT)) return "comment";
			if (stream.match(BLOCK_COMMENT)) return "comment";

			if (stexMode) {
				const opening = getMathOpening(stream);
				if (
					opening &&
					(!opening.inline || hasClosingOnLine(stream, opening))
				) {
					return enterMath(stream, state, stexMode, opening);
				}
			} else if (stream.match(MATH)) {
				return "string";
			}

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

	const stexMode = getStexMode(cm);
	const factory: CM5ModeFactory = () => createMode(isEnabled, stexMode);
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
