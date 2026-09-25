import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { string } from "zod/v4";

export default defineSchema({
  //#region Users table
  //Clerk stays the source of truth for authentication; this table is our own
  //copy of "who exists" so other users can be found by email (team invites)
  //and shown by name/avatar (presence).
  //
  //"clerkId" is the canonical user id across the app — it's the same value as
  //Clerk's "identity.subject", which is what "projects.ownerId" already stores.
  //So "project.ownerId === user.clerkId" links a project to its owner row.
  //
  //Rows are upserted by "users.store" every time a user signs in (see
  //"UserSync" in src/features/auth/components/user-sync.tsx).
  //#endregion
  users: defineTable({
    clerkId: v.string(),
    //Always stored lowercased so invite lookups are case-insensitive
    email: v.string(),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    //Pro plan snapshot from the Clerk token, refreshed on every "users.store".
    //Lets admins/contributors know whether the project OWNER's plan includes
    //team collaboration (they can't read the owner's token).
    isPro: v.optional(v.boolean()),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  //Projects table
  projects: defineTable({
    name: v.string(),
    ownerId: v.string(),
    updatedAt: v.number(),
    importStatus: v.optional(
      v.union(
        v.literal("importing"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
    exportStatus: v.optional(
      v.union(
        v.literal("exporting"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled"),
      ),
    ),
    exportRepoUrl: v.optional(v.string()),
    //webContainer settings generate by AI for the first time - after generation
    settings: v.optional(
      v.object({
        installCommand: v.optional(v.string()), //npm install //yarn install
        devCommand: v.optional(v.string()), //npm run dev
      }),
    ),
  }).index("by_owner", ["ownerId"]),

  //#region Project contributors table (team collaboration)
  //One row per person who was given access to someone else's project.
  //The owner is NOT stored here — "projects.ownerId" already says who owns it.
  //
  //An invite is addressed to an EMAIL, because the person may not have signed
  //up yet:
  //  - "pending": invite exists, "userId" is empty (nobody claimed it yet)
  //  - "active":  "userId" is set to the invitee's Clerk id → they have access
  //
  //Access checks only ever trust "active" rows (see "getProjectRole" in
  //convex/auth.ts), so a pending invite grants nothing.
  //#endregion
  projectContributors: defineTable({
    projectId: v.id("projects"),
    //Lowercased, same as "users.email", so the two can be matched
    email: v.string(),
    //Clerk id of the member, set once the invite is claimed
    userId: v.optional(v.string()),
    //"admin" = contributor + rename/export/manage contributors (see
    //convex/auth.ts). Only the owner can grant or revoke "admin".
    role: v.union(v.literal("admin"), v.literal("contributor")),
    status: v.union(v.literal("pending"), v.literal("active")),
    //Clerk id of whoever sent the invite (the owner)
    invitedBy: v.string(),
    updatedAt: v.number(),
  })
    //List a project's team
    .index("by_project", ["projectId"])
    //"Is this user a member of this project?" — the access check
    .index("by_project_user", ["projectId", "userId"])
    //"Was this email already invited to this project?"
    .index("by_project_email", ["projectId", "email"])
    //"Which projects are shared with me?" — the projects list
    .index("by_user_status", ["userId", "status"])
    //Claim pending invites when the invitee signs in
    .index("by_email_status", ["email", "status"]),

  //#region Presence table (who is in the project right now, and on which file)
  //One row per (project, user), upserted by "presence.heartbeat" every few
  //seconds while the project is open, and deleted by "presence.leave" when the
  //user closes it.
  //
  //A tab that dies without saying goodbye (crash, lost network) just stops
  //heartbeating — the client treats rows older than a few heartbeats as
  //offline, so nothing has to clean them up for the UI to be right.
  //#endregion
  presence: defineTable({
    projectId: v.id("projects"),
    //Clerk id (same as users.clerkId)
    userId: v.string(),
    //The file in the user's active editor tab (none → no file open)
    fileId: v.optional(v.id("files")),
    lastSeenAt: v.number(),
  })
    //Everyone in a project (the status bar)
    .index("by_project", ["projectId"])
    //My own row (heartbeat upsert / leave)
    .index("by_project_user", ["projectId", "userId"]),

  //Files table
  files: defineTable({
    // ID of the project this file or folder belongs to
    projectId: v.id("projects"),
    // ID of the parent folder if nested (undefined if it's in the root)
    parentId: v.optional(v.id("files")),
    // Name of the file or folder
    name: v.string(),
    // Type of the item, whether it's a file or a folder
    type: v.union(v.literal("file"), v.literal("folder")),
    // Text content of the file (optional, used if the file is text-based)
    content: v.optional(v.string()),
    // Reference ID to Convex File Storage if the file is binary/uploaded media
    storageId: v.optional(v.id("_storage")),
    // Timestamp of the last update
    updatedAt: v.number(),
  })
    // Index to fetch all files and roots belonging to a specific project
    .index("by_project", ["projectId"])
    // Index to fetch contents of a specific folder (files where parentId matches)
    .index("by_parent", ["parentId"])
    // Composite index to efficiently fetch files/folders inside a specific parent folder within a specific project
    .index("by_project_parent", ["projectId", "parentId"]),

  conversations: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    //adding project id to fetch messages belong to the project directly without fetching "conversation"
    projectId: v.id("projects"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    status: v.optional(
      v.union(
        v.literal("processing"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
    ),
    steps: v.optional(
      v.array(
        v.object({
          id: v.string(),
          label: v.string(), // "Scanning project files..."
          status: v.union(
            v.literal("running"),
            v.literal("done"),
            v.literal("error"),
          ),
          startedAt: v.number(),
          completedAt: v.optional(v.number()),
        }),
      ),
    ),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_project_status", ["projectId", "status"]),
});
