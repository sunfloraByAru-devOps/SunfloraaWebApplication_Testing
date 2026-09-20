-- URGENT FIX for a regression introduced by 01_admin_policies.sql.
--
-- 01 revoked EXECUTE on is_admin() from anon. But the admin policies are still
-- evaluated when an anonymous visitor reads those tables, so every anonymous
-- query against products / reviews / orders / profiles started failing with
-- "permission denied for function is_admin" (HTTP 401) — which takes the
-- public storefront down.
--
-- Granting EXECUTE to anon is safe and grants no access: is_admin() resolves
-- auth.uid(), which is NULL for an anonymous caller, so it always returns
-- false for them. It reports on the *current* caller only and reveals nothing
-- about any other user.

grant execute on function public.is_admin() to anon, authenticated;
