import { useEffect, useRef, useState } from "react";
import { rpc, type Participation } from "../api";

type Draft = { answers: Record<string, string>; current_question: number };
export function useAttemptDraft(token: string, participation: Participation) {
  const key = `hpde:attempt:${participation.attempt_id}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed.answers === "object" &&
          Number.isInteger(parsed.current_question)
        )
          return parsed;
      }
    } catch {
      /* Server snapshot is the fallback. */
    }
    return participation.progress ?? { answers: {}, current_question: 0 };
  });
  const [syncError, setSyncError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [dirty, setDirty] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const latest = useRef(draft);
  latest.current = draft;
  const queue = useRef(Promise.resolve());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function sync(snapshot = latest.current): Promise<void> {
    const work = queue.current
      .catch(() => undefined)
      .then(async () => {
        if (!mounted.current) return;
        setSyncing(true);
        try {
          await rpc("save_attempt_progress", {
            p_token: token,
            p_attempt_id: participation.attempt_id,
            p_answers: snapshot.answers,
            p_current_question: snapshot.current_question,
          });
          if (mounted.current) {
            setSyncError("");
            if (JSON.stringify(snapshot) === JSON.stringify(latest.current))
              setDirty(false);
          }
        } catch (e) {
          if (mounted.current) setSyncError((e as Error).message);
          throw e;
        } finally {
          if (mounted.current) setSyncing(false);
        }
      });
    queue.current = work;
    return work;
  }
  const syncRef = useRef(sync);
  syncRef.current = sync;
  useEffect(() => {
    setDirty(true);
    try {
      sessionStorage.setItem(key, JSON.stringify(draft));
    } catch {
      setSyncError(
        "Armazenamento local indisponível. Mantenha esta página aberta até enviar.",
      );
    }
    const timeout = setTimeout(() => {
      if (navigator.onLine) void syncRef.current(draft).catch(() => undefined);
    }, 600);
    return () => clearTimeout(timeout);
  }, [draft, key]);
  useEffect(() => {
    const connect = () => {
      setOnline(true);
      void syncRef.current().catch(() => undefined);
    };
    const disconnect = () => setOnline(false);
    addEventListener("online", connect);
    addEventListener("offline", disconnect);
    return () => {
      removeEventListener("online", connect);
      removeEventListener("offline", disconnect);
    };
  }, []);
  return {
    draft,
    setDraft,
    sync,
    syncError,
    syncing,
    dirty,
    online,
    clear: () => sessionStorage.removeItem(key),
  };
}
