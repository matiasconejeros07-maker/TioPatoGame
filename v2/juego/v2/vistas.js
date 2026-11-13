// VISTAS de la V2: dibujan y avisan de los toques. No deciden nada: llaman a los controladores.
// Usan las mismas piezas visuales del juego (modal, mcard, btn, seg…) para que todo se vea de una sola pieza.
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CONFETI = ['#ffc928', '#ff5a4f', '#5fe08a', '#58b6ff', '#c29aff', '#ffffff'];

/** Una capa encima del juego que se resuelve con lo que elija el jugador. */
function capa(clase, html, alAbrir) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal show v2 ' + clase; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = html;
    const cerrar = (v) => { el.classList.add('out'); setTimeout(() => el.remove(), 180); resolve(v); };
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b && !b.disabled) cerrar(b.dataset.v); });
    document.body.appendChild(el);
    alAbrir?.(el, cerrar);
  });
}

function confeti(el, n = 40, imagen) {
  const box = document.createElement('div'); box.className = 'v2-confeti'; el.appendChild(box);
  for (let i = 0; i < n; i++) {
    const p = document.createElement(imagen ? 'img' : 'i');
    if (imagen) { p.src = imagen; p.alt = ''; p.style.width = 22 + Math.random() * 22 + 'px'; } else p.style.background = CONFETI[i % CONFETI.length];
    p.style.left = Math.random() * 96 + '%'; p.style.animationDuration = 1.8 + Math.random() * 2 + 's'; p.style.animationDelay = Math.random() * .8 + 's';
    box.appendChild(p);
  }
}

export class VistaV2 {
  constructor() { this.toastTimer = 0; }
  conectar({ api, ctl }) { this.api = api; this.ctl = ctl; }

  aviso(texto) {
    let t = document.getElementById('v2toast');
    if (!t) { t = document.createElement('div'); t.id = 'v2toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = texto; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ───────── botón Arcade del menú: cuántos power-ups tienes ─────────
  pintarStockArcade(pu) {
    const b = document.getElementById('arcadeStock'); if (!b) return;
    const n = Object.values(pu).reduce((a, x) => a + (x > 0 ? x : 0), 0);
    b.hidden = n === 0; b.textContent = n > 99 ? '99+' : n;
  }

  // ───────── botones de power-ups en la partida (Arcade) ─────────
  mostrarHud(on) {
    let hud = document.getElementById('v2hud');
    if (!on) { hud?.remove(); clearInterval(this.hudTimer); return; }
    if (!hud) { hud = document.createElement('div'); hud.id = 'v2hud'; this.api.field.appendChild(hud); }
    hud.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();                        // tocar un power-up no mueve la barra
      const b = e.target.closest('button[data-k]'); if (b) this.ctl.powerUps.usar(b.dataset.k).then(() => this.pintarHud());
    });
    clearInterval(this.hudTimer); this.hudTimer = setInterval(() => this.pintarHud(), 200);
    this.pintarHud();
  }
  pintarHud() {
    const hud = document.getElementById('v2hud'); if (!hud) return;
    const pu = this.ctl.powerUps, stock = this.ctl.cuenta.powerUps;
    const html = Object.entries(pu.catalogo).map(([k, p]) => {
      const left = this.api.pupLeft(k), on = left > 0, no = !on && pu.motivo(k);
      return `<button type="button" data-k="${k}" class="${on ? 'on' : ''} ${no ? 'no' : ''}" aria-label="${p.n}" style="--p:${on ? (left / 10000).toFixed(3) : 0}">
        <span>${p.em}</span><i>${stock[k] || 0}</i>${on ? `<b>${Math.ceil(left / 1000)}</b>` : ''}</button>`;
    }).join('') + `<small>${pu.restantes}/${pu.porPartida}</small>`;
    if (hud.innerHTML !== html) hud.innerHTML = html;
  }

