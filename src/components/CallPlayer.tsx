"use client";

import { useEffect, useRef, useState } from "react";
import { fmtClock } from "@/lib/format";

export interface Turn {
  role: string;
  content: string;
  start: number | null; // seconds into the recording
}

const SPEEDS = [1, 1.25, 1.5, 2];

/**
 * Recording + transcript, kept in step: the line being spoken is highlighted while it plays, and
 * clicking any line jumps the audio to that moment.
 */
export function CallPlayer({ src, turns, agentName }: { src: string | null; turns: Turn[]; agentName: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [follow, setFollow] = useState(true);
  const lineRefs = useRef<(HTMLLIElement | null)[]>([]);

  let active = -1;
  for (let i = 0; i < turns.length; i++) if (turns[i].start != null && turns[i].start! <= time + 0.05) active = i;

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    if (!follow || active < 0 || audio.current?.paused) return;
    lineRefs.current[active]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active, follow]);

  function seek(t: number | null) {
    if (t == null || !audio.current) return;
    audio.current.currentTime = Math.max(0, t - 0.2);
    void audio.current.play();
  }

  return (
    <div className="card overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-black/5 bg-surface-2/60">
        {src ? (
          <div className="flex flex-wrap items-center gap-3">
            <audio
              ref={audio}
              src={src}
              controls
              preload="metadata"
              className="flex-1 min-w-[240px] h-10"
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            />
            <div className="flex items-center gap-1" role="group" aria-label="Playback speed">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  className={`btn btn-sm tabular ${speed === s ? "btn-primary" : "btn-ghost"}`}
                >
                  {s}×
                </button>
              ))}
            </div>
            <a href={src} download className="btn btn-ghost btn-sm">Download</a>
          </div>
        ) : (
          <p className="text-sm text-muted">The recording is still processing or wasn&apos;t saved for this call.</p>
        )}
      </div>

      {turns.length ? (
        <>
          {src && (
            <label className="flex items-center gap-2 text-xs text-muted px-5 pt-3">
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow along while playing
            </label>
          )}
          <ol className="p-4 sm:p-5 space-y-3 max-h-[560px] overflow-y-auto">
            {turns.map((t, i) => {
              const agent = t.role === "agent";
              return (
                <li key={i} ref={(el) => { lineRefs.current[i] = el; }} className={`flex ${agent ? "" : "justify-end"}`}>
                  <button
                    type="button"
                    onClick={() => seek(t.start)}
                    disabled={!src || t.start == null}
                    className={`text-left max-w-[85%] rounded-xl px-3.5 py-2.5 text-[14.5px] leading-relaxed transition-shadow disabled:cursor-default ${
                      agent ? "bg-surface-2" : "bg-fg text-white"
                    } ${i === active ? "shadow-[0_0_0_2px_var(--link)]" : ""}`}
                  >
                    <span className={`block text-[11px] font-semibold mb-0.5 ${agent ? "text-muted" : "text-white/70"}`}>
                      {agent ? agentName : "Caller"}
                      {t.start != null && <span className="tabular font-normal"> · {fmtClock(t.start)}</span>}
                    </span>
                    {t.content}
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <p className="p-5 text-sm text-muted">No transcript for this call yet.</p>
      )}
    </div>
  );
}
