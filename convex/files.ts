import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { verifyAuth } from "./auth";
import { Id } from "./_generated/dataModel";

// Retrieves all files and folders belonging to a specific project.
//#getFiles -> by projectId
export const getFiles = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    //Get the ownership
    const identity = await verifyAuth(ctx);
    //Fetch the project
    const project = await ctx.db.get("projects", args.projectId);

    // -- check if the project still exist
    if (!project) {
      throw new Error("Project not found!");
    }

    // -- check if the user has access to this project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    //Get the files by passing projectId
    return await ctx.db
      .query("files")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();
  },
});

// Retrieves a single file or folder by its unique ID with ownership verification.
//#getFile -> by Id
export const getFile = query({
  args: {
    id: v.id("files"),
  },
  handler: async (ctx, args) => {
    //Get the ownership
    const identity = await verifyAuth(ctx);

    //Fetch the file
    const file = await ctx.db.get("files", args.id);
    // -- check if the file still exist
    if (!file) {
      throw new Error("File not found!");
    }

    //Fetch the project that contains the requested file
    const project = await ctx.db.get("projects", file.projectId);
    // -- check if the project exist
    if (!project) {
      throw new Error("Project not found!");
    }

    // -- check if the user has access to this project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    // Return the fetched file after security checks are fulfilled
    return file;
  },
});

// Retrieves folder contents (files and subfolders) for a specific project and parent directory, sorted with folders first then files alphabetically.
//#getFolderContents -> by projectId & optional(parentId)
export const getFolderContents = query({
  args: {
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
  },
  handler: async (ctx, args) => {
    //Get the ownership
    const identity = await verifyAuth(ctx);
    //Fetch the project
    const project = await ctx.db.get("projects", args.projectId);

    // -- check if the project still exist
    if (!project) {
      throw new Error("Project not found!");
    }

    // -- check if the user has access to this project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    // query withIndexes all files and folders sharing the same projectId & parentId if provided
    // optional parentId means the (folder with it's folder & files) is at the project root, not inside a subfolder

    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId),
      )
      .collect();

    //Sort: folders first, then files, alphabetically within each group
    // --  e.q (folders first alphabetically)
    // --  e.q (files alphabetically)
    return files.sort((a, b) => {
      // If (a) is a folder and (b) is a file: keep a in its place before b (-1 means no swap, folder stays first)
      if (a.type == "folder" && b.type == "file") return -1;

      // If (a) is a file and (b) is a folder: swap their places so the folder comes first (1 means move a after b)
      if (a.type == "file" && b.type == "folder") return 1;

      // Within same type, sort alphabetically by name
      return a.name.localeCompare(b.name);
    });
  },
});

// Creates a new file within a project or parent folder while preventing duplicate names and validating parent ownership.
//#createFile -> by projectId, parentId, name & content with avoiding name duplication
export const createFile = mutation({
  args: {
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
    name: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    //Get the ownership
    const identity = await verifyAuth(ctx);
    //Fetch the project
    const project = await ctx.db.get("projects", args.projectId);

    // -- check if the project still exist
    if (!project) {
      throw new Error("Project not found!");
    }

    // -- check if the user has access to this project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    // -- Validate parent folder if provided
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);

      // 1. Check if the parent item actually exists
      if (!parent) {
        throw new Error("Parent folder not found!");
      }

      // 2. Ensure the parent belongs to the exact same project
      if (parent.projectId !== args.projectId) {
        throw new Error("Parent folder belongs to a different project!");
      }

      // 3. Ensure the parent is a folder, not a file
      if (parent.type !== "folder") {
        throw new Error("Cannot create items inside a file!");
      }
    }

    //  get all the files at the same location by passing project id and parentId if it's exist
    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId),
      )
      .collect();

    // -- find the file to -> (prevent name duplication)
    const existing = files.find(
      (file) => file.name === args.name && file.type === "file",
    );

    // -- if file with same name already exist at the location return error
    if (existing) {
      throw new Error(
        "File already exists at this location, please choose a different name.",
      );
    }

    //Insert the file
    await ctx.db.insert("files", {
      projectId: args.projectId,
      parentId: args.parentId,
      name: args.name,
      content: args.content,
      type: "file",
      updatedAt: Date.now(),
    });

    //update the project also -- because creating a file in a project means the project got update also
    await ctx.db.patch("projects", project._id, {
      updatedAt: Date.now(),
    });
  },
});

