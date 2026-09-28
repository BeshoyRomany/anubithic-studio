import { useMutation, useQuery } from "convex/react";

import { api } from "../../../../convex/_generated/api";
import { DEFAULT_MODEL_ID, getModelDefinition } from "../models";

export const useAiSettings = () => useQuery(api.aiSettings.get);

export const useAiKeys = () => useQuery(api.aiKeys.list);

// The model every AI feature runs on (a registry model or the user's local one).
// undefined while loading.
export const useChosenModel = () => {
  const settings = useAiSettings();

  if (settings === undefined) return undefined;
  return (
    getModelDefinition(settings?.modelId ?? "", settings) ??
    getModelDefinition(DEFAULT_MODEL_ID)!
  );
};

export const useSetModel = () => useMutation(api.aiSettings.setModel);

export const useRemoveLocalModel = () =>
  useMutation(api.aiSettings.removeLocalModel);

export const useRemoveAiKey = () => useMutation(api.aiKeys.remove);
