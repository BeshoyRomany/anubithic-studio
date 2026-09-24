import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { verifyAuth } from "./auth";
import { Id, Doc } from "./_generated/dataModel";

// Get all files and folders inside one project
// #getFiles -> by projectId
export const getFiles = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    // Check who is logged in
    const identity = await verifyAuth(ctx);

    // Load the project
    const project = await ctx.db.get("projects", args.projectId);

    // Stop if the project does not exist
    if (!project) {
      throw new Error("Project not found!");
    }

    // Stop if this user does not own the project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    // Return all files under this project, newest first
    return await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

/*
  Why getFilePath works this way:

  - The full path is built on the fly instead of being saved on each file.
    This avoids having to update every child file when a parent folder
    gets renamed or moved.

  - Same security checks as the other functions: the user must be logged
    in, and the file and its project must exist and belong to that user.

  - How the path is built: start at the target file, then keep following
    parentId upward. Each file found is added to the front of the array
    (path.unshift), so the final array reads from the root folder down
    to the file itself.
*/

// Get the full folder path from the root down to one file
// #getFilePath -> by fileId
export const getFilePath = query({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    // Check who is logged in
    const identity = await verifyAuth(ctx);

    // Load the file
    const file = await ctx.db.get("files", args.fileId);

    if (!file) {
      throw new Error("File not found!");
    }

    // Load the project this file belongs to
    const project = await ctx.db.get("projects", file.projectId);

    // Stop if the project does not exist
    if (!project) {
      throw new Error("Project not found!");
    }

    // Stop if this user does not own the project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    // Will hold the path, in order from root to file
    const path: { _id: string; name: string }[] = [];

    // Start walking upward from the target file
    let currentId: Id<"files"> | undefined = args.fileId;

    // Keep walking up through parents until we reach the root
    // (a file with no parentId)
    while (currentId) {
      const file = (await ctx.db.get("files", currentId)) as
        Doc<"files"> | undefined;

      // Stop if a broken/missing link is found
      if (!file) break;

      // Add this file to the front of the path (root ends up first)
      path.unshift({ _id: file._id, name: file.name });

      // Move up to the parent for the next loop
      currentId = file.parentId;
    }

    return path;
  },
});

// Get one file or folder by its ID
// #getFile -> by Id
export const getFile = query({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    // Check who is logged in
    const identity = await verifyAuth(ctx);

    // Load the file
    const file = await ctx.db.get("files", args.fileId);

    // Stop if the file does not exist
    if (!file) {
      throw new Error("File not found!");
    }

    // Load the project this file belongs to
    const project = await ctx.db.get("projects", file.projectId);

    // Stop if the project does not exist
    if (!project) {
      throw new Error("Project not found!");
    }

    // Stop if this user does not own the project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    // #region Binary files
    // Binary files (images, fonts, ...) keep their bytes in Convex file storage
    // instead of `content`. The raw `storageId` is useless to the browser, so we
    // resolve it into a short-lived served URL here — the ownership check above
    // already gates it, which is why this can stay on the public API.
    // #endregion
    const storageUrl = file.storageId
      ? await ctx.storage.getUrl(file.storageId)
      : null;

    // All checks passed, return the file
    return { ...file, storageUrl };
  },
});

// Get everything inside one folder (or the project root), folders first
// then files, both sorted alphabetically
// #getFolderContents -> by projectId & optional(parentId)
export const getFolderContents = query({
  args: {
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
  },
  handler: async (ctx, args) => {
    // Check who is logged in
    const identity = await verifyAuth(ctx);

    // Load the project
    const project = await ctx.db.get("projects", args.projectId);

    // Stop if the project does not exist
    if (!project) {
      throw new Error("Project not found!");
    }

    // Stop if this user does not own the project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    // Get every file/folder that shares this projectId and parentId.
    // No parentId means "at the project root" (not inside any folder).
    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId),
      )
      .collect();

    // Sort so folders come first, then files, each group A-Z
    return files.sort((a, b) => {
      // a is a folder, b is a file -> a stays first
      if (a.type == "folder" && b.type == "file") return -1;

      // a is a file, b is a folder -> swap, folder goes first
      if (a.type == "file" && b.type == "folder") return 1;

      // Same type -> sort alphabetically by name
      return a.name.localeCompare(b.name);
    });
  },
});

