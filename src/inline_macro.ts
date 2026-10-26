import {
	translateUnsupportedMacrosPerf,
	checkTranslatedMacros,
} from "./latex_translator";

export interface InlineMacroExtraction {
	inlineMacros: string;
	content: string;
	contentStartLine: number;
}

export function extractInlineMacros(source: string): InlineMacroExtraction {
	const sourceLines = source.split("\n");
	const foundIndex = sourceLines.findIndex((line) =>
		line.includes("\\begin{algorithm}")
	);
	const macroStartIndex = foundIndex >= 0 ? foundIndex : 0;

	const macroLines = sourceLines.slice(0, macroStartIndex).join("\n");
	const content = sourceLines.slice(macroStartIndex).join("\n");

	let inlineMacros = "";

	try {
		const translated = translateUnsupportedMacrosPerf(macroLines);
		inlineMacros = checkTranslatedMacros(translated);
	} catch (error) {
		console.error(error);
	}

	return {
		inlineMacros,
		content,
		contentStartLine: macroStartIndex,
	};
}
