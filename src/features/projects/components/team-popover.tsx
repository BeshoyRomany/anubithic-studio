import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useOpenBilling } from "@/features/auth/hooks/use-open-billing";
import { ProBadge } from "@/components/pro-badge";
import {
  CrownIcon,
  LinkIcon,
  SparklesIcon,
  LogOutIcon,
  ShieldIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  useContributors,
  useInviteContributor,
  useRemoveContributor,
  useSetContributorRole,
} from "../hooks/use-contributors";
import { getMutationErrorMessage } from "../hooks/use-files";
import { Id } from "../../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type ContributorRole = "admin" | "contributor";

const ROLE_LABELS: Record<ContributorRole, string> = {
  admin: "Admin",
  contributor: "Contributor",
};

//#region TeamPopover
//The "Team" button in the project navbar.
//
//Everyone on the project sees the list (owner, admins, contributors). What
//they can DO depends on "viewerRole" returned by contributors.list:
//  - owner       → invite (as admin or contributor), copy a pending invite's
//                  link, switch anyone's role, remove anyone
//  - admin       → invite contributors, copy links / remove for contributors
//                  only, "Leave" on their own row
//  - contributor → read-only list, plus "Leave" on their own row
//The server enforces the same rules (contributors.invite/remove/setRole), this
//only hides controls that would fail anyway.
//
//Everything is live: an invite, a removal or a pending invite being claimed
//shows up in every open popover through Convex reactivity.
//#endregion

interface MemberRowProps {
  name?: string;
  email?: string;
  imageUrl?: string;
  badge: React.ReactNode;
  isYou: boolean;
  action?: React.ReactNode;
}

const MemberRow = ({
  name,
  email,
  imageUrl,
  badge,
  isYou,
  action,
}: MemberRowProps) => {
  //Pending invitees have not accepted yet (no userId) → only the email is known
  const label = name || email || "Unknown user";

  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <Avatar size="sm">
        {imageUrl && <AvatarImage src={imageUrl} alt={label} />}
        <AvatarFallback>{label.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {label}
          {isYou && (
            <span className="ml-1 font-normal text-muted-foreground">
              (you)
            </span>
          )}
        </p>
        {name && email && (
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        )}
      </div>
      {badge}
      {action}
    </li>
  );
};

interface TeamPopoverProps {
  projectId: Id<"projects">;
}

