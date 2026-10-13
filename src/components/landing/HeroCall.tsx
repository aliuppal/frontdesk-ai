"use client";

import { useEffect, useState } from "react";
import s from "@/app/landing.module.css";

// The hero's "live call": a scripted conversation that plays on a loop. Every moving part animates
// only transform/opacity (see the 60fps rules in landing.module.css). All bubbles are rendered from the
// start, so revealing them never shifts layout.

const SCRIPT = [
  { role: "agent", text: "Thanks for calling Riverside Plumbing! How can I help?" },
  { role: "user", text: "Our kitchen sink is backing up. Can someone come tomorrow?" },
  { role: "agent", text: "Sorry about that. I have 9:00 AM or 1:30 PM tomorrow. Which works?" },
  { role: "user", text: "Nine, please." },
  { role: "agent", text: "You're booked for Wednesday at 9. Your confirmation is on its way." },
] as const;

type Event = { at: number; apply: (st: State) => State };
interface State {
  ringing: boolean;
  typing: number | null;
  shown: number;
  booked: boolean;
  fading: boolean;
}
const START: State = { ringing: true, typing: null, shown: 0, booked: false, fading: false };
const END: State = { ringing: false, typing: null, shown: SCRIPT.length, booked: true, fading: false };

function timeline(): { events: Event[]; length: number } {
  const events: Event[] = [];
  let t = 1800; // ring
  events.push({ at: t, apply: (st) => ({ ...st, ringing: false }) });
  SCRIPT.forEach((line, i) => {
    t += 500;
    if (line.role === "agent") {
      events.push({ at: t, apply: (st) => ({ ...st, typing: i }) });
      t += 900;
    }
    events.push({ at: t, apply: (st) => ({ ...st, typing: null, shown: i + 1 }) });
    t += 400 + line.text.length * 28; // time to "say" it
  });
  events.push({ at: t, apply: (st) => ({ ...st, booked: true }) });
  t += 3600;
  events.push({ at: t, apply: (st) => ({ ...st, fading: true }) });
  t += 600;
  return { events, length: t };
}

export function HeroCall() {
  const [st, setSt] = useState<State>(START);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const t = setTimeout(() => setSt(END)); // show the finished call, no motion
      return () => clearTimeout(t);
    }
    const { events, length } = timeline();
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      setSt(START);
      setSeconds(0);
      timers = events.map((e) => setTimeout(() => setSt((cur) => e.apply(cur)), e.at));
      timers.push(setTimeout(run, length));
    };
    run();
    const clock = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(clock);
    };
  }, []);

  const speaking = st.shown > 0 && SCRIPT[st.shown - 1].role === "agent" && !st.booked;
  const elapsed = Math.max(0, seconds - 2);
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className={s.callCard} aria-hidden>
      <div className={`${s.callInner} ${st.fading ? s.fadeOut : ""}`}>
        <div className={s.callHeader}>
          <div className={s.phoneWrap}>
            <span className={`${s.ring} ${st.ringing ? s.ringOn : ""}`} />
            <span className={`${s.ring} ${s.ringLate} ${st.ringing ? s.ringOn : ""}`} />
            <span className={s.phoneDot}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
              </svg>
            </span>
          </div>
          <div className={s.callWho}>
            <div className={s.callTitle}>(512) 555-0148</div>
            <div className={s.callMeta}>
              <span className={`${s.liveDot} ${st.ringing ? "" : s.liveOn}`} />{" "}
              {st.ringing ? "Ringing · 7:42 PM, after hours" : `AI receptionist on the line · ${clock}`}
            </div>
          </div>
          <div className={`${s.wave} ${speaking ? s.waveOn : ""}`}>
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${(i * 97) % 600}ms` }} />
            ))}
          </div>
        </div>

        <ol className={s.thread}>
          {SCRIPT.map((line, i) => {
            const visible = st.shown > i || st.typing === i;
            const typing = st.typing === i;
            return (
              <li key={i} className={`${s.line} ${line.role === "agent" ? s.agent : s.user} ${visible ? s.lineIn : ""}`}>
                <span className={s.bubble}>
                  <span className={`${s.bubbleText} ${typing ? s.hidden : ""}`}>{line.text}</span>
                  <span className={`${s.dots} ${typing ? s.dotsOn : ""}`}>
                    <i />
                    <i />
                    <i />
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        <div className={`${s.booked} ${st.booked ? s.bookedIn : ""}`}>
          <span className={s.check}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <div>
            <div className={s.bookedTitle}>Booked: Drain cleaning</div>
            <div className={s.bookedMeta}>Wed 9:00 AM · added to Google Calendar · email sent</div>
          </div>
        </div>
      </div>
    </div>
  );
}
