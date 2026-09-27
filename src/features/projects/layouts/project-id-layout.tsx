"use client";

import { ConversationSidebar } from "@/features/conversations/components/conversation-sidebar";
import { Id } from "../../../../convex/_generated/dataModel";
import { Navbar } from "../components/navbar";
import { PresenceBar } from "../components/presence-bar";
import { Allotment } from "allotment";
import { useEffect } from "react";
import { LogoLoader } from "@/components/logo-loader";
import { useDeletingProjectStore } from "../store/use-deleting-project-store";

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 800;
const DEFAULT_CONVERSATION_SIDEBAR_WIDTH = 400;
const DEFAULT_MAIN_SIZE = 1000;

interface ProjectIdLayoutProps {
  children: React.ReactNode;
  projectId: Id<"projects">;
}
export const ProjectIdLayout = ({
  children,
  projectId,
}: ProjectIdLayoutProps) => {
  const deletingProjectId = useDeletingProjectStore(
    (state) => state.deletingProjectId,
  );
  const setDeletingProjectId = useDeletingProjectStore(
    (state) => state.setDeletingProjectId,
  );

  //Reset the flag when we leave the project (e.g. redirected home after deleting)
  useEffect(() => {
    return () => setDeletingProjectId(null);
  }, [setDeletingProjectId]);

  //Project is being deleted -> unmount the whole IDE so none of its queries
  //throw "Project not found" (see use-deleting-project-store.ts)
  if (deletingProjectId === projectId) {
    return <LogoLoader label="Deleting project..." className="bg-sidebar" />;
  }

  return (
    <div className="w-full h-screen flex flex-col">
      <Navbar projectId={projectId} />
      <Allotment
        className="flex-1"
        //Two default sized -> which means 2 allotment panes
        defaultSizes={[DEFAULT_CONVERSATION_SIDEBAR_WIDTH, DEFAULT_MAIN_SIZE]}
      >
        <Allotment.Pane
          snap
          minSize={MIN_SIDEBAR_WIDTH}
          maxSize={MAX_SIDEBAR_WIDTH}
          preferredSize={DEFAULT_CONVERSATION_SIDEBAR_WIDTH}
        >
          <ConversationSidebar projectId={projectId} />
        </Allotment.Pane>
        <Allotment.Pane preferredSize={DEFAULT_MAIN_SIZE}>
          {children}
        </Allotment.Pane>
      </Allotment>
      {/* Who else is here + which file they're on. Also sends our own
          heartbeat, so it stays mounted for the whole project session. */}
      <PresenceBar projectId={projectId} />
    </div>
  );
};
