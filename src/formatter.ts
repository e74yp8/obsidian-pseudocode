import { LINE_COMMANDS, getLineCommandName } from "src/pseudocode_commands";
import type { PseudocodeSettings } from "src/setting";

export interface FormatOptions {
	indentUnit: string;
}

type IndentRole = "open" | "close" | "middle" | "none";

const ENVIRONMENT_BEGIN = /^\\begin\s*\{/;
const ENVIRONMENT_END = /^\\end\s*\{/;
const ALGORITHM_BEGIN = /\\begin\s*\{algorithm\}/;
const ENVIRONMENT_NAME = /^\s*\{[^}]*\}/;
const ESCAPED_CHARACTER = /[$%_{}&#\\]/;
const WHITESPACE = /\s/;
const LETTER = /[A-Za-z]/;

function getIndentRole(line: string): IndentRole {
	if (ENVIRONMENT_BEGIN.test(line)) return "open";
	if (ENVIRONMENT_END.test(line)) return "close";

	const command = getLineCommandName(line);
	if (!command) return "none";

	return LINE_COMMANDS[command].indent ?? "none";
}

function normalizeCommandSpacing(line: string): string {
	const match = /^(\\[A-Za-z]+)([ \t]*)(.*)$/.exec(line);
	if (!match) return line;

	const command = match[1].slice(1).toLowerCase();
	if (
		command !== "begin" &&
		command !== "end" &&
		!(command in LINE_COMMANDS)
	) {
		return line;
	}

	const rest = match[3];
	if (!rest) return line;

	return rest.startsWith("{") || rest.startsWith("[")
		? `${match[1]}${rest}`
		: `${match[1]} ${rest}`;
}

function shouldBreakBefore(
	source: string,
	command: string,
	commandEnd: number
): boolean {
	if (command === "begin" || command === "end") {
		return ENVIRONMENT_NAME.test(source.slice(commandEnd));
	}

	return command in LINE_COMMANDS;
}

function normalizeLineBreaks(source: string): string {
	const lines: string[] = [];
	let currentLine = "";
	let lineHasContent = false;
	let braceDepth = 0;
	let mathDelimiter: string | null = null;
	let inComment = false;
	let index = 0;

	const append = (text: string): void => {
		currentLine += text;
		if (!WHITESPACE.test(text)) {
			lineHasContent = true;
		}
	};

	const flushLine = (): void => {
		lines.push(currentLine.replace(/[ \t]+$/, ""));
		currentLine = "";
		lineHasContent = false;
	};

	while (index < source.length) {
		const char = source[index];

		if (char === "\n") {
			flushLine();
			inComment = false;
			index++;
			continue;
		}

		if (inComment) {
			append(char);
			index++;
			continue;
		}

		if (char === "%") {
			inComment = true;
			append(char);
			index++;
			continue;
		}

		if (char === "\\") {
			const next = source[index + 1];

			if (next === undefined) {
				append(char);
				index++;
				continue;
			}

			if (next === "\n" || next === "\r") {
				append(char);
				index++;
				continue;
			}

			if (next === "(" || next === "[") {
				if (!mathDelimiter) mathDelimiter = next;
				append("\\");
				append(next);
				index += 2;
				continue;
			}

			if (next === ")" || next === "]") {
				const opener = next === ")" ? "(" : "[";
				if (mathDelimiter === opener) mathDelimiter = null;
				append("\\");
				append(next);
				index += 2;
				continue;
			}

			if (ESCAPED_CHARACTER.test(next)) {
				append("\\");
				append(next);
				index += 2;
				continue;
			}

			if (LETTER.test(next)) {
				let commandEnd = index + 2;

				while (
					commandEnd < source.length &&
					LETTER.test(source[commandEnd])
				) {
					commandEnd++;
				}

				const command = source
					.slice(index + 1, commandEnd)
					.toLowerCase();

				if (
					!mathDelimiter &&
					braceDepth === 0 &&
					lineHasContent &&
					shouldBreakBefore(source, command, commandEnd)
				) {
					flushLine();
				}

				append(source.slice(index, commandEnd));
				index = commandEnd;
				continue;
			}

			append(char);
			append(next);
			index += 2;
			continue;
		}

		if (char === "$") {
			const isDouble = source[index + 1] === "$";

			if (isDouble) {
				if (mathDelimiter === "$$") {
					mathDelimiter = null;
				} else if (!mathDelimiter) {
					mathDelimiter = "$$";
				}

				append("$");
				append("$");
				index += 2;
				continue;
			}

			if (mathDelimiter === "$") {
				mathDelimiter = null;
			} else if (!mathDelimiter) {
				mathDelimiter = "$";
			}

			append("$");
			index++;
			continue;
		}

		if (!mathDelimiter) {
			if (char === "{") braceDepth++;
			if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
		}

		append(char);
		index++;
	}

	flushLine();

	return lines.join("\n");
}

export function formatPseudocodeSource(
	source: string,
	options: FormatOptions
): string {
	const lines = normalizeLineBreaks(source).split("\n");
	const algorithmIndex = lines.findIndex((line) =>
		ALGORITHM_BEGIN.test(line)
	);
	const contentStart = algorithmIndex >= 0 ? algorithmIndex : 0;

	let depth = 0;

	return lines
		.map((line, index) => {
			const trimmed = line.replace(/[ \t]+$/, "");

			if (index < contentStart) return trimmed;

			const content = trimmed.trim();
			if (!content) return "";

			const normalized = normalizeCommandSpacing(content);
			const role = getIndentRole(normalized);

			if (role === "close" || role === "middle") {
				depth = Math.max(0, depth - 1);
			}

			const formatted = `${options.indentUnit.repeat(depth)}${normalized}`;

			if (role === "open" || role === "middle") {
				depth++;
			}

			return formatted;
		})
		.join("\n");
}

export function getFormatIndentUnit(
	settings: PseudocodeSettings
): string {
	if (settings.formatIndentStyle === "tab") return "\t";

	const parsed = Math.floor(Number(settings.formatIndentSize));
	const size =
		Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 8) : 4;

	return " ".repeat(size);
}
