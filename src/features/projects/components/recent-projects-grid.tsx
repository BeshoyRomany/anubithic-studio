import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { FaGithub } from "react-icons/fa";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  GlobeIcon,
  LoaderIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

import { Doc } from "../../../../convex/_generated/dataModel";
import { useProjectsPartial } from "../hooks/use-projects";

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

const ProjectCard = ({
  data,
  isLatest,
}: {
  data: Doc<"projects">;
  isLatest: boolean;
}) => (
  <Link
    href={`/projects/${data._id}`}
    className={cn(
      "group flex min-w-0 items-center gap-3 rounded-xl border bg-white/3 px-3 py-2.5 backdrop-blur-sm transition-colors",
      "hover:border-logo/40 hover:bg-logo/5",
      isLatest ? "border-logo/30" : "border-white/10",
    )}
  >
    {getProjectIcon(data)}
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{data.name}</p>
      <p className="truncate text-xs text-muted-foreground">
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
);

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
