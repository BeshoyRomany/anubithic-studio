"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { SignInButton, SignOutButton } from "@clerk/nextjs";
import { CheckIcon, HomeIcon, LoaderIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  useAcceptInvite,
  useDeclineInvite,
  useInvite,
} from "../hooks/use-contributors";
import { getMutationErrorMessage } from "../hooks/use-files";

//#region InviteView (/invites/<inviteId>)
//Where an invite link lands. The link carries only the invite id — it isn't a
//secret: accepting also requires being signed in with the invited email
//(checked server side against the verified Clerk token).
//
//States (from contributors.getInvite):
//  signed out      → "sign in to accept" (Clerk modal keeps us on this URL)
//  pending         → who invited you to what + Accept / Decline
//  accepted        → already a member → straight to the project
//  wrong_account   → signed in with another email → offer to switch account
//  not_found       → bad/old link, cancelled or declined invite
//#endregion

//Shared frame so every state looks like the 404 / auth screens
const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className="flex h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
    <img
      src={"/logo.svg"}
      alt="Anubithic"
      className="size-12 drop-shadow-[0_0_18px_rgba(212,170,90,0.35)]"
    />
    {children}
  </main>
);

const HomeButton = () => (
  <Button asChild variant="outline">
    <Link href="/">
      <HomeIcon className="size-4" />
      Back to home
    </Link>
  </Button>
);

const InviteDetails = ({ inviteId }: { inviteId: string }) => {
  const router = useRouter();
  const result = useInvite(inviteId);
  const acceptInvite = useAcceptInvite();
  const declineInvite = useDeclineInvite();
  const [isBusy, setIsBusy] = useState(false);

  if (result === undefined) {
    return <LoaderIcon className="size-5 animate-spin text-muted-foreground" />;
  }

  if (result.state === "not_found") {
    return (
      <>
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-xl font-semibold">Invite not found</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            This invite link is invalid, or the invite was cancelled or
            declined. Ask the project owner to invite you again.
          </p>
        </div>
        <HomeButton />
      </>
    );
  }

  if (result.state === "wrong_account") {
    return (
      <>
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-xl font-semibold">
            This invite is for another account
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            You&apos;re signed in as{" "}
            <span className="text-foreground">{result.email}</span>. Sign in
            with the email address the invite was sent to.
          </p>
        </div>
        <div className="flex gap-2">
          <HomeButton />
          <SignOutButton redirectUrl={`/invites/${inviteId}`}>
            <Button>Switch account</Button>
          </SignOutButton>
        </div>
      </>
    );
  }

  if (result.state === "accepted") {
    return (
      <>
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-xl font-semibold">
            You&apos;re already on this team
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            You accepted this invite earlier.
          </p>
        </div>
        <Button asChild>
          <Link href={`/projects/${result.projectId}`}>Open project</Link>
        </Button>
      </>
    );
  }

  const { invite } = result;

  const handleAccept = async () => {
    setIsBusy(true);
    try {
      const projectId = await acceptInvite({ inviteId: invite._id });
      toast.success(`You joined "${invite.projectName}"`);
      router.push(`/projects/${projectId}`);
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Unable to accept invite"));
      setIsBusy(false);
    }
  };

  const handleDecline = async () => {
    setIsBusy(true);
    try {
      await declineInvite({ inviteId: invite._id });
      toast.success("Invite declined");
      router.push("/");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Unable to decline invite"));
      setIsBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-col items-center gap-3">
        <Avatar size="lg">
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
        <h1 className="text-xl font-semibold">
          {invite.inviterName} invited you to{" "}
          <span className="text-logo">{invite.projectName}</span>
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Join as a {invite.role} to edit the code together in real time.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" disabled={isBusy} onClick={handleDecline}>
          <XIcon className="size-4" />
          Decline
        </Button>
        <Button disabled={isBusy} onClick={handleAccept}>
          <CheckIcon className="size-4" />
          Accept invite
        </Button>
      </div>
    </>
  );
};

export const InviteView = ({ inviteId }: { inviteId: string }) => {
  return (
    <Frame>
      <AuthLoading>
        <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
      </AuthLoading>
      <Unauthenticated>
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-xl font-semibold">You&apos;ve been invited</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Sign in with the email address this invite was sent to.
          </p>
        </div>
        <SignInButton mode="modal" forceRedirectUrl={`/invites/${inviteId}`}>
          <Button>Sign in to accept</Button>
        </SignInButton>
      </Unauthenticated>
      <Authenticated>
        <InviteDetails inviteId={inviteId} />
      </Authenticated>
    </Frame>
  );
};
