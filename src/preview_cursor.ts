import type { EditorPosition } from "obsidian";

import type { PseudocodeBlock } from "src/pseudocode_block";
import type { RenderPseudocodeResult } from "src/render";
import type { PseudocodeJsSettings } from "src/setting";

interface SourceToken {
	text: string;
	start: number;
	end: number;
}

interface VisibleTextNode {
	node: Text;
	start: number;
	end: number;
	dataStart: number;
}

interface VisibleText {
	text: string;
	nodes: VisibleTextNode[];
}

const RENDERABLE_COMMANDS = new Set([
	"state",
	"return",
	"print",
	"require",
	"ensure",
	"input",
	"output",
	"if",
	"elif",
	"else",
	"endif",
	"for",
	"forall",
	"while",
	"endfor",
	"endwhile",
	"repeat",
	"until",
	"upon",
	"endupon",
	"procedure",
	"endprocedure",
	"function",
	"endfunction",
	"caption",
	"break",
	"continue",
]);

const NO_END_COMMANDS = new Set([
	"endif",
	"endfor",
	"endwhile",
	"endprocedure",
	"endfunction",
	"endupon",
]);

const TRAILING_KEYWORDS: Record<string, string> = {
	if: " then",
	elif: " then",
	for: " do",
	forall: " do",
	while: " do",
};

const LEADING_PREFIXES: Record<string, string> = {
	state: "",
	return: "return ",
	print: "print ",
	require: "Require: ",
	ensure: "Ensure: ",
	input: "Input: ",
	output: "Output: ",
	if: "if ",
	elif: "else if ",
	else: "else",
	endif: "end if",
	for: "for ",
	forall: "for all ",
	while: "while ",
	endfor: "end for",
	endwhile: "end while",
	repeat: "repeat",
	until: "until ",
	upon: "upon ",
	endupon: "end upon",
	procedure: "procedure ",
	endprocedure: "end procedure",
	function: "function ",
	endfunction: "end function",
	caption: "Algorithm ",
	break: "break",
	continue: "continue",
};

const HIDDEN_VISIBLE_TEXT_SELECTOR =
	".ps-linenum, .katex-mathml, .pseudocode-preview-caret";

function getCommandName(line: string): string | null {
	const match = /^\s*\\([A-Za-z]+)\b/.exec(line);
	return match ? match[1].toLowerCase() : null;
}

function isRenderableCommandLine(
	line: string,
	noEnd: boolean
): boolean {
	const command = getCommandName(line);
	if (!command || !RENDERABLE_COMMANDS.has(command)) return false;
	if (noEnd && NO_END_COMMANDS.has(command)) return false;
	return true;
}

function findStatementStart(
	contentLines: string[],
	contentIndex: number,
	noEnd: boolean
): number | null {
	for (let line = contentIndex; line >= 0; line--) {
		if (isRenderableCommandLine(contentLines[line], noEnd)) {
			return line;
		}
	}

	return null;
}

function countRenderableLines(
	contentLines: string[],
	endIndex: number,
	noEnd: boolean
): number {
	let count = 0;

	for (let line = 0; line <= endIndex; line++) {
		if (isRenderableCommandLine(contentLines[line], noEnd)) {
			count++;
		}
	}

	return count;
}

function isAsciiWord(char: string, mathMode: boolean): boolean {
	if (mathMode) return /[A-Za-z0-9]/.test(char);
	return /[A-Za-z0-9_]/.test(char);
}

function readWord(
	source: string,
	start: number,
	mathMode: boolean
): number {
	let end = start + 1;

	while (end < source.length && isAsciiWord(source[end], mathMode)) {
		end++;
	}

	return end;
}

