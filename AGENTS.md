# Project Architecture Rules

- Preserve historical team-lineup rows with `effective_from`/`effective_until`; active locks must require `effective_until IS NULL` so past contributions remain without blocking later moves.
- Protect privileged profile fields in the database trigger; the owner update policy must not read columns hidden from ordinary users.
- Privileged `/api/public/cron/*` routes must call `authorizeCron` (x-cron-secret checked against CRON_SECRET or the DB-held `private.cron_token`); pg_cron jobs read the token in SQL, because the publishable key is public and is not authentication.
- League sign-up rules (class/category, car number range, approval, capacity → waitlist) are enforced by the `enforce_entry_signup_rules` trigger, so client inserts cannot claim a confirmed seat.
- Coaching bookings are created only by the server checkout flow; participants can only cancel via the Data API (guard trigger), and ratings require a confirmed/completed, finished booking.- Finance: only Stripe balance transactions are booked (one entry per env+BT, enforced by a unique DB index); other Stripe objects are context only, so re-syncs never double-book.
- Finance: automatic posting stays off unless cutoff and rules are approved after their last change (DB guard), and any rule edit turns it off again.
- Finance access uses `fin_user_roles` (finance_admin/finance_approver) checked server-side via `fin_my_roles`; the admin layout only admits finance users to `/admin/regnskab`.
- Tiltrædelsespoint (joiner points) eligibility lives in `src/lib/joiner-eligibility.ts`: league entries count from signup time; single-division reserve entries count from that round's start only if the reserve actually drove it (non-DNS), so reserves get points for earlier rounds without waitlisters earning free points.
