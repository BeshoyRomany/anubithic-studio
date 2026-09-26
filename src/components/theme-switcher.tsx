"use client";

import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import { motion } from "motion/react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const;

type ThemeOption = (typeof OPTIONS)[number]["value"];

//Theme is only known on the client, so render a neutral pill until mounted
const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

//Grows the new theme as a circle from the clicked button
const switchWithReveal = (
  apply: () => void,
  origin: { x: number; y: number },
  toDark: boolean,
) => {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  //Same resolved theme (e.g. System → Dark on a dark OS): nothing to reveal
  const unchanged =
    document.documentElement.classList.contains("dark") === toDark;
  if (!document.startViewTransition || reducedMotion || unchanged) {
    apply();
    return;
  }

  const radius = Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y),
  );

  //Origin for the CSS reveal animation in globals.css
  const root = document.documentElement;
  root.style.setProperty("--reveal-x", `${origin.x}px`);
  root.style.setProperty("--reveal-y", `${origin.y}px`);
  root.style.setProperty("--reveal-r", `${radius}px`);

  //flushSync so the DOM (and theme class) is updated before the snapshot
  document.startViewTransition(() => flushSync(apply));
};

interface ThemeSwitcherProps {
  //"sm" fits dense toolbars like the IDE navbar
  size?: "default" | "sm";
  className?: string;
}

export const ThemeSwitcher = ({
  size = "default",
  className,
}: ThemeSwitcherProps) => {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const active = mounted ? (theme as ThemeOption) : undefined;

  const handleSelect = (
    value: ThemeOption,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (value === theme) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const toDark =
      value === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
        : value === "dark";
    switchWithReveal(
      () => setTheme(value),
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      toDark,
    );
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "relative flex items-center gap-0.5 rounded-full border border-foreground/10 bg-white/55 dark:bg-foreground/3 p-1 backdrop-blur-sm",
        size === "sm" && "p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const isActive = active === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            title={label}
            onClick={(e) => handleSelect(value, e)}
            className={cn(
              size === "sm" ? "size-6" : "size-7",
              "relative flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-logo/50 focus-visible:outline-none",
              isActive && "text-logo hover:text-logo",
            )}
          >
            {/* Shared layoutId → the thumb slides between options */}
            {isActive && (
              <motion.span
                layoutId="theme-switcher-thumb"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-full border border-logo/40 bg-logo/15 shadow-[0_0_14px_-2px_var(--color-logo)]"
              />
            )}
            <motion.span
              key={isActive ? "on" : "off"}
              initial={isActive ? { rotate: -90, scale: 0.6 } : false}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className="relative"
            >
              <Icon className="size-3.5" />
            </motion.span>
          </button>
        );
      })}
    </div>
  );
};
