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
  - Registers the sidebar preview controller
  - Manages settings and preamble loading

### Core Processing Flow
1. User creates a code block with `pseudo` language specifier
2. `pseudocodeHandler()` in main.ts delegates to `renderPseudocodeBlock()`:
   - Extracts inline macros (before `\begin{algorithm}`)
   - Combines with global preamble if enabled
   - Injects preamble into all math expressions (`$...$`)
   - Renders using pseudocode.js library
   - Adds export button when requested
3. The sidebar preview finds the `pseudo` fenced block containing the cursor and renders it with the same shared renderer

### Key Modules

**src/inline_macro.ts**
- Separates inline macro definitions from algorithm content
- Macros before `\begin{algorithm}` are treated as preamble

**src/latex_translator.ts**
- Converts unsupported LaTeX macros to KaTeX-compatible commands
- Handles `\DeclarePairedDelimiter`, `\DeclareMathOperator*`, `\DeclareMathOperator`
- Validates macros using KaTeX parser and converts `\newcommand` to `\renewcommand` when redefining

**src/render.ts**
- Shared renderer used by code blocks and the sidebar preview
- Extracts inline macros, injects the preamble, and renders with pseudocode.js
- Optionally adds the export button

**src/pseudocode_block.ts**
- Locates the `pseudo` fenced block containing the editor cursor or selection
- Supports backtick and tilde fences, blockquotes, and unclosed blocks

**src/preview_view.ts**
- Sidebar `ItemView` for the pseudocode preview
- Shows block metadata, refresh action, copy LaTeX action, empty state, and render errors

**src/preview_controller.ts**
- Opens and tracks the sidebar preview
- Registers the command and ribbon icon
- Follows the active Markdown editor and refreshes on cursor or document changes

**src/export_button.ts**
- Creates "Export to clipboard" button for each pseudocode block
- Builds compilable LaTeX documents with required packages (algorithm, algpseudocodex, amsmath)
- Includes both global and inline macros
- Exposes `buildLatexDocument()` and `copyLatexToClipboard()` for reuse

**src/setting_tab.ts**
- UI for plugin settings (block size, preamble path, line numbers, etc.)

**src/auto_complete.ts**
- EditorSuggestor for autocomplete within `pseudo` code blocks

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

### Sidebar Preview
- View type: `pseudocode-preview`
- Command: `open-pseudocode-preview`; ribbon icon: `code`
- The controller listens to workspace events and a CodeMirror 6 `updateListener`
- Cursor or document changes are debounced before re-rendering
- The preview keeps the last Markdown view when the preview pane itself has focus
- Renders through `renderPseudocodeBlock()` with `width: "100%"`, no edit click handler, and no export button

### Error Handling
- Pseudocode rendering errors display in-block with ✖ symbol
- Sidebar preview render errors display in the preview pane
- Preamble loading failures show Notice to user
- Invalid LaTeX in preamble is caught and logged to console

## Dependencies
- `pseudocode`: Uses forked version from ytliu74/pseudocode.js#master
- `katex`: Fixed at 0.11.1 for macro rendering
- `obsidian`: Latest API
- TypeScript 4.7.4 with strict null checks enabled
