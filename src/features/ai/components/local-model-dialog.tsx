"use client";

import ky from "ky";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CheckIcon,
  LoaderIcon,
  Trash2Icon,
  XCircleIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { useAiSettings, useRemoveLocalModel } from "../hooks/use-ai-settings";
import { DEFAULT_OLLAMA_URL, LOCAL_AGENT_RECOMMENDATIONS } from "../models";
import { useLocalModelStatus } from "../hooks/use-local-model-status";
import { errorMessage } from "../utils/error-message";

// In production our servers can't reach the user's localhost, so Ollama needs a public https tunnel
const NEEDS_TUNNEL = process.env.NODE_ENV !== "development";

// Ollama rejects requests whose Host isn't localhost, hence the host-header flags
const TUNNELS = [
  {
    name: "ngrok",
    href: "https://ngrok.com/download",
    command: 'ngrok http 11434 --host-header="localhost:11434"',
  },
  {
    name: "Cloudflare Tunnel",
    href: "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
    command:
      'cloudflared tunnel --url http://localhost:11434 --http-host-header="localhost:11434"',
  },
];

const TunnelSteps = () => (
  <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
    <p className="font-medium text-foreground">Connect through a tunnel</p>
    <p>
      Your model runs on your computer, and our servers reach it through a
      secure tunnel. Start Ollama, then run one of these and paste the{" "}
      <code className="font-mono">https://</code> address it prints:
    </p>
    {TUNNELS.map(({ name, href, command }) => (
      <div key={name} className="flex flex-col gap-1">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="w-fit text-foreground underline underline-offset-4"
        >
          {name}
        </a>
        <code className="select-all break-all rounded bg-background px-2 py-1 font-mono">
          {command}
        </code>
      </div>
    ))}
    {!NEEDS_TUNNEL && (
      <p>
        Running the app locally? Leave the URL empty to use{" "}
        <code className="font-mono">{DEFAULT_OLLAMA_URL}</code>.
      </p>
    )}
    <p className="flex items-start gap-1.5">
      <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
      Ollama has no password: anyone with this address can use your model. Keep
      it private and stop the tunnel when you&apos;re done.
    </p>
  </div>
);

// Small models often call tools badly even when they support them.
const isSmallModel = (parameterSize?: string) => {
  const billions = parseFloat(parameterSize ?? "");
  return Number.isFinite(billions) && billions < 7;
};

const LocalRecommendations = () => (
  <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
    {LOCAL_AGENT_RECOMMENDATIONS.map(({ size, memory, models, note }) => (
      <li key={size}>
        <span className="font-medium text-foreground">{size}</span> ({memory}
        ): {note}.{" "}
        {models.map((model, index) => (
          <span key={model}>
            {index > 0 && ", "}
            <code className="font-mono">{model}</code>
          </span>
        ))}
      </li>
    ))}
  </ul>
);

