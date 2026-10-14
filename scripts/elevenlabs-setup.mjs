// One-time ElevenLabs workspace setup: creates the signed post-call webhook pointing at this app and
// turns on transcript + audio delivery for every agent in the workspace.
// Usage: npm run elevenlabs:setup -- https://your-app.vercel.app
// Prints ELEVENLABS_WEBHOOK_SECRET: add it to Vercel (and .env.local) and redeploy.
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const appUrl = (process.argv[2] ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
if (!/^https:\/\//.test(appUrl)) {
  console.error("Pass the public https URL of the app, e.g. npm run elevenlabs:setup -- https://frontdesk.example.com");
  process.exit(1);
}
if (!process.env.ELEVENLABS_API_KEY) {
  console.error("ELEVENLABS_API_KEY is not set");
  process.exit(1);
}

const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
const webhookUrl = `${appUrl}/api/voice/webhook`;

const created = await client.webhooks.create({
  settings: { authType: "hmac", name: `FrontDesk post-call (${new URL(appUrl).host})`, webhookUrl },
});
await client.conversationalAi.settings.update({
  webhooks: { postCallWebhookId: created.webhookId, events: ["transcript", "audio"] },
});

console.log(`Post-call webhook ready → ${webhookUrl}`);
console.log(`webhook id: ${created.webhookId}`);
console.log(`ELEVENLABS_WEBHOOK_SECRET=${created.webhookSecret}`);
