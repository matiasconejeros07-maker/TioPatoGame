-- Cambio de nombre: una vez cada 30 días. NULL = nunca lo ha cambiado (puede hacerlo ya).
ALTER TABLE users ADD COLUMN name_changed_at timestamptz;
