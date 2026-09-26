import { useRouter } from "next/navigation";
import { FaGithub } from "react-icons/fa";
import { AlertCircleIcon, GlobeIcon, Loader2Icon } from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { useProjects } from "../hooks/use-projects";
import { GlowDialogContent, GlowDialogHeader } from "./glow-dialog";
import { Doc } from "../../../../convex/_generated/dataModel";

interface ProjectsCommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getProjectIcon = (project: Doc<"projects">) => {
  if (project.importStatus === "completed") {
    return <FaGithub className="size-4 text-muted-foreground shrink-0" />;
  }
  if (project.importStatus === "failed") {
    return (
      <AlertCircleIcon className="size-4 text-muted-foreground shrink-0" />
    );
  }
  if (project.importStatus === "importing") {
    return (
      <Loader2Icon className="size-4 text-muted-foreground shrink-0 animate-spin" />
    );
  }
  return <GlobeIcon className="size-4 text-muted-foreground shrink-0" />;
};

export const ProjectsCommandDialog = ({
  open,
  onOpenChange,
}: ProjectsCommandDialogProps) => {
  const router = useRouter();
  const projects = useProjects();

  const handleSelect = (projectId: string) => {
    router.push(`/projects/${projectId}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <GlowDialogContent>
        <GlowDialogHeader
          title="Your projects"
          description="Search and jump back into any of your projects."
        />
        <Command className="mt-3 bg-transparent **:data-[slot=command-input-wrapper]:h-12 **:data-[slot=command-input-wrapper]:border-foreground/5 **:data-[slot=command-input-wrapper]:px-5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground/70 [&_[cmdk-group]]:px-3 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:rounded-lg [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item][data-selected=true]]:bg-logo/10 [&_[cmdk-item][data-selected=true]]:text-logo [&_[cmdk-item][data-selected=true]_svg]:text-logo">
          <CommandInput placeholder="Search projects..." />
          <CommandList className="pb-2">
            <CommandEmpty>No projects found.</CommandEmpty>
            <CommandGroup heading="Projects">
              {projects?.map((project) => (
                <CommandItem
                  key={project._id}
                  //append the -project._id to not highlight all the search result if it has the same name
                  value={`${project.name}-${project._id}`}
                  onSelect={() => handleSelect(project._id)}
                >
                  {getProjectIcon(project)}
                  <span>{project.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </GlowDialogContent>
    </Dialog>
  );
};
