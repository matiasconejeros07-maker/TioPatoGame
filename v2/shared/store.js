// Catálogo de la tienda con pesos del juego y economía de la partida (lo que en la V1 era tienda.js).
// Lo leen la app (para dibujar) y el servidor (para cobrar y validar). Los ids son los mismos de la V1,
// así lo que cada jugador ya compró sigue siendo suyo tras la migración.

/** Economía de la partida. */
export const ECONOMY = Object.freeze({
  tier: 100,            // cada 100 rebotes sube el multiplicador («Monedas dobles»: ×2 en el 100, ×3 en el 200…)
  maxHits: 500,         // tope de rebotes que cuentan por partida
  angryAt: 55,          // rebote en que el personaje se enoja
});

/** Pesos que vale el rebote número n con una pelota que paga `rate` por punto. */
export const hitValue = (rate, n) => rate * (Math.floor(n / ECONOMY.tier) + 1);
/** Pesos de una partida de `hits` rebotes. */
export function matchEarnings(rate, hits) {
  let total = 0;
  for (let n = 1; n <= Math.min(hits, ECONOMY.maxHits); n++) total += hitValue(rate, n);
  return total;
}

export const CHARACTERS = Object.freeze([
  { id: 'tio', name: 'Tío Pato', price: 0, calm: 'trajes/angel.webp', angry: 'trajes/angel-demonio.webp', note: 'El de siempre: ángel que baja al infierno' },
  { id: 'tia', name: 'Tía Patita', price: 1500, calm: 'trajes/patita-angel.webp', angry: 'trajes/patita-diabla.webp', note: 'Ángel que se vuelve diabla' },
  { id: 'conejo', name: 'Tío Pato Conejo', price: 3000, calm: 'trajes/conejo.webp', angry: 'trajes/conejo-enojado.webp', note: 'Se enoja cuando avanzas' },
  { id: 'conejita', name: 'Tía Patita Conejita', price: 3000, calm: 'trajes/conejita.webp', angry: 'trajes/conejita-enojada.webp', note: 'Se enoja cuando avanzas' },
  { id: 'bigotes', name: 'Tío Pato Simi', price: 6000, calm: 'trajes/bigotes.webp', angry: 'trajes/bigotes-enojado.webp', note: 'Bigote, sombrero de copa y bata' },
  { id: 'tios', name: 'Tíos Patitos', price: 6000, calm: 'trajes/tios.webp', angry: 'trajes/tios-enojados.webp', wide: 1.5, note: 'La pareja: te devuelven la pelota de la mano' },
  { id: 'galactico', name: 'Tío Pato Galáctico', price: 50000, calm: 'trajes/galactico.webp', angry: 'trajes/galactico-furia.webp', note: 'Un trozo del universo' },
  { id: 'millonario', name: 'Tío Pato Dorado', price: 100000000, calm: 'trajes/dorado.webp', angry: 'trajes/dorado-oscuro.webp', secret: true, note: 'El secreto: rey de oro que se enciende al rojo vivo' },
]);

