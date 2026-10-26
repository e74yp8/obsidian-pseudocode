# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obsidian-Pseudocode is an Obsidian plugin that renders LaTeX-style pseudocode inside code blocks. It uses pseudocode.js to convert LaTeX algorithmic constructs to HTML, with support for math formulas via KaTeX.

## Build and Development Commands

```bash
# Development mode with file watching
npm run dev

# Production build (includes TypeScript type checking)
npm run build

# Version bump
npm run version
```

## Architecture

### Plugin Entry Point
- `main.ts`: Core plugin class (`PseudocodePlugin`)
  - Registers markdown code block processor for `pseudo` language
  - Manages settings and preamble loading

### Core Processing Flow
1. User creates a code block with `pseudo` language specifier
2. `pseudocodeHandler()` in main.ts processes the block:
   - Extracts inline macros (before `\begin{algorithm}`)
   - Combines with global preamble if enabled
   - Injects preamble into all math expressions (`$...$`)
   - Renders using pseudocode.js library
   - Adds export button

### Key Modules

**src/inline_macro.ts**
- Separates inline macro definitions from algorithm content
- Macros before `\begin{algorithm}` are treated as preamble

**src/latex_translator.ts**
- Converts unsupported LaTeX macros to KaTeX-compatible commands
- Handles `\DeclarePairedDelimiter`, `\DeclareMathOperator*`, `\DeclareMathOperator`
- Validates macros using KaTeX parser and converts `\newcommand` to `\renewcommand` when redefining

**src/export_button.ts**
- Creates "Export to clipboard" button for each pseudocode block
- Generates compilable LaTeX document with required packages (algorithm, algpseudocodex, amsmath)
- Includes both global and inline macros

**src/setting_tab.ts**
- UI for plugin settings (block size, preamble path, line numbers, etc.)

**src/auto_complete.ts**
- EditorSuggestor for autocomplete within `pseudo` code blocks

**src/editor_syntax.ts**
- Registers a CodeMirror 5 mode for `pseudo` fenced blocks
- Applies theme-aware syntax highlighting in the editor
- Delegates math spans to Obsidian's built-in CodeMirror 5 `stex` mode
- Falls back to treating math as a string token when `stex` is unavailable
- Refreshes open editors after registration or setting changes

**src/pseudocode_keywords.ts**
- Shared autocomplete keywords and paired command suggestions

### Build System
- Uses esbuild (config in `esbuild.config.mjs`)
- Bundles to CommonJS format targeting ES2018
- Main entry: `main.ts` → `main.js`
- External: Obsidian API, CodeMirror 6, Electron

## Important Implementation Details

### Preamble System
- Global preamble: loaded from file (default `preamble.sty`)
- Inline preamble: defined per-block before `\begin{algorithm}`
- Preamble is injected into every math expression in the pseudocode
- Must reload plugin after changing global preamble file

### Theme Integration
- `.ps-root` uses Obsidian CSS variables `--background-primary` and `--text-normal`, so theme changes apply automatically without JavaScript
- Algorithm borders use `currentColor` to match the active theme
- Obsidian PDF export switches the print window to the light theme; `@media print` also forces pseudocode blocks to a white background with black text

### Editor Syntax Highlighting
- Registered via `window.CodeMirror.defineMode("pseudo", ...)`
- Obsidian resolves fenced code block languages through the CodeMirror 5 mode registry
- `refreshSyntaxHighlighting()` forces re-tokenization by replacing the first character with itself
- Colors use Obsidian's native `.cm-*` token classes and theme variables

### Error Handling
- Pseudocode rendering errors display in-block with ✖ symbol
- Preamble loading failures show Notice to user
- Invalid LaTeX in preamble is caught and logged to console

## Dependencies
- `pseudocode`: Uses forked version from ytliu74/pseudocode.js#master
- `katex`: Fixed at 0.11.1 for macro rendering
- `obsidian`: Latest API
- TypeScript 4.7.4 with strict null checks enabled
