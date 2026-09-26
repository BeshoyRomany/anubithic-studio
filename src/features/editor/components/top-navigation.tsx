import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Id } from "../../../../convex/_generated/dataModel";
import { useEditor } from "../hooks/use-editor";
import { useFile } from "@/features/projects/hooks/use-files";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { FileIcon } from "@react-symbols/icons/utils";
import { XIcon } from "lucide-react";
interface TopNavigationProps {
  projectId: Id<"projects">;
}
interface TabProps {
  fileId: Id<"files">;
  isFirst: boolean;
  projectId: Id<"projects">;
}

const Tab = ({ fileId, isFirst, projectId }: TabProps) => {
  const file = useFile(fileId);
  const { activeTabId, previewTabId, setActiveTab, openFile, closeTab } =
    useEditor(projectId);
  const isActive = activeTabId === fileId;
  const isPreview = previewTabId === fileId;
  const fileName = file ? file.name : "Loading...";

  return (
    <div
      onClick={() => {
        console.log(file);
        setActiveTab(fileId);
      }}
      onDoubleClick={() => openFile(fileId, { pinned: true })}
      className={cn(
        "flex items-center gap-2 h-8.75 pl-2 pr-1.5 cursor-pointer text-muted-foreground group border-y border-x border-transparent hover:bg-accent/30",
        isActive &&
          "bg-background text-foreground border-x-border border-b-background -mb-px drop-shadow",
        isFirst && "border-l-transparent",
      )}
    >
      {file === undefined ? (
        <Spinner className="text-ring" />
      ) : (
        <FileIcon fileName={file.name} autoAssign className="size-4" />
      )}
      <span className={cn("text-sm whitespace-nowrap", isPreview && "italic")}>
        {fileName}
      </span>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          closeTab(fileId);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            closeTab(fileId);
          }
        }}
        className={cn(
          "p-0.5 rounded-sm hover:bg-foreground/10 opacity-0 group-hover:opacity-100",
          isActive && "opacity-100",
        )}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
};
export const TopNavigation = ({ projectId }: TopNavigationProps) => {
  const { openTabs } = useEditor(projectId);
  return (
    <ScrollArea className="flex-1">
      <nav className="bg-sidebar flex items-center h-8.75 border-b ">
        {openTabs.map((fileId, index) => (
          <Tab
            key={fileId}
            fileId={fileId}
            isFirst={index === 0}
            projectId={projectId}
          />
        ))}
      </nav>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};
