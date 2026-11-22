-- Rollback for 0027_payments.sql. WARNING: deletes all payment records and their history.
drop view if exists public.quotation_payment_summary;
drop table if exists public.payment_audit;
drop table if exists public.payments;
drop function if exists public.payments_before_write();
drop function if exists public.payments_after_write();
drop function if exists public.can_write_quotation_payments(uuid);
delete from public.org_counters where counter_key like 'receipt-%';
drop type if exists public.payment_record_status;
drop type if exists public.payment_kind;
drop type if exists public.payment_mode;
