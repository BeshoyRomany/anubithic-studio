import { keymap } from "@codemirror/view";
import { indentSelection } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";

export const formatCodeExtension = () => {
  return keymap.of([
    {
      key: "Shift-Alt-f",
      run: (view: EditorView) => {
        return indentSelection(view);
      },
    },
  ]);
};
