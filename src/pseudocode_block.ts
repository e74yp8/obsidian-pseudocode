import { Editor, EditorPosition } from "obsidian";

import { BLOCK_NAME } from "src/setting";

export interface PseudocodeBlock {
	source: string;
	startLine: number;
	endLine: number;
}

export type PseudocodeBlockLookup =
	| { status: "found"; block: PseudocodeBlock }
	| { status: "none" }
	| { status: "unclosed"; startLine: number };

interface Fence {
	char: "`" | "~";
	length: number;
	info: string;
}

interface ParsedFence extends Fence {
	inBlockquote: boolean;
}

interface OpenFence extends ParsedFence {
	startLine: number;
	isPseudocode: boolean;
}

const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/;
const BLOCK_QUOTE_PREFIX = /^[ \t]{0,3}>[ \t]?/;

function stripBlockquotePrefix(line: string): string {
	let result = line;
	let match = BLOCK_QUOTE_PREFIX.exec(result);

	while (match) {
		result = result.slice(match[0].length);
		match = BLOCK_QUOTE_PREFIX.exec(result);
	}

	return result;
}

function parseFence(
	line: string,
	allowBlockquote: boolean
): ParsedFence | null {
	const stripped = allowBlockquote
		? stripBlockquotePrefix(line)
		: line;
	const match = FENCE.exec(stripped);
	if (!match) return null;

	return {
		char: match[1].charAt(0) as "`" | "~",
		length: match[1].length,
		info: match[2].trim(),
		inBlockquote: stripped !== line,
	};
}

function isPseudocodeFence(fence: Fence): boolean {
	return (
		fence.info === BLOCK_NAME ||
		fence.info.startsWith(`${BLOCK_NAME} `) ||
		fence.info.startsWith(`${BLOCK_NAME}\t`)
	);
}

function isClosingFence(fence: Fence, openFence: OpenFence): boolean {
	return (
		fence.info === "" &&
		fence.char === openFence.char &&
		fence.length >= openFence.length
	);
}

function getBlockSource(
	editor: Editor,
	startLine: number,
	endLine: number,
	inBlockquote: boolean
): string {
	const lines: string[] = [];

	for (let line = startLine + 1; line < endLine; line++) {
		const sourceLine = editor.getLine(line);
		lines.push(
			inBlockquote ? stripBlockquotePrefix(sourceLine) : sourceLine
		);
	}

	return lines.join("\n");
}

export function findPseudocodeBlock(
	editor: Editor,
	position: EditorPosition
): PseudocodeBlockLookup {
	const cursorLine = position.line;
	const lineCount = editor.lineCount();
	let openFence: OpenFence | null = null;

	for (let line = 0; line < lineCount; line++) {
		const fence = parseFence(
			editor.getLine(line),
			openFence ? openFence.inBlockquote : true
		);

		if (!openFence) {
			if (fence) {
				openFence = {
					...fence,
					startLine: line,
					isPseudocode: isPseudocodeFence(fence),
				};
			}

			if (line === cursorLine && !openFence) {
				return { status: "none" };
			}

			continue;
		}

		if (fence && isClosingFence(fence, openFence)) {
			if (
				openFence.isPseudocode &&
				cursorLine >= openFence.startLine &&
				cursorLine <= line
			) {
				return {
					status: "found",
					block: {
						source: getBlockSource(
							editor,
							openFence.startLine,
							line,
							openFence.inBlockquote
						),
						startLine: openFence.startLine,
						endLine: line,
					},
				};
			}

			if (!openFence.isPseudocode && line >= cursorLine) {
				return { status: "none" };
			}

			openFence = null;
		}
	}

	if (
		openFence &&
		openFence.isPseudocode &&
		cursorLine >= openFence.startLine
	) {
		return { status: "unclosed", startLine: openFence.startLine };
	}

	return { status: "none" };
}
