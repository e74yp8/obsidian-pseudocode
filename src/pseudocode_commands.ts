export interface LineCommandSpec {
	prefix: string;
	trailing?: string;
	noEnd?: boolean;
	indent?: "open" | "close" | "middle";
}

const ELIF_SPEC: LineCommandSpec = {
	prefix: "else if ",
	trailing: " then",
	indent: "middle",
};

export const LINE_COMMANDS: Record<string, LineCommandSpec> = {
	state: { prefix: "" },
	return: { prefix: "return " },
	print: { prefix: "print " },
	require: { prefix: "Require: " },
	ensure: { prefix: "Ensure: " },
	input: { prefix: "Input: " },
	output: { prefix: "Output: " },
	if: { prefix: "if ", trailing: " then", indent: "open" },
	elif: ELIF_SPEC,
	elsif: ELIF_SPEC,
	elseif: ELIF_SPEC,
	else: { prefix: "else", indent: "middle" },
	endif: { prefix: "end if", noEnd: true, indent: "close" },
	for: { prefix: "for ", trailing: " do", indent: "open" },
	forall: { prefix: "for all ", trailing: " do", indent: "open" },
	while: { prefix: "while ", trailing: " do", indent: "open" },
	endfor: { prefix: "end for", noEnd: true, indent: "close" },
	endwhile: { prefix: "end while", noEnd: true, indent: "close" },
	repeat: { prefix: "repeat", indent: "open" },
	until: { prefix: "until ", indent: "close" },
	upon: { prefix: "upon ", indent: "open" },
	endupon: { prefix: "end upon", noEnd: true, indent: "close" },
	procedure: { prefix: "procedure ", indent: "open" },
	endprocedure: { prefix: "end procedure", noEnd: true, indent: "close" },
	function: { prefix: "function ", indent: "open" },
	endfunction: { prefix: "end function", noEnd: true, indent: "close" },
	caption: { prefix: "Algorithm " },
	break: { prefix: "break" },
	continue: { prefix: "continue" },
};

export type LineCommandName = keyof typeof LINE_COMMANDS;

export function getLineCommandName(
	line: string
): LineCommandName | null {
	const match = /^\s*\\([A-Za-z]+)\b/.exec(line);
	if (!match) return null;

	const name = match[1].toLowerCase();
	return name in LINE_COMMANDS ? (name as LineCommandName) : null;
}

export function isRenderableCommandLine(
	line: string,
	noEnd: boolean
): boolean {
	const command = getLineCommandName(line);
	if (!command) return false;

	return !(noEnd && LINE_COMMANDS[command].noEnd);
}
