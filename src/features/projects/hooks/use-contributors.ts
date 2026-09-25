import { useMutation, useQuery } from "convex/react";
import { OptimisticLocalStore } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

//Owner + contributors of a project, plus the viewer's own role/id
export const useContributors = (projectId: Id<"projects">) => {
  return useQuery(api.contributors.list, { projectId });
};

export const useInviteContributor = () => {
  return useMutation(api.contributors.invite);
};

//Owner only: promote to admin / demote to contributor. Optimistic, so the
//badge flips instantly.
export const useSetContributorRole = (projectId: Id<"projects">) => {
  return useMutation(api.contributors.setRole).withOptimisticUpdate(
    (localStore, args) => {
      const team = localStore.getQuery(api.contributors.list, { projectId });

      if (team) {
        localStore.setQuery(
          api.contributors.list,
          { projectId },
          {
            ...team,
            contributors: team.contributors.map((contributor) =>
              contributor._id === args.contributorId
                ? { ...contributor, role: args.role }
                : contributor,
            ),
          },
        );
      }
    },
  );
};

//#region Invitee side
//Pending invites addressed to the signed-in user (home page), one invite by
//its link id (/invites/<inviteId>), and accept/decline.
//Accept/decline optimistically drop the invite from "myInvites" so the card
//disappears instantly.
//#endregion
export const useMyInvites = () => {
  return useQuery(api.contributors.myInvites);
};

export const useInvite = (inviteId: string) => {
  return useQuery(api.contributors.getInvite, { inviteId });
};

const dropFromMyInvites = (
  localStore: OptimisticLocalStore,
  inviteId: Id<"projectContributors">,
) => {
  const invites = localStore.getQuery(api.contributors.myInvites, {});
  if (invites) {
    localStore.setQuery(
      api.contributors.myInvites,
      {},
      invites.filter((invite) => invite._id !== inviteId),
    );
  }
};

export const useAcceptInvite = () => {
  return useMutation(api.contributors.accept).withOptimisticUpdate(
    (localStore, args) => dropFromMyInvites(localStore, args.inviteId),
  );
};

export const useDeclineInvite = () => {
  return useMutation(api.contributors.decline).withOptimisticUpdate(
    (localStore, args) => dropFromMyInvites(localStore, args.inviteId),
  );
};

//Removes a contributor row — the owner revoking access, or a contributor leaving.
//Optimistically drops the row so the list updates instantly.
export const useRemoveContributor = (projectId: Id<"projects">) => {
  return useMutation(api.contributors.remove).withOptimisticUpdate(
    (localStore, args) => {
      const team = localStore.getQuery(api.contributors.list, { projectId });

      if (team) {
        localStore.setQuery(
          api.contributors.list,
          { projectId },
          {
            ...team,
            contributors: team.contributors.filter(
              (contributor) => contributor._id !== args.contributorId,
            ),
          },
        );
      }
    },
  );
};
