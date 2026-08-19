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
});
