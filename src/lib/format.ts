import { DateTime } from "luxon";

export function fmtDateTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return "—";
  return DateTime.fromISO(iso).setZone(tz).toFormat("LLL d, h:mm a");
}

export function fmtDay(iso: string, tz: string): string {
  const d = DateTime.fromISO(iso).setZone(tz);
  const today = DateTime.now().setZone(tz).startOf("day");
  const diff = Math.round(d.startOf("day").diff(today, "days").days);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toFormat(diff > -7 && diff < 7 ? "cccc" : "ccc, LLL d");
}

export function fmtTime(iso: string, tz: string): string {
  return DateTime.fromISO(iso).setZone(tz).toFormat("h:mm a");
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function fmtClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

export const US_TIMEZONES: [string, string][] = [
  ["America/New_York", "Eastern"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"],
  ["America/Los_Angeles", "Pacific"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
  ["Europe/London", "UK (London)"],
  ["Asia/Dubai", "UAE (Dubai)"],
  ["Asia/Karachi", "Pakistan (Karachi)"],
];
