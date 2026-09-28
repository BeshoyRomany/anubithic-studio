import ky from "ky";
import { useEffect, useState } from "react";

import type { LocalModelStatus } from "@/app/api/ai-local/route";

const POLL_MS = 5_000;

const fetchStatus = () =>
  ky
    .get("/api/ai-local", { timeout: 10_000, retry: 0 })
    .json<LocalModelStatus>()
    .catch((): LocalModelStatus => ({ status: "offline" }));

// Live status of the saved local model while `enabled` (the dialog is open).
// `localModel` re-triggers the check right after connecting or disconnecting.
export const useLocalModelStatus = (enabled: boolean, localModel?: string) => {
  const [status, setStatus] = useState<LocalModelStatus | null>(null);

  useEffect(() => {
    if (!enabled || !localModel) return;

    let cancelled = false;
    const check = () =>
      void fetchStatus().then((next) => {
        if (!cancelled) setStatus(next);
      });

    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, localModel]);

  // null while the first check runs, or when there's nothing to check
  return enabled && localModel ? status : null;
};
