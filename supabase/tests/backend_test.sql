begin;
select plan(1);
select pass('backend test harness initialized');
select * from finish();
rollback;
