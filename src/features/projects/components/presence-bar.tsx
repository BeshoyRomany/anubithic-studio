import { FileIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditorStore } from "@/features/editor/store/use-editor-store";

import { usePresence } from "../hooks/use-presence";
import { Id } from "../../../../convex/_generated/dataModel";

//Stable color per user (same user → same color in every browser), so a
//teammate is easy to recognise across the bar at a glance
const userColor = (userId: string) => {
  let hash = 0;
  for (const char of userId) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360} 70% 60%)`;
};

//#region PresenceBar
//VS Code-style status bar at the bottom of the IDE: who else is in this
//project right now and which file each of them has open.
//
//Clicking a teammate opens their file for you (as a preview tab, like a single
//click in the explorer) — a quick way to "follow" someone. The auto-reveal of
//the active file then expands the tree to it (see use-reveal-active-file.ts).
//
//This component also SENDS our own heartbeat (usePresence), so it must stay
//mounted for as long as the project is open — it lives in ProjectIdLayout.
//#endregion
interface PresenceBarProps {
  projectId: Id<"projects">;
}

export const PresenceBar = ({ projectId }: PresenceBarProps) => {
  const { others, isLoading } = usePresence(projectId);
  const openFile = useEditorStore((state) => state.openFile);

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 overflow-x-auto border-t bg-sidebar px-3 text-xs text-muted-foreground">
      <span className="flex shrink-0 items-center gap-1.5">
        <span
          className={cn(
            "size-1.5 rounded-full",
            others.length > 0 ? "bg-emerald-500" : "bg-muted-foreground/50",
          )}
        />
        {isLoading
          ? "Connecting..."
          : others.length > 0
            ? `${others.length + 1} online`
            : "Only you here"}
      </span>

      {others.map((person) => {
        const label = person.name || person.email || "Teammate";
        const fileId = person.fileId;

        return (
          <Tooltip key={person._id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                disabled={!fileId}
                onClick={() =>
                  fileId && openFile(projectId, fileId, { pinned: false })
                }
                className="flex shrink-0 items-center gap-1.5 rounded px-1 py-0.5 enabled:hover:bg-accent/40 enabled:hover:text-foreground"
              >
                <Avatar
                  className="size-4"
                  style={{
                    boxShadow: `0 0 0 1.5px ${userColor(person.userId)}`,
                  }}
                >
                  {person.imageUrl && (
                    <AvatarImage src={person.imageUrl} alt={label} />
                  )}
                  <AvatarFallback className="text-[9px]">
                    {label.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="max-w-32 truncate text-foreground/80">
                  {label}
                </span>
                {person.fileName ? (
                  <span className="flex items-center gap-1">
                    <FileIcon className="size-3" />
                    <span className="max-w-40 truncate">{person.fileName}</span>
                  </span>
                ) : (
                  <span className="italic">no file open</span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {person.filePath
                ? `${label} is on ${person.filePath} — click to open it`
                : `${label} has no file open`}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </footer>
  );
};
