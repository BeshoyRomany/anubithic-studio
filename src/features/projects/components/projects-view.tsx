"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { ThemeSwitcher } from "@/components/theme-switcher";

const font = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const PROMPT_ID = "home-prompt";

const FOOTER_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/security", label: "Security" },
];

const AUTH_BUTTON_CLASS =
  "flex items-center gap-2 rounded-full border border-foreground/10 bg-white/55 dark:bg-foreground/3 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:border-logo/50 hover:text-foreground";

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

      {/* Top-right: theme switcher + auth action (sign in / log out) */}
      <div className="fixed top-4 right-4 z-20 flex items-center gap-2">
        <ThemeSwitcher />
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
              <span className="bg-linear-to-r from-logo via-amber-500 to-logo dark:via-amber-200 bg-clip-text text-transparent">
                build
              </span>{" "}
              today?
            </h1>
            <p className="max-w-lg text-sm text-muted-foreground">
              Prompt full projects into existence, refine every line with your
              team in real time, and preview instantly, all in your browser.
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
                className="group flex items-center gap-2 rounded-full border border-foreground/10 bg-white/55 dark:bg-foreground/3 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:border-logo/50 hover:text-foreground"
              >
                <FaGithub className="size-4" />
                Import from GitHub
                <ProBadge />
                <ShortcutKeys keys={["I"]} />
              </button>
              <button
                onClick={() => setCommandDialogOpen(true)}
                className="group flex items-center gap-2 rounded-full border border-foreground/10 bg-white/55 dark:bg-foreground/3 px-4 py-2 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:border-logo/50 hover:text-foreground"
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

        {/* Public legal pages, also linked from the GitHub Marketplace listing */}
        <footer className="relative z-10 mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {FOOTER_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {label}
            </Link>
          ))}
        </footer>
      </main>
    </>
  );
};
