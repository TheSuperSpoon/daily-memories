create or replace function public.cancel_glimmer_upload(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.glimmers%rowtype; a public.glimmer_assets%rowtype;
begin
  select * into g from public.glimmers where id=p_id for update;
  if not found then return jsonb_build_object('id',p_id,'cancelled',true); end if;
  if g.owner_id<>auth.uid() then raise exception using errcode='42501',message='GLIMMER_NOT_OWNED'; end if;
  if g.status<>'pending' then raise exception using errcode='P0001',message='GLIMMER_NOT_PENDING'; end if;
  select * into a from public.glimmer_assets where glimmer_id=g.id and is_current and deleted_at is null;
  if a.provider='supabase' and exists(
    select 1 from storage.objects where bucket_id=a.bucket and name=a.object_key
  ) then raise exception using errcode='P0001',message='OBJECT_STILL_EXISTS'; end if;
  delete from public.glimmers where id=g.id;
  return jsonb_build_object('id',p_id,'cancelled',true);
end; $$;

revoke all on function public.cancel_glimmer_upload(uuid) from public;
grant execute on function public.cancel_glimmer_upload(uuid) to authenticated;
