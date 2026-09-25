import { ProjectIdLayout } from "@/features/projects/layouts/project-id-layout";
import { AuthGuard } from "@/features/auth/components/auth-guard";
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
    <AuthGuard>
      <ProjectIdLayout projectId={projectId as Id<"projects">}>
        {children}
      </ProjectIdLayout>
    </AuthGuard>
  );
}
