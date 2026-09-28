"use client";

import ky from "ky";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLinkIcon, LockIcon, Trash2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { useAiKeys, useRemoveAiKey } from "../hooks/use-ai-settings";
import { CLOUD_PROVIDERS, CloudProvider, PROVIDER_INFO } from "../models";
import { errorMessage } from "../utils/error-message";
import { ProviderLogo } from "./provider-logo";



//#region Cloud provider row
const CloudKeyRow = ({
  provider,
  last4,
  lastUsedAt,
}: {
  provider: CloudProvider;
  last4?: string;
  lastUsedAt?: number;
}) => {
  const info = PROVIDER_INFO[provider];
  const removeKey = useRemoveAiKey();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const showInput = !last4 || editing;

  const handleSave = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await ky.post("/api/ai-keys", {
        json: { provider, apiKey: value },
        timeout: 20_000,
        retry: 0,
      });
      toast.success(`${info.label} key saved`);
      setEditing(false);
    } catch (error) {
      toast.error(await errorMessage(error, "Couldn't save the key"));
    } finally {
      // The pasted key never stays in the page after saving
      setValue("");
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    try {
      await removeKey({ provider });
      toast.success(`${info.label} key deleted`);
    } catch {
      toast.error("Couldn't delete the key");
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-foreground/10 p-3">
      <div className="flex items-center gap-2">
        <ProviderLogo provider={provider} className="size-4" />
        <span className="text-sm font-medium">{info.label}</span>
        {last4 && !editing && (
          <>
            <Badge variant="secondary" className="font-mono">
              ••••{last4}
            </Badge>
            {/* Lets users spot use they didn't expect */}
            <span className="text-xs text-muted-foreground">
              {lastUsedAt
                ? `Last used ${formatDistanceToNow(lastUsedAt, { addSuffix: true })}`
                : "Not used yet"}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                Replace
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Delete ${info.label} key`}
                className="text-muted-foreground hover:text-destructive"
                onClick={handleRemove}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </div>
          </>
        )}
        {showInput && info.keyUrl && (
          <a
            href={info.keyUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Get a key <ExternalLinkIcon className="size-3" />
          </a>
        )}
      </div>
      {showInput && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            // This dialog renders inside the chat's form: React bubbles submit through
            // portals, so without this, Save would also send an empty chat message.
            e.stopPropagation();
            void handleSave();
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={info.keyPlaceholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-8 font-mono text-xs"
          />
          <Button size="sm" type="submit" disabled={saving || !value.trim()}>
            {saving ? "Checking..." : "Save"}
          </Button>
          {editing && (
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => {
                setEditing(false);
                setValue("");
              }}
            >
              Cancel
            </Button>
          )}
        </form>
      )}
    </div>
  );
};
//#endregion



interface ApiKeysDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ApiKeysDialog = ({ open, onOpenChange }: ApiKeysDialogProps) => {
  const keys = useAiKeys();
  const keyBy = new Map(keys?.map((key) => [key.provider, key]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>API keys</DialogTitle>
          <DialogDescription>
            Use your own provider keys. You pay your provider directly for what
            you use.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {CLOUD_PROVIDERS.map((provider) => (
            <CloudKeyRow
              key={provider}
              provider={provider}
              last4={keyBy.get(provider)?.last4}
              lastUsedAt={keyBy.get(provider)?.lastUsedAt}
            />
          ))}
        </div>

        <div className="flex gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          <LockIcon className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Your key is encrypted before it&apos;s stored, and we never show it
            again. We keep only its last 4 characters unencrypted, like
            &quot;card ending in 1234&quot;, so you can tell which key you saved.
            It&apos;s only used for your own requests, sent from our servers
            straight to the provider. Delete it here any time, or revoke it in
            your provider&apos;s console. Tip: create a key just for Anubithic
            Studio and set a monthly spending limit.{" "}
            <a
              href="/security"
              target="_blank"
              className="underline underline-offset-4 hover:text-foreground"
            >
              How we protect your key
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
