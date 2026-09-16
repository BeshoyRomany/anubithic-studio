import { FileSystemTree } from "@webcontainer/api";

import { Doc, Id } from "../../../../convex/_generated/dataModel";

type FileDoc = Doc<"files">;

/**
 * Convert flat Convex files to nested FileSystemTree for WebContainer
 */
export const buildFileTree = (files: FileDoc[]): FileSystemTree => {
  // Initialize an empty tree structure to hold the nested file system
  const tree: FileSystemTree = {};
  // Create a map for quick lookups of files by their unique IDs
  const filesMap = new Map(files.map((f) => [f._id, f]));

  // Helper function to build an array of path parts from root down to the file
  const getPath = (file: FileDoc): string[] => {
    // Start with the name of the current file/folder
    const parts: string[] = [file.name];
    let parentId = file.parentId;

    // Loop upward through the parent chain until the root is reached
    while (parentId) {
      const parent = filesMap.get(parentId);
      if (!parent) break;
      // Prepend the parent name to the beginning of the parts array
      parts.unshift(parent.name);
      // Get the parent of the current parent
      parentId = parent.parentId;
    }

    // Return the complete path segments array
    return parts;
  };

  // Iterate over every file document to place it into the nested tree structure
  for (const file of files) {
    // Retrieve the full path array for the current file
    const pathParts = getPath(file);
    let current = tree;

    // Traverse or build the tree directories according to the path segments
    for (let i = 0; i < pathParts.length; i++) {
      // Get the current path segment string
      const part = pathParts[i];
      // Check if this segment is the final item in the path array
      const isLast = i === pathParts.length - 1;

      // If this is the final segment of the path, insert the file or folder node
      if (isLast) {
        if (file.type === "folder") {
          // IMPORTANT: don't overwrite an existing directory node.
          // A child file may have already created this directory
          // implicitly (as an intermediate segment) before we reached
          // the folder's own doc in this loop. Overwriting here would
          // wipe out any children already placed inside it.
          const existing = current[part];
          if (!existing || !("directory" in existing)) {
            current[part] = { directory: {} };
          }
        } else if (!file.storageId && file.content !== undefined) {
          current[part] = { file: { contents: file.content } };
        }
      } else {
        // If it's an intermediate folder, ensure the directory object exists
        // without clobbering one that's already there.
        const existing = current[part];
        if (!existing || !("directory" in existing)) {
          current[part] = { directory: {} };
        }
        // Move the current pointer deeper into the nested directory
        const node = current[part];
        if ("directory" in node) {
          current = node.directory;
        }
      }
    }
  }

  // Return the fully constructed FileSystemTree
  return tree;
};

/**
 * Get full path for a file by traversing parent chain
 */
export const getFilePath = (
  file: FileDoc,
  filesMap: Map<Id<"files">, FileDoc>,
): string => {
  // Start with the file's own name
  const parts: string[] = [file.name];
  let parentId = file.parentId;

  // Walk up the parent hierarchy appending names to the path array
  while (parentId) {
    const parent = filesMap.get(parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    parentId = parent.parentId;
  }
  // Join all segments together with forward slashes into a single path string
  return parts.join("/");
};
