"use client";

import { useEffect, useRef, useState } from "react";
import { Conversation } from "@elevenlabs/client";

type State = "idle" | "connecting" | "live" | "ended" | "error";
type Session = Awaited<ReturnType<typeof Conversation.startSession>>;

/** Talk to your own agent through the browser mic. Calls made this way appear in Calls as "Browser test call". */
export function TestCallButton({ disabled }: { disabled?: boolean }) {
  const session = useRef<Session | null>(null);
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<{ role: string; content: string }[]>([]);
  const [agentTalking, setAgentTalking] = useState(false);

  useEffect(() => () => void session.current?.endSession(), []);

  async function start() {
    setError(null);
    setLines([]);
    setState("connecting");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }); // ask for the mic up front, with a clear prompt
      const res = await fetch("/api/test-call", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't start the call");
      session.current = await Conversation.startSession({
        signedUrl: body.signedUrl,
        onConnect: () => setState("live"),
        onDisconnect: () => {
          setState("ended");
          setAgentTalking(false);
        },
        onModeChange: ({ mode }) => setAgentTalking(mode === "speaking"),
        onMessage: ({ role, message }) => setLines((cur) => [...cur, { role, content: message }].slice(-6)),
        onError: (message) => {
          setError(message);
          setState("error");
        },
      });
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }

  const live = state === "live" || state === "connecting";
  return (
    <div>
      {live ? (
        <button type="button" className="btn btn-danger" onClick={() => session.current?.endSession()}>
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
