import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { FaGithub } from "react-icons/fa";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  GlobeIcon,
  LoaderIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

import { Doc } from "../../../../convex/_generated/dataModel";
import { useProjectsPartial } from "../hooks/use-projects";
import { DeleteProjectDialog } from "./delete-project-dialog";

const formatTimestamp = (timestamp: number) =>
  formatDistanceToNow(new Date(timestamp), { addSuffix: true });

const getProjectIcon = (project: Doc<"projects">) => {
  const className = "size-4 shrink-0 text-muted-foreground";
  if (project.importStatus === "completed") {
    return <FaGithub className={className} />;
  }
  if (project.importStatus === "failed") {
    return <AlertCircleIcon className={className} />;
  }
  if (project.importStatus === "importing") {
    return <LoaderIcon className={cn(className, "animate-spin")} />;
  }
  return <GlobeIcon className={className} />;
};

//#region ProjectCard
//The card itself is a <Link>; the delete button is a SIBLING positioned on top of
//it (a <button> inside an <a> is invalid HTML, and clicks would navigate).
//The dialog is a sibling too: React events bubble through portals to the React
//parent, so a dialog rendered inside the Link would trigger navigation on click.
//#endregion
const ProjectCard = ({
  data,
  isLatest,
}: {
  data: Doc<"projects"> & { role: "owner" | "admin" | "contributor" };
  isLatest: boolean;
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  //Projects shared with me can't be deleted by me → no delete button
  const isOwner = data.role === "owner";

  return (
    <div className="group relative min-w-0">
      <Link
        href={`/projects/${data._id}`}
        className={cn(
          "flex min-w-0 items-center gap-3 rounded-xl border bg-white/55 dark:bg-foreground/3 py-2.5 pl-3 pr-3 backdrop-blur-sm transition-[color,background-color,border-color,padding]",
          // Make room for the delete button only while it is visible (see below)
          isOwner &&
            "group-hover:pr-10 group-focus-within:pr-10 [@media(hover:none)]:pr-10",
          "group-hover:border-logo/40 group-hover:bg-logo/5",
          isLatest ? "border-logo/30" : "border-foreground/10",
        )}
      >
        {getProjectIcon(data)}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{data.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {!isOwner && (
              <span className="mr-1 inline-flex items-center gap-0.5 text-logo">
                <UsersIcon className="size-3" />
                {data.role === "admin" ? "Shared · Admin ·" : "Shared ·"}
              </span>
            )}
            {formatTimestamp(data.updatedAt)}
          </p>
        </div>
        {isLatest ? (
          <span className="shrink-0 rounded-full bg-logo/15 px-2 py-0.5 text-[10px] font-medium text-logo">
            Continue
          </span>
        ) : (
          <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-logo" />
        )}
      </Link>
      {isOwner && (
        <>
          <button
            type="button"
            aria-label={`Delete project ${data.name}`}
            onClick={() => setDeleteDialogOpen(true)}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-[color,background-color,opacity] hover:bg-destructive/10 hover:text-destructive",
              // Hidden until the card is hovered; still reachable by keyboard (focus)
              // and always shown on touch screens, which have no hover
              "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
            )}
          >
            <Trash2Icon className="size-3.5" />
          </button>
          <DeleteProjectDialog
            projectId={data._id}
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            variant="glow"
          />
        </>
      )}
    </div>
  );
};

interface RecentProjectsGridProps {
  onViewAll: () => void;
}

export const RecentProjectsGrid = ({ onViewAll }: RecentProjectsGridProps) => {
  const projects = useProjectsPartial(6);

  // In Convex, `undefined` means the query is still loading.
  if (projects === undefined) {
    return <Spinner className="mx-auto size-4 text-ring" />;
  }
  if (projects.length === 0) return null;

  return (
    <section className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Recent projects</span>
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-logo"
          onClick={onViewAll}
        >
          View all
          <ArrowRightIcon className="size-3" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
        {projects.map((project, index) => (
          <ProjectCard
            key={project._id}
            data={project}
            isLatest={index === 0}
          />
        ))}
      </div>
    </section>
  );
};
