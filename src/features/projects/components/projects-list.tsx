import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { useIsMac } from "@/hooks/useIsMac";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  GlobeIcon,
  LoaderIcon,
} from "lucide-react";
import Link from "next/link";
import { FaGithub } from "react-icons/fa";
import { Doc } from "../../../../convex/_generated/dataModel";
import { useProjectsPartial } from "../hooks/use-projects";

const formatTimestamp = (timestamp: number) => {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
};

const getProjectIcon = (project: Doc<"projects">) => {
  if (project.importStatus === "completed") {
    return <FaGithub className="size-3.5 text-muted-foreground shrink-0" />;
  }
  if (project.importStatus === "failed") {
    return (
      <AlertCircleIcon className="size-3.5 text-muted-foreground shrink-0" />
    );
  }
  if (project.importStatus === "importing") {
    return (
      <LoaderIcon className="size-3.5 text-muted-foreground shrink-0 animate-spin" />
    );
  }
  return <GlobeIcon className="size-3.5 text-muted-foreground shrink-0" />;
};

//Continue Card
const ContinueCard = ({ data }: { data: Doc<"projects"> }) => {
  //data" -> {data: {_id, name, importStatus, etc...}}
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Last updated</span>
        <Button
          variant="outline"
          asChild
          className="h-auto w-full min-w-0 items-start justify-start p-4 bg-background border rounded-none flex flex-col gap-2 whitespace-normal"
        >
          <Link href={`/projects/${data._id}`} className="group w-full min-w-0">
            <div className="flex items-center justify-between w-full min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {getProjectIcon(data)}
                <span className="font-medium truncate">{data.name}</span>
              </div>
              <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </div>
            <span className="text-xs text-muted-foreground">
              {formatTimestamp(data.updatedAt)}
            </span>
          </Link>
        </Button>
      </div>
    </>
  );
};

interface ProjectListProps {
  onViewAll: () => void;
}

//Item component
const ProjectItem = ({ data }: { data: Doc<"projects"> }) => {
  //data" -> {data: {_id, name, importStatus, etc...}}
  return (
    <Link
      href={`/projects/${data._id}`}
      className="text-sm gap-3 text-foreground/60 font-medium hover:text-foreground py-1 flex items-center justify-between w-full group"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {getProjectIcon(data)}
        <span className="truncate leading-normal">{data.name}</span>
      </div>
      <span className="text-xs text-muted-foreground group-hover:text-foreground/60 transition-colors">
        {formatTimestamp(data.updatedAt)}
      </span>
    </Link>
  );
};

//List component
export const ProjectsList = ({ onViewAll }: ProjectListProps) => {
  const isMac = useIsMac();
  const projects = useProjectsPartial(6);

  //note: in convex, if any query equal === undefined means that still loading
  if (projects === undefined) {
    return <Spinner className="size-4 text-ring" />;
  }

  //Extract the most recent project i have worked on from the rest of the list
  //e.g -> UI Card displays "Continue working on your most recent project"
  //[mostRecent, ...rest] -> mostRecent here is the first item in the array[]
  const [mostRecent, ...rest] = projects;
  return (
    <div className="flex flex-col gap-4">
      {mostRecent && <ContinueCard data={mostRecent} />}
      {rest.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Recent Projects
            </span>
            <button
              className="flex items-center gap-2 text-muted-foreground text-xs hover:text-foreground transition-colors"
              onClick={onViewAll}
            >
              View all
              <Kbd className="bg-accent border">{isMac ? "⌘K" : "Ctrl+K"}</Kbd>
            </button>
          </div>
          <ul className="flex flex-col">
            {rest.map((project) => (
              <ProjectItem key={project._id} data={project} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
