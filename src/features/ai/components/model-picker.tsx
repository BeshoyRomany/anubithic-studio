"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckIcon, KeyRoundIcon, LaptopIcon } from "lucide-react";

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorSeparator,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";

import {
  useAiKeys,
  useAiSettings,
  useChosenModel,
  useSetModel,
} from "../hooks/use-ai-settings";
import {
  CLOUD_PROVIDERS,
  localModelDefinition,
  ModelDefinition,
  MODELS,
  PROVIDER_INFO,
} from "../models";
import { ApiKeysDialog } from "./api-keys-dialog";
import { LocalModelDialog } from "./local-model-dialog";
import { ProviderLogo } from "./provider-logo";

const TIER_LABEL = { smart: "Smart", balanced: "Balanced", fast: "Fast" };

// One model for every AI feature: the agent, quick edit and suggestions all follow this pick.
export const ModelPicker = () => {
  const [open, setOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);

  const chosen = useChosenModel();
  const settings = useAiSettings();
  const keys = useAiKeys();
  const setModel = useSetModel();

  const providersWithKeys = new Set(keys?.map((key) => key.provider));
  const localModel = settings?.localModel
    ? localModelDefinition(
        settings.localModel,
        settings.localModelSupportsTools ?? false,
      )
    : null;

  const openKeys = () => {
    setOpen(false);
    setKeysOpen(true);
  };

  const openLocal = () => {
    setOpen(false);
    setLocalOpen(true);
  };

  const handleSelect = async (model: ModelDefinition) => {
    // Cloud model without a key: send the user to add one
    if (model.provider !== "ollama" && !providersWithKeys.has(model.provider)) {
      openKeys();
      return;
    }

    try {
      await setModel({ modelId: model.id });
      setOpen(false);
    } catch {
      toast.error("Couldn't switch the model");
    }
  };

  const renderItem = (model: ModelDefinition, blocker: string | null) => (
    <ModelSelectorItem
      key={model.id}
      value={`${PROVIDER_INFO[model.provider].label} ${model.label}`}
      onSelect={() => void handleSelect(model)}
      className={cn(blocker && "opacity-60")}
    >
      <ProviderLogo provider={model.provider} />
      <span className="truncate">{model.label}</span>
      <span className="text-xs text-muted-foreground">
        {model.provider === "ollama"
          ? settings?.localModelParameterSize
          : TIER_LABEL[model.tier]}
        {model.cost && ` · ${model.cost}`}
        {!model.supportsTools && " · no agent"}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">
        {blocker ??
          (chosen?.id === model.id && <CheckIcon className="size-4" />)}
      </span>
    </ModelSelectorItem>
  );

  return (
    <>
      <ApiKeysDialog open={keysOpen} onOpenChange={setKeysOpen} />
      <LocalModelDialog open={localOpen} onOpenChange={setLocalOpen} />
      <ModelSelector open={open} onOpenChange={setOpen}>
        <ModelSelectorTrigger asChild>
          <PromptInputButton
            size="sm"
            className="max-w-48 text-muted-foreground"
            tooltip="Model used by every AI feature"
          >
            {chosen && <ProviderLogo provider={chosen.provider} />}
            <span className="truncate">{chosen?.label ?? "Model"}</span>
          </PromptInputButton>
        </ModelSelectorTrigger>
        <ModelSelectorContent title="Choose a model">
          <ModelSelectorInput placeholder="Search models..." />
          <ModelSelectorList>
            <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
            {CLOUD_PROVIDERS.map((provider) => (
              <ModelSelectorGroup
                key={provider}
                heading={PROVIDER_INFO[provider].label}
              >
                {MODELS.filter((model) => model.provider === provider).map(
                  (model) =>
                    renderItem(
                      model,
                      providersWithKeys.has(provider) ? null : "Add key",
                    ),
                )}
              </ModelSelectorGroup>
            ))}
            <ModelSelectorGroup heading={PROVIDER_INFO.ollama.label}>
              {localModel ? (
                renderItem(localModel, null)
              ) : (
                <ModelSelectorItem value="connect local model" onSelect={openLocal}>
                  <LaptopIcon className="size-3" />
                  Connect a local model...
                </ModelSelectorItem>
              )}
            </ModelSelectorGroup>
            <ModelSelectorSeparator />
            <ModelSelectorGroup>
              <ModelSelectorItem value="manage api keys" onSelect={openKeys}>
                <KeyRoundIcon className="size-3" />
                Manage API keys
              </ModelSelectorItem>
              {localModel && (
                <ModelSelectorItem value="local model settings" onSelect={openLocal}>
                  <LaptopIcon className="size-3" />
                  Local model settings
                </ModelSelectorItem>
              )}
            </ModelSelectorGroup>
          </ModelSelectorList>
        </ModelSelectorContent>
      </ModelSelector>
    </>
  );
};
