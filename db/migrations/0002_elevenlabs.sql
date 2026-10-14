-- Voice provider: Retell → ElevenLabs Agents. Column names become provider-neutral.

alter table businesses rename column retell_agent_id to voice_agent_id;
alter table businesses drop column retell_llm_id;
-- ElevenLabs keeps tools as separate objects; we own two per business (check_availability, book_appointment).
alter table businesses add column voice_tool_ids text[] not null default '{}';
-- ElevenLabs id of the imported Twilio number, needed to (re)assign it to the agent.
alter table businesses add column phone_number_id text;

-- Default voice: ElevenLabs premade "Sarah" (warm, clear US English).
alter table businesses alter column voice_id set default 'EXAVITQu4vr4xnSDxMaL';
update businesses set voice_id = 'EXAVITQu4vr4xnSDxMaL' where voice_id like 'retell-%';

alter table calls rename column retell_call_id to conversation_id;
alter table appointments rename column retell_call_id to conversation_id;
alter index appointments_call_start_uniq rename to appointments_conversation_start_uniq;
