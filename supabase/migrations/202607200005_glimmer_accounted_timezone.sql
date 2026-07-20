create or replace function public.is_glimmer_accounted(g public.glimmers)
returns boolean language sql stable security definer set search_path='' as $$
  select g.glimmer_date = (g.created_at at time zone g.preferred_timezone)::date
    or exists (
      select 1 from public.reward_ledger r
      where r.space_id=g.space_id and r.event_type='retro_spent' and r.target_date=g.glimmer_date
    );
$$;

revoke all on function public.is_glimmer_accounted(public.glimmers) from public,anon;
grant execute on function public.is_glimmer_accounted(public.glimmers) to authenticated;
