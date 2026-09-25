// Authentication & authorization helpers
import { UserIdentity } from "convex/server";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

export const verifyAuth = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated");
  }
  return identity;
};

//#region hasProPlan (Clerk Billing)
//Clerk puts the user's active plans in the session token's "pla" claim as a
//comma-separated list of "scope:slug" entries, e.g. "u:pro" or
//"u:free_user". Scope "u" = user plan, "o" = organization plan, "ou"/"uo" =
//both. This mirrors how Clerk's own has({ plan: "pro" }) reads it, so Convex
//and the Next.js route handlers agree on who is Pro.
//#endregion
export const hasProPlan = (identity: UserIdentity) => {
  const plans = identity.pla;
  if (typeof plans !== "string" || !plans) return false;

  return plans.split(",").some((entry) => {
    const [scope, slug] = entry.trim().split(":");
    return ["u", "ou", "uo"].includes(scope) && slug === "pro";
  });
};

//#region Project roles (team collaboration)
//"owner"       → project.ownerId matches the user. Can do everything, and is
//                the only one who can delete the project or hand out / take
//                back admin rights. Can never be removed (not a contributor row).
//"admin"       → ACTIVE "projectContributors" row with role "admin". Everything
//                a contributor can, plus rename, GitHub export and managing
//                contributors (invite / remove) — but not other admins.
//"contributor" → ACTIVE "projectContributors" row with role "contributor".
//                Reads and edits the code (files, conversations/agent,
//                preview settings), nothing project-level.
//null          → no access at all.
//
//Takes a plain Clerk user id (not an identity) so the server-side zone
//("system.getProjectRole", used by Next.js route handlers) can reuse it too.
//#endregion
export type ProjectRole = "owner" | "admin" | "contributor";

//Higher rank = more rights; "at least admin" = rank >= ROLE_RANK.admin
const ROLE_RANK: Record<ProjectRole, number> = {
  contributor: 1,
  admin: 2,
  owner: 3,
};

export const hasRoleAtLeast = (
  role: ProjectRole | null,
  minimum: ProjectRole,
) => role !== null && ROLE_RANK[role] >= ROLE_RANK[minimum];

export const getProjectRole = async (
  ctx: QueryCtx | MutationCtx,
  project: Doc<"projects">,
  userId: string,
): Promise<ProjectRole | null> => {
  if (project.ownerId === userId) {
    return "owner";
  }

  const membership = await ctx.db
    .query("projectContributors")
    .withIndex("by_project_user", (q) =>
      q.eq("projectId", project._id).eq("userId", userId),
    )
    .first();

  //A pending invite grants nothing — only accepted ("active") rows count
  return membership?.status === "active" ? membership.role : null;
};

//#region verifyProjectAccess
//The one access gate for every client-facing function that touches a project.
//It replaces the "project.ownerId !== identity.subject" check that used to be
//copy-pasted everywhere, so every team member gets in by default.
//
//Pass { minimum: "admin" } for project-level actions (rename, team
//management) and { minimum: "owner" } for the owner-only ones (delete the
//project, promote/demote admins).
//
//Returns the identity, the loaded project and the caller's role so the caller
//doesn't have to fetch them again.
//#endregion
export const verifyProjectAccess = async (
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  options: { minimum?: ProjectRole } = {},
) => {
  const identity = await verifyAuth(ctx);
  const project = await ctx.db.get("projects", projectId);

  if (!project) {
    throw new Error("Project not found!");
  }

  const role = await getProjectRole(ctx, project, identity.subject);

  if (!role) {
    throw new Error("Unauthorized access to this project!");
  }

  if (options.minimum && !hasRoleAtLeast(role, options.minimum)) {
    throw new Error(
      options.minimum === "owner"
        ? "Only the project owner can do this"
        : "Only the project owner or an admin can do this",
    );
  }

  return { identity, project, role };
};
