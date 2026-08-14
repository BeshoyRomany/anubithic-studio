"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthLoadingView } from "@/features/auth/components/auth-loading-view";
import { UnauthenticatedView } from "@/features/auth/components/unauthenticated-view";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import {
  Authenticated,
  AuthLoading,
  ConvexReactClient,
  Unauthenticated,
} from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
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
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {/* The whole entire app should rendered when im only authenticated */}
            <Authenticated>{children}</Authenticated>
            {/* The whole entire app should rendered when im only authenticated */}
            <Unauthenticated>
              <UnauthenticatedView />
            </Unauthenticated>
            <AuthLoading>
              <AuthLoadingView />
            </AuthLoading>
          </TooltipProvider>
        </ThemeProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
