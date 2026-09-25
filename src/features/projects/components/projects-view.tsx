"use client";

import { useEffect, useState } from "react";
import { Authenticated, Unauthenticated } from "convex/react";
import { SignInButton, SignOutButton } from "@clerk/nextjs";
import { Poppins } from "next/font/google";
import { cn } from "@/lib/utils";
import { ProBadge } from "@/components/pro-badge";
import { FaGithub } from "react-icons/fa";
import { FolderOpenIcon, LogOutIcon, RocketIcon } from "lucide-react";
import { ProjectsCommandDialog } from "./projects-command-dialog";
import { ImportGithubDialog } from "./import-github-dialog";
import { ProjectsBackground } from "./projects-background";
import { GlowCard } from "./glow-dialog";
import { NewProjectPrompt } from "./new-project-prompt";
import { RecentProjectsGrid } from "./recent-projects-grid";
import { PendingInvites } from "./pending-invites";
import { ShortcutKeys } from "./shortcut-keys";

const font = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const PROMPT_ID = "home-prompt";

const AUTH_BUTTON_CLASS =
  "flex items-center gap-2 rounded-full border border-white/10 bg-white/3 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:border-logo/50 hover:text-foreground";

export const ProjectsView = () => {
  const [commandDialogOpen, setCommandDialogOpen] = useState<boolean>(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandDialogOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setImportDialogOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        const prompt = document.getElementById(PROMPT_ID);
        prompt?.scrollIntoView({ behavior: "smooth", block: "center" });
        prompt?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {/* These dialogs query Convex, so render them only when signed in */}
      <Authenticated>
        <ProjectsCommandDialog
          open={commandDialogOpen}
          onOpenChange={setCommandDialogOpen}
        />
        <ImportGithubDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
        />
      </Authenticated>
      <ProjectsBackground />

      {/* Top-right auth action: sign in when signed out, log out when signed in */}
      <div className="fixed top-4 right-4 z-20">
        <Unauthenticated>
          <SignInButton mode="modal" forceRedirectUrl="/">
            <button className={AUTH_BUTTON_CLASS}>
              <RocketIcon className="size-4" />
              Start building
            </button>
          </SignInButton>
        </Unauthenticated>
        <Authenticated>
          <SignOutButton redirectUrl="/">
            <button className={AUTH_BUTTON_CLASS}>
              <LogOutIcon className="size-4" />
              Log out
            </button>
          </SignOutButton>
        </Authenticated>
      </div>

      <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-8 md:py-10">
        <div className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-6">
          {/* Brand */}
          <div className={cn("flex items-center gap-3", font.className)}>
            <img
              src={"/logo.svg"}
              alt="Anubithic"
              className="size-9 drop-shadow-[0_0_18px_rgba(212,170,90,0.35)]"
            />
            <span className="text-lg font-semibold">
              Anubithic/
              <span className="font-mono font-light text-logo">Studio</span>
            </span>
          </div>

          {/* Headline */}
          <div className="flex flex-col items-center gap-2 text-center">
            <h1
              className={cn(
                "text-3xl font-semibold tracking-tight md:text-4xl",
                font.className,
              )}
            >
              What will you{" "}
              <span className="bg-linear-to-r from-logo via-amber-200 to-logo bg-clip-text text-transparent">
                build
              </span>{" "}
              today?
            </h1>
            <p className="max-w-lg text-sm text-muted-foreground">
              Prompt full projects into existence, refine every line of code,
              and preview instantly, all in your browser.
            </p>
          </div>

          {/* Prompt */}
          <GlowCard className="w-full">
            <NewProjectPrompt textareaId={PROMPT_ID} />
          </GlowCard>

          {/* Secondary actions + recent projects (signed-in users only) */}
          <Authenticated>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => setImportDialogOpen(true)}
                className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/3 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:border-logo/50 hover:text-foreground"
              >
                <FaGithub className="size-4" />
                Import from GitHub
                <ProBadge />
                <ShortcutKeys keys={["I"]} />
              </button>
              <button
                onClick={() => setCommandDialogOpen(true)}
                className="group flex items-center gap-2 rounded-full border border-white/10 bg-white/3 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:border-logo/50 hover:text-foreground"
              >
                <FolderOpenIcon className="size-4" />
                All projects
                <ShortcutKeys keys={["K"]} />
              </button>
            </div>

            {/* Team invites waiting for my answer (renders nothing if none) */}
            <PendingInvites />

            <RecentProjectsGrid onViewAll={() => setCommandDialogOpen(true)} />
          </Authenticated>
        </div>
      </main>
    </>
  );
};
