-- Pull-based call history: the dashboard fetches new conversations from the ElevenLabs API.
-- Remembers when each business last synced so page loads don't call ElevenLabs every time.
alter table businesses add column conversations_synced_at timestamptz;
