"use client";

import { useState } from "react";
import ky from "ky";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";

import { Id } from "../../../../convex/_generated/dataModel";
import { ShortcutKeys } from "./shortcut-keys";

const SUGGESTIONS = [
  "A SaaS landing page with pricing",
  "A kanban board with drag & drop",
  "A markdown notes app",
];

interface NewProjectPromptProps {
  onCreated?: () => void;
  textareaId?: string;
}

export const NewProjectPrompt = ({
  onCreated,
  textareaId,
}: NewProjectPromptProps) => {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (message: PromptInputMessage) => {
    if (!message.text) return;

    setIsSubmitting(true);

    try {
      const { projectId } = await ky
        .post("/api/projects/create-with-prompt", {
          json: { prompt: message.text.trim() },
        })
        .json<{ projectId: Id<"projects"> }>();

      toast.success("Project created");
      onCreated?.();
      setInput("");
      router.push(`/projects/${projectId}`);
    } catch {
      toast.error("Unable to create project");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PromptInput
        onSubmit={handleSubmit}
        className={cn(
          "px-2",
          "**:data-[slot=input-group]:border-0! **:data-[slot=input-group]:bg-transparent! **:data-[slot=input-group]:shadow-none! **:data-[slot=input-group]:ring-0!",
        )}
      >
        <PromptInputBody>
          <PromptInputTextarea
            id={textareaId}
            placeholder="Ask Anubithic/studio to build..."
            onChange={(e) => setInput(e.target.value)}
            value={input}
            disabled={isSubmitting}
            className="min-h-20 placeholder:text-muted-foreground/60"
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
              <ShortcutKeys keys={["↵"]} mod={false} /> send
              <span className="mx-1">·</span>
              <ShortcutKeys keys={["Shift", "↵"]} mod={false} /> new line
            </span>
          </PromptInputTools>
          <PromptInputSubmit
            disabled={!input || isSubmitting}
            className="rounded-lg bg-logo text-black hover:bg-logo/90 disabled:bg-muted disabled:text-muted-foreground"
          />
        </PromptInputFooter>
      </PromptInput>

      <div className="flex flex-wrap gap-2 border-t border-white/5 px-5 py-3">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setInput(suggestion)}
            disabled={isSubmitting}
            className="rounded-full border border-white/10 bg-white/3 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-logo/50 hover:text-logo"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </>
  );
};
