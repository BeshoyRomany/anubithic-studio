"use client";

import { useEffect, useState } from "react";
import ky from "ky";
import { useClerk } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
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
import { useTypewriterPlaceholder } from "../hooks/use-typewriter-placeholder";

const SUGGESTIONS = [
  "A SaaS landing page with pricing",
  "A kanban board with drag & drop",
  "A markdown notes app",
];

// Streamed after the fixed "Ask Anubithic/studio to " in the placeholder
const PLACEHOLDER_PREFIX = "Ask Anubithic/studio to ";
const PLACEHOLDER_EXAMPLES = [
  "build a SaaS landing page with pricing",
  "build an admin dashboard",
  "create a kanban board with drag & drop",
  "make a markdown notes app",
  "design a portfolio site with a blog",
  "build a weather dashboard with charts",
  "clone a todo app with dark mode",
];

// Holds the prompt while a signed-out user goes through sign-in
const PENDING_PROMPT_KEY = "anubithic:pending-prompt";

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

  const { isAuthenticated } = useConvexAuth();
  const clerk = useClerk();

  //Paused while there is text -> the placeholder is hidden, no need to animate
  const placeholder = useTypewriterPlaceholder({
    prefix: PLACEHOLDER_PREFIX,
    phrases: PLACEHOLDER_EXAMPLES,
    paused: input.length > 0,
  });

  const createProject = async (prompt: string) => {
    setInput(prompt); // show the restored prompt while it submits
    setIsSubmitting(true);

    try {
      const { projectId } = await ky
        .post("/api/projects/create-with-prompt", {
          json: { prompt: prompt.trim() },
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

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text) return;

    // Signed out: save the prompt (survives OAuth redirects), then sign in
    if (!isAuthenticated) {
      sessionStorage.setItem(PENDING_PROMPT_KEY, message.text);
      clerk.openSignIn({ forceRedirectUrl: "/" });
      return;
    }

    createProject(message.text);
  };

  // Back from sign-in: restore the saved prompt and submit it
  useEffect(() => {
    if (!isAuthenticated) return;
    const pending = sessionStorage.getItem(PENDING_PROMPT_KEY);
    if (!pending) return;
    // Remove first so it runs only once (StrictMode runs effects twice)
    sessionStorage.removeItem(PENDING_PROMPT_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from sessionStorage
    createProject(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

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
            placeholder={placeholder}
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
