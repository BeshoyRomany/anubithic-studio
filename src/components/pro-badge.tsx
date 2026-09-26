"use client";

import { useAuth } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

//#region ProBadge
//The golden "PRO" pill next to every feature that needs the Pro plan
//(Clerk Billing): GitHub import, GitHub export, team collaboration.
//
//An upsell, so it's shown ONLY to users without Pro: once they subscribe, it
//disappears everywhere (and comes back after a downgrade) with no reload —
//Clerk's has() reads the live session claims, which Clerk refreshes after
//checkout and on its periodic token refresh.
//Hidden until Clerk has loaded, so Pro users never see it flash in.
//
//One exception, handled by the caller: the Team button/heading shows it to the
//project OWNER only — collaboration runs on the owner's plan, so a free
//admin/contributor on someone else's project has nothing to upgrade.
//
//It's a label, not a gate — the server enforces the plan (route handlers via
//has({ plan: "pro" }), Convex via hasProPlan).
//
//Gold = the brand "logo" color, the same gradient as "build" in the home
//headline.
//#endregion
export const ProBadge = ({ className }: { className?: string }) => {
  const { isLoaded, has } = useAuth();

  if (!isLoaded || has?.({ plan: "pro" })) return null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-logo/40 bg-logo/10 px-1.5 py-px text-[10px] leading-none font-semibold tracking-wide",
        className,
      )}
    >
      <span className="bg-linear-to-r from-logo via-amber-500 to-logo dark:via-amber-200 bg-clip-text text-transparent">
        PRO
      </span>
    </span>
  );
};
