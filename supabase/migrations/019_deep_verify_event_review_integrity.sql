alter table public.deep_verify_events
  add column if not exists reviewed_at timestamptz;

alter table public.deep_verify_events
  add constraint deep_verify_event_key_length
  check (char_length(btrim(event_key)) between 1 and 80)
  not valid;

alter table public.deep_verify_events
  validate constraint deep_verify_event_key_length;

alter table public.deep_verify_events
  add constraint deep_verify_event_label_length
  check (char_length(btrim(label)) between 1 and 120)
  not valid;

alter table public.deep_verify_events
  validate constraint deep_verify_event_label_length;

alter table public.deep_verify_events
  add constraint deep_verify_event_note_length
  check (evidence_note is null or char_length(evidence_note) <= 1000)
  not valid;

alter table public.deep_verify_events
  validate constraint deep_verify_event_note_length;
