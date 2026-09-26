"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { UserSync } from "@/features/auth/components/user-sync";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useAuthFromClerk } from "@/features/auth/hooks/use-auth-from-clerk";
import { useTheme } from "next-themes";
import { ReactNode } from "react";

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL in your .env file");
}

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL);

//Clerk modals follow the app theme
const ThemedClerkProvider = ({ children }: { children: ReactNode }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  return (
    <ClerkProvider appearance={{ theme: isDark ? dark : undefined }}>
      {children}
    </ClerkProvider>
  );
};

export default function Providers({ children }: { children: ReactNode }) {
  return (
    //Outside Clerk so Clerk's appearance can follow the theme
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ThemedClerkProvider>
        {/* ConvexProviderWithClerk, but re-authenticating when the Clerk plan
            changes too, so Pro features lock/unlock without a reload */}
        <ConvexProviderWithAuth client={convex} useAuth={useAuthFromClerk}>
          {/* Keeps the Convex "users" row in sync with the signed-in Clerk user */}
          <UserSync />
          {/* Auth gate moved to AuthGuard (protected routes only) */}
          <TooltipProvider>{children}</TooltipProvider>
        </ConvexProviderWithAuth>
      </ThemedClerkProvider>
    </ThemeProvider>
  );
}
