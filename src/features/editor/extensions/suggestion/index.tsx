import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  keymap,
} from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import { fetcher } from "./fetcher";
//------------- Create & update Suggestion State -------------//

// StateEffect: A way to send "messages" to update state.
// We define one effect type for setting the suggestion text.
const setSuggestionEffect = StateEffect.define<string | null>();

// StateField: Holds our suggestion state in the editor.
// - create(): Returns the initial value when the editor loads
// - update(): Called on every transaction (keystroke, etc.) to potentially update the value

const suggestionState = StateField.define<string | null>({
  create() {
    return null; //Init the view with null
  },
  update(value, transaction) {
    // Check each effect in this transaction
    // If we find our setSuggestionEffect, return its new value
    // Otherwise, keep the current value unchanged
    for (const effect of transaction.effects) {
      if (effect.is(setSuggestionEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

//------------- view rendering Widget -------------//

/* WidgetType: Creates custom DOM elements to display in the editor.
/* toDOM() is called by CodeMirror to create the actual HTML element.*/
class SuggestionWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.text;
    span.style.opacity = "0.4"; // Ghost text appearance
    span.style.pointerEvents = "none"; // Don't interfere with clicks
    return span;
  }
}

//------------- Debouncing Helpers -------------//
let debounceTimer: number | null = null;
let isWaitingForSuggestion = false;
const DEBOUNCE_DELAY = 1200;

let currentAbortController: AbortController | null = null;

const generatePayload = (view: EditorView, fileName: string) => {
  // Extract the entire document text from CodeMirror state
  const code = view.state.doc.toString();

  // Return null immediately if the editor is completely empty to prevent unnecessary API calls
  if (!code || code.trim().length === 0) return null; // no reason to make API Request

  // Get the current primary cursor/selection head position (absolute character index)
  const cursorPosition = view.state.selection.main.head;

  // Find the exact line object where the cursor is currently located
  const currentLine = view.state.doc.lineAt(cursorPosition);

  // Calculate the cursor offset relative to the start of the current line (text before cursor)
  const cursorInLine = cursorPosition - currentLine.from; // everything before the cursor in the same line

  // Initialize an array to hold the preceding lines of context
  const previousLines: string[] = [];

  // Determine how many lines above the current line to fetch, capping the maximum at 5
  const previousLinesToFetch = Math.min(10, currentLine.number - 1);

  //#region Example: If cursor is at line 10, and previousLinesToFetch = 5:
  // i = 5 -> line(10 - 5) = line 5 (oldest context line)
  // i = 4 -> line(10 - 4) = line 6
  // i = 3 -> line(10 - 3) = line 7
  // i = 2 -> line(10 - 2) = line 8
  // i = 1 -> line(10 - 1) = line 9 (the line right above cursor)
  //#endregion
  for (let i = previousLinesToFetch; i >= 1; i--) {
    previousLines.push(view.state.doc.line(currentLine.number - i).text);
  }

  // Initialize an array to hold the succeeding lines of context
  const nextLines: string[] = [];
  // Get the total number of lines in the entire document
  const totalLines = view.state.doc.lines;
  // Determine how many lines below the current line to fetch, capping the maximum at 5
  const linesToFetch = Math.min(10, totalLines - currentLine.number); // 50 - 10 = 40 so (5 less than 40) take 5

  //#region Example: If cursor is at line 10, and linesToFetch = 3:
  // i = 1 -> line(10 + 1) = line 11 (the line right below cursor)
  // i = 2 -> line(10 + 2) = line 12
  // i = 3 -> line(10 + 3) = line 13 (farthest next context line)
  //#endregion
  for (let i = 1; i <= linesToFetch; i++) {
    nextLines.push(view.state.doc.line(currentLine.number + i).text);
  }

  return {
    fileName, // The name of the file currently being edited
    code, // The full text content of the entire document
    currentLine: currentLine.text, // The complete text content of the line where the cursor is
    previousLines: previousLines.join("\n"), // Combines the previous lines array into a single multiline string
    textBeforeCursor: currentLine.text.slice(0, cursorInLine), // The text on the current line from the start up to the cursor
    textAfterCursor: currentLine.text.slice(cursorInLine), // The text on the current line from the cursor to the end of the line
    nextLines: nextLines.join("\n"), // Combines the next lines array into a single multiline string
    lineNumber: currentLine.number, // The absolute line number where the cursor is currently located
  };
};
//------------- Debouncing Plugins -------------//
const createDebouncePlugin = (fileName: string) => {
  return ViewPlugin.fromClass(
    class {
      constructor(view: EditorView) {
        this.triggerSuggestion(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet) {
          this.triggerSuggestion(update.view);
        }
      }

      triggerSuggestion(view: EditorView) {
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
        }

        if (currentAbortController !== null) {
          currentAbortController.abort();
        }
        isWaitingForSuggestion = true;

        //Simulate fake suggestion with timeout
        debounceTimer = window.setTimeout(async () => {
          const payload = generatePayload(view, fileName);

          if (!payload) {
            isWaitingForSuggestion = false;
            view.dispatch({ effects: setSuggestionEffect.of(null) });
            return;
          }

          currentAbortController = new AbortController();
          const suggestion = await fetcher(
            payload,
            currentAbortController.signal,
          );
          //reset the waiting
          isWaitingForSuggestion = false;

          //View dispatch
          view.dispatch({
            effects: setSuggestionEffect.of(suggestion),
          });
        }, DEBOUNCE_DELAY);
      }
      //remove the timer on destroy
      destroy() {
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
        }

        if (currentAbortController !== null) {
          currentAbortController.abort();
        }
      }
    },
  );
};

//------------- Rendering Plugins -------------//
const renderPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      // Rebuild decorations if doc changed, cursor moved, or suggestion changed
      const suggestionChanged = update.transactions.some((transaction) => {
        return transaction.effects.some((effect) => {
          return effect.is(setSuggestionEffect);
        });
      });

      // Rebuild decorations if doc changed, cursor moved, or suggestion changed
      const shouldRebuild =
        update.docChanged || update.selectionSet || suggestionChanged;

      if (shouldRebuild) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView) {
      if (isWaitingForSuggestion) {
        return Decoration.none;
      }
      // Get current suggestion from state
      const suggestion = view.state.field(suggestionState);
      if (!suggestion) {
        return Decoration.none;
      }

      // Create a widget decoration at the cursor position
      const cursor = view.state.selection.main.head;
      return Decoration.set([
        Decoration.widget({
          widget: new SuggestionWidget(suggestion),
          side: 1, // Render after cursor (side: 1), not before (side: -1)
        }).range(cursor),
      ]);
    }
  },
  { decorations: (plugin) => plugin.decorations }, // Tell CodeMirror to use our decorations
);

