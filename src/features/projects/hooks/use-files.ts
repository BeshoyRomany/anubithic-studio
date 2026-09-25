import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";

// Sort: folders first, then files, alphabetically within each group
const sortFiles = <T extends { type: "file" | "folder"; name: string }>(
  files: T[],
): T[] => {
  return [...files].sort((a, b) => {
    if (a.type === "folder" && b.type === "file") return -1;
    if (a.type === "file" && b.type === "folder") return 1;
    return a.name.localeCompare(b.name);
  });
};

// The server blocks duplicates, but optimistic updates run first - skip the
// fake row on a clash so it doesn't flash in and silently vanish
const hasNameClash = (
  files: Doc<"files">[],
  name: string,
  type: "file" | "folder",
  exceptId?: Id<"files">,
) =>
  files.some(
    (file) => file.name === name && file.type === type && file._id !== exceptId,
  );

// Pull the readable message out of a Convex server error, for toasts
export const getMutationErrorMessage = (
  error: unknown,
  fallback = "Something went wrong.",
) => {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.match(/Uncaught Error: (.*)/)?.[1] ?? fallback;
};

export const useFile = (fileId: Id<"files"> | null) => {
  return useQuery(api.files.getFile, fileId ? { fileId } : "skip");
};

export const useFiles = (projectId: Id<"projects">) => {
  return useQuery(api.files.getFiles, projectId ? { projectId } : "skip");
};

export const useFilePath = (fileId: Id<"files"> | null) => {
  return useQuery(api.files.getFilePath, fileId ? { fileId } : "skip");
};

export const useUpdateFile = () => {
  return useMutation(api.files.updateFile);
};

export const useCreateFile = () => {
  return useMutation(api.files.createFile).withOptimisticUpdate(
    (localStore, args) => {
      //query all the folder files by parent id
      //folderContents can be folder/root
      const existingFiles = localStore.getQuery(api.files.getFolderContents, {
        parentId: args.parentId,
        projectId: args.projectId,
      });

      if (existingFiles !== undefined) {
        // Name taken -> skip the fake row
        if (hasNameClash(existingFiles, args.name, "file")) return;

        const now = Date.now();
        const newFile: Doc<"files"> = {
          _id: crypto.randomUUID() as Id<"files">,
          _creationTime: now,
          parentId: args.parentId,
          projectId: args.projectId,
          name: args.name,
          content: args.content,
          type: "file" as const,
          updatedAt: now,
        };

        //update the parent content folder/root
        //sort the files with adding the new file
        localStore.setQuery(
          api.files.getFolderContents,
          { parentId: args.parentId, projectId: args.projectId },
          sortFiles([...existingFiles, newFile]),
        );
      }
    },
  );
};
export const useRenameFile = ({
  projectId,
  parentId,
}: {
  projectId: Id<"projects">;
  parentId?: Id<"files">;
}) => {
  return useMutation(api.files.renameFile).withOptimisticUpdate(
    (localStore, args) => {
      //query all the folder files by parent id
      //folderContents can be folder/root
      const existingFiles = localStore.getQuery(api.files.getFolderContents, {
        projectId,
        parentId,
      });

      if (existingFiles !== undefined) {
        // Name taken -> keep the old name
        const renamed = existingFiles.find((file) => file._id === args.id);
        if (
          renamed &&
          hasNameClash(existingFiles, args.newName, renamed.type, args.id)
        ) {
          return;
        }

        // update the file
        const updatedFiles = existingFiles.map((file) =>
          file._id === args.id ? { ...file, name: args.newName } : file,
        );

        //update the names
        localStore.setQuery(
          //folderContents can be folder/root
          api.files.getFolderContents,
          { projectId, parentId },
          //Sort files again client/side
          sortFiles(updatedFiles),
        );
      }
    },
  );
};

