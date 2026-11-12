// Los modelos solo guardan datos (getters y setters) y avisan cuando cambian. La lógica se prueba en los controladores.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { GameFlowModel, GameState } from '../src/models/GameFlowModel.js';
import { PowerUpInventoryModel, MatchPowerUpsModel } from '../src/models/PowerUpModel.js';
import { ProfileModel } from '../src/models/ProfileModel.js';
import { APP_ID } from '../../shared/ids.js';

test('modelos: guardan lo que se les asigna, avisan del cambio y no dejan que se les modifique por fuera', () => {
  const flow = new GameFlowModel();
  const seen = [];
  flow.on('change', (e) => seen.push(e));
  flow.state = GameState.MENU;
  assert.deepEqual(seen, [{ state: GameState.MENU, previous: GameState.BOOT }]);

  const inventory = new PowerUpInventoryModel();
  inventory.quantities = { slow: 2 };
  inventory.quantities.slow = 99;                       // modificar la copia no cambia el modelo
  assert.deepEqual(inventory.quantities, { slow: 2 });

  const match = new MatchPowerUpsModel('arcade');
  match.used = ['slow'];
  match.used.push('trampa');
  assert.deepEqual([match.mode, match.used], ['arcade', ['slow']]);

  const profile = new ProfileModel();
  profile.displayName = 'Ana';
  assert.deepEqual([profile.displayName, profile.nextNameChangeAt], ['Ana', null]);
});

test('modelos: ninguno tiene métodos de lógica, solo getters y setters', () => {
  const dir = new URL('../src/models/', import.meta.url);
  for (const file of readdirSync(dir)) {
    const body = readFileSync(new URL(file, dir), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const methods = [...body.matchAll(/^\s{2}(?:async\s+)?(#?[a-zA-Z]\w*)\s*\(/gm)].map((m) => m[1]).filter((name) => name !== 'constructor');
    assert.deepEqual(methods, [], `${file} tiene métodos que deberían estar en un controlador`);
  }
});

test('configuración: el appId de Capacitor es el mismo de shared/ids.js', () => {
  const config = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(config.appId, APP_ID);
});
