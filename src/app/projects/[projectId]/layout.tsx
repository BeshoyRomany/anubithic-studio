import { ProjectIdLayout } from "@/features/projects/layouts/project-id-layout";
import React from "react";
import { Id } from "../../../../convex/_generated/dataModel";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ projectId: Id<"projects"> }>;
}
const Layout = async ({ children, params }: LayoutProps) => {
  const { projectId } = await params;
  return <ProjectIdLayout projectId={projectId}>{children}</ProjectIdLayout>;
};

export default Layout;
