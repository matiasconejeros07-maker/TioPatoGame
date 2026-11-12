-- Compras permanentes (no consumibles), p. ej. «Sin anuncios». A diferencia de los power-ups, no se gastan.
CREATE TABLE entitlements (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entitlement_id text NOT NULL,              -- 'no_ads'
  purchase_id    uuid REFERENCES purchases(id) ON DELETE SET NULL,
  granted_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, entitlement_id)
);