// fx: cómo se mueve (spin = gira · flutter = revolotea · jump = salta) · w: ancho relativo · asp: alto/ancho · tier: tratamiento premium
export const BALLS = Object.freeze([
  { id: 'peso1', name: 'Moneda $1', price: 0, rate: 1, img: 'skins/peso1.webp', fx: 'spin', w: 1, asp: 0.975, trail: '#d5dbe8' },
  { id: 'peso5', name: 'Moneda $5', price: 5, rate: 2, img: 'skins/peso5.webp', fx: 'spin', w: 1, asp: 0.98, trail: '#f2b830' },
  { id: 'peso10', name: 'Moneda $10', price: 10, rate: 3, img: 'skins/peso10.webp', fx: 'spin', w: 1, asp: 0.997, trail: '#f2c66a' },
  { id: 'peso50', name: 'Moneda $50', price: 50, rate: 4, img: 'skins/peso50.webp', fx: 'spin', w: 1, asp: 1.003, trail: '#e0b060' },
  { id: 'peso100', name: 'Moneda $100', price: 100, rate: 5, img: 'skins/peso100.webp', fx: 'spin', w: 1, asp: 1, trail: '#ffe08a' },
  { id: 'peso500', name: 'Moneda $500', price: 500, rate: 6, img: 'skins/peso500.webp', fx: 'spin', w: 1.05, asp: 1, trail: '#f5f0d0' },
  { id: 'b1000', name: 'Billete $1.000', price: 1000, rate: 7, img: 'skins/b1000.webp', fx: 'flutter', w: 1.6, asp: 0.571, trail: '#8fe08f' },
  { id: 'b2000', name: 'Billete $2.000', price: 2000, rate: 8, img: 'skins/b2000.webp', fx: 'flutter', w: 1.6, asp: 0.509, trail: '#c9a6ee' },
  { id: 'b5000', name: 'Billete $5.000', price: 5000, rate: 9, img: 'skins/b5000.webp', fx: 'flutter', w: 1.6, asp: 0.495, trail: '#f08a94' },
  { id: 'b10000', name: 'Billete $10.000', price: 10000, rate: 10, img: 'skins/b10000.webp', fx: 'flutter', w: 1.6, asp: 0.476, trail: '#7cc4f0' },
  { id: 'b20000', name: 'Billete $20.000', price: 20000, rate: 20, img: 'skins/b20000.webp', fx: 'flutter', w: 1.6, asp: 0.486, trail: '#f0a070' },
  { id: 'plata', name: 'Lingote de plata', price: 50000, rate: 100, img: 'skins/plata.webp', fx: 'jump', w: 1.7, asp: 0.594, trail: '#cfd6e2', tier: 'silver' },
  { id: 'oro', name: 'Lingote de oro', price: 500000, rate: 500, img: 'skins/oro.webp', fx: 'jump', w: 1.7, asp: 0.594, trail: '#ffd54a', tier: 'gold' },
  { id: 'diamante', name: 'Diamante', price: 1000000, rate: 5000, img: 'skins/diamante.webp', fx: 'jump', w: 1.15, asp: 1.04, trail: '#8fd3ff', tier: 'diamond' },
]);

export const PADS = Object.freeze([
  { id: 'clasica', name: 'Clásica', price: 0, note: 'Blanca y sencilla' },
  { id: 'dorada', name: 'Oro líquido', price: 220, note: 'Metal con destellos' },
  { id: 'fuego', name: 'Llamarada', price: 280, note: 'Fuego con brasas' },
  { id: 'cristal', name: 'Cristal', price: 300, note: 'Vidrio con prisma' },
  { id: 'neon', name: 'Neón', price: 350, note: 'Brilla y cambia de color' },
  { id: 'galaxia', name: 'Galaxia', price: 400, note: 'Estrellas en movimiento' },
  { id: 'arcoiris', name: 'Arcoíris', price: 450, note: 'Colores que fluyen' },
  { id: 'holo', name: 'Holográfica', price: 500, note: 'Iridiscente con destellos' },
]);

export const BACKGROUNDS = Object.freeze([
  { id: 'clasico', name: 'Clásico', price: 0, note: 'Parte azul y cambia de color con tus puntos' },
  { id: 'atardecer', name: 'Atardecer', price: 2000, note: 'Sol sobre el mar' },
  { id: 'aurora', name: 'Aurora boreal', price: 3000, note: 'Cortinas de luz sobre las montañas' },
  { id: 'galaxia', name: 'Galaxia', price: 4000, note: 'Espiral y estrellas' },
  { id: 'synth', name: 'Synthwave', price: 5500, note: 'Sol neón y cuadrícula' },
]);

/** Sonidos de rebote equipables (se sintetizan con Web Audio; ver AudioService). */
export const BOUNCE_SOUNDS = Object.freeze([
  { id: 'clasico', name: 'Clásico', price: 0, icon: '🔔', note: 'El «tic» de siempre' },
  { id: 'cuac', name: 'Pato', price: 800, icon: '🦆', note: '¡Cuac!' },
  { id: 'bip', name: 'Scanner', price: 800, icon: '🛒', note: 'BIP de caja de supermercado' },
  { id: 'cash', name: 'Máquina expendedora', price: 1200, icon: '🏧', note: '¡Cash!' },
  { id: 'kling', name: 'Moneda', price: 1200, icon: '🪙', note: 'Kling metálico' },
  { id: 'gota', name: 'Gota', price: 1500, icon: '💧', note: 'Plop de agua' },
  { id: 'laser', name: 'Láser', price: 2000, icon: '🔫', note: 'Piu de arcade' },
]);