// Creates a new folder within a project or parent directory while preventing duplicate names and validating parent ownership.
//#createFolder -> by projectId, parentId, name & content with avoiding name duplication
export const createFolder = mutation({
  args: {
    projectId: v.id("projects"),
    parentId: v.optional(v.id("files")),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    //Get the ownership
    const identity = await verifyAuth(ctx);

    //Fetch the project
    const project = await ctx.db.get("projects", args.projectId);

    // -- check if the project still exist
    if (!project) {
      throw new Error("Project not found!");
    }

    // -- check if the user has access to this project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    // -- Validate parent folder if provided
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);

      // 1. Check if the parent item actually exists
      if (!parent) {
        throw new Error("Parent folder not found!");
      }

      // 2. Ensure the parent belongs to the exact same project
      if (parent.projectId !== args.projectId) {
        throw new Error("Parent folder belongs to a different project!");
      }

      // 3. Ensure the parent is a folder, not a file
      if (parent.type !== "folder") {
        throw new Error("Cannot create folders inside a file!");
      }
    }

    // get all the folder at the same location by passing project id and parentId if it's exist
    const files = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId),
      )
      .collect();

    // -- find the folder to -> (prevent name duplication)
    const existing = files.find(
      (file) => file.name === args.name && file.type === "folder",
    );

    // -- if folder with same name already exist at the location return error
    if (existing) {
      throw new Error(
        "folder already exists at this location, please choose a different name.",
      );
    }

    //Insert the file
    await ctx.db.insert("files", {
      projectId: args.projectId,
      parentId: args.parentId,
      name: args.name,
      type: "folder",
      updatedAt: Date.now(),
    });

    //update the project also -- because creating a folder in a project means the project got update also
    await ctx.db.patch("projects", project._id, {
      updatedAt: Date.now(),
    });
  },
});
// Renames an existing file or folder while checking for name conflicts among siblings.
//#renameFile -> by fileId, newName -- not with projectId Or ParentId --because the file we gonna fetch holds parentId & projectId
export const renameFile = mutation({
  args: {
    id: v.id("files"),
    newName: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    //Fetch the file
    const file = await ctx.db.get("files", args.id);

    //if the file not exist
    if (!file) {
      throw new Error("File not found.");
    }

    //check if the project that holds this file exists
    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    // -- check if the user has access to this project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    //check if a file with the same name already exist at the same location by getting the file siblings
    const siblings = await ctx.db
      .query("files")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", file.projectId).eq("parentId", file.parentId),
      )
      .collect();

    // check if the newName already token reserved for one of the siblings before we rename
    const existing = siblings.find(
      (sibling) =>
        sibling.name === args.newName && // if file exist with the same name
        sibling.type === file.type && // if file exist with the same type
        sibling._id !== args.id, // the file (should not) be the file i try to rename
      //because if it's the same id means this file not a sibling , means this is the file itself
    );

    //if file/folder exist at the location with the same name throw an error
    if (existing) {
      throw new Error(
        `A ${file.type} with this name already exists in this location`,
      );
    }

    //update the folder name
    await ctx.db.patch("files", args.id, {
      name: args.newName,
      updatedAt: Date.now(),
    });

    //update the project also -- because renaming a file in a project means the project got update also
    await ctx.db.patch("projects", project._id, {
      updatedAt: Date.now(),
    });

    // Note: If we rename a folder, we don't need to update any files or subfolders inside it.
    // Why? Because inner files are linked to this folder using a fixed ID (parentId),
    // not by using the folder's name. So changing the name doesn't break the connection at all.
  },
});

// Deletes a file or recursively deletes a folder along with all its nested descendants and storage assets.
//#deleteFile -> by fileId, delete files, and folders and folders inside folders by deleteRecursive()
export const deleteFile = mutation({
  args: {
    id: v.id("files"),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    //Fetch the file
    const file = await ctx.db.get("files", args.id);

    //if the file not exist
    if (!file) {
      throw new Error("File not found.");
    }

    //check if the project that holds this file exists
    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    // -- check if the user has access to this project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    //recursively delete file or folders with its all descendants
    const deleteRecursive = async (fileId: Id<"files">) => {
      const item = await ctx.db.get("files", fileId);

      if (!item) {
        return;
      }

      //### FOLDER ###//
      // if it's a folder, delete all children first
      if (item.type === "folder") {
        const children = await ctx.db
          .query("files")
          .withIndex(
            "by_project_parent",
            (q) => q.eq("projectId", item.projectId).eq("parentId", fileId),
            // the current item fileId is the parentId -> means get each children under this parentId
          )
          .collect();

        //also each on of the children can be a folder also, so we have to run the same function again to do unlimited children check
        for (const child of children) {
          await deleteRecursive(child._id); // it will apply the logic for each children level
        }
      }
      //### END FOLDER ###//

      //Delete storage file if it exists
      if (item.storageId) {
        await ctx.storage.delete(item.storageId);
      }

      //Delete the file/folder itself
      await ctx.db.delete("files", fileId);
    };
    //Fire the delete Recursive on files/folders
    await deleteRecursive(args.id);

    //update the project also -- because deleting a file in a project means the project got update also
    await ctx.db.patch("projects", project._id, {
      updatedAt: Date.now(),
    });
  },
});

// Updates the text content (code) of an existing file by its ID.
//#updateFile -> by fileId, content -- the file content the (code)
export const updateFile = mutation({
  args: {
    id: v.id("files"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await verifyAuth(ctx);

    //Fetch the file
    const file = await ctx.db.get("files", args.id);

    //if the file not exist
    if (!file) {
      throw new Error("File not found.");
    }

    //check if the project that holds this file exists
    const project = await ctx.db.get("projects", file.projectId);

    if (!project) {
      throw new Error("Project not found.");
    }

    // -- check if the user has access to this project
    if (project.ownerId !== identity.subject) {
      throw new Error("Unauthorized access to this project!");
    }

    //update the file content the (code) by file id
    await ctx.db.patch("files", args.id, {
      content: args.content,
      updatedAt: Date.now(),
    });

    //update the project also -- because update file in a project means the project got update also
    await ctx.db.patch("projects", project._id, {
      updatedAt: Date.now(),
    });
  },
});
