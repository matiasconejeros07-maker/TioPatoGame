-- Paso 2: dispositivo (atestación y cambio de teléfono), SSO, partidas con modo, uso de power-ups y reembolsos.

-- ---------- Device Binding ----------
ALTER TABLE devices ADD COLUMN sign_count bigint NOT NULL DEFAULT 0;      -- contador de App Attest (detecta claves clonadas)
ALTER TABLE users   ADD COLUMN device_changed_at timestamptz;             -- último cambio de teléfono (uno cada 30 días); NULL = nunca

-- ---------- SSO ----------
-- Apple exige revocar el acceso al eliminar la cuenta: para eso se guarda (cifrado) su refresh token.
ALTER TABLE identities ADD COLUMN refresh_token_enc text;

-- ---------- Marcadores por modo ----------
-- classic = sin power-ups de pago (ranking principal) · arcade = con power-ups. Lo que viene de la V1 es classic.
ALTER TABLE scores ADD COLUMN mode text NOT NULL DEFAULT 'classic' CHECK (mode IN ('classic', 'arcade'));
ALTER TABLE scores DROP CONSTRAINT scores_pkey, ADD PRIMARY KEY (user_id, mode);
DROP INDEX scores_best;
CREATE INDEX scores_best ON scores(mode, best DESC);
ALTER TABLE scores ALTER COLUMN mode DROP DEFAULT;

ALTER TABLE period_scores ADD COLUMN mode text NOT NULL DEFAULT 'classic' CHECK (mode IN ('classic', 'arcade'));
ALTER TABLE period_scores DROP CONSTRAINT period_scores_pkey, ADD PRIMARY KEY (mode, kind, period, user_id);
ALTER TABLE period_scores ALTER COLUMN mode DROP DEFAULT;

-- El tiempo jugado es de la cuenta, no de un modo.
ALTER TABLE users ADD COLUMN played_ms bigint NOT NULL DEFAULT 0 CHECK (played_ms >= 0);
UPDATE users u SET played_ms = s.played_ms FROM scores s WHERE s.user_id = u.id;
ALTER TABLE scores DROP COLUMN played_ms;

-- ---------- Partidas ----------
-- (El cierre y el cobro de la partida llegan en el paso 3; aquí está lo que necesita el uso de power-ups.)
CREATE TABLE matches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode       text NOT NULL CHECK (mode IN ('classic', 'arcade')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at   timestamptz                      -- NULL = en curso
);
CREATE UNIQUE INDEX matches_one_open ON matches(user_id) WHERE ended_at IS NULL;   -- una partida en curso por cuenta

CREATE TABLE match_powerups (
  match_id   uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  slot       smallint NOT NULL CHECK (slot BETWEEN 1 AND 3),   -- máximo 3 por partida, garantizado por la base
  powerup_id text NOT NULL,
  used_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, slot)
);

-- ---------- Reembolsos ----------
ALTER TABLE purchases ADD COLUMN quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1);
ALTER TABLE purchases ADD COLUMN refunded_at timestamptz;
-- Si alguien usa los power-ups y después pide el reembolso, su inventario queda en negativo:
-- la próxima compra primero salda esa deuda. (Usar exige tener al menos 1.)
ALTER TABLE powerup_inventory DROP CONSTRAINT powerup_inventory_quantity_check;
