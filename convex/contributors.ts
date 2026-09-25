// Project contributors functions (list, invite, remove)

import { v } from "convex/values";
import { mutation, MutationCtx, query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { UserIdentity } from "convex/server";
import { hasProPlan, verifyAuth, verifyProjectAccess } from "./auth";

//Deliberately loose: just "something@something.tld". Real validation happens
//when the invitee signs in with Clerk — only that exact address can claim it.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

//#region Pro gate (team collaboration is a Pro feature)
//Tied to the project OWNER's plan — whoever pays unlocks it for their project,
//so a free admin on a Pro owner's project can still invite.
//  - caller IS the owner → read their plan straight from the token (always
//    fresh: unlocks as soon as Convex gets the post-upgrade token, ~1 min)
//  - caller is an admin/contributor → the owner's "users.isPro" snapshot,
//    refreshed whenever the owner opens the app
//Only GROWING the team is gated (invite, change roles). Existing members keep
//their access if the owner downgrades, and removing people always works.
//#endregion
const PRO_REQUIRED_MESSAGE = "Team collaboration requires the Pro plan";

const isTeamEnabled = async (
  ctx: QueryCtx | MutationCtx,
  project: Doc<"projects">,
  identity: UserIdentity,
) => {
  if (project.ownerId === identity.subject) {
    return hasProPlan(identity);
  }

  const owner = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", project.ownerId))
    .unique();

  return owner?.isPro === true;
};

//#region list (the Team popover)
//Anyone on the project (owner, admin or contributor) can see who else is on it.
//
//Returns the owner first, then every contributor row (pending + active),
//each joined with its "users" row for name/avatar. Pending invites may have no
//user yet (the person hasn't signed up), so the UI falls back to the email.
//
//"viewerRole" / "viewerId" tell the UI which controls to show:
//  owner → invite (as admin or contributor), change roles, remove anyone
//  admin → invite contributors, remove contributors, leave
//  contributor → leave
//#endregion
export const list = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const { identity, project, role } = await verifyProjectAccess(
      ctx,
      args.projectId,
    );

    const owner = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", project.ownerId))
      .unique();

    const rows = await ctx.db
      .query("projectContributors")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const contributors = await Promise.all(
      rows.map(async (row) => {
        const userId = row.userId;
        const user = userId
          ? await ctx.db
              .query("users")
              .withIndex("by_clerk_id", (q) => q.eq("clerkId", userId))
              .unique()
          : null;

        return {
          _id: row._id,
          email: row.email,
          status: row.status,
          role: row.role,
          userId: row.userId,
          name: user?.name,
          imageUrl: user?.imageUrl,
        };
      }),
    );

    return {
      viewerId: identity.subject,
      viewerRole: role,
      //false → the UI shows the upgrade prompt instead of the invite form
      teamEnabled: await isTeamEnabled(ctx, project, identity),
      owner: {
        userId: project.ownerId,
        email: owner?.email,
        name: owner?.name,
        imageUrl: owner?.imageUrl,
      },
      //Active before pending, admins before contributors; ties keep the
      //index order (oldest invite first)
      contributors: contributors.sort((a, b) => {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
        return 0;
      }),
    };
  },
});

