-- [SEC] Policy-acceptance audit column (I-040 security-fix round, minor:
-- "policy acceptance server-side"). The member wizard's confirm step already
-- gates on a client-side checkbox (AC-849) — this migration lets the SERVER
-- record that acceptance on the booking row itself, so the fact is not
-- merely a client-side UI gate but an auditable server-side record. Nullable
-- (older rows, walk-ins started elsewhere, and admin-created bookings have
-- no such checkbox to accept).
ALTER TABLE "bookings" ADD COLUMN "policy_accepted_at" timestamp (3);
