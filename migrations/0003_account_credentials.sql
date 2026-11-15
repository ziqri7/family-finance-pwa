CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE TABLE account_credentials (
 account_id text PRIMARY KEY CHECK(account_id IN ('partner-a','partner-b')),
 scheme text NOT NULL CHECK(scheme IN ('legacy_pbkdf2','bcrypt_hmac_sha384')),
 hash text NOT NULL,
 salt text,
 iterations integer,
 pepper_id text,
 version integer NOT NULL DEFAULT 1 CHECK(version>=1),
 updated_at bigint NOT NULL,
 CHECK((scheme='legacy_pbkdf2' AND hash ~ '^[a-f0-9]{64}$' AND salt IS NOT NULL AND salt ~ '^[a-f0-9]{32}$' AND iterations IS NOT NULL AND iterations=100000 AND pepper_id IS NULL) OR (scheme='bcrypt_hmac_sha384' AND hash ~ '^\$2[abxy]\$12\$[./A-Za-z0-9]{53}$' AND salt IS NULL AND iterations IS NULL AND pepper_id IS NOT NULL AND pepper_id ~ '^[a-f0-9]{64}$'))
);
