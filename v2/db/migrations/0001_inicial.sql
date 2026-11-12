-- Gánale al Tío Pato V2 · esquema inicial (PostgreSQL 15+: Supabase o Neon).
-- Todo lo que mueve pesos, compras o inventario se escribe dentro de una transacción (ACID).
-- Los marcadores en vivo viven en Redis (ZSET) y se reconstruyen desde aquí: PostgreSQL es la fuente de verdad.

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ---------- cuentas ----------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid  text UNIQUE,                 -- uid de la V1; NULL en las cuentas nacidas en la V2
  display_name  text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 16),
  name_key      text UNIQUE CHECK (name_key ~ '^[a-z0-9.]{3,24}$'),   -- nombre sin mayúsculas ni tildes (el `k` de la V1)
  legacy_email  text,                        -- solo para avisar de la migración; se borra al reclamar la cuenta
  avatar        text,                        -- emblema (formato de la V1)
  golden_frame  boolean NOT NULL DEFAULT false,
  role          text CHECK (role IN ('tio', 'tia', 'dev')),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('legacy_unclaimed', 'active')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  claimed_at    timestamptz                  -- cuándo una cuenta de la V1 se enlazó a un SSO
);

-- SSO oficial: una identidad (Apple o Google Play Games) pertenece a una sola cuenta.
CREATE TABLE identities (
  provider   text NOT NULL CHECK (provider IN ('apple', 'google_play_games')),
  subject    text NOT NULL,                  -- `sub` de Apple / playerId de Play Games
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user ON identities(user_id);

-- Device Binding: 1 dispositivo = 1 cuenta. `hardware_id` sale de la atestación (keyId de App Attest /
-- huella de la clave atestada del Keystore de Android), nunca de un dato que el cliente pueda inventar.
CREATE TABLE devices (
  hardware_id text PRIMARY KEY,
  platform    text NOT NULL CHECK (platform IN ('ios', 'android')),
  user_id     uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,  -- UNIQUE: una cuenta, un dispositivo activo
  public_key  bytea,                         -- clave pública atestada (para verificar aserciones)
  bound_at    timestamptz NOT NULL DEFAULT now()
);

-- Sesiones: la clave HMAC de cada sesión NO se guarda; se deriva de (secreto maestro, id de sesión).
CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hardware_id text REFERENCES devices(hardware_id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
CREATE INDEX sessions_user ON sessions(user_id);

-- ---------- economía ----------
CREATE TABLE wallets (
  user_id         uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  earned          bigint NOT NULL DEFAULT 0 CHECK (earned >= 0),      -- `c` de la V1
  spent           bigint NOT NULL DEFAULT 0 CHECK (spent >= 0),       -- `sp`
  last_run_legacy bigint,                                             -- `lr`: última partida cobrada en la V1
  CHECK (spent <= earned)                                             -- el saldo (earned − spent) nunca es negativo
);

-- Lo comprado con pesos del juego (personajes, fondos, barras, pelotas, colores, sonidos de rebote).
CREATE TABLE inventory (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     text NOT NULL,                 -- 'ch_millonario', 'ball_diamante', 'sfx_cuac'…
  acquired_at timestamptz,                   -- NULL = comprado en la V1 (no guardaba la fecha)
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE equipped (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot    text NOT NULL,                     -- 'ch', 'bg', 'pad', 'ball', 'th', 'sfx'
  item_id text NOT NULL,
  PRIMARY KEY (user_id, slot)
);

-- ---------- progreso ----------
CREATE TABLE streaks (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  days             integer NOT NULL DEFAULT 0 CHECK (days >= 0),      -- `n`
  last_claim_at    timestamptz,                                       -- `t`
  streak_x2 integer NOT NULL DEFAULT 0, streak_x3 integer NOT NULL DEFAULT 0, streak_x4 integer NOT NULL DEFAULT 0,   -- x2/x3/x4
  wheel_x2  integer NOT NULL DEFAULT 0, wheel_x3  integer NOT NULL DEFAULT 0, wheel_x4  integer NOT NULL DEFAULT 0,   -- y2/y3/y4
  boost_started_at timestamptz,                                       -- `bx`
  boost_mult       integer,                                           -- `bm`
  boost_ms         integer,                                           -- `bd`
  CHECK (LEAST(streak_x2, streak_x3, streak_x4, wheel_x2, wheel_x3, wheel_x4) >= 0)
);

CREATE TABLE scores (
  user_id   uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  best      integer NOT NULL DEFAULT 0 CHECK (best >= 0),             -- `s`
  best_at   timestamptz,                                              -- `t`
  played_ms bigint NOT NULL DEFAULT 0 CHECK (played_ms >= 0)          -- `ms`
);
CREATE INDEX scores_best ON scores(best DESC);

-- Marcadores por período: kind 'w' = semana (número de semana de la V1) · 'm' = mes (AAAAMM).
CREATE TABLE period_scores (
  kind    char(1) NOT NULL CHECK (kind IN ('w', 'm')),
  period  integer NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  best    integer NOT NULL CHECK (best >= 0),
  PRIMARY KEY (kind, period, user_id)
);

-- Estadísticas de las misiones. Los contadores por día/semana/mes se guardan tal cual venían (jsonb):
-- caducan solos al cambiar el período y así no se pierde ningún campo de la V1.
CREATE TABLE stats (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  games   bigint NOT NULL DEFAULT 0,          -- `g`
  bounces bigint NOT NULL DEFAULT 0,          -- `r`
  periods jsonb  NOT NULL DEFAULT '{}'        -- sl, d, dg, dr, dm, dc, w, wg, wr, wm, wc, ml, mo, mm
);

CREATE TABLE achievements (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL,              -- 'g100', 'b50', 's7'…
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE wheel (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_spin_at  timestamptz,                 -- `t`
  claimed_spin  timestamptz                  -- `c`
);

CREATE TABLE vip_contacts (
  user_id  uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  whatsapp text NOT NULL,
  consent  boolean NOT NULL DEFAULT false,
  left_at  timestamptz
);

-- ---------- dinero real (IAP) ----------
-- Una transacción de la tienda se entrega UNA sola vez: lo garantiza UNIQUE (store, transaction_id).
CREATE TABLE purchases (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES users(id) ON DELETE SET NULL,   -- se conserva sin dueño si la cuenta se elimina (contabilidad y fraude)
  store          text NOT NULL CHECK (store IN ('apple', 'google')),
  product_id     text NOT NULL,
  transaction_id text NOT NULL,
  environment    text NOT NULL CHECK (environment IN ('production', 'sandbox')),
  status         text NOT NULL DEFAULT 'granted' CHECK (status IN ('granted', 'refunded')),
  store_closed   boolean NOT NULL DEFAULT false,                 -- Google: ya se «consumió» en la tienda
  purchase_token text,                                           -- Google: hace falta para consumir
  receipt        jsonb NOT NULL,                                 -- lo que respondió la tienda
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store, transaction_id)
);
CREATE INDEX purchases_user ON purchases(user_id);

CREATE TABLE powerup_inventory (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  powerup_id text NOT NULL,
  quantity   integer NOT NULL CHECK (quantity >= 0),
  PRIMARY KEY (user_id, powerup_id)
);

-- Libro de movimientos (solo se agrega): de dónde salió y a dónde fue cada power-up.
CREATE TABLE powerup_ledger (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  powerup_id text NOT NULL,
  delta      integer NOT NULL,
  reason     text NOT NULL,                  -- 'purchase' | 'match' | 'refund'
  ref        text,                           -- id de la compra o de la partida
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- migración ----------
-- Copia íntegra de lo que cada cuenta tenía en Firebase (por si hay que revisar o reprocesar algo).
CREATE TABLE legacy_snapshots (
  firebase_uid text PRIMARY KEY,
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  data         jsonb NOT NULL,
  imported_at  timestamptz NOT NULL DEFAULT now()
);

-- Rastro de las cuentas eliminadas (sin datos personales): prueba de que se cumplió la solicitud.
CREATE TABLE account_deletions (
  id         bigserial PRIMARY KEY,
  user_hash  text NOT NULL,                  -- SHA-256 del id de la cuenta
  deleted_at timestamptz NOT NULL DEFAULT now()
);
