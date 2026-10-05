-- Superadmin: the only level allowed to change a country's name and code, or delete a country
-- (which also deletes its channels and requests). Apply with: wrangler d1 migrations apply wme-requests
--
-- The app never sets or clears is_superadmin: no API, modal or form writes it, and removing a
-- superadmin's access from Admin → Users is refused. Grant or revoke it in the database only:
--
--   wrangler d1 execute wme-requests --remote --command "UPDATE user_access SET is_superadmin = 1 WHERE user_id = (SELECT id FROM \"user\" WHERE email = 'you@example.com')"
--
-- (SET is_superadmin = 0 to revoke.)

ALTER TABLE user_access ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0;
