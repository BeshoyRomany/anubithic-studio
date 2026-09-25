"use client";
import { cn } from "@/lib/utils";
import { Id } from "../../../../convex/_generated/dataModel";
import { useState } from "react";
import { Allotment } from "allotment";
import { FaGithub } from "react-icons/fa";
import { FileExplorer } from "../components/file-explorer";
import { EditorView } from "@/features/editor/views/editor-view";
import { PreviewView } from "../components/preview-view";
import { ExportPopover } from "../components/export-popover";
import { DeleteProjectDialog } from "../components/delete-project-dialog";
import { Trash2Icon } from "lucide-react";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 800;
const DEFAULT_SIDEBAR_WIDTH = 350;
const DEFAULT_MAIN_SIZE = 1000;
interface TabProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}
const Tab = ({ label, isActive, onClick }: TabProps) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 h-full px-3 cursor-pointer text-muted-foreground border-r hover:bg-accent/30",
        isActive && "bg-background text-foreground",
      )}
    >
      <span className="text-sm">{label}</span>
    </div>
  );
};

interface ProjectIdViewProps {
  projectId: Id<"projects">;
}
export const ProjectIdView = ({ projectId }: ProjectIdViewProps) => {
  const [activeView, setActiveView] = useState<"editor" | "preview">("editor");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  return (
    <div className="h-full flex flex-col">
      <DeleteProjectDialog
        projectId={projectId}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        isCurrentProject
      />
      <nav className="h-8.75 flex items-center bg-sidebar border-b">
        <Tab
          label="Code"
          isActive={activeView === "editor"}
          onClick={() => setActiveView("editor")}
        />
        <Tab
          label="Preview"
          isActive={activeView === "preview"}
          onClick={() => setActiveView("preview")}
        />
        <div className="flex-1 flex justify-end h-full">
          <div
            role="button"
            onClick={() => setDeleteDialogOpen(true)}
            className="flex items-center gap-1.5 h-full px-3 cursor-pointer text-muted-foreground border-l hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2Icon className="size-3.5" />
            <span className="text-sm">Delete</span>
          </div>
          <ExportPopover projectId={projectId} />
        </div>
      </nav>
      <div className="flex-1 relative">
        <div
          className={cn(
            "absolute inset-0",
            activeView === "editor" ? "visible" : "invisible",
          )}
        >
          <Allotment defaultSizes={[DEFAULT_SIDEBAR_WIDTH, DEFAULT_MAIN_SIZE]}>
            <Allotment.Pane
              snap
              minSize={MIN_SIDEBAR_WIDTH}
              maxSize={MAX_SIDEBAR_WIDTH}
              preferredSize={DEFAULT_SIDEBAR_WIDTH}
            >
              <FileExplorer projectId={projectId} />
            </Allotment.Pane>
            <Allotment.Pane preferredSize={DEFAULT_MAIN_SIZE}>
              <div className="h-full">
                <EditorView projectId={projectId} />
              </div>
            </Allotment.Pane>
          </Allotment>
        </div>
        <div
          className={cn(
            "absolute inset-0",
            activeView === "preview" ? "visible" : "invisible",
          )}
        >
          <PreviewView projectId={projectId} />
        </div>
      </div>
    </div>
  );
};
