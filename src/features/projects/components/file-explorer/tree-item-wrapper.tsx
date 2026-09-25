import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuContent,
  ContextMenuTrigger,
  ContextMenuShortcut,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { getItemPadding } from "./constants";
import { type TreeDndData } from "./dnd";
import { Doc } from "../../../../../convex/_generated/dataModel";
import { useIsMac } from "@/hooks/useIsMac";

interface TreeItemWrapperProps {
  item: Doc<"files">;
  children: React.ReactNode;
  level: number;
  isActive?: boolean;
  // Drag & drop: this row is inside the folder currently being hovered as
  // the drop target, so it's tinted along with the rest of that subtree
  isDropHighlighted?: boolean;
  // Drag & drop: this row is the dragged folder or inside it, so dropping
  // here must be refused (can't move a folder into its own subtree)
  isDropInvalid?: boolean;
  // Forwarded to the row <button>. Lets callers grab the DOM node, e.g. to
  // scroll the active file row into view when the tree reveals it.
  ref?: React.Ref<HTMLButtonElement>;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onCreateFile?: () => void;
  onCreateFolder?: () => void;
}

export const TreeItemWrapper = ({
  item,
  children,
  level,
  isActive,
  isDropHighlighted,
  isDropInvalid,
  ref,
  onClick,
  onDoubleClick,
  onRename,
  onDelete,
  onCreateFile,
  onCreateFolder,
}: TreeItemWrapperProps) => {
  const isMac = useIsMac();

  // Every row is both a drag source and a drop target. They can share the
  // item id because dnd-kit keeps draggables and droppables in separate
  // registries. The FileTreeDndProvider decides what a drop on this row means.
  const {
    setNodeRef: setDragRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({ id: item._id, data: { item } satisfies TreeDndData });
  const { setNodeRef: setDropRef } = useDroppable({
    id: item._id,
    data: { item, invalid: isDropInvalid } satisfies TreeDndData,
  });

  // The <button> has three owners: dnd-kit's drag + drop refs and the
  // caller's ref (auto-scroll of the active file), so fan the node out
  const setRefs = (node: HTMLButtonElement | null) => {
    setDragRef(node);
    setDropRef(node);
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          ref={setRefs}
          {...attributes}
          {...listeners}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onRename?.();
            }
          }}
          className={cn(
            "group flex  items-center gap-1 w-full h-5.5 hover:bg-accent/30 outline-none focus:ring-1 focus:ring-inset focus:ring-ring",
            isActive && "bg-accent/30",
            isDropHighlighted && "bg-accent/20",
            isDragging && "opacity-50",
          )}
          style={{ paddingLeft: getItemPadding(level, item.type === "file") }}
        >
          {children}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="w-64"
      >
        {item.type === "folder" && (
          <>
            <ContextMenuItem onClick={onCreateFile} className="text-sm">
              New file...
            </ContextMenuItem>
            <ContextMenuItem onClick={onCreateFolder} className="text-sm">
              New Folder...
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={onRename} className="text-sm">
          Rename...
          <ContextMenuShortcut>Enter</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={onDelete} className="text-sm">
          Delete Permanently
          <ContextMenuShortcut>
            {isMac ? "⌘Backspace" : "Ctrl+Backspace"}
          </ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