  // ───────── pestaña Power-Ups de la tienda ─────────
  pintarPowerUps(grid) {
    const { powerUps: pu, compras, cuenta } = this.ctl, api = this.api, stock = cuenta.powerUps;
    const sinSesion = !api.session;
    const iconos = ['🫧', '❄️', '⚡', '👑'];
    grid.innerHTML = `
      <p class="v2-lead">Se usan en partidas <b>Arcade</b>: duran 10 segundos y puedes activar hasta 3 por partida. En el modo <b>Clásico</b> (el ranking principal) no se pueden usar.</p>
      <div class="v2-stock">${Object.entries(pu.catalogo).map(([k, p]) => `
        <div class="v2-pu pu-${k}"><span class="em">${p.em}</span><b>${stock[k] || 0}</b><small>${esc(p.n)}</small>
          <button type="button" class="v2-coin ${api.balance() >= pu.precioPesos ? '' : 'no'}" data-pesos="${k}" ${sinSesion ? 'disabled' : ''}><img src="${(document.querySelector('.coins .ci') || {}).src || 'skins/peso1.webp'}" alt="">${api.money(pu.precioPesos)}</button></div>`).join('')}</div>
      <h3 class="v2-sec">Packs de ofertas</h3>
      ${compras.packs.map((p, i) => `
        <article class="v2-pack pack-${i + 1}">${p.cinta ? `<span class="cinta">${esc(p.cinta)}</span>` : ''}
          <div class="emblema"><span>${iconos[i] || '⚡'}</span><i>×${Object.values(p.da).reduce((a, b) => a + b, 0)}</i></div>
          <div class="info"><h4>${esc(p.n)}</h4><ul>${Object.entries(p.da).map(([k, n]) => `<li>${pu.catalogo[k].em} ×${n}</li>`).join('')}</ul>
            <button type="button" class="v2-buy" data-pack="${i}" ${sinSesion ? 'disabled' : ''}>Comprar · ${esc(p.precio)}</button></div></article>`).join('')}
      ${compras.sinAnuncios && !cuenta.sinAnuncios ? `
        <article class="v2-pack pack-na"><div class="emblema"><span>🚫</span></div>
          <div class="info"><h4>${esc(compras.sinAnuncios.n)}</h4><ul><li>Para siempre</li><li>Una sola compra</li></ul>
            <button type="button" class="v2-buy" data-na="1" ${sinSesion ? 'disabled' : ''}>Comprar · ${esc(compras.sinAnuncios.precio)}</button></div></article>` : ''}
      ${sinSesion ? '<p class="v2-lead">Entra a tu cuenta para comprar.</p>' : '<p class="v2-lead fino">Demo: las compras con dinero real son de prueba (no se cobra nada). En la app las cobra Google Play o el App Store.</p>'}`;
    grid.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.pesos) await pu.comprarConPesos(b.dataset.pesos);
      else if (b.dataset.pack) await compras.comprar(compras.packs[+b.dataset.pack]);
      else if (b.dataset.na) await compras.comprar(compras.sinAnuncios);
      else return;
      api.renderShop();
    };
  }

  // ───────── compra con dinero real (simulada en la demo) ─────────
  hojaDeCompra(p) {
    return capa('v2-hoja', `<div class="mcard">
      <span class="v2-tag">Compra de prueba</span><h2>${esc(p.n)}</h2>
      <p class="msub">En la app real esto lo cobra Google Play o el App Store y el servidor lo valida antes de entregarlo. Aquí no se cobra nada.</p>
      <button class="btn" data-v="si">Comprar · ${esc(p.precio)}</button><button class="link" data-v="">Cancelar</button></div>`).then((v) => v === 'si');
  }

  // ───────── privacidad y anuncios ─────────
  consentimiento() {
    return capa('v2-privacidad', `<div class="mcard">
      <h2>Tu privacidad 🔒</h2>
      <p class="msub">Este juego es gratis gracias a los anuncios. ¿Nos dejas mostrarte anuncios según tus intereses? Si no, verás anuncios genéricos. Puedes cambiarlo cuando quieras en Ajustes.</p>
      <button class="btn" data-v="si">Aceptar</button><button class="btn ghost" data-v="no">Solo anuncios genéricos</button>
      <p class="v2-lead fino">En la app esto lo muestra la plataforma de consentimiento de Google (GDPR / CCPA).</p></div>`);
  }
  anuncio(personalizado) {
    return capa('v2-anuncio', `<div class="mcard">
      <span class="v2-tag">Anuncio de prueba${personalizado ? '' : ' · genérico'}</span>
      <div class="v2-adbox">AdMob</div>
      <p class="msub">Sale un anuncio cada 5 partidas. Con «Sin anuncios» no aparece nunca más.</p>
      <button class="btn" data-v="ok" disabled>Cerrar (3)</button></div>`, (el) => {
      const b = el.querySelector('[data-v]'); let n = 3;
      const t = setInterval(() => { n -= 1; if (n <= 0) { clearInterval(t); b.disabled = false; b.textContent = 'Cerrar'; } else b.textContent = `Cerrar (${n})`; }, 1000);
    });
  }

  // ───────── animaciones de compra ─────────
  /**
   * @param {{ tipo: 'articulo'|'secreto'|'pack'|'sinanuncios', cat?: string, it?: object, titulo?: string, da?: object }} c
   */
  celebrar(c) {
    const cat = c.cat, it = c.it || {};
    let premio = '', titulo = c.titulo || '', sub = '';
    const art = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    if (c.tipo === 'secreto' || cat === 'ch') {
      const quien = it.name || it.n, g = it.g;                       // el nombre del personaje ya trae su artículo: «la Tía Patita», «los Tíos Patitos»
      premio = `<img src="${esc(it.stat)}" alt="">`;
      titulo = c.tipo === 'secreto' ? `¡${art(quien)}!` : `¡${art(quien)} ${g === 'p' ? 'son tuyos' : g === 'f' ? 'es tuya' : 'es tuyo'}!`;
      sub = c.tipo === 'secreto' ? 'Desbloqueaste el personaje secreto. Bienvenido al club de los millonarios 👑'
        : g === 'p' ? 'Ya te esperan en la cancha. ¡A ganarles!' : g === 'f' ? 'Ya te espera en la cancha. ¡A ganarle!' : 'Ya te espera en la cancha. ¡A ganarle!';
    } else if (cat === 'ball') {
      premio = `<div class="ball ${it.fx || ''} ${it.rate >= 100 ? 'premium t-' + it.id : ''}" style="--bw:${it.w || 1}"><img src="${esc(it.img)}" alt=""></div>`;
      const f = it.gen === 'f';
      titulo = `¡${f ? 'La' : 'El'} ${esc(it.n)} es ${f ? 'tuya' : 'tuyo'}!`;
      sub = `Ahora cada rebote paga ${this.api.money(it.rate)}. Tu billetera ya la lleva.`;
    } else if (cat === 'pad') { premio = `<div class="v2-barra"><div class="pvbar p-${esc(it.id)}"></div></div>`; titulo = `¡Barra «${esc(it.n)}»!`; sub = 'Ya la llevas en la cancha.'; }
    else if (cat === 'bg') { premio = `<div class="v2-marco"><div class="pv bgx" data-bg="${esc(it.id)}"><i></i><i></i><i></i><i></i><i></i></div></div>`; titulo = `¡Fondo «${esc(it.n)}»!`; sub = 'Lo verás mientras juegas.'; }
    else if (cat === 'th') { premio = `<div class="v2-colores" style="background:linear-gradient(180deg, ${it.c[0]}, ${it.c[1]} 50%, ${it.c[2]})"><i style="background:radial-gradient(circle at 50% 40%, ${it.s[0]}, ${it.s[1]} 55%, ${it.s[2]})"></i></div>`; titulo = `¡Colores «${esc(it.n)}»!`; sub = 'El menú, la tienda y los marcadores ya se ven así.'; }
    else if (cat === 'sfx') { premio = `<span class="v2-icono">${it.icon || '🔔'}</span>`; titulo = `¡Sonido «${esc(it.n)}»!`; sub = 'Lo escucharás en cada rebote.'; setTimeout(() => this.ctl.sonido.probar(it.id), 500); }
    else if (c.tipo === 'pack') { premio = `<div class="v2-da">${Object.entries(c.da).map(([k, n], i) => `<div style="--i:${i}"><span>${this.ctl.powerUps.catalogo[k].em}</span><b>×${n}</b></div>`).join('')}</div>`; sub = 'Úsalos en partidas Arcade.'; }
    else if (c.tipo === 'sinanuncios') { premio = '<span class="v2-icono">🚫</span>'; titulo = '¡Sin anuncios!'; sub = 'Ya no verás anuncios entre partidas. Gracias por apoyar el juego.'; }

    const secreto = c.tipo === 'secreto';
    return capa(`v2-cele ${secreto ? 'secreto' : ''} cat-${cat || c.tipo}`, `
      <div class="rayos"></div>${secreto ? '<div class="flash"></div>' : ''}
      <div class="premio">${premio}</div>
      <h2 class="${secreto ? 'tarde' : ''}">${titulo}</h2><p class="${secreto ? 'tarde' : ''}">${sub}</p>
      <button class="btn ${secreto ? 'oro tarde' : ''}" data-v="ok">${secreto ? 'Continuar' : '¡Bacán!'}</button>`, (el) => {
      const img = cat === 'ball' ? it.img : null;
      if (secreto) setTimeout(() => el.isConnected && confeti(el, 60), 4000); else confeti(el, 36, img);
    }).then(() => undefined);
  }

  // ───────── ajustes ─────────
  cambiarNombre(actual, alGuardar) {
    return capa('v2-nombre', `<div class="mcard">
      <button class="mclose" data-v="" aria-label="Cerrar">✕</button>
      <h2>Tu nombre</h2><p class="msub">De 3 a 12 letras o números. Después tendrás que esperar 30 días para cambiarlo otra vez.</p>
      <form><input class="field" id="v2nombre" maxlength="12" autocomplete="off" value="${esc(actual)}" aria-label="Nombre nuevo">
      <div class="status err" id="v2nombreMsg" role="alert"></div><button class="btn" type="submit">Guardar</button></form></div>`, (el, cerrar) => {
      const f = el.querySelector('form'), msg = el.querySelector('#v2nombreMsg'), inp = el.querySelector('input');
      setTimeout(() => { inp.focus(); inp.select(); }, 60);
      f.addEventListener('submit', async (e) => {
        e.preventDefault(); const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Un momento…';
        const error = await alGuardar(inp.value);
        b.disabled = false; b.textContent = 'Guardar';
        if (error) { msg.textContent = error; inp.focus(); } else cerrar('ok');
      });
    });
  }
  confirmarEliminar() {
    return capa('v2-eliminar', `<div class="mcard">
      <h2>¿Eliminar tu cuenta?</h2>
      <p class="msub">Se borran para siempre tus pesos, compras, racha, emblema y récords. No se puede deshacer.</p>
      <button class="btn rojo" data-v="si">Sí, eliminar mi cuenta</button><button class="btn ghost" data-v="">No, volver</button></div>`).then((v) => v === 'si');
  }
}
