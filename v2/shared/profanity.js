// Filtro de nombres ofensivos: garabatos y groserías chilenas, y referencias a genitales.
// Es estricto a propósito: prefiere rechazar un nombre dudoso antes que dejar pasar un insulto al marcador.
// Lo usan la app (para avisar al escribir) y el servidor (que es quien decide).

// Letras disfrazadas: «p1c0», «w3@», «cu1i40»…
const LOOKALIKES = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '€': 'e', '+': 't' };

// Se buscan en CUALQUIER parte del nombre (también pegadas a otras letras: «elweon», «xXculiaoXx»).
// Van sin tildes y sin letras repetidas, porque el nombre se compara ya normalizado.
const ANYWHERE = [
  // garabatos chilenos
  'weon', 'weona', 'hueon', 'huevon', 'gueon', 'aweona', 'ahuevona', 'wea', 'huea', 'hueva', 'guea',
  'culia', 'culiao', 'qlia', 'qliao', 'kliao', 'culeado', 'culero',
  'conchetum', 'conchasum', 'conchadesum', 'chuchetum', 'chuchasum', 'ctm', 'csm', 'ctmr', 'ptm',
  'maricon', 'maraco', 'fleto', 'puta', 'puto', 'putit', 'mierda', 'cagad', 'cagon', 'sacowea',
  'aweonao', 'pajero', 'pajera', 'reculia', 'chupal', 'chupam', 'mamal', 'mamam', 'lameme',
  // genitales (y variantes chilenas)
  'pichula', 'pichul', 'verga', 'penis', 'vagina', 'clitoris', 'testicul', 'escroto', 'prepucio', 'callampa', 'corneta',
  'diuca', 'chucha', 'zorra', 'tetas', 'tetona', 'culito', 'potito', 'ojete', 'pajaso', 'semen',
  // inglés (aparecen igual en los nombres)
  'fuck', 'shit', 'bitch', 'pusy', 'dick', 'cunt', 'penis', 'boob',
];

// Palabras cortas o que también son inocentes dentro de otras («PENElope», «PICOteo», «musCULO», «TULAnsingo»):
// solo se bloquean cuando son una palabra completa del nombre («El Pico», «pico_99», «ql»).
const WHOLE_WORD = [
  'ql', 'kl', 'qlo', 'klo', 'wn', 'wna', 'pico', 'pene', 'tula', 'pija', 'pito', 'nepe', 'polla', 'pinga', 'cola',
  'culo', 'poto', 'raja', 'ano', 'anal', 'teta', 'concha', 'choro', 'chocho', 'coño', 'cono', 'sapo', 'bolas', 'cocos', 'huevos',
  'paja', 'caca', 'pichi', 'peo', 'perra', 'cock', 'ass', 'sex', 'sexo', 'porno', 'porn',
].map((w) => w.normalize('NFD').replace(/[̀-ͯ]/g, ''));

const squeeze = (text) => text.replace(/(.)\1+/g, '$1');                  // «weeeaaa» → «wea»
const ANYWHERE_SET = [...new Set(ANYWHERE.map(squeeze))];
const WHOLE_SET = new Set(WHOLE_WORD.map(squeeze));

/** Palabras del nombre en minúsculas, sin tildes, con las letras disfrazadas traducidas y sin repeticiones. */
function words(name) {
  const plain = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[0134578@$!|€+]/g, (c) => LOOKALIKES[c]);
  return plain.split(/[^a-z]+/).filter(Boolean).map(squeeze);
}

/** @returns {boolean} true si el nombre contiene una grosería o una referencia a genitales */
export function isOffensive(name) {
  const list = words(name);
  const joined = list.join('');                                           // «w.e.o.n», «c t m» → todo junto
  if (WHOLE_SET.has(joined) || list.some((w) => WHOLE_SET.has(w))) return true;
  // una palabra corta seguida o precedida de relleno típico: «elpico», «picoql», «tupico»
  if (list.some((w) => [...WHOLE_SET].some((bad) => bad.length >= 4 && (w === 'el' + bad || w === 'la' + bad || w === 'tu' + bad || w === 'mi' + bad)))) return true;
  return ANYWHERE_SET.some((bad) => joined.includes(bad));
}
