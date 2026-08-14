import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useAuth } from "@clerk/nextjs";

export const useProject = (projectId: Id<"projects">) => {
  return useQuery(api.projects.getById, { projectId });
};
export const useProjects = () => {
  return useQuery(api.projects.get);
};

export const useProjectsPartial = (limit: number) => {
  return useQuery(api.projects.getPartial, { limit });
};

export const useCreateProject = () => {
  const { userId } = useAuth();
  return useMutation(api.projects.create).withOptimisticUpdate(
    (localStore, args) => {
      const now = Date.now();
      const newProject = {
        _id: crypto.randomUUID() as Id<"projects">,
        _creationTime: now,
        name: args.name,
        ownerId: userId || "anonymous",
        updatedAt: now,
      };

      const existingProjects = localStore.getQuery(api.projects.get);

      if (existingProjects !== undefined) {
        localStore.setQuery(api.projects.get, {}, [
          newProject,
          ...existingProjects,
        ]);
      }

      const limit = 6;
      const existingPartial = localStore.getQuery(api.projects.getPartial, {
        limit,
      });

      if (existingPartial !== undefined) {
        localStore.setQuery(api.projects.getPartial, { limit }, [
          newProject,
          ...existingPartial,
        ]);
      }
    },
  );
};

export const useRenameProject = () => {
  return useMutation(api.projects.rename).withOptimisticUpdate(
    (localStore, args) => {
      args.projectId;
      const now = Date.now();

      //Update the current project (getById)
      const existingProject = localStore.getQuery(api.projects.getById, {
        projectId: args.projectId,
      });

      if (existingProject !== undefined && existingProject !== null) {
        localStore.setQuery(
          api.projects.getById,
          { projectId: args.projectId },
          {
            ...existingProject,
            name: args.name,
            updatedAt: now,
          },
        );
      }

      //Update the projects list (get)
      const existingProjects = localStore.getQuery(api.projects.get);
      if (existingProjects !== undefined) {
        localStore.setQuery(
          api.projects.get,
          {},
          existingProjects.map((project) => {
            return project._id === args.projectId
              ? { ...project, name: args.name, updatedAt: now }
              : project;
          }),
        );
      }
    },
  );
};
