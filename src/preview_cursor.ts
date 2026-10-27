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

interface CursorTarget {
	lineEl: HTMLElement;
	position: { node: Text; offset: number } | null;
	lineRect: DOMRect;
	renderRect: DOMRect;
}

export interface PlacedCaret {
	caretEl: HTMLElement;
	lineEl: HTMLElement;
}

interface LineCommandSpec {
	prefix: string;
	trailing?: string;
	noEnd?: boolean;
}

const LINE_COMMANDS: Record<string, LineCommandSpec> = {
	state: { prefix: "" },
	return: { prefix: "return " },
	print: { prefix: "print " },
	require: { prefix: "Require: " },
	ensure: { prefix: "Ensure: " },
	input: { prefix: "Input: " },
	output: { prefix: "Output: " },
	if: { prefix: "if ", trailing: " then" },
	elif: { prefix: "else if ", trailing: " then" },
	else: { prefix: "else" },
	endif: { prefix: "end if", noEnd: true },
	for: { prefix: "for ", trailing: " do" },
	forall: { prefix: "for all ", trailing: " do" },
	while: { prefix: "while ", trailing: " do" },
	endfor: { prefix: "end for", noEnd: true },
	endwhile: { prefix: "end while", noEnd: true },
	repeat: { prefix: "repeat" },
	until: { prefix: "until " },
	upon: { prefix: "upon " },
	endupon: { prefix: "end upon", noEnd: true },
	procedure: { prefix: "procedure " },
	endprocedure: { prefix: "end procedure", noEnd: true },
	function: { prefix: "function " },
	endfunction: { prefix: "end function", noEnd: true },
	caption: { prefix: "Algorithm " },
	break: { prefix: "break" },
	continue: { prefix: "continue" },
};

type LineCommandName = keyof typeof LINE_COMMANDS;

const HIDDEN_VISIBLE_TEXT_SELECTOR =
	".ps-linenum, .katex-mathml, .pseudocode-preview-caret";

function getLineCommandName(
	line: string
): LineCommandName | null {
	const match = /^\s*\\([A-Za-z]+)\b/.exec(line);
	if (!match) return null;

	const name = match[1].toLowerCase();
	return name in LINE_COMMANDS ? (name as LineCommandName) : null;
}

function isRenderableCommandLine(
	line: string,
	noEnd: boolean
): boolean {
	const command = getLineCommandName(line);
	if (!command) return false;

	return !(noEnd && LINE_COMMANDS[command].noEnd);
}

function getStatementInfo(
	contentLines: string[],
	contentIndex: number,
	noEnd: boolean
): { statementStart: number; targetLineIndex: number } | null {
	let count = 0;
	let lastRenderable = -1;

	for (let i = 0; i <= contentIndex; i++) {
		if (isRenderableCommandLine(contentLines[i], noEnd)) {
			count++;
			lastRenderable = i;
		}
	}

	if (lastRenderable === -1) return null;

	return {
		statementStart: lastRenderable,
		targetLineIndex: count - 1,
	};
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
	const command = getLineCommandName(
		statementSource.split("\n")[0]
	);
	if (!command) return 0;

	const prefix = LINE_COMMANDS[command].prefix;
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

	const command = getLineCommandName(source.split("\n")[0]);
	const trailing = command
		? LINE_COMMANDS[command].trailing
		: undefined;
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

function resolveCursorTarget(
	renderEl: HTMLElement,
	block: PseudocodeBlock,
	result: RenderPseudocodeResult,
	cursor: EditorPosition,
	settings: PseudocodeJsSettings,
	renderedLines?: HTMLElement[]
): CursorTarget | null {
	const contentLines = result.blockContent.split("\n");
	const blockLine = cursor.line - (block.startLine + 1);

	if (blockLine < 0 || blockLine >= block.columnOffsets.length) {
		return null;
	}

	const contentIndex = blockLine - result.contentStartLine;
	if (contentIndex < 0 || contentIndex >= contentLines.length) {
		return null;
	}

	const statementInfo = getStatementInfo(
		contentLines,
		contentIndex,
		settings.noEnd
	);
	if (!statementInfo) return null;

	const { statementStart, targetLineIndex } = statementInfo;
	if (targetLineIndex < 0) return null;

	const lines =
		renderedLines ??
		Array.from(renderEl.querySelectorAll<HTMLElement>(".ps-line"));
	if (lines.length === 0) return null;

	const lineEl = lines[Math.min(targetLineIndex, lines.length - 1)];

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
	if (!visible.text) return null;

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

	return {
		lineEl,
		position,
		lineRect: lineEl.getBoundingClientRect(),
		renderRect: renderEl.getBoundingClientRect(),
	};
}

function placeCaret(
	renderEl: HTMLElement,
	target: CursorTarget
): PlacedCaret {
	target.lineEl.classList.add("pseudocode-preview-current-line");

	const range = document.createRange();
	if (target.position) {
		range.setStart(target.position.node, target.position.offset);
		range.collapse(true);
	} else {
		range.selectNodeContents(target.lineEl);
		range.collapse(false);
	}

	let caretRect = range.getBoundingClientRect();

	if (caretRect.width === 0 && caretRect.height === 0) {
		caretRect = target.lineRect;
	}

	const caretEl = document.createElement("span");
	caretEl.classList.add("pseudocode-preview-caret");
	caretEl.style.left = `${
		caretRect.left - target.renderRect.left + renderEl.scrollLeft
	}px`;
	caretEl.style.top = `${
		caretRect.top - target.renderRect.top + renderEl.scrollTop
	}px`;
	caretEl.style.height = `${caretRect.height || target.lineRect.height}px`;
	renderEl.appendChild(caretEl);

	scrollIntoView(renderEl, target.lineEl, caretRect);

	return { caretEl, lineEl: target.lineEl };
}

export function applyPreviewCursor(
	renderEl: HTMLElement,
	block: PseudocodeBlock,
	result: RenderPseudocodeResult,
	cursor: EditorPosition,
	settings: PseudocodeJsSettings,
	renderedLines?: HTMLElement[]
): PlacedCaret | null {
	const target = resolveCursorTarget(
		renderEl,
		block,
		result,
		cursor,
		settings,
		renderedLines
	);
	if (!target) return null;

	return placeCaret(renderEl, target);
}
