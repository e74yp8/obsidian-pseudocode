import { LINE_COMMANDS, getLineCommandName } from "src/pseudocode_commands";
import type { PseudocodeSettings } from "src/setting";

export interface FormatOptions {
	indentUnit: string;
}

type IndentRole = "open" | "close" | "middle" | "none";

const ENVIRONMENT_BEGIN = /^\\begin\s*\{/;
const ENVIRONMENT_END = /^\\end\s*\{/;
const ALGORITHM_BEGIN = /\\begin\s*\{algorithm\}/;

function getIndentRole(line: string): IndentRole {
	if (ENVIRONMENT_BEGIN.test(line)) return "open";
	if (ENVIRONMENT_END.test(line)) return "close";

	const command = getLineCommandName(line);
	if (!command) return "none";

	return LINE_COMMANDS[command].indent ?? "none";
}

export function formatPseudocodeSource(
	source: string,
	options: FormatOptions
): string {
	const lines = source.split("\n");
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

			const role = getIndentRole(content);

			if (role === "close" || role === "middle") {
				depth = Math.max(0, depth - 1);
			}

			const formatted = `${options.indentUnit.repeat(depth)}${content}`;

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