//#region invite
//Owner or admin. Only the OWNER may invite someone straight in as "admin" —
//an admin can only bring in contributors. The invite is addressed to an email and ALWAYS starts "pending",
//even if that email already has an account: nobody is added to a project
//without agreeing to it. The invitee accepts or declines either
//  - on their home page ("myInvites" → <PendingInvites>), or
//  - through the invite link /invites/<inviteId> (see "getInvite").
//Until then the row grants nothing (getProjectRole only trusts "active").
//#endregion
export const invite = mutation({
  args: {
    projectId: v.id("projects"),
    email: v.string(),
    //Defaults to "contributor"
    role: v.optional(v.union(v.literal("admin"), v.literal("contributor"))),
  },
  handler: async (ctx, args) => {
    const { identity, project, role } = await verifyProjectAccess(
      ctx,
      args.projectId,
      { minimum: "admin" },
    );

    if (!(await isTeamEnabled(ctx, project, identity))) {
      throw new Error(PRO_REQUIRED_MESSAGE);
    }

    const inviteRole = args.role ?? "contributor";

    if (inviteRole === "admin" && role !== "owner") {
      throw new Error("Only the project owner can invite admins");
    }

    const email = args.email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(email)) {
      throw new Error("Please enter a valid email address");
    }

    if (identity.email?.toLowerCase() === email) {
      throw new Error("You're already on this team");
    }

    const owner = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", project.ownerId))
      .unique();

    if (owner?.email === email) {
      throw new Error("That's the project owner — they're already on the team");
    }

    const alreadyInvited = await ctx.db
      .query("projectContributors")
      .withIndex("by_project_email", (q) =>
        q.eq("projectId", project._id).eq("email", email),
      )
      .first();

    if (alreadyInvited) {
      throw new Error("This email is already on the team");
    }

    //No userId yet: it's filled in by whoever ACCEPTS with this email
    const inviteId = await ctx.db.insert("projectContributors", {
      projectId: project._id,
      email,
      role: inviteRole,
      status: "pending",
      invitedBy: identity.subject,
      updatedAt: Date.now(),
    });

    return inviteId;
  },
});

//#region Invitee side (accept / decline)
//An invite belongs to whoever proves they own its email address. The proof is
//the "email" claim in the verified Clerk token — never a client argument —
//so an invite link that gets forwarded (or guessed) is useless to anyone else.
//#endregion
const getMyEmail = (identity: { email?: string }) => {
  if (!identity.email) {
    throw new Error("Your account has no email address");
  }
  return identity.email.toLowerCase();
};

//Load a pending invite and make sure it's addressed to the caller
const getMyPendingInvite = async (
  ctx: MutationCtx,
  inviteId: Id<"projectContributors">,
) => {
  const identity = await verifyAuth(ctx);
  const invite = await ctx.db.get("projectContributors", inviteId);

  if (
    !invite ||
    invite.status !== "pending" ||
    invite.email !== getMyEmail(identity)
  ) {
    throw new Error("This invite doesn't exist or isn't for your account");
  }

  return { identity, invite };
};

//Joins an invite with the project name and the inviter's profile for display
const describeInvite = async (
  ctx: QueryCtx,
  invite: Doc<"projectContributors">,
) => {
  const project = await ctx.db.get("projects", invite.projectId);
  if (!project) return null;

  const inviter = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", invite.invitedBy))
    .unique();

  return {
    _id: invite._id,
    projectId: project._id,
    projectName: project.name,
    role: invite.role,
    invitedAt: invite._creationTime,
    inviterName: inviter?.name ?? inviter?.email ?? "Someone",
    inviterImageUrl: inviter?.imageUrl,
  };
};

//All pending invites addressed to me (home page list, live)
export const myInvites = query({
  args: {},
  handler: async (ctx) => {
    const identity = await verifyAuth(ctx);
    const email = getMyEmail(identity);

    const invites = await ctx.db
      .query("projectContributors")
      .withIndex("by_email_status", (q) =>
        q.eq("email", email).eq("status", "pending"),
      )
      .collect();

    const described = await Promise.all(
      invites.map((invite) => describeInvite(ctx, invite)),
    );
    //Drop invites whose project was deleted in the meantime
    return described.filter((invite) => invite !== null);
  },
});

