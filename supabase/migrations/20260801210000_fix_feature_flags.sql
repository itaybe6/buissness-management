-- Sync inconsistent module flags and drop the legacy "forms" key (renamed to agreements).

-- payroll requires attendance — turn attendance back on wherever payroll is on.
update public.business_features att
set enabled = true
from public.business_features payroll
where att.business_id = payroll.business_id
  and att.feature_key = 'attendance'
  and not att.enabled
  and payroll.feature_key = 'payroll'
  and payroll.enabled;

-- waste requires inventory — same repair.
update public.business_features child
set enabled = true
from public.business_features parent
where child.business_id = parent.business_id
  and child.feature_key = 'inventory'
  and not child.enabled
  and parent.feature_key = 'waste'
  and parent.enabled;

-- Legacy seed rows used "forms" instead of "agreements".
insert into public.business_features (business_id, feature_key, enabled)
select business_id, 'agreements', true
from public.business_features
where feature_key = 'forms' and enabled
on conflict (business_id, feature_key) do update set enabled = true;

delete from public.business_features where feature_key = 'forms';
