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
  initialValue?: string;
  onChange: (value: string) => void;
}
export const CodeEditor = ({
  fileName,
  initialValue = "",
  onChange,
}: CodeEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewsRef = useRef<EditorView | null>(null);

  const languageExtension = useMemo(
    () => getLanguageExtension(fileName),
    [fileName],
  );

  useEffect(() => {
    if (!editorRef.current) return;
    const view = new EditorView({
      doc: initialValue,
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
            onChange(update.state.doc.toString());
          }
        }),
      ],
    });

    //set the current view the div
    viewsRef.current = view;

    return () => {
      view.destroy();
    };
  }, [languageExtension]);
  return <div ref={editorRef} className="size-full pl-4 bg-background" />;
};
