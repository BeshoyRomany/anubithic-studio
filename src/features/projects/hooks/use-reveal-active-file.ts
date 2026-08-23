import { useEffect } from "react";
import { Id } from "../../../../convex/_generated/dataModel";
import { useEditorStore } from "@/features/editor/store/use-editor-store";
import { useFilePath } from "./use-files";

/*
  #region Why the reveal logic is a store reaction (not a callback)
  =============================================================================
  Instead of wiring "reveal" calls into every place that activates a file
  (tab clicks in top-navigation, file clicks in the tree, closing a tab that
  auto-activates its neighbor, ...), this hook simply reacts to activeTabId
  changing in the shared editor store.

  Any code path that makes a file active automatically gets the reveal
  behavior for free - including paths that don't exist yet.
  =============================================================================
*/

/**
 * VS Code-style "reveal in explorer": whenever the project's active tab
 * changes, resolve the file's full ancestor chain (root -> direct parent)
 * and expand every folder along the way in the shared editor store.
 *
 * Must be mounted once per project (FileExplorer does this). The expansion
 * state is read by <Tree />, whose lazy useFolderContents fetch then loads
 * each newly-expanded folder's children level by level until the file row
 * renders and scrolls into view.
 */
export const useRevealActiveFile = (projectId: Id<"projects">) => {
  // Narrow selector: only re-run when THIS project's active tab changes
  const activeTabId = useEditorStore(
    (state) => state.getTabState(projectId).activeTabId,
  );
  const revealFolders = useEditorStore((state) => state.revealFolders);

  // Ask the backend for the path root -> file. Folders load lazily in the
  // tree, so the client cannot know the ancestors on its own. Convex caches
  // queries per arguments, so re-revealing the same file is a cache hit.
  const path = useFilePath(activeTabId);

  useEffect(() => {
    if (!activeTabId || !path) return;

    // The path ends with the file itself (e.g. [root, src, app, page.tsx]),
    // so every element except the last one is a folder to expand.
    const ancestorFolderIds = path
      .slice(0, -1)
      .map((item) => item._id as Id<"files">);

    revealFolders(projectId, ancestorFolderIds);
  }, [activeTabId, path, projectId, revealFolders]);
};
