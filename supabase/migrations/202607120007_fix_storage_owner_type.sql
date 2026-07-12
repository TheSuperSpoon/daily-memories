create or replace function public.finalize_glimmer_upload(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare g public.glimmers%rowtype; a public.glimmer_assets%rowtype;
begin
  select * into g from public.glimmers where id=p_id for update;
  if not found or g.owner_id <> auth.uid() or g.deleted_at is not null then
    raise exception using errcode='42501', message='GLIMMER_NOT_OWNED';
  end if;
  if g.status='ready' then return to_jsonb(g); end if;
  select * into a from public.glimmer_assets where glimmer_id=g.id and is_current and deleted_at is null;
  if a.provider <> 'supabase' or not exists (
    select 1 from storage.objects o where o.bucket_id=a.bucket and o.name=a.object_key
      and o.owner_id=auth.uid()::text and o.metadata->>'mimetype'=a.content_type
  ) then raise exception using errcode='P0001', message='OBJECT_NOT_FOUND_OR_MISMATCH'; end if;
  update public.glimmers set status='ready',ready_at=coalesce(ready_at,now()) where id=g.id returning * into g;
  return to_jsonb(g);
end; $$;

revoke all on function public.finalize_glimmer_upload(uuid) from public;
grant execute on function public.finalize_glimmer_upload(uuid) to authenticated;