//------------- Accept & Dismiss suggestion keymap (extension) -------------//
const suggestionKeymap = keymap.of([
  {
    key: "Tab",
    run: (view) => {
      const suggestion = view.state.field(suggestionState);

      if (!suggestion) return false; //No suggestion found? let "Tab" do it's normal thing just -> normal indentation
      const cursorPosition = view.state.selection.main.head;

      view.dispatch({
        changes: {
          from: cursorPosition,
          insert: suggestion,
        }, //Insert the suggestion text starting from the cursor pointer
        selection: { anchor: cursorPosition + suggestion.length }, // Move the cursor to the end of the inserted text
        effects: setSuggestionEffect.of(null), // clear the suggestion
      });
      return true; // we handle tab not indent
    },
  },
  {
    key: "Escape",
    run: (view) => {
      const suggestion = view.state.field(suggestionState);

      if (!suggestion && !isWaitingForSuggestion) return false;

      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }

      if (currentAbortController !== null) {
        currentAbortController.abort();
      }
      isWaitingForSuggestion = false;

      view.dispatch({
        effects: setSuggestionEffect.of(null),
      });

      return true;
    },
  },
]);

export const suggestion = (fileName: string) => [
  suggestionState, // Our state storage
  createDebouncePlugin(fileName), //Trigger suggestions on typing
  renderPlugin, // render the ghost text
  suggestionKeymap, // Tab key to accept
];
