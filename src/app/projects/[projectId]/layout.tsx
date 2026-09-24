import { ProjectIdLayout } from "@/features/projects/layouts/project-id-layout";
import React from "react";
import { Id } from "../../../../convex/_generated/dataModel";

interface ProjectIdLayoutPageProps {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}

export default async function Layout({
  children,
  params,
}: ProjectIdLayoutPageProps) {
  const { projectId } = await params;
  return (
    <ProjectIdLayout projectId={projectId as Id<"projects">}>
      {children}
    </ProjectIdLayout>
  );
}
