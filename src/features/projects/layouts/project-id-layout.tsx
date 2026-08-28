"use client";

import { Id } from "../../../../convex/_generated/dataModel";
import { Navbar } from "../components/navbar";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
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
          minSize={0}
          maxSize={0}
          preferredSize={0}
          // TODO: ADD -> MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH LATER, DEFAULT_CONVERSATION_SIDEBAR_WIDTH LATER
        >
          <div>Conversation Sidebar</div>
        </Allotment.Pane>
        <Allotment.Pane preferredSize={DEFAULT_MAIN_SIZE}>
          {children}
        </Allotment.Pane>
      </Allotment>
    </div>
  );
};
