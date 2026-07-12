revoke execute on function public.begin_glimmer_upload(uuid,date,text,bigint,text),
 public.cancel_glimmer_upload(uuid),public.complete_glimmer_delete(uuid),
 public.complete_retro_glimmer(uuid,date),public.finalize_glimmer_upload(uuid),
 public.grant_streak_rewards(uuid),
 public.list_glimmers(uuid,date,date,uuid,integer,date,timestamptz,uuid)
from anon;

grant execute on function public.begin_glimmer_upload(uuid,date,text,bigint,text),
 public.cancel_glimmer_upload(uuid),public.complete_glimmer_delete(uuid),
 public.complete_retro_glimmer(uuid,date),public.finalize_glimmer_upload(uuid),
 public.grant_streak_rewards(uuid),
 public.list_glimmers(uuid,date,date,uuid,integer,date,timestamptz,uuid)
to authenticated;
