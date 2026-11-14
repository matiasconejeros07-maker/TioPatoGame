// Catálogo de la tienda y reglas de la economía. Los precios están en pesos ($).
// Si cambias algo aquí, ejecuta `node juego/herramientas/generar-reglas.js` y vuelve a pegar `firebase-rules.json` en
// Firebase (las reglas también validan precios y recompensas, por eso deben coincidir con este archivo).
window.TIENDA = {
  // Economía: cada punto vale lo que paga tu pelota (ball[].rate) multiplicado por «Monedas dobles»: ×1 del punto 1 al 99, ×2 del 100 al 199, ×3 del 200 al 299…
  eco: { tier: 100, msPorRebote: 450, holguraMs: 3000, hMax: 500, cMax: 1000000000000,
    // tiempo jugado (marcador «Tiempo jugado»): al terminar cada partida cobrada se suma lo que duró de verdad (el «Aguantaste 1:52 min» del final); las reglas solo dejan sumar hasta lo que tardó la partida en el servidor, con tope de 4,5 s por rebote + 6 s (así dejar el juego abierto no suma horas)
    tiempo: { msPorRebote: 4500, holguraMs: 6000, cuentaMs: 3500 },       // cuentaMs: la cuenta regresiva de cada partida (solo se descuenta de partidas viejas que no guardaron cuánto duraron)
    // misiones: los premios los verifica el servidor (reglas de Firebase) con estadísticas que solo suben al cobrar partidas de verdad (una partida cuenta desde minRebotes rebotes).
    // dia: 3 casillas por día (fácil / media / difícil, el premio es fijo por casilla); en cada casilla la misión del día se elige entre las 3 según la fecha (la misma para todos).
    //      de: [tipo, meta] · g = partidas jugadas hoy · r = rebotes sumados hoy · m = rebotes en una sola partida hoy
    // logros: [id, tipo, meta, premio] de una sola vez · g = partidas · r = rebotes totales · b = mejor partida · s = días de racha · t = tiempo jugado · e = tiene emblema · c = compró algo · v = correo verificado
    misiones: {
      minRebotes: 5,
      dia: [
        { premio: 100, de: [['g', 3], ['r', 50], ['m', 20]] },
        { premio: 250, de: [['g', 5], ['r', 150], ['m', 40]] },
        { premio: 500, de: [['g', 10], ['r', 400], ['m', 80]] }
      ],
      // misiones de la semana (la semana empieza el lunes, hora de Chile): 3 casillas (fácil / media / difícil) y en cada una se elige UNA de 5 misiones al azar según la semana (igual para todos);
      //   de: [tipo, meta] · g = partidas esta semana · r = rebotes esta semana · m = rebotes en una sola partida esta semana. El premio es fijo por casilla.
      semana: { premios: [1000, 3000, 10000], de: [
        [['g', 15], ['g', 20], ['r', 500], ['r', 700], ['m', 40]],
        [['g', 35], ['g', 45], ['r', 1500], ['r', 2000], ['m', 75]],
        [['g', 70], ['g', 90], ['r', 4000], ['r', 5500], ['m', 100]]
      ] },
      // logros de una sola vez: [id, tipo, meta, premio]. Cuanto más cuesta, más pagan: 100 rebotes ya es difícil, 150 es muy difícil y 200 o 300 son de leyenda.
      // t = tiempo total jugado (ms) · el resto como arriba
      logros: [
        ['g1', 'g', 1, 100], ['g10', 'g', 10, 250], ['g50', 'g', 50, 1000], ['g100', 'g', 100, 3000], ['g250', 'g', 250, 8000], ['g500', 'g', 500, 20000], ['g1000', 'g', 1000, 60000],
        ['b10', 'b', 10, 100], ['b25', 'b', 25, 250], ['b50', 'b', 50, 600], ['b75', 'b', 75, 1500], ['b100', 'b', 100, 4000], ['b125', 'b', 125, 10000], ['b150', 'b', 150, 25000], ['b200', 'b', 200, 100000], ['b300', 'b', 300, 500000],
        ['r100', 'r', 100, 150], ['r500', 'r', 500, 500], ['r2000', 'r', 2000, 2000], ['r5000', 'r', 5000, 6000], ['r10000', 'r', 10000, 20000], ['r25000', 'r', 25000, 60000], ['r50000', 'r', 50000, 150000],
        ['s3', 's', 3, 300], ['s7', 's', 7, 1500], ['s14', 's', 14, 5000], ['s21', 's', 21, 12000], ['s28', 's', 28, 30000], ['s60', 's', 60, 100000],
        ['t1', 't', 3600000, 1000], ['t10', 't', 36000000, 8000], ['t50', 't', 180000000, 40000],
        ['e1', 'e', 1, 150], ['c1', 'c', 1, 150], ['v1', 'v', 1, 500]
      ]
    },
    // Ruleta diaria: un giro por día (medianoche de Chile). El resultado NO lo elige el jugador: sale de la hora en que el servidor anota el giro (hora en ms % 20, 20 casillas iguales)
    // y el cobro es un segundo paso que repite esa misma cuenta, así no hay forma de «reintentar hasta que toque el premio grande».
    // premios: [pesos, multiplicador, casillas de las 20] · pesos 0 + multiplicador = se guarda uno (×2 o ×3, 10 min, lo activas tú como los de la racha) · las casillas suman 20
    // en promedio, un giro vale unos $2.900 en pesos y, una de cada cuatro veces, un multiplicador (el premio gordo de $25.000 sale 1 de cada 20)
    ruleta: { multMs: 300000, premios: [[500, 0, 4], [1000, 0, 4], [2500, 0, 3], [5000, 0, 2], [10000, 0, 1], [25000, 0, 1], [0, 2, 2], [0, 3, 2], [0, 4, 1]] },
    // Racha diaria: entrar cada día da premios y la racha sigue mientras no te saltes un día. El día cambia a medianoche de Chile en horario de verano (huso -3).
    // dias = pesos del día 1 al 27 (0 = ese día regala un multiplicador, ver mult): semana 1: $100 a $500 y el billete de $1.000 · semana 2: de 1 a 6 monedas de $500 · semana 3: de 1 a 6 billetes de $1.000 ·
    //        semana 4: $2.000 a $8.000. Desde el día `fijoDesde` en adelante se paga `fijo` cada día (el billete de $10.000).
    // mult = [día, multiplicador]: ese día se guarda un multiplicador en la cuenta; NO se activa solo: el jugador lo activa con un botón y dura dobleMs (las partidas que EMPIEZAN en ese lapso pagan ×N).
    racha: { dias: [100, 200, 300, 400, 500, 1000, 0,   500, 1000, 1500, 2000, 2500, 3000, 0,   1000, 2000, 3000, 4000, 5000, 6000, 0,   2000, 3000, 4000, 5000, 6000, 8000],
      fijo: 10000, fijoDesde: 28, mult: [[7, 2], [14, 3], [21, 4]], dobleMs: 600000, huso: -3 } },

  // Foto de perfil = un emblema que cada jugador arma en el editor: forma, colores de fondo y borde, diseño y hasta 5 símbolos puestos donde quiera.
  // Se guarda en 25 caracteres como máximo («e» + forma + fondo + borde + diseño + 4 por símbolo), así pesa casi nada en la base de datos y se dibuja con CSS (sin imágenes).
  // emojis = los símbolos que se pueden elegir (el 0 es la inicial del nombre; hasta 63) · paleta = [color claro, color oscuro, color de la letra]; hasta 64 colores.
  avatar: {
    emojis: ['🦆', '😎', '👑', '💰', '🪙', '💎', '🔥', '⚡', '🚀', '🏆', '🎮', '🎩', '🌈', '🍀', '🦁', '🐸', '🐼', '🦊', '👻', '🌙', '⭐', '❤️', '💀', '👽',
      '🤖', '🐱', '🐶', '🦄', '🐉', '🦅', '🐯', '🐵', '🦈', '🐧', '🌵', '🌸', '🍕', '🍔', '🎧', '🎸', '⚽', '🏀', '🥇', '🎯', '🧠', '💣', '⚔️', '❄️'],
    paleta: [['#4a4a4a', '#151515', '#fff'], ['#ff7b7b', '#d6282c', '#fff'], ['#ffb752', '#ee6a00', '#fff'], ['#ffe978', '#f0b400', '#3a2f00'], ['#86e486', '#25a038', '#fff'], ['#66e6d3', '#0f9f8f', '#fff'],
      ['#78d4ff', '#1f8fe0', '#fff'], ['#7b94ff', '#2c46d6', '#fff'], ['#bb94ff', '#6a35e0', '#fff'], ['#ff94d4', '#e0149f', '#fff'], ['#ffe9a0', '#cf9b10', '#3a2f00'], ['#ffffff', '#cfcfdc', '#222'],
      ['#c98a5b', '#7a4a22', '#fff'], ['#5a6fb5', '#1c2760', '#fff'], ['#d4f26a', '#8cb800', '#2a3300'], ['#b8bcc6', '#6b7080', '#fff']]
  },

  // Personajes: el rival que te devuelve la pelota. Todos son imágenes sueltas (el Tío Pato y la Tía Patita se transforman de ángel a diablo/diabla; el resto solo se enoja)
  // con temblor, brillo rojo y vapor. stat = dibujo calmado · stat2 = dibujo enojado, al que cambian cuando el personaje se enoja.
  // av = recorte de la cara para el avatar · dw = ancho de la caja del personaje (la pareja es más ancha) · g = género/número del nombre (m, f o p = plural).
  // devil: true = el personaje se transforma en diablo (su dibujo enojado es un demonio): sus frases del rebote 70 en adelante hablan del infierno; los demás solo se enfurecen.
  ch: [
    { id: 'tio', n: 'Tío Pato',   price: 0,   stat: 'trajes/angel.webp', stat2: 'trajes/angel-demonio.webp', asp: 1.723, asp2: 1.172, name: 'el Tío Pato', g: 'm', devil: true,
      av: { w: 55, fx: .545, fy: .309 }, av2: { w: 66, fx: .55, fy: .261 }, css: { steam: '60% 17%' }, note: 'El de siempre: ángel que baja al infierno' },
    // EDICIÓN LIMITADA: se vende hasta `until` (hora del servidor, en ms). Después sale de la tienda, pero quien la compró la conserva y puede equiparla para siempre.
    // Las reglas de Firebase solo dejan comprarla antes de `until` (cambiar la fecha = volver a correr generar-reglas.js y publicar). Hasta el 14 de noviembre de 2026 a las 23:59:59 (hora de Chile, UTC-3).
    { id: 'teleton', n: 'Tío Pato Teletón', price: 1000, until: Date.UTC(2026, 10, 15, 3, 0, 0), stat: 'trajes/teleton.webp', asp: 1.951, name: 'el Tío Pato Teletón', g: 'm',
      av: { w: 49, fx: .515, fy: .319 }, css: { steam: '58% 16%' }, note: 'Edición limitada: gorra y camiseta Teletón' },
    { id: 'tia', n: 'Tía Patita', price: 1500, stat: 'trajes/patita-angel.webp', stat2: 'trajes/patita-diabla.webp', asp: 1.547, asp2: 1.179, name: 'la Tía Patita', g: 'f', devil: true,
      av: { w: 51, fx: .465, fy: .296 }, av2: { w: 77, fx: .525, fy: .273 }, css: { steam: '62% 14%' }, note: 'Ángel que se vuelve diabla' },
    { id: 'conejo',   n: 'Tío Pato Conejo',     price: 3000, stat: 'trajes/conejo.webp',   stat2: 'trajes/conejo-enojado.webp',   asp: 1.905, asp2: 1.65, name: 'el Tío Pato Conejo',     g: 'm',
      av: { w: 46, fx: .47, fy: .333 }, av2: { w: 57, fx: .525, fy: .354 }, css: { steam: '66% 12%' }, note: 'Se enoja cuando avanzas' },
    { id: 'conejita', n: 'Tía Patita Conejita', price: 3000, stat: 'trajes/conejita.webp', stat2: 'trajes/conejita-enojada.webp', asp: 1.63, asp2: 1.45, name: 'la Tía Patita Conejita', g: 'f',
      av: { w: 56, fx: .535, fy: .388 }, av2: { w: 59, fx: .52, fy: .397 }, css: { steam: '70% 16%' }, note: 'Se enoja cuando avanzas' },
    { id: 'bigotes',  n: 'Tío Pato Simi',       price: 6000, stat: 'trajes/bigotes.webp',  stat2: 'trajes/bigotes-enojado.webp',  asp: 1.92, asp2: 1.61, name: 'el Tío Pato Simi',       g: 'm',
      av: { w: 48, fx: .46, fy: .319 }, av2: { w: 55, fx: .52, fy: .333 }, css: { steam: '64% 12%' }, note: 'Bigote, sombrero de copa y bata' },
    { id: 'tios',     n: 'Tíos Patitos',        price: 6000, stat: 'trajes/tios.webp',     stat2: 'trajes/tios-enojados.webp',    asp: .826,  asp2: .86,  name: 'los Tíos Patitos',       g: 'p', dw: 1.5,
      av: { w: 58, fx: .525, fy: .264 }, av2: { w: 58, fx: .525, fy: .28 }, css: { steam: '48% 6%' }, note: 'La pareja: te devuelven la pelota de la mano' },
    { id: 'galactico', n: 'Tío Pato Galáctico',  price: 50000, stat: 'trajes/galactico.webp', stat2: 'trajes/galactico-furia.webp', asp: 1.918, asp2: 1.56, name: 'el Tío Pato Galáctico',  g: 'm',
      av: { w: 45, fx: .46, fy: .337 }, av2: { w: 61, fx: .525, fy: .404 }, css: { steam: '60% 14%' }, note: 'Un trozo del universo: se enoja y se le eriza la melena' },
    // Personaje secreto: aparece como una carta misteriosa hasta que lo compras. Es el Tío Pato Dorado (rey de oro con corona que al enojarse se enciende al rojo vivo).
    // Su id sigue siendo «millonario» para que quien ya lo compró no lo pierda (las reglas de Firebase guardan lo comprado como ch_millonario).
    { id: 'millonario', n: 'Tío Pato Dorado', price: 100000000, stat: 'trajes/dorado.webp', stat2: 'trajes/dorado-oscuro.webp', asp: 1.812, asp2: 1.767, name: 'el Tío Pato Dorado', g: 'm', secret: true, glow: true,
      av: { w: 48, fx: .415, fy: .368 }, av2: { w: 45, fx: .475, fy: .391 }, css: { steam: '62% 22%' }, note: 'El secreto: rey de oro que se enciende al rojo vivo' }
  ],

  // vip: true = artículo para millonarios (la tienda los separa y los marca con 💎; el precio ya los deja fuera del alcance de quien recién empieza).
  bg: [
    { id: 'clasico',   n: 'Clásico',          price: 0,   base: '#003454', dark: true, note: 'Parte azul y cambia de color con tus puntos' },
    { id: 'atardecer', n: 'Atardecer',        price: 2000, base: '#ffb199', note: 'Sol sobre el mar y nubes que pasan' },
    { id: 'cristal',   n: 'Cristal helado',   price: 2200, base: '#dcecff', note: 'Témpanos, escarcha y destellos' },
    { id: 'aurora',    n: 'Aurora boreal',    price: 3000, base: '#0b1b34', dark: true, note: 'Cortinas de luz sobre las montañas' },
    { id: 'galaxia',   n: 'Galaxia',          price: 4000, base: '#0a0a1f', dark: true, note: 'Espiral girando y estrellas fugaces' },
    { id: 'holo',      n: 'Holográfico',      price: 4500, base: '#e9c8ff', note: 'Reflejos iridiscentes y burbujas' },
    { id: 'synth',     n: 'Synthwave',        price: 5500, base: '#3d0a6b', dark: true, note: 'Sol neón, montañas y cuadrícula' },
    { id: 'boveda',    n: 'Bóveda de oro',    price: 20000000,  base: '#1c1204', dark: true, vip: true, note: 'Una montaña de lingotes y polvo de oro' },
    { id: 'prisma',    n: 'Palacio de diamante', price: 50000000, base: '#0b1747', dark: true, vip: true, note: 'Un brillante gigante y rayos de arcoíris' },
    { id: 'agujero',   n: 'Agujero negro',    price: 100000000, base: '#02020a', dark: true, vip: true, note: 'Disco de fuego que gira sin parar' }
  ],

  // Barras: cada una con sus propios efectos (brillos, chispas, anillos al rebotar).
  pad: [
    { id: 'clasica',  n: 'Clásica',      price: 0,   note: 'Negra y sencilla' },
    { id: 'dorada',   n: 'Oro líquido',  price: 220, note: 'Gotas de oro que se derriten' },
    { id: 'fuego',    n: 'Llamarada',    price: 280, note: 'Roca volcánica en llamas, con brasas y humo' },
    { id: 'cristal',  n: 'Cristal',      price: 300, note: 'Esquirlas de hielo y vaho frío' },
    { id: 'neon',     n: 'Neón',         price: 350, note: 'Tubo de letrero con electrones' },
    { id: 'galaxia',  n: 'Galaxia',      price: 400, note: 'Polvo de estrellas en órbita y cometas' },
    { id: 'arcoiris', n: 'Arcoíris',     price: 450, note: 'Cintas de seda de colores' },
    { id: 'holo',     n: 'Holográfica',  price: 500, note: 'Proyecta un holograma 3D' },
    { id: 'midas',    n: 'Rey Midas',    price: 3000000,  vip: true, note: 'Todo lo que toca se vuelve monedas' },
    { id: 'diamante', n: 'Diamante',     price: 6000000,  vip: true, note: 'Facetas que lanzan arcoíris' },
    { id: 'nuclear',  n: 'Núcleo radiactivo', price: 8000000, vip: true, note: 'Cilindro de plutonio que brilla y gotea' },
    { id: 'plasma',   n: 'Tormenta eléctrica', price: 12000000, vip: true, note: 'Rayos que saltan entre electrodos' }
  ],

  // Pelotas: monedas y billetes chilenos. rate = pesos que paga cada punto (se multiplica por «Monedas dobles» desde el rebote 100).
  // nom/gen = cómo los nombran los textos del juego («la moneda», «el billete», «el lingote de oro», «el diamante»).
  // fx = cómo se mueve (spin: la moneda gira en el sentido del reloj · flutter: el billete revolotea · jump: el lingote y el diamante saltan). w = ancho relativo.
  // asp = alto/ancho del dibujo (medido de la imagen): con w dice cuánto mide la pelota en pantalla, y el juego hace chocar la pelota con las paredes, la barra y el Pato exactamente donde se ve (si cambias una imagen, el juego mide la nueva solo).
  ball: [
    { id: 'peso1',   n: 'Moneda $1',       price: 0,     rate: 1,  img: 'skins/peso1.webp',   fx: 'spin',    w: 1, asp: 0.975,    trail: '#d5dbe8', nom: 'moneda', gen: 'f', note: 'La moneda de inicio' },
    { id: 'peso5',   n: 'Moneda $5',       price: 5,     rate: 2,  img: 'skins/peso5.webp',   fx: 'spin',    w: 1, asp: 0.98,    trail: '#f2b830', nom: 'moneda', gen: 'f' },
    { id: 'peso10',  n: 'Moneda $10',      price: 10,    rate: 3,  img: 'skins/peso10.webp',  fx: 'spin',    w: 1, asp: 0.997,    trail: '#f2c66a', nom: 'moneda', gen: 'f' },
    { id: 'peso50',  n: 'Moneda $50',      price: 50,    rate: 4,  img: 'skins/peso50.webp',  fx: 'spin',    w: 1, asp: 1.003,    trail: '#e0b060', nom: 'moneda', gen: 'f' },
    { id: 'peso100', n: 'Moneda $100',     price: 100,   rate: 5,  img: 'skins/peso100.webp', fx: 'spin',    w: 1, asp: 1.0,    trail: '#ffe08a', nom: 'moneda', gen: 'f' },
    { id: 'peso500', n: 'Moneda $500',     price: 500,   rate: 6,  img: 'skins/peso500.webp', fx: 'spin',    w: 1.05, asp: 1.0, trail: '#f5f0d0', nom: 'moneda', gen: 'f' },
    { id: 'b1000',   n: 'Billete $1.000',  price: 1000,  rate: 7,  img: 'skins/b1000.webp',   fx: 'flutter', w: 1.6, asp: 0.571,  trail: '#8fe08f', nom: 'billete', gen: 'm' },
    { id: 'b2000',   n: 'Billete $2.000',  price: 2000,  rate: 8,  img: 'skins/b2000.webp',   fx: 'flutter', w: 1.6, asp: 0.509,  trail: '#c9a6ee', nom: 'billete', gen: 'm' },
    { id: 'b5000',   n: 'Billete $5.000',  price: 5000,  rate: 9,  img: 'skins/b5000.webp',   fx: 'flutter', w: 1.6, asp: 0.495,  trail: '#f08a94', nom: 'billete', gen: 'm' },
    { id: 'b10000',  n: 'Billete $10.000', price: 10000, rate: 10, img: 'skins/b10000.webp',  fx: 'flutter', w: 1.6, asp: 0.476,  trail: '#7cc4f0', nom: 'billete', gen: 'm' },
    { id: 'b20000',  n: 'Billete $20.000', price: 20000, rate: 20, img: 'skins/b20000.webp',  fx: 'flutter', w: 1.6, asp: 0.486,  trail: '#f0a070', nom: 'billete', gen: 'm' },
    { id: 'plata',   n: 'Lingote de plata', price: 50000,   rate: 100,   img: 'skins/plata.webp',    fx: 'jump', w: 1.7, asp: 0.594, trail: '#cfd6e2', nom: 'lingote de plata', gen: 'm', note: 'Un lingote de verdad' },
    { id: 'oro',     n: 'Lingote de oro',   price: 500000,  rate: 500,   img: 'skins/oro.webp',     fx: 'jump', w: 1.7, asp: 0.594, trail: '#ffd54a', nom: 'lingote de oro', gen: 'm' },
    { id: 'diamante', n: 'Diamante',        price: 1000000, rate: 5000,  img: 'skins/diamante.webp', fx: 'jump', w: 1.15, asp: 1.04, trail: '#8fd3ff', nom: 'diamante', gen: 'm', note: 'La joya de la corona' }
  ],

  // Colores del juego: pintan el inicio, la tienda y los marcadores (el fondo de la partida se elige en «Fondos»). El primero es el de siempre (gratis); los demás se compran y se cambian cuando uno quiere.
  // c = [arriba, medio, abajo] del degradado de fondo · s = [centro, medio, borde] del círculo del Pato · dark = fondo oscuro (el texto va claro; sin dark, el texto va oscuro).
  // Opcionales: on = color del texto sobre el fondo · on2 = el texto más suave · g = [1, 2] del lema dorado · t = [1, 2] del título. vip = solo para millonarios (se muestran aparte).
  // V2 · sonidos de rebote (se compran con pesos como cualquier artículo y se equipan en wallet.eq.sfx). El sonido se sintetiza en v2/audio.js.
  sfx: [
    { id: 'clasico', n: 'Clásico',             price: 0,    icon: '🔔', note: 'El «tic» de siempre' },
    { id: 'cuac',    n: 'Pato',                price: 800,  icon: '🦆', note: '¡Cuac! en cada rebote' },
    { id: 'bip',     n: 'Scanner',             price: 800,  icon: '🛒', note: 'El BIP de la caja del súper' },
    { id: 'cash',    n: 'Máquina expendedora', price: 1200, icon: '🏧', note: '¡Cash! como caja registradora' },
    { id: 'kling',   n: 'Moneda',              price: 1200, icon: '🪙', note: 'Kling metálico de moneda' },
    { id: 'gota',    n: 'Gota',                price: 1500, icon: '💧', note: 'Plop de agua' },
    { id: 'laser',   n: 'Láser',               price: 2000, icon: '🔫', note: 'Piu de máquina arcade' }
  ],

  // V2 · power-ups de pago (se usan en partidas Arcade: 10 s cada uno, máximo 3 por partida). Con pesos: carísimos.
  v2: {
    powerups: { slow: { n: 'Burbujas', em: '🫧' }, freeze: { n: 'Hielo cristal', em: '❄️' }, wide: { n: 'Barra grande', em: '📏' } },
    precioPesos: 500000, porPartida: 3, duraMs: 10000, anuncioCada: 5,
    packs: [
      { id: 'com.miempresa.pingpong.pack1', n: 'Pack Inicial',    precio: '$990',   da: { slow: 3, wide: 2 } },
      { id: 'com.miempresa.pingpong.pack2', n: 'Pack Hielo',      precio: '$1.990', da: { freeze: 5 } },
      { id: 'com.miempresa.pingpong.pack3', n: 'Pack Pro',        precio: '$3.990', da: { slow: 6, freeze: 6, wide: 6 }, cinta: 'Más vendido' },
      { id: 'com.miempresa.pingpong.pack4', n: 'Pack Millonario', precio: '$7.990', da: { slow: 15, freeze: 15, wide: 15 }, cinta: 'Mejor precio' }
    ],
    sinAnuncios: { id: 'com.miempresa.pingpong.sinanuncios', n: 'Sin anuncios', precio: '$2.490' }
  },

  th: [
    { id: 'oceano',   n: 'Azul profundo',   price: 0,       dark: true, c: ['#00223b', '#003454', '#001d35'], s: ['#0a6b8a', '#0a4e65', '#06384d'], note: 'El de siempre: azul marino con toques dorados' },
    { id: 'clasico',  n: 'Amarillo clásico', price: 1000,    c: ['#ffec96', '#fff7c2', '#fff7c2'], s: ['#fffef0', '#fff1a8', '#f7d85a'], note: 'El amarillo de antes' },
    { id: 'bosque',   n: 'Verde bosque',    price: 2000,     dark: true, c: ['#05261a', '#0b3d2b', '#04201a'], s: ['#1f8a5c', '#126343', '#0a3f2b'], note: 'Verde profundo, como de noche en el bosque' },
    { id: 'rosa',     n: 'Rosa chicle',     price: 2000,     c: ['#ffc2e0', '#ffd9ec', '#ffd0e8'], s: ['#fff5fb', '#ffc2e0', '#f58fc4'], on: '#3d0a2a', on2: '#8a3a68', g: ['#b0156b', '#e0458f'], t: ['#3d0a2a', '#9a1560'], note: 'Dulce y brillante' },
    { id: 'violeta',  n: 'Violeta',         price: 3000,     dark: true, c: ['#1f0a3d', '#341a63', '#1a0838'], s: ['#7a45d6', '#5329a6', '#341a63'], note: 'Morado intenso con aire de magia' },
    { id: 'fuego',    n: 'Rojo fuego',      price: 3500,     dark: true, c: ['#2e0505', '#6b1410', '#2a0705'], s: ['#e8572a', '#b02a12', '#6b1410'], note: 'Brasas y llamas' },
    { id: 'noche',    n: 'Noche',           price: 4000,     dark: true, c: ['#05050a', '#12121c', '#05050a'], s: ['#3a3a55', '#23233a', '#12121c'], note: 'Negro elegante' },
    { id: 'oro',      n: 'Negro y oro',     price: 10000000, dark: true, vip: true, c: ['#140e02', '#2a1c04', '#100a01'], s: ['#f2c24a', '#b8860b', '#6b4a06'], on: '#fff3d0', on2: 'rgba(255, 236, 180, .78)', g: ['#ffe27a', '#ffb300'], t: ['#fff3b0', '#ffc928'], note: 'Negro con oro por todos lados' },
    { id: 'diamante', n: 'Hielo diamante',  price: 25000000, vip: true, c: ['#d8f3ff', '#eafaff', '#cdeeff'], s: ['#ffffff', '#bfeaff', '#7fd0f5'], on: '#0a2a40', on2: '#3a6a88', g: ['#0a7aa8', '#2fb4e8'], t: ['#0a2a40', '#1a6a98'], note: 'Celeste cristalino, solo para millonarios' }
  ]
};
