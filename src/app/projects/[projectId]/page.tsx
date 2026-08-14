import { ProjectIdView } from "@/features/projects/views/project-id-view";
import { Id } from "../../../../convex/_generated/dataModel";

interface Params {
  params: Promise<{ projectId: Id<"projects"> }>;
}
const Page = async ({ params }: Params) => {
  const { projectId } = await params;
  return <ProjectIdView projectId={projectId} />;
};

export default Page;