const LocalModelForm = ({ open }: { open: boolean }) => {
  const settings = useAiSettings();
  const removeLocalModel = useRemoveLocalModel();
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [draftModel, setDraftModel] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const url = draftUrl ?? settings?.ollamaBaseUrl ?? "";
  const model = draftModel ?? settings?.localModel ?? "";
  const connected = settings?.localModel;
  const live = useLocalModelStatus(open, connected);
  const online = live?.status === "online";
  // Fields unchanged from the saved, reachable model: nothing to connect
  const alreadyConnected =
    online &&
    model.trim() === connected &&
    (url.trim() || undefined) === (settings?.ollamaBaseUrl || undefined);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await ky.post("/api/ai-local", {
        json: { baseUrl: url || undefined, model },
        timeout: 20_000,
        retry: 0,
      });
      setDraftUrl(null);
      setDraftModel(null);
      toast.success(`Connected to ${model}`);
    } catch (error) {
      toast.error(await errorMessage(error, "Couldn't connect to Ollama"));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          // Renders inside the chat's form: React bubbles submit through portals
          e.stopPropagation();
          void handleConnect();
        }}
      >
        <Input
          placeholder="Tunnel URL, e.g. https://your-name.ngrok-free.app"
          value={url}
          onChange={(e) => setDraftUrl(e.target.value)}
          className="h-8 font-mono text-xs"
        />
        <div className="flex items-center gap-2">
          <Input
            placeholder="Model name, e.g. qwen2.5:14b"
            value={model}
            onChange={(e) => setDraftModel(e.target.value)}
            className="h-8 font-mono text-xs"
          />
          <Button
            size="sm"
            type="submit"
            disabled={
              connecting ||
              alreadyConnected ||
              !model.trim() ||
              (NEEDS_TUNNEL && !url.trim())
            }
          >
            {connecting ? (
              "Checking..."
            ) : alreadyConnected ? (
              <>
                <CheckIcon className="size-3.5" />
                Connected
              </>
            ) : (
              "Connect"
            )}
          </Button>
        </div>
      </form>

      {connected && live === null && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderIcon className="size-3.5 animate-spin" />
          Checking connection to Ollama...
        </p>
      )}

      {connected && live && !online && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <XCircleIcon className="mt-0.5 size-3.5 shrink-0" />
          {"message" in live && live.message
            ? live.message
            : "Couldn't reach Ollama."}
        </p>
      )}

      {connected &&
        online &&
        settings?.localModelSupportsTools &&
        !isSmallModel(settings.localModelParameterSize) && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2Icon className="size-3.5 text-green-500" />
            <code className="font-mono">{connected}</code>
            {settings.localModelParameterSize &&
              ` (${settings.localModelParameterSize})`}{" "}
            connected, supports tools: ready for the agent.
          </p>
        )}

      {connected &&
        online &&
        settings?.localModelSupportsTools &&
        isSmallModel(settings.localModelParameterSize) && (
          <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-2">
            <p className="flex items-start gap-1.5 text-xs">
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              <span>
                <code className="font-mono">{connected}</code> (
                {settings.localModelParameterSize}) is connected. It&apos;s
                fine for quick edit and suggestions, but models under 7B often
                misuse the agent&apos;s tools and may not answer properly in
                chat. For the agent, use a 7B model or larger:
              </span>
            </p>
            <LocalRecommendations />
          </div>
        )}

      {connected && online && !settings?.localModelSupportsTools && (
        <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-2">
          <p className="flex items-start gap-1.5 text-xs">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
            <span>
              <code className="font-mono">{connected}</code> can&apos;t call
              tools, so it can do quick edit and suggestions but not the agent.
              For the agent, pull one of these:
            </span>
          </p>
          <LocalRecommendations />
        </div>
      )}

      {connected && (
        <Button
          size="sm"
          variant="ghost"
          className="w-fit text-muted-foreground hover:text-destructive"
          onClick={() => void removeLocalModel()}
        >
          <Trash2Icon className="size-3.5" />
          Disconnect {connected}
        </Button>
      )}

      {alreadyConnected ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer w-fit">
            How to connect through a tunnel
          </summary>
          <div className="mt-2">
            <TunnelSteps />
          </div>
        </details>
      ) : (
        <TunnelSteps />
      )}

      {!connected && (
        <p className="text-xs text-muted-foreground">
          Runs on your own machine, free. For the agent, start Ollama with a
          bigger context window:{" "}
          <code className="font-mono">OLLAMA_CONTEXT_LENGTH=32768 ollama serve</code>
        </p>
      )}
    </div>
  );
};

interface LocalModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Connects a model running in the user's own Ollama. No API key involved.
export const LocalModelDialog = ({ open, onOpenChange }: LocalModelDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Local model</DialogTitle>
        <DialogDescription>
          Run a model on your own machine with Ollama. No API key needed, and
          nothing is billed per request.
        </DialogDescription>
      </DialogHeader>
      <LocalModelForm open={open} />
    </DialogContent>
  </Dialog>
);
