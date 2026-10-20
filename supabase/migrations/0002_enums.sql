do $$ begin
  create type public.app_role as enum (
    'owner', 'admin', 'sales_manager', 'sales_executive', 'viewer'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.membership_status as enum ('invited', 'active', 'suspended');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.lifecycle_stage as enum ('lead', 'customer', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.lead_status as enum (
    'new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.priority_level as enum ('low', 'medium', 'high', 'urgent');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.consent_status as enum ('unknown', 'granted', 'withdrawn');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.call_direction as enum ('incoming', 'outgoing');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.call_outcome as enum (
    'answered', 'not_answered', 'busy', 'callback', 'interested', 'not_interested'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_status as enum ('pending', 'in_progress', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.task_kind as enum ('task', 'follow_up', 'reminder');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.campaign_status as enum (
    'draft', 'scheduled', 'queued', 'sending', 'paused', 'completed', 'cancelled', 'failed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.email_job_status as enum (
    'queued', 'claimed', 'processing', 'sent', 'bounced', 'failed', 'cancelled', 'dead_letter'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.email_event_type as enum (
    'queued', 'processing', 'smtp_accepted', 'bounced', 'failed', 'delivered',
    'unsubscribed', 'suppressed', 'cancelled', 'retried'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.suppression_reason as enum (
    'unsubscribe', 'bounce', 'complaint', 'manual', 'unknown_consent'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.deal_stage as enum (
    'new_lead', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.quotation_status as enum (
    'draft', 'pending_approval', 'approved', 'sent', 'accepted', 'rejected', 'superseded'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.project_status as enum (
    'planning', 'active', 'on_hold', 'completed', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.meeting_status as enum (
    'scheduled', 'completed', 'cancelled', 'no_show'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.import_status as enum (
    'pending', 'validating', 'previewed', 'importing', 'completed', 'failed', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.activity_type as enum (
    'note', 'call', 'email', 'task', 'meeting', 'deal', 'quotation', 'project',
    'document', 'import', 'status_change', 'assignment', 'system'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_kind as enum (
    'follow_up_due', 'task_due', 'task_overdue', 'email_failed', 'mention', 'system'
  );
exception when duplicate_object then null;
end $$;
