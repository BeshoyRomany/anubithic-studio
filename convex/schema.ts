import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { string } from "zod/v4";

export default defineSchema({
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
