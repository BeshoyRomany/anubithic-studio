import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

export const useCreateFile = () => {
  return useMutation(api.files.createFile);
};

export const useRenameFile = () => {
  return useMutation(api.files.renameFile);
};

export const useDeleteFile = () => {
  return useMutation(api.files.deleteFile);
};

export const useCreateFolder = () => {
  return useMutation(api.files.createFolder);
};

interface useFolderContent {
  projectId: Id<"projects">;
  parentId?: Id<"files">;
  enabled?: boolean;
}

//Enabled if -> 1-folder open and project loaded already
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
