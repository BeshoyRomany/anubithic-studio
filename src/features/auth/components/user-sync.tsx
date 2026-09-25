"use client";

import { useEffect } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "../../../../convex/_generated/api";

//#region UserSync
//Renders nothing — it only keeps our Convex "users" row in sync with Clerk.
//
//Mounted once in <Providers> (not in AuthGuard) so it runs on every page,
//including the public home page, as soon as a user signs in.
//
//We wait for "useConvexAuth().isAuthenticated" rather than Clerk's own
//"isSignedIn": Clerk can be signed in a moment before Convex has received the
//JWT, and calling "store" in that gap would throw "Unauthenticated".
//
//Re-runs when the Clerk user id changes (sign out → sign in as someone else)
//and when the plan in CONVEX's token changes (upgrade/downgrade, see
//"users.tokenIsPro"), so "users.isPro" — which teammates rely on to know if
//the owner's plan includes collaboration — follows the subscription live.
//#endregion
export const UserSync = () => {
  const { isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  //undefined while loading / signed out ("skip"), then true/false
  const tokenIsPro = useQuery(
    api.users.tokenIsPro,
    isAuthenticated ? {} : "skip",
  );
  const storeUser = useMutation(api.users.store);

  useEffect(() => {
    if (!isAuthenticated) return;

    storeUser().catch((error) => {
      console.error("Failed to sync user", error);
    });
  }, [isAuthenticated, user?.id, tokenIsPro, storeUser]);

  return null;
};
