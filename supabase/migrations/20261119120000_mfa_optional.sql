-- Owner's decision (18 Nov 2026): no role is forced to use an authenticator
-- app; staff can still turn it on from their Account page.
-- Applied in production by the owner through the Supabase SQL editor.
-- Rollback: update private.roles set requires_mfa = true
--           where code in ('owner', 'super_admin', 'manager', 'finance');
update private.roles set requires_mfa = false where requires_mfa;
