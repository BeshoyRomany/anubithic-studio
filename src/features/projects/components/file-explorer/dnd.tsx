import { createContext, useContext, useId, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
} from "@dnd-kit/core";
import { FileIcon, FolderIcon } from "@react-symbols/icons/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useEditor } from "@/features/editor/hooks/use-editor";
import { getMutationErrorMessage, useMoveFile } from "../../hooks/use-files";
import { Doc, Id } from "../../../../../convex/_generated/dataModel";

// #region Drag & drop in the file explorer - how it works
/*
  Built on @dnd-kit/core. Every tree row (file or folder) is BOTH draggable
  and droppable (see <TreeItemWrapper />), and the whole explorer is one extra
  droppable - the "root" - that catches drops on empty space.

  VS Code semantics for "where does this land?":
  - over a folder row -> into that folder
  - over a file row   -> into that file's folder (its parentId, or the root)
  - over empty space  -> into the project root

  Drop is refused (no highlight, no mutation) when:
  - the destination is the folder the item already lives in (a no-op), or
  - the row is the dragged folder itself or anything inside it (can't move a
    folder into its own subtree - the server re-checks this too).

  The tree has no stored order: listings are always "folders first, then
  A-Z", so a drop only changes parentId (api.files.moveFile) and the item
  re-sorts itself into its new folder. The move is optimistic (useMoveFile),
  so the row jumps instantly and snaps back if the server rejects it.

  State that the rows need to render (what's being dragged, which folder is
  the current drop target) is shared through FileTreeDndStateContext, so each
  <Tree /> can highlight its whole subtree and auto-expand on hover.
*/
// #endregion

// id of the droppable that represents the project root (empty explorer space)
export const ROOT_DROP_ID = "file-explorer-root";

// Where a drop would land: a folder id, the project root, or nowhere
export type DropTarget = Id<"files"> | typeof ROOT_DROP_ID | null;

// Payload attached to every row's draggable/droppable (read back in handlers)
export interface TreeDndData {
  item: Doc<"files">;
  // true for the dragged folder's own row and every row inside it
  invalid?: boolean;
}

interface FileTreeDndState {
  activeItem: Doc<"files"> | null;
  dropTarget: DropTarget;
}

const FileTreeDndStateContext = createContext<FileTreeDndState>({
  activeItem: null,
  dropTarget: null,
});

export const useFileTreeDnd = () => useContext(FileTreeDndStateContext);

// Rows never overlap, so at most one row sits under the pointer. When there
// is one, it wins over the root droppable (which contains every row).
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const rowHits = hits.filter((hit) => hit.id !== ROOT_DROP_ID);
  return rowHits.length > 0 ? rowHits : hits;
};

// Translate "the pointer is over X" into "the item would move into Y"
const resolveDropTarget = (
  over: Over | null,
  activeItem: Doc<"files"> | null,
): DropTarget => {
  if (!over || !activeItem) return null;

  let target: DropTarget;
  if (over.id === ROOT_DROP_ID) {
    target = ROOT_DROP_ID;
  } else {
    const data = over.data.current as TreeDndData | undefined;
    if (!data || data.invalid) return null;
    // folder -> into it; file -> into the folder that holds it
    target =
      data.item.type === "folder"
        ? data.item._id
        : (data.item.parentId ?? ROOT_DROP_ID);
  }

  // Dropping into the folder it's already in changes nothing
  const currentParent = activeItem.parentId ?? ROOT_DROP_ID;
  return target === currentParent ? null : target;
};

interface FileTreeDndProviderProps {
  projectId: Id<"projects">;
  children: React.ReactNode;
}

export const FileTreeDndProvider = ({
  projectId,
  children,
}: FileTreeDndProviderProps) => {
  //states
  const [activeItem, setActiveItem] = useState<Doc<"files"> | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);

  //hooks
  const moveFile = useMoveFile(projectId);
  const { revealFolders, openExplorerRoot } = useEditor(projectId);
  // Stable id so dnd-kit's accessibility nodes match between SSR and client
  const dndId = useId();

  // A small movement threshold keeps click / double-click (open file, toggle
  // folder) and right-click (context menu) working as before
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  //functions
  const reset = () => {
    setActiveItem(null);
    setDropTarget(null);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const data = active.data.current as TreeDndData | undefined;
    setActiveItem(data?.item ?? null);
  };

  const handleDragOver = ({ over }: DragOverEvent) => {
    setDropTarget(resolveDropTarget(over, activeItem));
  };

  const handleDragEnd = ({ over }: DragEndEvent) => {
    const item = activeItem;
    const target = resolveDropTarget(over, item);
    reset();
    if (!item || !target) return;

    const newParentId = target === ROOT_DROP_ID ? undefined : target;

    // Open the destination so the user sees where the item landed
    if (newParentId) revealFolders([newParentId]);
    else openExplorerRoot();

    moveFile({ id: item._id, newParentId }).catch((error) => {
      toast.error(getMutationErrorMessage(error, "Unable to move item."));
    });
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
    >
      <FileTreeDndStateContext.Provider value={{ activeItem, dropTarget }}>
        {children}
      </FileTreeDndStateContext.Provider>

      {/* Ghost row following the pointer. No drop animation: the real row
          has already moved (optimistically), so animating "back" to the old
          spot would look wrong. */}
      <DragOverlay dropAnimation={null}>
        {activeItem && (
          <div className="flex items-center gap-1 h-5.5 px-2 w-fit max-w-60 rounded-sm bg-sidebar border border-border shadow-md">
            {activeItem.type === "file" ? (
              <FileIcon
                fileName={activeItem.name}
                autoAssign
                className="size-4"
              />
            ) : (
              <FolderIcon folderName={activeItem.name} className="size-4" />
            )}
            <span className="truncate text-sm">{activeItem.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
};

// The whole explorer body - dropping on empty space moves the item to the root
export const RootDropZone = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const { setNodeRef } = useDroppable({ id: ROOT_DROP_ID });
  const { dropTarget } = useFileTreeDnd();

  return (
    <div
      ref={setNodeRef}
      className={cn(className, dropTarget === ROOT_DROP_ID && "bg-accent/20")}
    >
      {children}
    </div>
  );
};
