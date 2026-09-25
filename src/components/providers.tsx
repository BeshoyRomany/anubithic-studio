"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { UserSync } from "@/features/auth/components/user-sync";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useAuthFromClerk } from "@/features/auth/hooks/use-auth-from-clerk";
import { ReactNode } from "react";

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL in your .env file");
}

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL);

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        theme: dark,
      }}
    >
      {/* ConvexProviderWithClerk, but re-authenticating when the Clerk plan
          changes too, so Pro features lock/unlock without a reload */}
      <ConvexProviderWithAuth client={convex} useAuth={useAuthFromClerk}>
        {/* Keeps the Convex "users" row in sync with the signed-in Clerk user */}
        <UserSync />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {/* Auth gate moved to AuthGuard (protected routes only) */}
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </ConvexProviderWithAuth>
    </ClerkProvider>
  );
}
