"use client";

import { useEffect, useRef, useState } from "react";
import { RetellWebClient } from "retell-client-js-sdk";

type State = "idle" | "connecting" | "live" | "ended" | "error";

/** Talk to your own agent through the browser mic. Calls made this way appear in Calls as "Browser test call". */
export function TestCallButton({ disabled }: { disabled?: boolean }) {
  const client = useRef<RetellWebClient | null>(null);
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<{ role: string; content: string }[]>([]);
  const [agentTalking, setAgentTalking] = useState(false);

  useEffect(() => () => client.current?.stopCall(), []);

  async function start() {
    setError(null);
    setLines([]);
    setState("connecting");
    try {
      const res = await fetch("/api/test-call", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't start the call");
      const c = new RetellWebClient();
      client.current = c;
      c.on("call_started", () => setState("live"));
      c.on("call_ended", () => {
        setState("ended");
        setAgentTalking(false);
      });
      c.on("agent_start_talking", () => setAgentTalking(true));
      c.on("agent_stop_talking", () => setAgentTalking(false));
      c.on("update", (u: { transcript?: { role: string; content: string }[] }) => {
        if (u.transcript) setLines(u.transcript.slice(-6));
      });
      c.on("error", (e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
        c.stopCall();
      });
      await c.startCall({ accessToken: body.accessToken });
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }

  const live = state === "live" || state === "connecting";
  return (
    <div>
      {live ? (
        <button type="button" className="btn btn-danger" onClick={() => client.current?.stopCall()}>
          <span className={`size-2 rounded-full bg-[var(--bad)] ${agentTalking ? "animate-pulse" : ""}`} aria-hidden />
          {state === "connecting" ? "Connecting…" : "End test call"}
        </button>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={start} disabled={disabled}>
          Talk to it in your browser
        </button>
      )}
      {error && <p className="text-sm text-[var(--bad)] mt-2" role="alert">{error}</p>}
      {state === "ended" && <p className="text-sm text-muted mt-2">Call ended. It will show up under Calls in a moment.</p>}
      {lines.length > 0 && (
        <ol className="mt-3 space-y-1.5 text-sm" aria-live="polite">
          {lines.map((l, i) => (
            <li key={i}>
              <span className="font-semibold">{l.role === "agent" ? "Agent" : "You"}:</span> <span className="text-muted">{l.content}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
