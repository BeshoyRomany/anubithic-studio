"use client";

import { NotFoundView } from "@/components/not-found-view";

// Catches errors from /projects/[projectId] (including its layout): a malformed
// id, a deleted project, or someone else's project all throw in Convex.
const ProjectError = () => {
  return (
    <NotFoundView
      title="Project not found"
      description="This project doesn't exist or you don't have access to it."
    />
  );
};

export default ProjectError;
