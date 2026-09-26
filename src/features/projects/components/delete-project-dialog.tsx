"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ProBadge } from "@/components/pro-badge";
import { FaGithub } from "react-icons/fa";
import { LoaderIcon, TriangleAlertIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useProject, useRemoveProject } from "../hooks/use-projects";
import { useDeletingProjectStore } from "../store/use-deleting-project-store";
import { ExportPopover } from "./export-popover";
import { GlowDialogContent, GlowDialogHeader } from "./glow-dialog";

import { Id } from "../../../../convex/_generated/dataModel";

// #region Design notes
// Two visual variants over the same delete logic (useDeleteProject):
//  - "default": plain shadcn AlertDialog — used inside the IDE, matching the editor chrome.
//  - "glow": the home-screen shell (glow-dialog.tsx) shared with "New project" and
//    "Import from GitHub", so the delete dialog looks like its siblings there.
// #endregion

interface DeleteProjectDialogProps {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  //true when the dialog is opened from INSIDE the project (IDE page):
  //we have to unmount the IDE before deleting, then go back home.
  isCurrentProject?: boolean;
  variant?: "default" | "glow";
}

export const DeleteProjectDialog = ({
  projectId,
  open,
  onOpenChange,
  isCurrentProject = false,
  variant = "default",
}: DeleteProjectDialogProps) => {
  //Content is only mounted while open -> the project query inside it
  //doesn't run for every card on the home page
  if (variant === "glow") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <GlowDialogContent>
          {open && (
            <GlowDeleteContent
              projectId={projectId}
              onOpenChange={onOpenChange}
              isCurrentProject={isCurrentProject}
            />
          )}
        </GlowDialogContent>
      </Dialog>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {open && (
          <DefaultDeleteContent
            projectId={projectId}
            onOpenChange={onOpenChange}
            isCurrentProject={isCurrentProject}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
};

type DeleteContentProps = Omit<DeleteProjectDialogProps, "open" | "variant">;

//#region useDeleteProject — the shared logic
//Guards: mirror the server-side checks in "projects.remove" so the user sees *why*
//the button is disabled instead of hitting an error. (A processing agent message
//is only checked server side -> surfaced through the error toast.)
//
//Delete flow — order matters:
//This dialog (and the export popover inside it) subscribes to "projects.getById",
//which THROWS once the project row is gone. So we get rid of every subscriber
//*before* the mutation lands:
//  - inside the IDE -> flag the project; the layout unmounts the IDE (and this dialog)
//  - on the home page -> just close the dialog; the card vanishes optimistically
//The async handler keeps running after unmount, so the toasts still fire.
//#endregion
const useDeleteProject = ({
  projectId,
  onOpenChange,
  isCurrentProject,
}: DeleteContentProps) => {
  const router = useRouter();
  const project = useProject(projectId);
  const removeProject = useRemoveProject();
  const setDeletingProjectId = useDeletingProjectStore(
    (state) => state.setDeletingProjectId,
  );

  const [confirmName, setConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const isExporting = project?.exportStatus === "exporting";
  const isImporting = project?.importStatus === "importing";
  const nameMatches = !!project && confirmName.trim() === project.name;
  const canDelete = nameMatches && !isExporting && !isImporting && !isDeleting;

  const handleDelete = async () => {
    if (!canDelete || !project) return;
    setIsDeleting(true);
    const projectName = project.name;

    if (isCurrentProject) {
      setDeletingProjectId(projectId);
    } else {
      onOpenChange(false);
    }

    try {
      await removeProject({ projectId });
      toast.success(`Project "${projectName}" deleted`);
      if (isCurrentProject) {
        router.replace("/");
      }
    } catch {
      if (isCurrentProject) {
        setDeletingProjectId(null);
      }
      toast.error(
        "Unable to delete the project. Make sure no import, export or AI request is still running.",
      );
    }
  };

  return {
    project,
    confirmName,
    setConfirmName,
    isDeleting,
    isExporting,
    isImporting,
    canDelete,
    handleDelete,
  };
};

const BusyNotice = ({ isExporting }: { isExporting: boolean }) => (
  <p className="flex items-center gap-2 text-xs text-muted-foreground">
    <LoaderIcon className="size-3.5 animate-spin" />
    {isExporting
      ? "Export in progress — you can delete once it finishes."
      : "Import in progress — you can delete once it finishes."}
  </p>
);

//#region Default variant (IDE)
const DefaultDeleteContent = (props: DeleteContentProps) => {
  const {
    project,
    confirmName,
    setConfirmName,
    isDeleting,
    isExporting,
    isImporting,
    canDelete,
    handleDelete,
  } = useDeleteProject(props);

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogMedia className="bg-destructive/10 text-destructive">
          <TriangleAlertIcon />
        </AlertDialogMedia>
        <AlertDialogTitle>Delete this project?</AlertDialogTitle>
        <AlertDialogDescription>
          Deleting{" "}
          <span className="font-semibold text-foreground">
            {project?.name ?? "this project"}
          </span>{" "}
          will permanently remove the entire project: all of its files, every
          conversation and all of their messages. This cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="flex flex-col gap-3">
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Want to keep your code? Export the project to GitHub before deleting
          it.
        </p>

        {(isExporting || isImporting) && (
          <BusyNotice isExporting={isExporting} />
        )}

        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <span>
            Type{" "}
            <span className="font-mono font-semibold text-foreground">
              {project?.name}
            </span>{" "}
            to confirm
          </span>
          <Input
            autoFocus
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleDelete();
            }}
            disabled={isDeleting}
            aria-label="Project name confirmation"
          />
        </label>
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
        <ExportPopover
          projectId={props.projectId}
          trigger={
            <Button variant="outline" disabled={isDeleting}>
              {isExporting ? (
                <LoaderIcon className="size-4 animate-spin" />
              ) : (
                <FaGithub className="size-4" />
              )}
              Export to GitHub
              <ProBadge />
            </Button>
          }
        />
        {/* Plain Button (not AlertDialogAction) -> Radix would close the dialog
            on click before the mutation finishes */}
        <Button
          variant="destructive"
          disabled={!canDelete}
          onClick={handleDelete}
        >
          {isDeleting && <LoaderIcon className="size-4 animate-spin" />}
          Delete project
        </Button>
      </AlertDialogFooter>
    </>
  );
};
//#endregion

