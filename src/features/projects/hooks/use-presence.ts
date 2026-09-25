import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuth } from "@clerk/nextjs";

import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useEditorStore } from "@/features/editor/store/use-editor-store";

//How often this browser says "I'm still here (on this file)"
const HEARTBEAT_INTERVAL_MS = 10_000;
//Missed ~3 heartbeats → treat as gone (closed laptop, crashed tab, offline)
const ONLINE_THRESHOLD_MS = 30_000;
//How often the "who is still online" filter re-evaluates
const CLOCK_TICK_MS = 5_000;

//#region usePresence
//Both halves of presence for one project, used once by <PresenceBar>:
//
//1- SEND: heartbeat right away, whenever the active editor tab changes, and
//   every HEARTBEAT_INTERVAL_MS. "leave" on unmount (closing the project).
//   The active file comes from the editor store's per-project "activeTabId" —
//   the same source the tabs and the auto-reveal use.
//
//2- RECEIVE: "presence.list" is reactive, so the bar updates the moment
//   anyone switches file. But a query does NOT re-run just because time
//   passes, so staleness is decided here with a ticking clock.
//
//Clock skew: "lastSeenAt" is SERVER time; comparing it with this machine's
//Date.now() breaks if the local clock is off by more than the threshold. Each
//heartbeat returns the server's time, so we keep "serverNow - localNow" and
//judge freshness in server time.
//#endregion
export const usePresence = (projectId: Id<"projects">) => {
  const { userId } = useAuth();
  const activeFileId = useEditorStore(
    (state) => state.getTabState(projectId).activeTabId,
  );

  const heartbeat = useMutation(api.presence.heartbeat);
  const leave = useMutation(api.presence.leave);
  const rows = useQuery(api.presence.list, { projectId });

  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  //1- SEND (re-subscribes, and so beats immediately, when the file changes)
  useEffect(() => {
    const beat = async () => {
      try {
        const sentAt = Date.now();
        const serverNow = await heartbeat({
          projectId,
          fileId: activeFileId ?? undefined,
        });
        setClockOffset(serverNow - sentAt);
      } catch {
        //Access revoked / project deleted — the page's own queries handle
        //that (error screen), presence just stays quiet
      }
    };

    beat();
    const interval = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [projectId, activeFileId, heartbeat]);

  //Remove our row when the project closes (best effort — if the tab dies
  //first, the row simply goes stale and is filtered out below)
  useEffect(() => {
    return () => {
      leave({ projectId }).catch(() => {});
    };
  }, [projectId, leave]);

  //2- RECEIVE: re-evaluate who's still fresh even when no data changes
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const serverNow = now + clockOffset;
  const others = (rows ?? []).filter(
    (row) =>
      row.userId !== userId && serverNow - row.lastSeenAt < ONLINE_THRESHOLD_MS,
  );

  return { others, isLoading: rows === undefined };
};
