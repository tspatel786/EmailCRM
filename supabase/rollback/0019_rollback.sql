-- Rollback for 0019_accept_invite_rpc.sql -- safe to drop, nothing else depends on it.

drop function if exists public.accept_invite(uuid);
