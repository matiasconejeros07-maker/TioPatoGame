-- Paso 3: el juego completo sobre PostgreSQL (partidas cobradas por el servidor, racha, ruleta, misiones, tienda y marcadores).

-- Partidas: al empezar se anota con qué pelota y multiplicador empezó (no se puede cambiar a mitad de partida);
-- al terminar, cuántos rebotes se le reconocieron, cuánto pagó y cuánto tiempo jugado sumó. hits NULL = sin cobrar.
ALTER TABLE matches ADD COLUMN ball_id   text;
ALTER TABLE matches ADD COLUMN rate      integer NOT NULL DEFAULT 1 CHECK (rate >= 0);
ALTER TABLE matches ADD COLUMN mult      integer NOT NULL DEFAULT 1 CHECK (mult BETWEEN 1 AND 10);
ALTER TABLE matches ADD COLUMN hits      integer CHECK (hits BETWEEN 0 AND 500);
ALTER TABLE matches ADD COLUMN payout    bigint CHECK (payout >= 0);
ALTER TABLE matches ADD COLUMN played_ms integer CHECK (played_ms >= 0);
ALTER TABLE matches ADD COLUMN played_fixed boolean NOT NULL DEFAULT false;   -- el juego ya informó lo que midió (se corrige una sola vez)
CREATE INDEX matches_user ON matches(user_id, started_at DESC);

-- Marcadores: lo que más se consulta es «los mejores de…» y «cuántos me ganan».
CREATE INDEX period_scores_top ON period_scores(mode, kind, period, best DESC);
CREATE INDEX users_played ON users(played_ms DESC);