export const useDeleteFile = ({
  projectId,
  parentId,
}: {
  projectId: Id<"projects">;
  parentId?: Id<"files">;
}) => {
  return useMutation(api.files.deleteFile).withOptimisticUpdate(
    (localStore, args) => {
      //query all the folder files by parent id
      //folderContents can be folder/root
      const existingFiles = localStore.getQuery(api.files.getFolderContents, {
        projectId,
        parentId,
      });

      if (existingFiles !== undefined) {
        localStore.setQuery(
          //folderContents can be folder/root
          api.files.getFolderContents,
          { projectId, parentId },
          // return the all files with the deleted file
          existingFiles.filter((file) => file._id !== args.id),
        );
      }
    },
  );
};

export const useCreateFolder = () => {
  return useMutation(api.files.createFolder).withOptimisticUpdate(
    (localStore, args) => {
      //query all the folder files by parent id
      //folderContents can be folder/root
      const existingFiles = localStore.getQuery(api.files.getFolderContents, {
        parentId: args.parentId,
        projectId: args.projectId,
      });

      if (existingFiles !== undefined) {
        // Name taken -> skip the fake row
        if (hasNameClash(existingFiles, args.name, "folder")) return;

        const now = Date.now();
        const newFolder = {
          _id: crypto.randomUUID() as Id<"files">,
          _creationTime: now,
          parentId: args.parentId,
          projectId: args.projectId,
          name: args.name,
          type: "folder" as const,
          updatedAt: now,
        };

        //update the parent content folder/root
        //sort the files with adding the new file
        localStore.setQuery(
          api.files.getFolderContents,
          { parentId: args.parentId, projectId: args.projectId },
          sortFiles([...existingFiles, newFolder]),
        );
      }
    },
  );
};

// #region useMoveFile - optimistic move
/*
  Drag & drop should feel instant, so the item jumps to its new folder before
  the server answers. Unlike rename/delete, the hook doesn't need to be told
  the SOURCE folder: getAllQueries hands us every cached folder listing, and
  we simply look for the one that currently holds the item.

  - Source listing      -> item filtered out
  - Destination listing -> item added with its new parentId, then re-sorted
                           (only if that folder is cached, i.e. it has been
                           opened; otherwise the server result fills it in
                           when it opens)

  If the server rejects the move (name clash, folder into itself...), Convex
  drops the optimistic state and the tree snaps back on its own.
*/
// #endregion
export const useMoveFile = (projectId: Id<"projects">) => {
  return useMutation(api.files.moveFile).withOptimisticUpdate(
    (localStore, args) => {
      const listings = localStore.getAllQueries(api.files.getFolderContents);

      // Find the item in whichever cached listing currently contains it
      let movedItem: Doc<"files"> | undefined;
      for (const { args: queryArgs, value } of listings) {
        if (queryArgs.projectId !== projectId || value === undefined) continue;
        const found = value.find((file) => file._id === args.id);
        if (!found) continue;

        movedItem = found;
        //remove it from the source folder/root
        localStore.setQuery(
          api.files.getFolderContents,
          queryArgs,
          value.filter((file) => file._id !== args.id),
        );
        break;
      }

      if (!movedItem) return;

      //add it to the destination folder/root (if cached), sorted again
      const destinationArgs = { projectId, parentId: args.newParentId };
      const destination = localStore.getQuery(
        api.files.getFolderContents,
        destinationArgs,
      );
      if (destination !== undefined) {
        localStore.setQuery(
          api.files.getFolderContents,
          destinationArgs,
          sortFiles([
            ...destination,
            { ...movedItem, parentId: args.newParentId },
          ]),
        );
      }
    },
  );
};

interface useFolderContent {
  projectId: Id<"projects">;
  parentId?: Id<"files">;
  enabled?: boolean;
}

//Enabled if -> folder open and project loaded already
export const useFolderContents = ({
  projectId,
  parentId,
  enabled = true,
}: useFolderContent) => {
  return useQuery(
    api.files.getFolderContents,
    enabled ? { projectId, parentId } : "skip",
  );
};