// Create a new file inside a project (or inside a folder), blocking
// duplicate names at the same location
// #createFile -> by projectId, parentId, name & content, blocks duplicate names
export const createFile = mutation({
  args: {
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
    name: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // Check who is logged in
    const identity = await verifyAuth(ctx);

    // Load the project
    const project = await ctx.db.get("projects", args.projectId);

    // Stop if the project does not exist
    if (!project) {
      throw new Error("Project not found!");
    }

    // Stop if this user does not own the project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    // If a parent folder was given, make sure it's valid
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);

      // 1. The parent must exist
      if (!parent) {
        throw new Error("Parent folder not found!");
      }

      // 2. The parent must belong to the same project
      if (parent.projectId !== args.projectId) {
        throw new Error("Parent folder belongs to a different project!");
      }

      // 3. The parent must be a folder, not a file
      if (parent.type !== "folder") {
        throw new Error("Cannot create items inside a file!");
      }
    }

    // Get everything already at this same location (same project + parent)
    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId),
      )
      .collect();

    // Look for a file with the same name already there
    const existing = files.find(
      (file) => file.name === args.name && file.type === "file",
    );

    // Stop if a file with this name already exists here
    if (existing) {
      throw new Error(
        "File already exists at this location, please choose a different name.",
      );
    }

    // Save the new file
    await ctx.db.insert("files", {
      projectId: args.projectId,
      parentId: args.parentId,
      name: args.name,
      content: args.content,
      type: "file",
      updatedAt: Date.now(),
    });

    // Mark the project as updated too, since adding a file counts
    // as a change to the project
    await ctx.db.patch("projects", project._id, {
      updatedAt: Date.now(),
    });
  },
});

// Create a new folder inside a project (or inside another folder),
// blocking duplicate names at the same location
// #createFolder -> by projectId, parentId, name, blocks duplicate names
export const createFolder = mutation({
  args: {
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Check who is logged in
    const identity = await verifyAuth(ctx);

    // Load the project
    const project = await ctx.db.get("projects", args.projectId);

    // Stop if the project does not exist
    if (!project) {
      throw new Error("Project not found!");
    }

    // Stop if this user does not own the project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    // If a parent folder was given, make sure it's valid
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);

      // 1. The parent must exist
      if (!parent) {
        throw new Error("Parent folder not found!");
      }

      // 2. The parent must belong to the same project
      if (parent.projectId !== args.projectId) {
        throw new Error("Parent folder belongs to a different project!");
      }

      // 3. The parent must be a folder, not a file
      if (parent.type !== "folder") {
        throw new Error("Cannot create folders inside a file!");
      }
    }

    // Get everything already at this same location (same project + parent)
    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId),
      )
      .collect();

    // Look for a folder with the same name already there
    const existing = files.find(
      (file) => file.name === args.name && file.type === "folder",
    );

    // Stop if a folder with this name already exists here
    if (existing) {
      throw new Error(
        "folder already exists at this location, please choose a different name.",
      );
    }

    // Save the new folder
    await ctx.db.insert("files", {
      projectId: args.projectId,
      parentId: args.parentId,
      name: args.name,
      type: "folder",
      updatedAt: Date.now(),
    });

    // Mark the project as updated too, since adding a folder counts
    // as a change to the project
    await ctx.db.patch("projects", project._id, {
      updatedAt: Date.now(),
    });
  },
});

