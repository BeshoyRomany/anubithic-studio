import { ProjectIdView } from "@/features/projects/views/project-id-view";
import { Id } from "../../../../convex/_generated/dataModel";

interface Params {
  params: Promise<{ projectId: string }>;
}

const Page = async ({ params }: Params) => {
  const { projectId } = await params;
  return <ProjectIdView projectId={projectId as Id<"projects">} />;
};

export default Page;
