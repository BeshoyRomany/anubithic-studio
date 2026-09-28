// CodeMirror popups are plain DOM, outside React: the editor keeps this in sync with
// the chosen model so the quick-edit popup can show what's running.
let currentModelLabel = "";

export const setCurrentModelLabel = (label: string) => {
  currentModelLabel = label;
};

export const getCurrentModelLabel = () => currentModelLabel;
