import { EditorView, EditorViewConfig } from "@codemirror/view";
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
    scrollbarColor: "#3f3f46 transparent",
  },
});
