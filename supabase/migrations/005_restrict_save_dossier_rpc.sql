revoke execute on function public.save_dossier(jsonb, jsonb, jsonb) from public;
revoke execute on function public.save_dossier(jsonb, jsonb, jsonb) from anon;
grant execute on function public.save_dossier(jsonb, jsonb, jsonb) to authenticated;
