# Project Architecture Rules

- Preserve historical team-lineup rows with `effective_from`/`effective_until`; active locks must require `effective_until IS NULL` so past contributions remain without blocking later moves.
- Protect privileged profile fields in the database trigger; the owner update policy must not read columns hidden from ordinary users.