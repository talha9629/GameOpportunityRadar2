create or replace function public.prevent_resolved_verification_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new is not distinct from old then
    return new;
  end if;

  if exists (
    select 1
    from public.verification_task_resolutions vtr
    where vtr.source_event_id = old.id
      and vtr.resolution_state = 'resolved'
  ) then
    raise exception using
      errcode = '23514',
      message = 'This timestamped finding is locked by a resolved verification task. Reopen the task before changing its evidence.';
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_resolved_verification_event_mutation() from public, anon, authenticated;

drop trigger if exists prevent_resolved_verification_event_mutation on public.deep_verify_events;

create trigger prevent_resolved_verification_event_mutation
before update on public.deep_verify_events
for each row
execute function public.prevent_resolved_verification_event_mutation();