//#region getInvite (the /invites/<inviteId> page)
//Never throws for a bad link — returns a "state" the page can explain.
//Project details are only revealed to the account the invite is addressed to.
//#endregion
export const getInvite = query({
  args: {
    inviteId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);
    const email = getMyEmail(identity);

    //The id comes straight from the URL: validate it instead of letting the
    //argument validator throw on garbage
    const inviteId = ctx.db.normalizeId("projectContributors", args.inviteId);
    const invite = inviteId
      ? await ctx.db.get("projectContributors", inviteId)
      : null;

    if (!invite) {
      return { state: "not_found" as const };
    }

    if (invite.email !== email) {
      return { state: "wrong_account" as const, email };
    }

    if (invite.status === "active") {
      return { state: "accepted" as const, projectId: invite.projectId };
    }

    const details = await describeInvite(ctx, invite);
    if (!details) {
      return { state: "not_found" as const };
    }

    return { state: "pending" as const, invite: details };
  },
});

export const accept = mutation({
  args: {
    inviteId: v.id("projectContributors"),
  },
  handler: async (ctx, args) => {
    const { identity, invite } = await getMyPendingInvite(ctx, args.inviteId);

    const project = await ctx.db.get("projects", invite.projectId);
    if (!project) {
      throw new Error("This project no longer exists");
    }

    //Attaching the userId is what turns the invite into real access
    await ctx.db.patch("projectContributors", invite._id, {
      userId: identity.subject,
      status: "active",
      updatedAt: Date.now(),
    });

    return invite.projectId;
  },
});

//Declining simply deletes the invite; the owner sees it vanish from the team
export const decline = mutation({
  args: {
    inviteId: v.id("projectContributors"),
  },
  handler: async (ctx, args) => {
    const { invite } = await getMyPendingInvite(ctx, args.inviteId);
    await ctx.db.delete("projectContributors", invite._id);
  },
});

//#region remove (revoke or leave)
//Who may delete a contributor row:
//  - the OWNER → anyone (revoke access or cancel a pending invite)
//  - an ADMIN  → contributors only; removing an admin is a stronger version of
//                demoting one, and only the owner manages admins
//  - the person themselves → "leave project"
//The owner can never be removed: they aren't a row in this table at all.
//Access is re-checked on every query, so the removed user's open tabs lose the
//project as soon as this commits (their queries start throwing "Unauthorized").
//#endregion
export const remove = mutation({
  args: {
    contributorId: v.id("projectContributors"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("projectContributors", args.contributorId);

    if (!row) {
      throw new Error("Contributor not found");
    }

    const { identity, role } = await verifyProjectAccess(ctx, row.projectId);

    const isSelf = row.userId === identity.subject;
    const canRemove =
      isSelf ||
      role === "owner" ||
      (role === "admin" && row.role === "contributor");

    if (!canRemove) {
      throw new Error(
        row.role === "admin"
          ? "Only the project owner can remove an admin"
          : "Only the project owner or an admin can do this",
      );
    }

    await ctx.db.delete("projectContributors", row._id);

    //Drop them from the presence bar right away instead of waiting for their
    //row to go stale (their next heartbeat will be rejected anyway)
    const removedUserId = row.userId;
    if (removedUserId) {
      const presence = await ctx.db
        .query("presence")
        .withIndex("by_project_user", (q) =>
          q.eq("projectId", row.projectId).eq("userId", removedUserId),
        )
        .first();

      if (presence) {
        await ctx.db.delete("presence", presence._id);
      }
    }
  },
});

//#region setRole (promote / demote)
//Owner only: make a contributor an admin, or turn an admin back into a
//contributor. Works on pending invites too (changes the role they'll get when
//they accept). Takes effect immediately — every access check reads the row.
//#endregion
export const setRole = mutation({
  args: {
    contributorId: v.id("projectContributors"),
    role: v.union(v.literal("admin"), v.literal("contributor")),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("projectContributors", args.contributorId);

    if (!row) {
      throw new Error("Contributor not found");
    }

    const { identity, project } = await verifyProjectAccess(
      ctx,
      row.projectId,
      { minimum: "owner" },
    );

    if (!(await isTeamEnabled(ctx, project, identity))) {
      throw new Error(PRO_REQUIRED_MESSAGE);
    }

    await ctx.db.patch("projectContributors", row._id, {
      role: args.role,
      updatedAt: Date.now(),
    });
  },
});
