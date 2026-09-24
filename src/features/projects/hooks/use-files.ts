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
