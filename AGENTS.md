# Project Architecture Rules

- Preserve historical team-lineup rows with `effective_from`/`effective_until`; active locks must require `effective_until IS NULL` so past contributions remain without blocking later moves.
- Protect privileged profile fields in the database trigger; the owner update policy must not read columns hidden from ordinary users.
- Privileged `/api/public/cron/*` routes must call `authorizeCron` (x-cron-secret checked against CRON_SECRET or the DB-held `private.cron_token`); pg_cron jobs read the token in SQL, because the publishable key is public and is not authentication.
- League sign-up rules (class/category, car number range, approval, capacity → waitlist) are enforced by the `enforce_entry_signup_rules` trigger, so client inserts cannot claim a confirmed seat.
- Coaching bookings are created only by the server checkout flow; participants can only cancel via the Data API (guard trigger), and ratings require a confirmed/completed, finished booking.