function tokenizeSource(source: string): SourceToken[] {
	const tokens: SourceToken[] = [];
	let mathDelimiter: string | null = null;
	let index = 0;

	while (index < source.length) {
		const char = source[index];

		if (char === "\\") {
			const next = source[index + 1];
			if (next === undefined) {
				index++;
				continue;
			}

			if (next === "(" || next === "[") {
				if (!mathDelimiter) mathDelimiter = next;
				index += 2;
				continue;
			}

			if (next === ")" || next === "]") {
				const opener = next === ")" ? "(" : "[";
				if (mathDelimiter === opener) mathDelimiter = null;
				index += 2;
				continue;
			}

			if (
				next === "$" ||
				next === "%" ||
				next === "_" ||
				next === "{" ||
				next === "}" ||
				next === "&" ||
				next === "#"
			) {
				tokens.push({
					text: next,
					start: index,
					end: index + 2,
				});
				index += 2;
				continue;
			}

			if (next === "\\") {
				index += 2;
				continue;
			}

			if (/[A-Za-z]/.test(next)) {
				index += 2;
				while (
					index < source.length &&
					/[A-Za-z]/.test(source[index])
				) {
					index++;
				}
				continue;
			}

			index += 2;
			continue;
		}

		if (char === "$") {
			if (source[index + 1] === "$") {
				if (mathDelimiter === "$$") {
					mathDelimiter = null;
				} else if (!mathDelimiter) {
					mathDelimiter = "$$";
				}
				index += 2;
				continue;
			}

			if (mathDelimiter === "$") {
				mathDelimiter = null;
			} else if (!mathDelimiter) {
				mathDelimiter = "$";
			}
			index++;
			continue;
		}

		if (char === "%") {
			const newline = source.indexOf("\n", index);
			if (newline < 0) break;
			index = newline + 1;
			continue;
		}

		if (char === "{" || char === "}") {
			index++;
			continue;
		}

		if (/\s/.test(char)) {
			index++;
			continue;
		}

		const inMath = mathDelimiter !== null;

		if (
			inMath &&
			(char === "_" ||
				char === "^" ||
				char === "&" ||
				char === "#" ||
				char === "~")
		) {
			index++;
			continue;
		}

		if (isAsciiWord(char, inMath)) {
			const end = readWord(source, index, inMath);
			tokens.push({
				text: source.slice(index, end),
				start: index,
				end,
			});
			index = end;
			continue;
		}

		tokens.push({
			text: char,
			start: index,
			end: index + 1,
		});
		index++;
	}

	return tokens;
}

function collectVisibleText(lineEl: HTMLElement): VisibleText {
	const walker = document.createTreeWalker(
		lineEl,
		NodeFilter.SHOW_TEXT
	);
	const nodes: VisibleTextNode[] = [];
	let text = "";
	let trimLeading = true;

	while (walker.nextNode()) {
		const node = walker.currentNode as Text;
		const parent = node.parentElement;
		if (!parent || parent.closest(HIDDEN_VISIBLE_TEXT_SELECTOR)) {
			continue;
		}

		const value = node.data;
		if (!value) continue;

		if (trimLeading) {
			const trimmed = value.replace(/^\s+/, "");
			if (!trimmed) continue;

			trimLeading = false;
			nodes.push({
				node,
				start: 0,
				end: trimmed.length,
				dataStart: value.length - trimmed.length,
			});
			text += trimmed;
			continue;
		}

		nodes.push({
			node,
			start: text.length,
			end: text.length + value.length,
			dataStart: 0,
		});
		text += value;
	}

	return { text, nodes };
}

function getStartVisibleOffset(
	visibleText: string,
	statementSource: string
): number {
	const command = getCommandName(statementSource.split("\n")[0]);
	if (!command) return 0;

	const prefix = LEADING_PREFIXES[command];
	if (!prefix) return 0;

	const index = visibleText.indexOf(prefix);
	return index >= 0 ? index + prefix.length : 0;
}

function mapCursorToVisibleOffset(
	source: string,
	cursorOffset: number,
	visibleText: string,
	startVisible: number
): number {
	const tokens = tokenizeSource(source);
	if (tokens.length === 0) {
		const commandStart = source.search(/\S/);
		if (commandStart < 0 || cursorOffset <= commandStart) return 0;
		return visibleText.length;
	}

	let lastSourceEnd = 0;
	let lastVisibleEnd = Math.min(startVisible, visibleText.length);

	for (const token of tokens) {
		const found = visibleText.indexOf(token.text, lastVisibleEnd);

		if (token.start > cursorOffset) {
			if (found < 0) return lastVisibleEnd;

			const gapSource = source.slice(lastSourceEnd, token.start);
			const backslashIndex = gapSource.indexOf("\\");
			if (backslashIndex >= 0) {
				const commandStart = lastSourceEnd + backslashIndex;
				if (cursorOffset > commandStart) return found;
				if (lastSourceEnd === 0 && startVisible > 0) return 0;
				return lastVisibleEnd;
			}

			const gapSourceLength = token.start - lastSourceEnd;
			if (gapSourceLength <= 0) return found;

			const ratio =
				(cursorOffset - lastSourceEnd) / gapSourceLength;
			return Math.round(
				lastVisibleEnd + ratio * (found - lastVisibleEnd)
			);
		}

		if (token.end <= cursorOffset) {
			if (found >= 0) {
				lastVisibleEnd = found + token.text.length;
			}
			lastSourceEnd = token.end;
			continue;
		}

		if (found < 0) return lastVisibleEnd;

		const within = Math.min(
			cursorOffset - token.start,
			token.text.length
		);
		return found + within;
	}

	const command = getCommandName(source.split("\n")[0]);
	const trailing = command ? TRAILING_KEYWORDS[command] : undefined;
	if (trailing && visibleText.endsWith(trailing)) {
		return visibleText.length - trailing.length;
	}

	return visibleText.length;
}

