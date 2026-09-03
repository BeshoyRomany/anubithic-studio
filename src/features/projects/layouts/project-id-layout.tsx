"use client";

import { ConversationSidebar } from "@/features/conversations/components/conversation-sidebar";
import { Id } from "../../../../convex/_generated/dataModel";
import { Navbar } from "../components/navbar";
import { Allotment } from "allotment";

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
    </div>
  );
};
