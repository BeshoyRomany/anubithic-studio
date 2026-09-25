import { create } from "zustand";
import { Id } from "../../../../convex/_generated/dataModel";

//#region Why a store for this?
//When the project you are currently inside gets deleted, every query on the
//IDE page (project, files, conversations, …) starts throwing "Project not found".
//So BEFORE firing the delete mutation we flag the project here, and
//"ProjectIdLayout" swaps the whole IDE for a "Deleting…" screen — unmounting all
//those queries. After success we navigate home; on failure we clear the flag and
//the IDE mounts again.
//The flag has to be shared state because the delete button lives in
//"ProjectIdView" (the page) while the thing to unmount is the layout around it.
//#endregion
interface DeletingProjectState {
  deletingProjectId: Id<"projects"> | null;
  setDeletingProjectId: (projectId: Id<"projects"> | null) => void;
}

export const useDeletingProjectStore = create<DeletingProjectState>((set) => ({
  deletingProjectId: null,
  setDeletingProjectId: (projectId) => set({ deletingProjectId: projectId }),
}));
