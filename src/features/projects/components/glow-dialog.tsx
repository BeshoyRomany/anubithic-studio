"use client";

import { Poppins } from "next/font/google";

import { cn } from "@/lib/utils";
import { ProBadge } from "@/components/pro-badge";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const font = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// #region Design notes
// Shared shell for the home screen dialogs (New project, Import from GitHub)
// so they match the animated home backdrop (projects-background.tsx): a dark
// glass card wrapped in a 1px border that is a slowly rotating gold→white
// conic gradient (gold→bronze in light theme), with a soft gold glow behind it. The shadcn DialogContent is
// made transparent/borderless so only our card shows.
// #endregion

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
}

// The card on its own, so it can also be placed inline on a page (e.g. the
// home screen prompt) and not only inside a dialog.
export const GlowCard = ({ children, className }: GlowCardProps) => (
  <div className={cn("relative", className)}>
    {/* Glow */}
    <div className="pointer-events-none absolute -inset-6 rounded-3xl bg-logo/10 blur-2xl" />

    {/* Soft black shadow (outside overflow-hidden, or it would be clipped) */}
    <div className="relative overflow-hidden rounded-2xl p-px shadow-[0_10px_30px_-10px_rgb(0_0_0/0.25)] dark:shadow-[0_12px_36px_-8px_rgb(0_0_0/0.6)]">
      {/* Rotating gradient border */}
      <div className="absolute inset-[-150%] animate-[spin_8s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,var(--color-logo)_70deg,transparent_140deg,transparent_180deg,var(--glow-sheen)_250deg,transparent_320deg)] motion-reduce:animate-none" />

      <div className="relative rounded-[15px] bg-[oklch(0.99_0.006_85)]/90 backdrop-blur-xl dark:bg-[oklch(0.14_0.012_264)]/95">
        {children}
      </div>
    </div>
  </div>
);

interface GlowDialogContentProps {
  children: React.ReactNode;
  className?: string;
}

export const GlowDialogContent = ({
  children,
  className,
}: GlowDialogContentProps) => (
  <DialogContent
    showCloseButton={false}
    className={cn(
      "sm:max-w-xl p-0 gap-0 border-0 bg-transparent shadow-none",
      className,
    )}
  >
    <GlowCard>{children}</GlowCard>
  </DialogContent>
);

interface GlowDialogHeaderProps {
  title: string;
  description: string;
  // Shows the golden PRO pill after the title (Pro-plan features)
  pro?: boolean;
  // Defaults to the Anubithic mark in the logo color.
  icon?: React.ReactNode;
}

export const GlowDialogHeader = ({
  title,
  description,
  icon,
  pro,
}: GlowDialogHeaderProps) => (
  <DialogHeader className="gap-1 px-5 pt-5 text-left">
    <DialogTitle
      className={cn(
        "flex items-center gap-2 text-base font-medium",
        font.className,
      )}
    >
      {icon ?? (
        // The SVG ships with a baked-in grey fill, so it's used as a mask
        // over a `bg-logo` box to paint it in the logo color.
        <span
          aria-hidden
          className="size-7 shrink-0 bg-logo [mask:url(/anubithic-thinking.svg)_center/contain_no-repeat]"
        />
      )}
      {title}
      {pro && <ProBadge />}
    </DialogTitle>
    <DialogDescription className="text-xs">{description}</DialogDescription>
  </DialogHeader>
);
