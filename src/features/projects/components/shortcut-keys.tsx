"use client";

import { cn } from "@/lib/utils";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useIsMac } from "@/hooks/useIsMac";

interface ShortcutKeysProps {
  keys: string[];
  mod?: boolean;
  className?: string;
}

export const ShortcutKeys = ({
  keys,
  mod = true,
  className,
}: ShortcutKeysProps) => {
  const isMac = useIsMac();
  const allKeys = mod ? [isMac ? "⌘" : "Ctrl", ...keys] : keys;

  return (
    <KbdGroup className={cn("gap-0.5", className)}>
      {allKeys.map((key) => (
        <Kbd
          key={key}
          className={cn(
            "h-5 min-w-5 rounded-md border border-b-2 border-white/10 border-b-white/15 bg-white/5 px-1.5 font-mono text-[10px] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors",
            "group-hover:border-logo/40 group-hover:border-b-logo/60 group-hover:bg-logo/10 group-hover:text-logo",
            "group-focus-visible:border-logo/40 group-focus-visible:text-logo",
          )}
        >
          {key}
        </Kbd>
      ))}
    </KbdGroup>
  );
};
