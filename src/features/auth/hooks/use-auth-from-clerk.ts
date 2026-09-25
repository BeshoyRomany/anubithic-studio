import { useCallback, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";

//#region useAuthFromClerk (Clerk → Convex auth bridge, plan-aware)
//Same as the hook inside convex/react-clerk's <ConvexProviderWithClerk>, with
//ONE difference: the plan claim ("pla") is part of the dependencies.
//
//Why: Convex only asks Clerk for a new token when "fetchAccessToken" changes.
//Upstream rebuilds it on org/session changes only, so after an upgrade (or a
//cancelled / expired trial) Convex kept using the token with the OLD plan
//until a page reload — the "Collaborate · PRO" button stayed locked.
//
//Clerk refreshes "sessionClaims" by itself: right away after its checkout
//flow, and within ~1 minute for changes made elsewhere (dashboard, trial end).
//When "pla" changes we hand Convex a new fetchAccessToken → it re-
//authenticates → every query re-runs with the new plan, no reload.
//
//Upstream's own comment on those deps: "Anything else from the JWT Clerk
//wants to be reactive goes here too."
//#endregion
export const useAuthFromClerk = () => {
  const {
    isLoaded,
    isSignedIn,
    getToken,
    orgId,
    orgRole,
    sessionId,
    sessionClaims,
  } = useAuth();

  //The native Clerk↔Convex integration puts aud "convex" on the session
  //token itself; older setups use a JWT template named "convex"
  const usesSessionToken = sessionClaims?.aud === "convex";
  const plan = sessionClaims?.pla;

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      try {
        return usesSessionToken
          ? await getToken({ skipCache: forceRefreshToken })
          : await getToken({
              template: "convex",
              skipCache: forceRefreshToken,
            });
      } catch {
        return null;
      }
    },
    //getToken is left out on purpose (same as upstream): it isn't guaranteed
    //to be stable, and a new function here means "re-authenticate"
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, orgRole, sessionId, usesSessionToken, plan],
  );

  return useMemo(
    () => ({
      isLoading: !isLoaded,
      isAuthenticated: isSignedIn ?? false,
      fetchAccessToken,
    }),
    [isLoaded, isSignedIn, fetchAccessToken],
  );
};
