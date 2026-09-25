import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { CheckIcon, MailIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  useAcceptInvite,
  useDeclineInvite,
  useMyInvites,
} from "../hooks/use-contributors";
import { getMutationErrorMessage } from "../hooks/use-files";
import { Id } from "../../../../convex/_generated/dataModel";

//#region PendingInvites (home page)
//Invites addressed to the signed-in user's email that they haven't answered.
//Live: a new invite pops in as soon as the owner sends it, and cards vanish
//instantly on accept/decline (optimistic updates in use-contributors.ts).
//Renders nothing when there are no invites, so the home page is unchanged
//for most users.
//#endregion
export const PendingInvites = () => {
  const router = useRouter();
  const invites = useMyInvites();
  const acceptInvite = useAcceptInvite();
  const declineInvite = useDeclineInvite();
  //The invite whose button was just clicked, to disable its buttons
  const [busyId, setBusyId] = useState<Id<"projectContributors"> | null>(null);

  if (!invites || invites.length === 0) return null;

  const handleAccept = async (
    inviteId: Id<"projectContributors">,
    projectName: string,
  ) => {
    setBusyId(inviteId);
    try {
      const projectId = await acceptInvite({ inviteId });
      toast.success(`You joined "${projectName}"`);
      router.push(`/projects/${projectId}`);
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Unable to accept invite"));
    } finally {
      setBusyId(null);
    }
  };

  const handleDecline = async (inviteId: Id<"projectContributors">) => {
    setBusyId(inviteId);
    try {
      await declineInvite({ inviteId });
      toast.success("Invite declined");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Unable to decline invite"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="flex w-full flex-col gap-2">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MailIcon className="size-3" />
        Invitations
      </span>
      <div className="flex flex-col gap-2">
        {invites.map((invite) => (
          <div
            key={invite._id}
            className="flex min-w-0 items-center gap-3 rounded-xl border border-logo/30 bg-logo/5 px-3 py-2.5 backdrop-blur-sm"
          >
            <Avatar size="sm">
              {invite.inviterImageUrl && (
                <AvatarImage
                  src={invite.inviterImageUrl}
                  alt={invite.inviterName}
                />
              )}
              <AvatarFallback>
                {invite.inviterName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <span className="font-medium">{invite.inviterName}</span>{" "}
                invited you to{" "}
                <span className="font-medium text-logo">
                  {invite.projectName}
                </span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                As {invite.role} ·{" "}
                {formatDistanceToNow(invite.invitedAt, { addSuffix: true })}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-muted-foreground"
              disabled={busyId === invite._id}
              onClick={() => handleDecline(invite._id)}
            >
              <XIcon className="size-3.5" />
              Decline
            </Button>
            <Button
              size="sm"
              className="h-7"
              disabled={busyId === invite._id}
              onClick={() => handleAccept(invite._id, invite.projectName)}
            >
              <CheckIcon className="size-3.5" />
              Accept
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
};
