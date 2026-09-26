import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { oneDark } from "@codemirror/theme-one-dark";

export const customTheme = EditorView.theme({
  "&": {
    outline: "none !important",
    fontSize: "15px",
  },
  ".cm-content": {
    fontFamily: "var(--font-plex-mono), monospace",
    fontSize: "14px",
  },
  ".cm-scroller": {
    scrollbarWidth: "thin",
  },
});

//#region One Light
//Atom's One Light, matching the chat's "one-light" Shiki code blocks
const light = {
  text: "#383a42",
  comment: "#a0a1a7",
  keyword: "#a626a4",
  string: "#50a14f",
  number: "#986801",
  func: "#4078f2",
  variable: "#e45649",
  type: "#c18401",
  operator: "#0184bc",
  cursor: "#526eff",
};

const oneLightTheme = EditorView.theme(
  {
    "&": { color: light.text, backgroundColor: "var(--background)" },
    ".cm-content": { caretColor: light.cursor },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: light.cursor },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
      { backgroundColor: "#d7dbe8" },
    ".cm-activeLine": { backgroundColor: "oklch(0.22 0.02 264 / 4%)" },
    ".cm-selectionMatch": { backgroundColor: "#e6e1c8" },
    ".cm-searchMatch": {
      backgroundColor: "#fbe19c80",
      outline: "1px solid #e0b44a",
    },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#f5c85a" },
    "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
      backgroundColor: "#d8dae0",
    },
    ".cm-gutters": {
      backgroundColor: "var(--background)",
      color: "#9d9d9f",
      border: "none",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: light.text,
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "transparent",
      border: "none",
      color: light.comment,
    },
    ".cm-tooltip": {
      border: "1px solid var(--border)",
      backgroundColor: "var(--popover)",
      color: "var(--popover-foreground)",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
    },
    ".cm-panels": { backgroundColor: "var(--sidebar)", color: light.text },
    ".cm-scroller": { scrollbarColor: "#c9c9cc transparent" },
  },
  { dark: false },
);

const oneLightHighlight = HighlightStyle.define([
  { tag: t.comment, color: light.comment, fontStyle: "italic" },
  {
    tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword],
    color: light.keyword,
  },
  { tag: [t.string, t.special(t.string), t.regexp], color: light.string },
  { tag: [t.number, t.bool, t.null, t.atom], color: light.number },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName)],
    color: light.func,
  },
  { tag: [t.propertyName, t.attributeName], color: light.number },
  { tag: [t.variableName, t.tagName, t.deleted], color: light.variable },
  { tag: [t.typeName, t.className, t.namespace], color: light.type },
  { tag: [t.operator, t.escape, t.url], color: light.operator },
  { tag: [t.meta, t.definition(t.name)], color: light.func },
  { tag: t.heading, color: light.variable, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.link, color: light.func, textDecoration: "underline" },
  { tag: t.invalid, color: "#ca1243" },
]);
//#endregion

const oneDarkScrollbar = EditorView.theme(
  { ".cm-scroller": { scrollbarColor: "#3f3f46 transparent" } },
  { dark: true },
);

//Swapped at runtime through a Compartment in code-editor.tsx
export const editorTheme = (isDark: boolean): Extension =>
  isDark
    ? [oneDark, oneDarkScrollbar]
    : [oneLightTheme, syntaxHighlighting(oneLightHighlight)];