// Rename an existing file or folder, blocking a name clash with its siblings
// #renameFile -> by fileId, newName
// (no projectId/parentId needed here, since the file we load already has both)
export const renameFile = mutation({
  args: {
    id: v.id("files"),
    newName: v.string(),
  },
  handler: async (ctx, args) => {
    // Check who is logged in
    const identity = await verifyAuth(ctx);

    // Load the file
    const file = await ctx.db.get("files", args.id);

    // Stop if the file does not exist
    if (!file) {
      throw new Error("File not found.");
    }

    // Load the project this file belongs to
    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    // Stop if this user does not own the project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    // Get this file's siblings (everything else at the same location)
    const siblings = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", file.projectId).eq("parentId", file.parentId),
      )
      .collect();

    // Check if the new name is already taken by a sibling
    const existing = siblings.find(
      (sibling) =>
        sibling.name === args.newName && // same name
        sibling.type === file.type && // same type (file vs folder)
        sibling._id !== args.id, // not the file we're renaming itself
    );

    // Stop if the name is already in use here
    if (existing) {
      throw new Error(
        `A ${file.type} with this name already exists in this location`,
      );
    }

    // Save the new name
    await ctx.db.patch("files", args.id, {
      name: args.newName,
      updatedAt: Date.now(),
    });

    // Mark the project as updated too, since renaming counts as a change
    await ctx.db.patch("projects", project._id, {
      updatedAt: Date.now(),
    });

    // Note: renaming a folder does not require updating its children.
    // Child files link to their parent by a fixed parentId, not by the
    // parent's name, so the connection stays intact either way.
  },
});

// Delete a file, or delete a folder and everything inside it
// #deleteFile -> by fileId, removes files/folders recursively via deleteRecursive()
export const deleteFile = mutation({
  args: {
    id: v.id("files"),
  },
  handler: async (ctx, args) => {
    // Check who is logged in
    const identity = await verifyAuth(ctx);

    // Load the file
    const file = await ctx.db.get("files", args.id);

    // Stop if the file does not exist
    if (!file) {
      throw new Error("File not found.");
    }

    // Load the project this file belongs to
    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    // Stop if this user does not own the project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    // Delete a file or folder, and if it's a folder, delete everything
    // inside it first (children, grandchildren, and so on)
    const deleteRecursive = async (fileId: Id<"files">) => {
      const item = await ctx.db.get("files", fileId);

      // Already gone, nothing to do
      if (!item) {
        return;
      }

      // If this is a folder, clear out its contents first
      if (item.type === "folder") {
        // Find direct children (this folder is their parentId)
        const children = await ctx.db
          .query("files")
          .withIndex("by_project_parent", (q) =>
            q.eq("projectId", item.projectId).eq("parentId", fileId),
          )
          .collect();

        // Each child might also be a folder, so repeat this same
        // process for every child (goes as deep as needed)
        for (const child of children) {
          await deleteRecursive(child._id);
        }
      }

      // Delete the stored asset too, if this file has one
      if (item.storageId) {
        await ctx.storage.delete(item.storageId);
      }

      // Finally, delete the file/folder record itself
      await ctx.db.delete("files", fileId);
    };

    // Start the recursive delete from the requested file/folder
    await deleteRecursive(args.id);

    // Mark the project as updated too, since deleting counts as a change
    await ctx.db.patch("projects", project._id, {
      updatedAt: Date.now(),
    });
  },
});

// Update the text content (code) of an existing file
// #updateFile -> by fileId, content
export const updateFile = mutation({
  args: {
    fileId: v.id("files"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    // Check who is logged in
    const identity = await verifyAuth(ctx);

    // Load the file
    const file = await ctx.db.get("files", args.fileId);

    // Stop if the file does not exist
    if (!file) {
      throw new Error("File not found.");
    }

    // Load the project this file belongs to
    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    // Stop if this user does not own the project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    // Save the new content
    await ctx.db.patch("files", args.fileId, {
      content: args.content,
      updatedAt: Date.now(),
    });

    // Mark the project as updated too, since editing a file counts
    // as a change to the project
    await ctx.db.patch("projects", project._id, {
      updatedAt: Date.now(),
    });
  },
});