function findTextPosition(
	visible: VisibleText,
	offset: number
): { node: Text; offset: number } | null {
	if (visible.nodes.length === 0) return null;

	const target = Math.max(0, Math.min(offset, visible.text.length));

	for (const entry of visible.nodes) {
		if (target <= entry.end) {
			return {
				node: entry.node,
				offset:
					entry.dataStart +
					Math.max(0, target - entry.start),
			};
		}
	}

	const last = visible.nodes[visible.nodes.length - 1];
	return {
		node: last.node,
		offset: last.node.data.length,
	};
}

function removeCursorDecorations(renderEl: HTMLElement): void {
	renderEl
		.querySelectorAll(".pseudocode-preview-caret")
		.forEach((element) => element.remove());
	renderEl
		.querySelectorAll(".pseudocode-preview-current-line")
		.forEach((element) =>
			element.classList.remove("pseudocode-preview-current-line")
		);
}

function scrollIntoView(
	renderEl: HTMLElement,
	lineEl: HTMLElement,
	caretRect: DOMRect
): void {
	const scrollEl = renderEl.closest(
		".pseudocode-preview-content"
	) as HTMLElement | null;

	if (scrollEl) {
		const lineRect = lineEl.getBoundingClientRect();
		const scrollRect = scrollEl.getBoundingClientRect();
		const margin = 24;

		if (lineRect.top < scrollRect.top + margin) {
			scrollEl.scrollTop +=
				lineRect.top - scrollRect.top - margin;
		} else if (lineRect.bottom > scrollRect.bottom - margin) {
			scrollEl.scrollTop +=
				lineRect.bottom - scrollRect.bottom + margin;
		}
	}

	const renderRect = renderEl.getBoundingClientRect();

	if (caretRect.left < renderRect.left) {
		renderEl.scrollLeft += caretRect.left - renderRect.left;
	} else if (caretRect.right > renderRect.right) {
		renderEl.scrollLeft += caretRect.right - renderRect.right;
	}
}

export function applyPreviewCursor(
	renderEl: HTMLElement,
	block: PseudocodeBlock,
	result: RenderPseudocodeResult,
	cursor: EditorPosition,
	settings: PseudocodeJsSettings
): void {
	removeCursorDecorations(renderEl);

	const contentLines = result.blockContent.split("\n");
	const blockLine = cursor.line - (block.startLine + 1);

	if (blockLine < 0 || blockLine >= block.columnOffsets.length) {
		return;
	}

	const contentIndex = blockLine - result.contentStartLine;
	if (contentIndex < 0 || contentIndex >= contentLines.length) {
		return;
	}

	const statementStart = findStatementStart(
		contentLines,
		contentIndex,
		settings.noEnd
	);
	if (statementStart === null) return;

	const targetLineIndex =
		countRenderableLines(
			contentLines,
			statementStart,
			settings.noEnd
		) - 1;
	if (targetLineIndex < 0) return;

	const renderedLines = Array.from(
		renderEl.querySelectorAll<HTMLElement>(".ps-line")
	);
	if (renderedLines.length === 0) return;

	const lineEl =
		renderedLines[
			Math.min(targetLineIndex, renderedLines.length - 1)
		];

	const columnOffset = block.columnOffsets[blockLine] ?? 0;
	const sourceLine = contentLines[contentIndex];
	const sourceCh = Math.max(
		0,
		Math.min(cursor.ch - columnOffset, sourceLine.length)
	);

	const statementLines = contentLines.slice(
		statementStart,
		contentIndex + 1
	);
	let cursorOffset = sourceCh;

	for (
		let line = statementStart;
		line < contentIndex;
		line++
	) {
		cursorOffset += contentLines[line].length + 1;
	}

	const statementSource = statementLines.join("\n");
	const visible = collectVisibleText(lineEl);
	if (!visible.text) return;

	const startVisible = getStartVisibleOffset(
		visible.text,
		statementSource
	);
	const visibleOffset = mapCursorToVisibleOffset(
		statementSource,
		cursorOffset,
		visible.text,
		startVisible
	);
	const position = findTextPosition(visible, visibleOffset);

	lineEl.classList.add("pseudocode-preview-current-line");

	const range = document.createRange();
	if (position) {
		range.setStart(position.node, position.offset);
		range.collapse(true);
	} else {
		range.selectNodeContents(lineEl);
		range.collapse(false);
	}

	let caretRect = range.getBoundingClientRect();
	const lineRect = lineEl.getBoundingClientRect();

	if (caretRect.width === 0 && caretRect.height === 0) {
		caretRect = lineRect;
	}

	const renderRect = renderEl.getBoundingClientRect();
	const caretEl = document.createElement("span");
	caretEl.classList.add("pseudocode-preview-caret");
	caretEl.style.left = `${
		caretRect.left - renderRect.left + renderEl.scrollLeft
	}px`;
	caretEl.style.top = `${
		caretRect.top - renderRect.top + renderEl.scrollTop
	}px`;
	caretEl.style.height = `${caretRect.height || lineRect.height}px`;
	renderEl.appendChild(caretEl);

	scrollIntoView(renderEl, lineEl, caretRect);
}