/** Categorías de la tienda: prefijo del id en el inventario (igual que en la V1) → catálogo. */
export const SHOP = Object.freeze({ ch: CHARACTERS, ball: BALLS, pad: PADS, bg: BACKGROUNDS, sfx: BOUNCE_SOUNDS });
export const DEFAULT_EQUIPPED = Object.freeze({ ch: 'tio', ball: 'peso1', pad: 'clasica', bg: 'clasico', sfx: 'clasico' });
export const itemOf = (slot, id) => SHOP[slot]?.find((item) => item.id === id) ?? null;
export const SECRET_CHARACTER = 'ch_millonario';

/** Racha diaria: pesos del día n (los primeros 6 de la V1; después, fijo). */
export const STREAK_REWARDS = Object.freeze([100, 200, 300, 400, 500, 1000, 2000]);
export const streakReward = (day) => STREAK_REWARDS[Math.min(day, STREAK_REWARDS.length) - 1];

/** Logros de una sola vez: [id, estadística, meta, premio]. g = partidas · b = mejor partida · r = rebotes totales. */
export const ACHIEVEMENTS = Object.freeze([
  ['g1', 'g', 1, 100], ['g10', 'g', 10, 250], ['g50', 'g', 50, 1000], ['g100', 'g', 100, 3000],
  ['b10', 'b', 10, 100], ['b25', 'b', 25, 250], ['b50', 'b', 50, 600], ['b75', 'b', 75, 1500], ['b100', 'b', 100, 4000], ['b150', 'b', 150, 25000],
  ['r100', 'r', 100, 150], ['r500', 'r', 500, 500], ['r2000', 'r', 2000, 2000], ['r5000', 'r', 5000, 6000],
].map(([id, stat, goal, reward]) => Object.freeze({ id, stat, goal, reward })));

/** Objetivos del día: [estadística de hoy, meta, premio]. */
export const DAILY_GOALS = Object.freeze([
  { id: 'd1', stat: 'g', goal: 3, reward: 100 }, { id: 'd2', stat: 'r', goal: 150, reward: 250 }, { id: 'd3', stat: 'b', goal: 80, reward: 500 },
]);

export const STAT_LABEL = Object.freeze({
  g: (n) => `Juega ${n} ${n === 1 ? 'partida' : 'partidas'}`,
  b: (n) => `Llega a ${n} rebotes en una partida`,
  r: (n) => `Suma ${n.toLocaleString('es-CL')} rebotes`,
});

/** Frases del personaje por fase de la partida. %h = tus rebotes. */
export const DIALOGUE = Object.freeze({
  start: ['¡Ahí va la primera!', '¿Listo? ¡Atento a la moneda!', 'A ver cuánto aguantas 😎'],
  calm: ['¡Bien ahí!', 'Vas de pana 😎', '¡Bacán! Sigue así', 'No está mal, no está mal…', '¡Esa estuvo buena!', 'Tranquilo, que recién empieza'],
  dare: ['¿%h? Eso lo hace cualquiera', 'Te veo nervioso…', '¡Más rápido que se te va!', 'Ya po, ¿eso es todo?', 'Cuidado con la punta de la barra'],
  angry: ['¡Ya me estás cansando!', '¡%h rebotes! ¿Quién te crees?', '¡Devuélveme mis pesos!', '¡Ahora sí que sí!', '¡No vas a pasar de aquí!'],
  fury: ['¡¡NADIE LE GANA AL TÍO PATO!!', '¡¡SUELTA ESA BARRA!!', '¡¡%h!! ¡¡IMPOSIBLE!!', '¡¡Esto es personal!!'],
});
