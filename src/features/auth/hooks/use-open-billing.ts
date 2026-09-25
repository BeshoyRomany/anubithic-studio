import { useCallback } from "react";
import { useClerk } from "@clerk/nextjs";

//#region useOpenBilling
//Every "Upgrade" action (GitHub import/export, team collaboration) opens the
//Clerk user profile modal directly on its Billing page, where the user can
//switch plans — instead of on "Profile details", which made them hunt for it.
//
//"__experimental_startPath" is Clerk's (experimental) option for the page the
//modal opens on; it's kept in this one hook so a future rename in Clerk is a
//one-line fix. Other openUserProfile() calls (e.g. "Connect GitHub") still
//open on Profile, where connected accounts live.
//#endregion
export const useOpenBilling = () => {
  const { openUserProfile } = useClerk();

  return useCallback(
    () => openUserProfile({ __experimental_startPath: "/billing" }),
    [openUserProfile],
  );
};
