import { InviteView } from "@/features/projects/views/invite-view";

interface Params {
  params: Promise<{ inviteId: string }>;
}

//Invite links land here: /invites/<inviteId> (see InviteView)
const Page = async ({ params }: Params) => {
  const { inviteId } = await params;
  return <InviteView inviteId={inviteId} />;
};

export default Page;
