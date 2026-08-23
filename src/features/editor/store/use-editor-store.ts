import { create } from "zustand";
import { Id } from "../../../../convex/_generated/dataModel";

// Tab state for a single project: which files are open, which tab is active,
// and which tab (if any) is in "preview" mode
interface TabState {
  openTabs: Id<"files">[];
  activeTabId: Id<"files"> | null;
  previewTabId: Id<"files"> | null;
}

// Used when a project has no tab state yet
const defaultTabState: TabState = {
  openTabs: [],
  activeTabId: null,
  previewTabId: null,
};

interface EditorStore {
  // Each project gets its own tab state, stored by project id
  tabs: Map<Id<"projects">, TabState>;

  // Get the tab state for one project (or the default if none exists yet)
  getTabState: (projectId: Id<"projects">) => TabState;

  // Open a file in a project. If "pinned" is false, it opens as a preview
  // tab (replaces any existing preview). If "pinned" is true, it opens as
  // a permanent tab.
  openFile: (
    projectId: Id<"projects">,
    fileId: Id<"files">,
    options: { pinned: boolean },
  ) => void;

  // Close one open tab in a project
  closeTab: (projectId: Id<"projects">, fileId: Id<"files">) => void;

  // Close every open tab in a project
  closeAllTabs: (projectId: Id<"projects">) => void;

  // Make a given file the active tab in a project
  setActiveTab: (projectId: Id<"projects">, file: Id<"files">) => void;
}

export const useEditorStore = create<EditorStore>()((set, get) => ({
  tabs: new Map(),

  getTabState: (projectId) => {
    return get().tabs.get(projectId) ?? defaultTabState;
  },

  openFile: (projectId, fileId, { pinned }) => {
    // Copy the map so Zustand/React notices the state changed
    const tabs = new Map(get().tabs);

    // Load this project's current tab state
    const state = tabs.get(projectId) ?? defaultTabState;
    const { openTabs, previewTabId } = state;

    // Is this file already open in a tab?
    const isOpen = openTabs.includes(fileId);

    // Case 1: single click on an unopened file -> open it as a preview tab.
    // A preview tab is temporary: opening another file this way replaces it.
    if (!isOpen && !pinned) {
      const newTabs = previewTabId
        ? // A preview tab already exists, so swap it out for the new file
          openTabs.map((id) => (id === previewTabId ? fileId : id))
        : // No preview tab yet, so just add the new file
          [...openTabs, fileId];

      tabs.set(projectId, {
        openTabs: newTabs,
        previewTabId: fileId,
        activeTabId: fileId,
      });
      set({ tabs });
      return;
    }

    // Case 2: double click on an unopened file -> open it as a pinned
    // (permanent) tab, without touching any existing preview tab
    if (!isOpen && pinned) {
      tabs.set(projectId, {
        ...state,
        openTabs: [...openTabs, fileId],
        activeTabId: fileId,
      });
      set({ tabs });
      return;
    }

    // Case 3: the file is already open -> just make it active.
    // If it's currently the preview tab and the user double-clicked,
    // "pin" it by clearing previewTabId.
    const shouldPin = pinned && previewTabId === fileId;
    tabs.set(projectId, {
      ...state,
      activeTabId: fileId,
      previewTabId: shouldPin ? null : previewTabId,
    });
    set({ tabs });
  },

  closeTab: (projectId, fileId) => {
    // Copy the map so Zustand/React notices the state changed
    const tabs = new Map(get().tabs);
    const state = tabs.get(projectId) ?? defaultTabState;
    const { openTabs, activeTabId, previewTabId } = state;

    // Nothing to do if the file isn't actually open
    const tabIndex = openTabs.indexOf(fileId);
    if (tabIndex === -1) return;

    // Build the tab list without the closed file
    const newTabs = openTabs.filter((id) => id !== fileId);

    // Figure out which tab should become active next, but only if we
    // just closed the tab that was active
    let newActiveTab = activeTabId;

    if (activeTabId === fileId) {
      if (newTabs.length === 0) {
        // No tabs left at all
        newActiveTab = null;
      } else if (tabIndex >= newTabs.length) {
        // We closed the last tab -> activate the new last tab
        // Example: closed index 6, only 5 tabs remain (indices 0-4),
        // so fall back to the new final tab
        newActiveTab = newTabs[newTabs.length - 1];
      } else {
        // We closed a middle tab -> the tab that shifted into its
        // spot becomes active
        // Example: [A, B(active), C, D], close B -> [A, C, D],
        // C (now at index 1) becomes active
        newActiveTab = newTabs[tabIndex];
      }
    }

    tabs.set(projectId, {
      openTabs: newTabs,
      activeTabId: newActiveTab,
      // Clear the preview tab if we just closed it
      previewTabId: previewTabId === fileId ? null : previewTabId,
    });
    set({ tabs });
    return;
  },

  // Close all tabs for a project by wiping its state back to the default
  // (no open tabs, no active tab, no preview tab)
  closeAllTabs: (projectId) => {
    // Copy the map so Zustand/React notices the state changed
    const tabs = new Map(get().tabs);

    // Reset this project's tab state to empty
    tabs.set(projectId, defaultTabState);

    // Save the updated map back into the store
    set({ tabs });
  },

  // Make a given file the active tab, without changing openTabs or previewTabId
  setActiveTab: (projectId, fileId) => {
    // Copy the map so Zustand/React notices the state changed
    const tabs = new Map(get().tabs);

    // Load this project's current tab state
    const state = tabs.get(projectId) ?? defaultTabState;

    // Update just the active tab, keep everything else the same
    tabs.set(projectId, {
      ...state,
      activeTabId: fileId,
    });
    set({ tabs });
  },
}));
