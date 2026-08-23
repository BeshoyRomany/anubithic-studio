import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

export const useFile = (fileId: Id<"files"> | null) => {
  return useQuery(api.files.getFile, fileId ? { fileId } : "skip");
};

export const useFilePath = (fileId: Id<"files"> | null) => {
  return useQuery(api.files.getFilePath, fileId ? { fileId } : "skip");
};

export const useUpdateFile = () => {
  return useMutation(api.files.updateFile);
};

export const useCreateFile = () => {
  return useMutation(api.files.createFile);
  //TODO: Add optimistic mutation
};

export const useRenameFile = () => {
  return useMutation(api.files.renameFile);
  //TODO: Add optimistic mutation
};

export const useDeleteFile = () => {
  return useMutation(api.files.deleteFile);
  //TODO: Add optimistic mutation
};

export const useCreateFolder = () => {
  return useMutation(api.files.createFolder);
  //TODO: Add optimistic mutation
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
