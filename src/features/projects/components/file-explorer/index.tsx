import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  ChevronRightIcon,
  CopyMinusIcon,
  FilePlusCorner,
  FolderPlusIcon,
} from "lucide-react";
import { useState } from "react";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useProject } from "../../hooks/use-projects";
import { Button } from "@/components/ui/button";
import {
  useCreateFile,
  useCreateFolder,
  useFolderContents,
} from "../../hooks/use-files";
import { CreateInput } from "./create-input";
import { LoadingRow } from "./loading-row";
import { Tree } from "./tree";

interface FileExplorerProps {
  projectId: Id<"projects">;
}
export const FileExplorer = ({ projectId }: FileExplorerProps) => {
  //States
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [collapseKey, setCollapseKey] = useState<number>(0);
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);

  //hooks
  const project = useProject(projectId);
  const createFile = useCreateFile();
  const createFolder = useCreateFolder();
  const rootFiles = useFolderContents({ projectId, enabled: isOpen });

  //functions
  const handleCreate = (name: string) => {
    //first, cancel any creating.
    setCreating(null);

    //Creation (folder | file) -> directly onClick
    if (creating === "file") {
      createFile({
        projectId,
        name,
        content: "",
        parentId: undefined,
      });
    } else {
      createFolder({
        projectId,
        name,
        parentId: undefined,
      });
    }
  };

  return (
    <div className="h-full bg-sidebar">
      <ScrollArea className="h-full w-full [&>div>div]:block! [&>div]:h-full!">
        {/* Project name & creations actions collapse */}
        <div
          role="button"
          onClick={() => setIsOpen((value) => !value)}
          className="group/project cursor-pointer w-full text-left flex items-center gap-0.5 h-5.5 bg-accent font-bold"
        >
          {/* #Root Chevron + project name */}
          <ChevronRightIcon
            className={cn(
              "size-4 shrink-0 text-muted-foreground",
              isOpen && "rotate-90",
            )}
          />
          <p className="text-xs uppercase line-clamp-1 truncate">
            {project?.name ?? "Loading..."}
          </p>

          {/* #Root actions create, file, folder & collapse*/}
          <div className="opacity-0 group-hover/project:opacity-100 transition-none duration-0 flex items-center gap-0.5 ml-auto">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setIsOpen(true);
                setCreating("file");
              }}
              variant="highlight"
              size="icon-xs"
            >
              <FilePlusCorner className="size-3.5" />
            </Button>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setIsOpen(true);
                setCreating("folder");
              }}
              variant="highlight"
              size="icon-xs"
            >
              <FolderPlusIcon className="size-3.5" />
            </Button>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setCollapseKey((prev) => prev + 1);
                //Reset collapse
              }}
              variant="highlight"
              size="icon-xs"
            >
              <CopyMinusIcon className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* #Root if file explorer open */}
        {isOpen && (
          <>
            {rootFiles === undefined && <LoadingRow level={0} />}
            {creating && (
              <CreateInput
                type={creating}
                level={0}
                onSubmit={handleCreate}
                onCancel={() => setCreating(null)}
              />
            )}
            {rootFiles?.map((item) => (
              // concatenating _id + Incrementing collapseKey forces React to unmount and remount (each) component tree,
              // effectively resetting all internal states (like open folders and active inputs)
              // back to their initial closed state with a single click.
              <Tree
                key={`${item._id}-${collapseKey}`}
                item={item}
                level={0} //#root level
                projectId={projectId}
              />
            ))}
          </>
        )}
      </ScrollArea>
    </div>
  );
};
