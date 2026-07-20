with examples as (
  select
    jsonb_populate_record(null::public.glimmers, jsonb_build_object(
      'space_id','00000000-0000-0000-0000-000000000001',
      'glimmer_date','2030-07-20',
      'created_at','2030-07-21T02:00:00+00',
      'preferred_timezone','America/Los_Angeles'
    )) as west_record,
    jsonb_populate_record(null::public.glimmers, jsonb_build_object(
      'space_id','00000000-0000-0000-0000-000000000001',
      'glimmer_date','2030-07-20',
      'created_at','2030-07-21T02:00:00+00',
      'preferred_timezone','Asia/Shanghai'
    )) as beijing_record
)
select
  public.is_glimmer_accounted(west_record) as west_coast_visible,
  not public.is_glimmer_accounted(beijing_record) as beijing_next_date_rejected
from examples;
