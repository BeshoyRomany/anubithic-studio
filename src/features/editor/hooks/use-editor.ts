import { useCallback } from "react";

import { Id } from "../../../../convex/_generated/dataModel";
import { useEditorStore } from "../store/use-editor-store";

export const useEditor = (projectId: Id<"projects">) => {
  const store = useEditorStore();

  const tabState = useEditorStore((state) => state.getTabState(projectId));
  const openFile = useCallback(
    (fileId: Id<"files">, options: { pinned: boolean }) => {
      store.openFile(projectId, fileId, options);
    },
    [store, projectId],
  );
  const closeTab = useCallback(
    (fileId: Id<"files">) => {
      store.closeTab(projectId, fileId);
    },
    [store, projectId],
  );
  const closeAllTabs = useCallback(() => {
    store.closeAllTabs(projectId);
  }, [store, projectId]);

  const setActiveTab = useCallback(
    (fileId: Id<"files">) => {
      store.setActiveTab(projectId, fileId);
    },
    [store, projectId],
  );

  const toggleFolder = useCallback(
    (folderId: Id<"files">) => {
      store.toggleFolder(projectId, folderId);
    },
    [store, projectId],
  );

  const toggleExplorerRoot = useCallback(() => {
    store.toggleExplorerRoot(projectId);
  }, [store, projectId]);

  const openExplorerRoot = useCallback(() => {
    store.openExplorerRoot(projectId);
  }, [store, projectId]);

  const revealFolders = useCallback(
    (folderIds: Id<"files">[]) => {
      store.revealFolders(projectId, folderIds);
    },
    [store, projectId],
  );

  const collapseAllFolders = useCallback(() => {
    store.collapseAllFolders(projectId);
  }, [store, projectId]);

  return {
    openTabs: tabState.openTabs,
    activeTabId: tabState.activeTabId,
    previewTabId: tabState.previewTabId,
    openFile,
    closeTab,
    closeAllTabs,
    setActiveTab,
    toggleFolder,
    toggleExplorerRoot,
    openExplorerRoot,
    revealFolders,
    collapseAllFolders,
  };
};