export const TeamPopover = ({ projectId }: TeamPopoverProps) => {
  const router = useRouter();
  //Upgrade → straight to the Billing page of the profile modal
  const openBilling = useOpenBilling();
  const team = useContributors(projectId);
  const inviteContributor = useInviteContributor();
  const removeContributor = useRemoveContributor(projectId);
  const setContributorRole = useSetContributorRole(projectId);

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ContributorRole>("contributor");
  const [isInviting, setIsInviting] = useState(false);

  const isOwner = team?.viewerRole === "owner";
  //Owner and admins can invite and manage contributors
  const canManage = isOwner || team?.viewerRole === "admin";
  //Team collaboration is a Pro feature of the OWNER's plan (see
  //contributors.ts "Pro gate"). Unknown while loading → assume enabled so the
  //normal Team button doesn't flash into the upgrade one for Pro users.
  const teamEnabled = team?.teamEnabled ?? true;
  //Admins manage contributors only; the owner manages everyone
  const canManageRow = (role: ContributorRole) =>
    isOwner || (canManage && role === "contributor");
  //Owner + everyone who has access (pending invites don't count yet)
  const activeCount =
    1 + (team?.contributors.filter((c) => c.status === "active").length ?? 0);

  //The invitee opens /invites/<id> (signed in with the invited email) to accept
  const copyInviteLink = async (
    inviteId: Id<"projectContributors">,
    notify = true,
  ) => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/invites/${inviteId}`,
      );
      if (notify) toast.success("Invite link copied");
    } catch {
      //Clipboard can be blocked (permissions / insecure context) — not fatal,
      //the invite still shows on the invitee's home page
      if (notify) toast.error("Unable to copy the invite link");
    }
  };

  //Same upgrade flow as GitHub import/export: a toast whose action opens the
  //Clerk user profile, where the Billing tab handles the upgrade
  const showUpgrade = () => {
    toast.error("Upgrade to Pro to collaborate", {
      description:
        "Invite teammates to edit this project with you in real time.",
      action: {
        label: "Upgrade",
        onClick: () => openBilling(),
      },
    });
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    setIsInviting(true);
    try {
      const inviteId = await inviteContributor({
        projectId,
        email: trimmedEmail,
        //Only the owner sees the role picker; admins always invite contributors
        role: isOwner ? inviteRole : "contributor",
      });

      //Nobody is added without agreeing: the invitee accepts on their home
      //page or through the link, which we copy right away for convenience
      await copyInviteLink(inviteId, false);
      toast.success(`Invite sent to ${trimmedEmail}`, {
        description:
          "They get access after accepting. Invite link copied to your clipboard.",
      });
      setEmail("");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Unable to send invite"));
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemove = async (
    contributorId: Id<"projectContributors">,
    label: string,
  ) => {
    try {
      await removeContributor({ contributorId });
      toast.success(`${label} was removed from the project`);
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Unable to remove member"));
    }
  };

  const handleRoleChange = async (
    contributorId: Id<"projectContributors">,
    role: ContributorRole,
    label: string,
  ) => {
    try {
      await setContributorRole({ contributorId, role });
      toast.success(
        role === "admin"
          ? `${label} is now an admin`
          : `${label} is now a contributor`,
      );
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Unable to change role"));
    }
  };

  const handleLeave = async (contributorId: Id<"projectContributors">) => {
    try {
      //Leave the page first: once the row is gone, this project's queries
      //start throwing "Unauthorized" for us
      router.push("/");
      await removeContributor({ contributorId });
      toast.success("You left the project");
    } catch (error) {
      toast.error(getMutationErrorMessage(error, "Unable to leave project"));
    }
  };

  //#region Free plan, nobody on the team yet → just an upgrade button
  //There is nothing to show in the popover, so the button itself is the
  //upsell. (A free owner who still HAS members — e.g. after a downgrade —
  //keeps the normal popover so they can see and remove them.)
  //#endregion
  if (team && !team.teamEnabled && isOwner && team.contributors.length === 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2"
        onClick={showUpgrade}
      >
        <UsersIcon className="size-3.5" />
        <span className="text-sm">Collaborate</span>
        <ProBadge />
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2">
          <UsersIcon className="size-3.5" />
          <span className="text-sm">Team</span>
          {/* The one exception to "PRO badge for every free user": collaboration
              runs on the OWNER's plan, so on someone else's project a free
              admin/contributor isn't being upsold anything → owner only */}
          {isOwner && <ProBadge />}
          {team && (
            <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="flex items-center gap-1.5 text-sm font-medium">
              Team collaboration
              {isOwner && <ProBadge />}
            </h4>
            <p className="text-xs text-muted-foreground">
              {canManage && teamEnabled
                ? "Invite people by the email they sign in with. Once they accept, they can edit the code with you in real time."
                : "People working on this project."}
            </p>
          </div>

          {/* Plan doesn't include collaboration → upgrade prompt instead of
              the invite form (owner can upgrade, an admin can only ask) */}
          {canManage && !teamEnabled && (
            <div className="flex flex-col gap-2 rounded-md border border-logo/30 bg-logo/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-logo">
                <SparklesIcon className="size-3.5" />
                Team collaboration is a Pro feature
              </p>
              <p className="text-xs text-muted-foreground">
                {isOwner
                  ? "Upgrade to invite new teammates and manage roles. Current members keep their access."
                  : "Ask the project owner to upgrade to Pro to invite new teammates."}
              </p>
              {isOwner && (
                <Button size="sm" className="h-7" onClick={() => openBilling()}>
                  Upgrade to Pro
                </Button>
              )}
            </div>
          )}

          {canManage && teamEnabled && (
            <form onSubmit={handleInvite} className="flex flex-col gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                className="h-8 text-sm"
                disabled={isInviting}
              />
              <div className="flex gap-2">
                {/* Only the owner can invite someone straight in as admin */}
                {isOwner && (
                  <Select
                    value={inviteRole}
                    onValueChange={(value: ContributorRole) =>
                      setInviteRole(value)
                    }
                    disabled={isInviting}
                  >
                    <SelectTrigger size="sm" className="h-8 flex-1 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contributor">
                        {ROLE_LABELS.contributor}
                      </SelectItem>
                      <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 flex-1"
                  disabled={isInviting || !email.trim()}
                >
                  {isInviting ? "Inviting..." : "Invite"}
                </Button>
              </div>
            </form>
          )}

          {team === undefined ? (
            <p className="text-xs text-muted-foreground">Loading team...</p>
          ) : (
            <ul className="max-h-64 divide-y overflow-y-auto">
              <MemberRow
                name={team.owner.name}
                email={team.owner.email}
                imageUrl={team.owner.imageUrl}
                isYou={team.viewerId === team.owner.userId}
                badge={
                  <Badge variant="outline" className="gap-1">
                    <CrownIcon className="text-logo" />
                    Owner
                  </Badge>
                }
              />
              {team.contributors.map((contributor) => {
                const isYou = contributor.userId === team.viewerId;
                const label = contributor.name || contributor.email;

                return (
                  <MemberRow
                    key={contributor._id}
                    name={contributor.name}
                    email={contributor.email}
                    imageUrl={contributor.imageUrl}
                    isYou={isYou}
                    badge={
                      <>
                        {contributor.status === "pending" && (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                        {isOwner ? (
                          //The owner can switch roles (also on pending invites)
                          <Select
                            value={contributor.role}
                            disabled={!teamEnabled}
                            onValueChange={(value: ContributorRole) =>
                              handleRoleChange(contributor._id, value, label)
                            }
                          >
                            <SelectTrigger
                              size="sm"
                              aria-label={`Role of ${label}`}
                              className="h-6! gap-1 px-2 text-xs"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent align="end">
                              <SelectItem value="contributor">
                                {ROLE_LABELS.contributor}
                              </SelectItem>
                              <SelectItem value="admin">
                                {ROLE_LABELS.admin}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn(
                              "gap-1",
                              contributor.role === "admin" && "text-logo",
                            )}
                          >
                            {contributor.role === "admin" && <ShieldIcon />}
                            {ROLE_LABELS[contributor.role]}
                          </Badge>
                        )}
                      </>
                    }
                    action={
                      canManageRow(contributor.role) && !isYou ? (
                        <>
                          {contributor.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground"
                              aria-label={`Copy invite link for ${label}`}
                              title="Copy invite link"
                              onClick={() => copyInviteLink(contributor._id)}
                            >
                              <LinkIcon className="size-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            aria-label={
                              contributor.status === "pending"
                                ? `Cancel invite for ${label}`
                                : `Remove ${label}`
                            }
                            onClick={() => handleRemove(contributor._id, label)}
                          >
                            <XIcon className="size-3.5" />
                          </Button>
                        </>
                      ) : isYou ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Leave project"
                          title="Leave project"
                          onClick={() => handleLeave(contributor._id)}
                        >
                          <LogOutIcon className="size-3.5" />
                        </Button>
                      ) : null
                    }
                  />
                );
              })}
            </ul>
          )}

          {team &&
            team.contributors.length === 0 &&
            canManage &&
            teamEnabled && (
              <p className="text-xs text-muted-foreground">
                No contributors yet — invite someone above.
              </p>
            )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
