import "server-only";
import { after } from "next/server";
import { isConfigured, need } from "../env";
import { one, sql } from "../db";
import { saveAudio, saveConversation, type ConversationDetail } from "./calls";

// Pull-based call history. ElevenLabs keeps every conversation (transcript, summary, extracted fields,
// audio); this copies new ones into our database and Blob store when an owner opens the dashboard.
// It works without the post-call webhook, and both paths upsert the same rows.

const API = "https://api.elevenlabs.io/v1/convai";
const MIN_INTERVAL_SECS = 30; // page loads within this window reuse the last sync
const MAX_DETAILS_PER_SYNC = 15; // keeps a page load fast; the rest arrive on the next sync
const MAX_AUDIO_PER_SYNC = 5;

interface ListedConversation {
  conversation_id: string;
  status: string; // initiated | in-progress | processing | done | failed
  call_duration_secs?: number;
}

async function eleven<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { "xi-api-key": need("ELEVENLABS_API_KEY") }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

async function fetchAudio(conversationId: string): Promise<Buffer | null> {
  const res = await fetch(`${API}/conversations/${conversationId}/audio`, {
    headers: { "xi-api-key": need("ELEVENLABS_API_KEY") },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ElevenLabs audio ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Copy this business's recent ElevenLabs conversations into `calls`. Throttled per business unless
 * `force`. Never throws: a sync failure must not break the dashboard.
 */
export async function syncConversations(businessId: string, opts: { force?: boolean } = {}): Promise<{ added: number }> {
  try {
    if (!isConfigured("ELEVENLABS_API_KEY")) return { added: 0 };
    // Claim the sync slot atomically so parallel page loads don't all hit ElevenLabs.
    const claimed = await one<{ voice_agent_id: string | null }>(sql`
      update businesses set conversations_synced_at = now()
      where id = ${businessId} and voice_agent_id is not null
        and (${!!opts.force} or conversations_synced_at is null or conversations_synced_at < now() - make_interval(secs => ${MIN_INTERVAL_SECS}))
      returning voice_agent_id`);
    if (!claimed?.voice_agent_id) return { added: 0 };

    const list = await eleven<{ conversations: ListedConversation[] }>(
      `/conversations?agent_id=${encodeURIComponent(claimed.voice_agent_id)}&page_size=30`,
    );
    // Finished conversations only; skip empty ones that never connected.
    const finished = list.conversations.filter((c) => (c.status === "done" || c.status === "failed") && (c.call_duration_secs ?? 0) > 0);
    if (!finished.length) return { added: 0 };

    const known = await sql<{ conversation_id: string; has_transcript: boolean; has_audio: boolean }>`
      select conversation_id, transcript is not null as has_transcript, recording_path is not null as has_audio
      from calls where conversation_id = any(${finished.map((c) => c.conversation_id)}::text[])`;
    const byId = new Map(known.map((k) => [k.conversation_id, k]));

    let added = 0;
    const needAudio: string[] = [];
    for (const c of finished) {
      const k = byId.get(c.conversation_id);
      if (!k?.has_transcript && added < MAX_DETAILS_PER_SYNC) {
        const detail = await eleven<ConversationDetail>(`/conversations/${c.conversation_id}`);
        await saveConversation(businessId, detail);
        added++;
        if (detail.has_audio !== false) needAudio.push(c.conversation_id);
      } else if (k && !k.has_audio) {
        needAudio.push(c.conversation_id);
      }
    }

    // Audio files are larger: copy them after the response so the page renders right away.
    const audioBatch = needAudio.slice(0, MAX_AUDIO_PER_SYNC);
    if (audioBatch.length) {
      after(async () => {
        for (const id of audioBatch) {
          try {
            const mp3 = await fetchAudio(id);
            if (mp3?.length) await saveAudio(businessId, id, mp3);
          } catch (err) {
            console.error("conversation audio sync failed", id, err);
          }
        }
      });
    }
    return { added };
  } catch (err) {
    console.error("conversation sync failed", businessId, err);
    return { added: 0 };
  }
}
