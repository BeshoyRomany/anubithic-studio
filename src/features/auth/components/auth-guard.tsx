"use client";

import { ReactNode } from "react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { AuthLoadingView } from "./auth-loading-view";
import { UnauthenticatedView } from "./unauthenticated-view";

// Wraps protected routes only, so the home page stays public.
export const AuthGuard = ({ children }: { children: ReactNode }) => {
  return (
    <>
      <Authenticated>{children}</Authenticated>
      <Unauthenticated>
        <UnauthenticatedView />
      </Unauthenticated>
      <AuthLoading>
        <AuthLoadingView />
      </AuthLoading>
    </>
  );
};
