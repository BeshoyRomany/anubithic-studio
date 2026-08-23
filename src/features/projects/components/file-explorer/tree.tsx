import { ChevronRightIcon } from "lucide-react";
import { FileIcon, FolderIcon } from "@react-symbols/icons/utils";
import { cn } from "@/lib/utils";
import {
  useCreateFile,
  useCreateFolder,
  useFolderContents,
  useRenameFile,
  useDeleteFile,
} from "@/features/projects/hooks/use-files";
import { getItemPadding } from "./constants";
import { LoadingRow } from "./loading-row";
import { CreateInput } from "./create-input";
import { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { useState } from "react";
import { TreeItemWrapper } from "./tree-item-wrapper";
import { RenameInput } from "./rename-input";
import { useEditor } from "@/features/editor/hooks/use-editor";

interface TreeProps {
  projectId: Id<"projects">;
  item: Doc<"files">;
  level?: number;
}

/** <Tree /> component lifecycle
 * =============================================================================
 * TREE COMPONENT LIFECYCLE & RECURSIVE CYCLE:
 * =============================================================================
 * 1. MOUNT & INITIAL RENDER:
 *    - Each Tree component represents a single node (File or Folder instance).
 *    - Starts at level 0 (Root) and increases recursively per depth level (+1).
 *
 * 2. FILE NODE LIFECYCLE:
 *    - If item.type === "file", it renders the file item and stops (Base case).
 *
 * 3. FOLDER NODE LIFECYCLE & STATES:
 *    - isOpen (boolean): Controls whether the folder is expanded to fetch/show contents.
 *    - isRenaming (boolean): Handles inline renaming state.
 *    - creating ("file" | "folder" | null): Handles inline creation state.
 *
 * 4. RECURSIVE RENDER CYCLE (When folder is open):
 *    - Triggers useFolderContents hook based on parentId and isOpen status.
 *    - Maps over folderContents and renders child <Tree /> components recursively.
 *    - Increases indentation level automatically via level={level + 1}.
 *
 * 5. CREATING CYCLE:
 *    - When creating is active, renders the folder header, places the <CreateInput />,
 *    - and maps remaining child items recursively underneath.
 *
 * 6. - Each <TreeItemWrapper/> represents an independent node instance in the Tree,
 *    - allowing the context menu to work separately for each specific folder or file
 * =============================================================================
 */

/** How recursive LEVELS work
// =============================================================================
// HOW RECURSIVE LEVELS WORK IN DEEP NESTED FOLDERS:
// =============================================================================
// 1. MEMORY & SCOPE ISOLATION: 
//    Each Tree instance holds its own 'level' value independently in memory.
//    (Level 0 -> Level 1 -> Level 2 -> Level 3, etc.)
// 
// 2. RIGHT-CLICK ACTION:
//    When you right-click a folder at Level 3, its specific instance knows its ID 
//    and its current level (3) via its own scope.
// 
// 3. PASSING THE NEXT LEVEL:
//    When creating inside it, we explicitly pass (level + 1) to the CreateInput 
//    and any sub-items, making the new folder correctly render at Level 4.
// =============================================================================
*/

export const Tree = ({ projectId, item, level = 0 }: TreeProps) => {
  //states
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isRenaming, setIsRenaming] = useState<boolean>(false);
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);

  //api hooks
  const createFolder = useCreateFolder();
  const createFile = useCreateFile();
  const renameFile = useRenameFile();
  const deleteFile = useDeleteFile();
  const { openFile, closeTab, activeTabId } = useEditor(projectId);
  // Get children items only if this item is a folder and it is open
  const folderContents = useFolderContents({
    projectId,
    parentId: item._id,
    enabled: item.type === "folder" && isOpen,
  });

  //functions
  const handleCreate = (name: string) => {
    console.log(name);
    setCreating(null);
    if (creating === "file") {
      createFile({
        projectId,
        name,
        content: "",
        parentId: item._id,
      });
    } else {
      createFolder({
        projectId,
        name,
        parentId: item._id,
      });
    }
  };
  const handleRename = (newName: string) => {
    setIsRenaming(false);
    if (newName === item.name) return;

    renameFile({ id: item._id, newName });
  };
  const startCreating = (type: "file" | "folder") => {
    setIsOpen(true);
    setCreating(type);
  };

  //file logic
  if (item.type === "file") {
    const fileName = item.name;
    const isActive = activeTabId === item._id;
    if (isRenaming) {
      return (
        <RenameInput
          type="file"
          defaultValue={fileName}
          level={level}
          onSubmit={handleRename}
          onCancel={() => setIsRenaming(false)}
        />
      );
    }

    return (
      <TreeItemWrapper
        item={item}
        level={level}
        isActive={isActive}
        onClick={() => openFile(item._id, { pinned: false })}
        onDoubleClick={() => openFile(item._id, { pinned: true })}
        onRename={() => setIsRenaming(true)}
        onDelete={() => {
          closeTab(item._id);
          deleteFile({ id: item._id });
        }}
      >
        {/* The file Children */}
        <FileIcon fileName={fileName} autoAssign className="size-4" />
        <span className="truncate text-sm">{fileName}</span>
      </TreeItemWrapper>
    );
  }

  //folder Logic
  const folderName = item.name;
  // Prepare The folder Children
  const folderRender = (
    <>
      <div className="flex items-center gap-0.5">
        <ChevronRightIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground",
            isOpen && "rotate-90",
          )}
        />
        <FolderIcon folderName={folderName} className="size-4" />
      </div>
      <span className="truncate text-sm">{folderName}</span>
    </>
  );
  if (creating) {
    return (
      <>
        <button
          onClick={() => setIsOpen((value) => !value)}
          className="group flex items-center gap-1 h-5.5 hover:bg-accent/30 w-full"
          style={{ paddingLeft: getItemPadding(level, false) }}
        >
          {folderRender}
        </button>
        {isOpen && (
          <>
            {folderContents === undefined && <LoadingRow level={level + 1} />}
            <CreateInput
              level={level + 1} //current level + 1
              type={creating}
              key={item._id}
              onCancel={() => setCreating(null)}
              onSubmit={handleCreate}
            />
            {folderContents?.map((subItem) => (
              <Tree
                item={subItem}
                projectId={projectId}
                level={level + 1} //current level + 1
                key={subItem._id}
              />
            ))}
          </>
        )}
      </>
    );
  }
  if (isRenaming) {
    return (
      <>
        <RenameInput
          type="folder"
          defaultValue={folderName}
          isOpen={isOpen}
          level={level}
          onSubmit={handleRename}
          onCancel={() => setIsRenaming(false)}
        />
        {isOpen && (
          <>
            {folderContents === undefined && <LoadingRow level={level + 1} />}
            {folderContents?.map((subItem) => (
              <Tree
                item={subItem}
                projectId={projectId}
                level={level + 1} //current level + 1
                key={subItem._id}
              />
            ))}
          </>
        )}
      </>
    );
  }

  return (
    <>
      <TreeItemWrapper
        item={item}
        level={level}
        isActive={false}
        onClick={() => setIsOpen((value) => !value)}
        onDoubleClick={() => {}}
        onRename={() => setIsRenaming(true)}
        onDelete={() => {
          deleteFile({ id: item._id });
        }}
        onCreateFile={() => startCreating("file")}
        onCreateFolder={() => startCreating("folder")}
      >
        {/* The folder Children */}
        {folderRender}
      </TreeItemWrapper>

      {/* Render nested contents recursively if the folder is open */}
      {isOpen && (
        <>
          {folderContents === undefined && <LoadingRow level={level + 1} />}
          {folderContents?.map((subItem) => (
            <Tree
              item={subItem}
              projectId={projectId}
              level={level + 1} //current level + 1
              key={subItem._id}
            />
          ))}
        </>
      )}
    </>
  );
};