//#region Glow variant (home page) — same layout as import-github-dialog.tsx
const GlowDeleteContent = (props: DeleteContentProps) => {
  const {
    project,
    confirmName,
    setConfirmName,
    isDeleting,
    isExporting,
    isImporting,
    canDelete,
    handleDelete,
  } = useDeleteProject(props);

  return (
    <>
      <GlowDialogHeader
        title="Delete project"
        description="This permanently removes the entire project — all of its files, every conversation and all of their messages. This cannot be undone."
        icon={
          <TriangleAlertIcon
            aria-hidden
            className="size-6 shrink-0 text-destructive"
          />
        }
      />
      {/* Deliberately NOT a <form>: the export popover's form is portaled, and React
          events bubble through portals — submitting the export would also submit
          (= delete) here. Enter / click are wired explicitly instead. */}
      <div>
        <div className="flex flex-col gap-3 px-5 pt-4 pb-5">
          <p className="rounded-lg border border-dashed border-foreground/10 bg-foreground/3 px-3 py-2 text-xs text-muted-foreground">
            Want to keep your code? Export the project to GitHub before deleting
            it.
          </p>

          {(isExporting || isImporting) && (
            <BusyNotice isExporting={isExporting} />
          )}

          <label className="flex flex-col gap-2 text-xs text-muted-foreground">
            <span>
              Type{" "}
              <span className="font-mono font-semibold text-foreground">
                {project?.name}
              </span>{" "}
              to confirm
            </span>
            <Input
              autoFocus
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleDelete();
              }}
              disabled={isDeleting}
              placeholder={project?.name}
              autoComplete="off"
              aria-label="Project name confirmation"
              className="h-10 rounded-lg border-foreground/10 bg-foreground/3! placeholder:text-muted-foreground/40 focus-visible:border-destructive/60 focus-visible:ring-destructive/20"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-foreground/5 px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => props.onOpenChange(false)}
            disabled={isDeleting}
            className="rounded-lg text-muted-foreground"
          >
            Cancel
          </Button>
          <ExportPopover
            projectId={props.projectId}
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isDeleting}
                className="rounded-lg border-foreground/10 bg-foreground/3! hover:border-logo/40 hover:text-logo"
              >
                {isExporting ? (
                  <LoaderIcon className="size-3.5 animate-spin" />
                ) : (
                  <FaGithub className="size-3.5" />
                )}
                Export to GitHub
                <ProBadge />
              </Button>
            }
          />
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={!canDelete}
            onClick={handleDelete}
            className="rounded-lg disabled:bg-muted disabled:text-muted-foreground"
          >
            {isDeleting && <LoaderIcon className="size-3.5 animate-spin" />}
            Delete project
          </Button>
        </div>
      </div>
    </>
  );
};
//#endregion
