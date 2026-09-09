import { useEffect, useMemo, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { customTheme } from "../extensions/theme-extension";
import { getLanguageExtension } from "../extensions/language-extension";
import { minimap } from "../extensions/minimap-extension";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { customSetup } from "./custom-setup";
import { suggestion } from "../extensions/suggestion";
import { quickEdit } from "../extensions/quick-edit";
import { selectionTooltip } from "../extensions/selection-tooltip-extionsion";
import { formatCodeExtension } from "../extensions/code-format-extension";

interface CodeEditorProps {
  fileName: string;
  value?: string;
  onChange: (value: string) => void;
}

export const CodeEditor = ({
  fileName,
  value = "",
  onChange,
}: CodeEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewsRef = useRef<EditorView | null>(null);

  // Ref flag to distinguish between user typing and remote agent updates
  const isLocalEditRef = useRef(false);

  const languageExtension = useMemo(
    () => getLanguageExtension(fileName),
    [fileName],
  );

  useEffect(() => {
    if (!editorRef.current) return;

    const view = new EditorView({
      doc: value,
      parent: editorRef.current,
      extensions: [
        customSetup,
        oneDark,
        customTheme,
        languageExtension,
        selectionTooltip(),
        suggestion(fileName),
        quickEdit(fileName),
        formatCodeExtension(),
        keymap.of([indentWithTab]),
        minimap(),
        indentationMarkers(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            // Mark that the change originated locally inside the editor
            isLocalEditRef.current = true;
            onChange(update.state.doc.toString());
          }
        }),
      ],
    });

    viewsRef.current = view;

    return () => {
      view.destroy();
      viewsRef.current = null;
    };
  }, [languageExtension]);

  useEffect(() => {
    const view = viewsRef.current;
    if (!view) return;

    // 1. Skip dispatch if the change originated from local user input
    if (isLocalEditRef.current) {
      isLocalEditRef.current = false;
      return;
    }

    const currentDoc = view.state.doc.toString();

    // 2. Apply external document updates from Convex / Agent
    if (value !== currentDoc) {
      const currentSelection = view.state.selection.main;
      const newDocLength = value.length;

      // Clamp cursor positions to prevent RangeError when new content is shorter
      const anchor = Math.min(currentSelection.anchor, newDocLength);
      const head = Math.min(currentSelection.head, newDocLength);

      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: value,
        },
        selection: { anchor, head },
      });
    }
  }, [value]);

  return <div ref={editorRef} className="size-full pl-4 bg-background" />;
};

/**
 * CODE EDITOR STATE SYNCHRONIZATION (CodeMirror <-> Convex / Agent)
 * ================================================================
 * Handles two-way synchronization between CodeMirror's internal state
 * and external React prop updates driven by Convex.
 *
 * 1. LOCAL EDITS (User Typing):
 *    - User input triggers `updateListener` (update.docChanged), setting `isLocalEditRef = true`.
 *    - `onChange` updates Convex state.
 *    - When React re-renders with the updated `value` prop, `useEffect([value])` sees `isLocalEditRef = true`,
 *      resets it to `false`, and SKIPS `view.dispatch`.
 *    - Why? Prevents CodeMirror from re-rendering the document and resetting the user's cursor position.
 *
 * 2. REMOTE EDITS (Agent Updates via Convex):
 *    - The Agent updates Convex, pushing a new `value` prop while `isLocalEditRef` remains `false`.
 *    - `useEffect([value])` detects `value !== currentDoc` and dispatches the new content to CodeMirror.
 *    - Selection Clamping (`Math.min`): Ensures cursor coordinates stay within bounds to avoid RangeErrors if new content is shorter.
 *    - Note: `view.dispatch` side-effect fires `updateListener` again, setting `isLocalEditRef = true`,
 *      which safely resets on the secondary re-render when `value === currentDoc`.
 */
