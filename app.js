// =============================================
// FIREBASE — sincronización en tiempo real
// =============================================
// Pasos para activar:
// 1. Ve a https://console.firebase.google.com → Crear proyecto
// 2. Agrega una app web → copia la config aquí abajo
// 3. Ve a Realtime Database → Crear base de datos → Modo prueba
// 4. (Opcional) En Rules, pon ".read": true, ".write": true bajo "catan_results"
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAdexIBsjz_3YV8rF5GvhMzeClwvybxeTc",
  authDomain:        "catantournament-720b7.firebaseapp.com",
  databaseURL:       "https://catantournament-720b7-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "catantournament-720b7",
  storageBucket:     "catantournament-720b7.firebasestorage.app",
  messagingSenderId: "254641903048",
  appId:             "1:254641903048:web:35ab1584f364efcfe81cfd"
};

const FIREBASE_ENABLED = typeof firebase !== 'undefined' && !!FIREBASE_CONFIG.databaseURL;
let _db = null;
let _fbListenerRef = null;

(function initFirebase() {
  if (!FIREBASE_ENABLED) return;
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    _db = firebase.database();
    console.info('[Firebase] Conectado:', FIREBASE_CONFIG.databaseURL);
  } catch(e) {
    console.warn('[Firebase] Error al inicializar:', e.message);
  }
})();

function fbEnviarResultado(torneoId, rondaNum, mesaIdx, datos) {
  if (!_db) return Promise.reject('Firebase no disponible');
  return _db.ref(`catan_results/${torneoId}/${rondaNum}_${mesaIdx}`).set(datos);
}

function fbIniciarListener(torneoId) {
  if (!_db) return;
  fbDetenerListener();
  _fbListenerRef = _db.ref(`catan_results/${torneoId}`);
  _fbListenerRef.on('value', snap => {
    const data = snap.val();
    if (data) _aplicarResultadosFirebase(torneoId, data);
  });
}

function fbDetenerListener() {
  if (_fbListenerRef) { _fbListenerRef.off('value'); _fbListenerRef = null; }
}

function _aplicarResultadosFirebase(torneoId, data) {
  const t = state.torneos.find(x => x.id === torneoId);
  if (!t || t !== state.torneoActivo) return;
  let changed = false;
  Object.entries(data).forEach(([key, resultados]) => {
    const parts = key.split('_');
    const mesaIdx = parseInt(parts.pop());
    const rondaNum = parseInt(parts.join('_'));
    const ronda = t.rondas.find(r => r.numero === rondaNum);
    if (!ronda) return;
    ronda.resultadosMesas = ronda.resultadosMesas || [];
    if (JSON.stringify(ronda.resultadosMesas[mesaIdx]) !== JSON.stringify(resultados)) {
      ronda.resultadosMesas[mesaIdx] = resultados;
      changed = true;
    }
  });
  if (changed) {
    guardarEstado();
    renderRondas();
    renderClasificacion();
    renderHistorial();
    actualizarBtnRonda();
    _mostrarToastFb('🔄 Resultado recibido de un jugador');
  }
}

function _mostrarToastFb(msg) {
  let toast = document.getElementById('fb-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'fb-toast';
    toast.className = 'fb-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('visible'), 3500);
}

// =============================================

const state = {
  torneos: JSON.parse(localStorage.getItem('catan_torneos') || '[]'),
  torneoActivo: null,
  seccion: 'torneo',
};

function guardarEstado() {
  localStorage.setItem('catan_torneos', JSON.stringify(state.torneos));
}

// --- Navegación de secciones (sidebar) ---
document.querySelectorAll('.sidebar-item').forEach(btn => {
  btn.addEventListener('click', () => mostrarSeccion(btn.dataset.section));
});

function mostrarSeccion(seccion) {
  state.seccion = seccion;
  document.querySelectorAll('.sidebar-item').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.section === seccion)
  );
  const esMapa = seccion === 'mapa';
  if (esMapa) {
    document.getElementById('vistaInicio').classList.add('hidden');
    document.getElementById('vistaDetalle').classList.add('hidden');
    document.getElementById('vistaMapa').classList.remove('hidden');
  } else {
    document.getElementById('vistaMapa').classList.add('hidden');
    mostrarVista(state.torneoActivo ? 'detalle' : 'inicio');
  }
}

// --- Navegación de vistas (dentro de torneo) ---
function mostrarVista(vista) {
  document.getElementById('vistaInicio').classList.toggle('hidden', vista !== 'inicio');
  document.getElementById('vistaDetalle').classList.toggle('hidden', vista !== 'detalle');
  document.getElementById('vistaMapa').classList.add('hidden');
}

// =============================================
// GENERADOR DE MAPA
// =============================================

const BOARD_COORDS = [
  {q:0,r:-2},{q:1,r:-2},{q:2,r:-2},
  {q:-1,r:-1},{q:0,r:-1},{q:1,r:-1},{q:2,r:-1},
  {q:-2,r:0},{q:-1,r:0},{q:0,r:0},{q:1,r:0},{q:2,r:0},
  {q:-2,r:1},{q:-1,r:1},{q:0,r:1},{q:1,r:1},
  {q:-2,r:2},{q:-1,r:2},{q:0,r:2},
];

const MAP_RESOURCES = [
  'ore','ore','ore',
  'brick','brick','brick',
  'sheep','sheep','sheep','sheep',
  'wood','wood','wood','wood',
  'wheat','wheat','wheat','wheat',
  'desert',
];

const MAP_NUMBERS = [2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12];

const PIPS = {2:1,3:2,4:3,5:4,6:5,8:5,9:4,10:3,11:2,12:1};

const RES_BORDER = {
  ore:'#52555A', brick:'#7A2E10', sheep:'#3E6E20',
  wood:'#1A3A18', wheat:'#9A6808', desert:'#907040',
};

const HEX_SIZE = 90;
const MAP_CX = 395, MAP_CY = 365;

function axialToPixel(q, r) {
  return {
    x: MAP_CX + HEX_SIZE * Math.sqrt(3) * (q + r / 2),
    y: MAP_CY + HEX_SIZE * 1.5 * r,
  };
}

function hexPoints(cx, cy) { return hexPointsSize(cx, cy, HEX_SIZE); }

function hexPointsSize(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 90);
    pts.push(`${(cx + size * Math.cos(a)).toFixed(1)},${(cy + size * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

// ---- Tiles por recurso ----
function p(n) { return n.toFixed(1); }

const RES_IMG = {
  ore:    'assets/stone.png',
  brick:  'assets/brick.png',
  sheep:  'assets/sheep.png',
  wood:   'assets/Wood.png',
  wheat:  'assets/weat.png',
  desert: 'assets/desert.png',
};

function drawOre(cx, cy) {
  return `
    <rect x="${p(cx-78)}" y="${p(cy-78)}" width="156" height="156" fill="#9EA3A8"/>
    <rect x="${p(cx-78)}" y="${p(cy-78)}" width="156" height="90" fill="#B0B5BA"/>
    <polygon points="${p(cx-8)},${p(cy-62)} ${p(cx-50)},${p(cy+32)} ${p(cx+52)},${p(cy+32)}" fill="#7A7E83"/>
    <polygon points="${p(cx+18)},${p(cy-54)} ${p(cx-58)},${p(cy+32)} ${p(cx+62)},${p(cy+32)}" fill="#5E6166"/>
    <polygon points="${p(cx-8)},${p(cy-62)} ${p(cx-20)},${p(cy-36)} ${p(cx+6)},${p(cy-36)}" fill="#E8EAEA" opacity="0.92"/>
    <polygon points="${p(cx+18)},${p(cy-54)} ${p(cx+6)},${p(cy-28)} ${p(cx+30)},${p(cy-28)}" fill="#E8EAEA" opacity="0.85"/>
    <ellipse cx="${p(cx+38)}" cy="${p(cy+22)}" rx="11" ry="7" fill="#48484C"/>
    <ellipse cx="${p(cx-44)}" cy="${p(cy+20)}" rx="9" ry="6" fill="#48484C"/>
    <ellipse cx="${p(cx+10)}" cy="${p(cy+28)}" rx="7" ry="4" fill="#48484C"/>`;
}

function drawBrick(cx, cy) {
  return `
    <rect x="${p(cx-78)}" y="${p(cy-78)}" width="156" height="156" fill="#D06040"/>
    <rect x="${p(cx-78)}" y="${p(cy-78)}" width="156" height="88" fill="#E07850"/>
    <rect x="${p(cx-78)}" y="${p(cy+10)}" width="156" height="68" fill="#8B2E12"/>
    <ellipse cx="${p(cx)}" cy="${p(cy+38)}" rx="82" ry="42" fill="#A83820"/>
    <ellipse cx="${p(cx-12)}" cy="${p(cy+12)}" rx="38" ry="20" fill="#C04828" opacity="0.65"/>
    <line x1="${p(cx-32)}" y1="${p(cy-8)}" x2="${p(cx-10)}" y2="${p(cy+14)}" stroke="#7A2010" stroke-width="2.5" opacity="0.7"/>
    <line x1="${p(cx+18)}" y1="${p(cy-14)}" x2="${p(cx+44)}" y2="${p(cy+8)}" stroke="#7A2010" stroke-width="2.5" opacity="0.7"/>
    <line x1="${p(cx-62)}" y1="${p(cy+8)}" x2="${p(cx-38)}" y2="${p(cy+18)}" stroke="#7A2010" stroke-width="2" opacity="0.6"/>
    <line x1="${p(cx-5)}" y1="${p(cy+18)}" x2="${p(cx+24)}" y2="${p(cy+28)}" stroke="#7A2010" stroke-width="2" opacity="0.6"/>
    <line x1="${p(cx-55)}" y1="${p(cy-5)}" x2="${p(cx-35)}" y2="${p(cy+8)}" stroke="#7A2010" stroke-width="2" opacity="0.6"/>`;
}

function drawWood(cx, cy) {
  return `
    <rect x="${p(cx-78)}" y="${p(cy-78)}" width="156" height="156" fill="#2A5020"/>
    <rect x="${p(cx-78)}" y="${p(cy-78)}" width="156" height="65" fill="#1E3C18"/>
    <rect x="${p(cx-78)}" y="${p(cy+22)}" width="156" height="56" fill="#163010"/>
    <polygon points="${p(cx-48)},${p(cy-58)} ${p(cx-66)},${p(cy-12)} ${p(cx-30)},${p(cy-12)}" fill="#1A3E16"/>
    <polygon points="${p(cx+48)},${p(cy-55)} ${p(cx+30)},${p(cy-10)} ${p(cx+66)},${p(cy-10)}" fill="#1A3E16"/>
    <polygon points="${p(cx)},${p(cy-72)} ${p(cx-24)},${p(cy-18)} ${p(cx+24)},${p(cy-18)}" fill="#2A5420"/>
    <polygon points="${p(cx)},${p(cy-55)} ${p(cx-22)},${p(cy+2)} ${p(cx+22)},${p(cy+2)}" fill="#346828"/>
    <polygon points="${p(cx)},${p(cy-36)} ${p(cx-20)},${p(cy+22)} ${p(cx+20)},${p(cy+22)}" fill="#448038"/>
    <rect x="${p(cx-5)}" y="${p(cy+22)}" width="10" height="24" fill="#5D3A1A"/>
    <polygon points="${p(cx-34)},${p(cy-48)} ${p(cx-52)},${p(cy-5)} ${p(cx-16)},${p(cy-5)}" fill="#244C1C"/>
    <polygon points="${p(cx-34)},${p(cy-32)} ${p(cx-50)},${p(cy+12)} ${p(cx-18)},${p(cy+12)}" fill="#306024"/>
    <rect x="${p(cx-37)}" y="${p(cy+12)}" width="7" height="17" fill="#4A2E14"/>
    <polygon points="${p(cx+34)},${p(cy-45)} ${p(cx+16)},${p(cy-4)} ${p(cx+52)},${p(cy-4)}" fill="#244C1C"/>
    <polygon points="${p(cx+34)},${p(cy-30)} ${p(cx+18)},${p(cy+12)} ${p(cx+50)},${p(cy+12)}" fill="#306024"/>
    <rect x="${p(cx+30)}" y="${p(cy+12)}" width="7" height="15" fill="#4A2E14"/>`;
}

function drawWheat(cx, cy) {
  const stalks = [];
  for (let i = -3; i <= 3; i++) {
    const sx = cx + i * 19 + (i % 2 === 0 ? 0 : 5);
    const baseY = cy + 32;
    const topY  = cy - 18 + Math.abs(i) * 4;
    stalks.push(`<line x1="${p(sx)}" y1="${p(baseY)}" x2="${p(sx)}" y2="${p(topY)}" stroke="#B88808" stroke-width="2.5"/>`);
    stalks.push(`<ellipse cx="${p(sx)}" cy="${p(topY-12)}" rx="5" ry="12" fill="#D4A820"/>`);
    stalks.push(`<ellipse cx="${p(sx-6)}" cy="${p(topY-6)}" rx="4" ry="9" fill="#C09018" transform="rotate(-22 ${p(sx-6)} ${p(topY-6)})"/>`);
    stalks.push(`<ellipse cx="${p(sx+6)}" cy="${p(topY-6)}" rx="4" ry="9" fill="#C09018" transform="rotate(22 ${p(sx+6)} ${p(topY-6)})"/>`);
  }
  return `
    <rect x="${p(cx-78)}" y="${p(cy-78)}" width="156" height="156" fill="#C89810"/>
    <rect x="${p(cx-78)}" y="${p(cy-78)}" width="156" height="82" fill="#90C8E8"/>
    <rect x="${p(cx-78)}" y="${p(cy+4)}" width="156" height="74" fill="#B07808"/>
    <rect x="${p(cx-78)}" y="${p(cy-18)}" width="156" height="22" fill="#C89010"/>
    ${stalks.join('')}
    <line x1="${p(cx-78)}" y1="${p(cy+22)}" x2="${p(cx+78)}" y2="${p(cy+22)}" stroke="#907008" stroke-width="1.5" opacity="0.5"/>
    <line x1="${p(cx-78)}" y1="${p(cy+34)}" x2="${p(cx+78)}" y2="${p(cy+34)}" stroke="#907008" stroke-width="1.5" opacity="0.5"/>`;
}

function drawSheep(cx, cy) {
  return `
    <rect x="${p(cx-78)}" y="${p(cy-78)}" width="156" height="156" fill="#68B430"/>
    <rect x="${p(cx-78)}" y="${p(cy-78)}" width="156" height="82" fill="#A8D8F0"/>
    <rect x="${p(cx-78)}" y="${p(cy+4)}" width="156" height="74" fill="#58A828"/>
    <rect x="${p(cx-78)}" y="${p(cy-18)}" width="156" height="22" fill="#78C438"/>
    <ellipse cx="${p(cx-52)}" cy="${p(cy+6)}" rx="22" ry="11" fill="#68B830"/>
    <ellipse cx="${p(cx+42)}" cy="${p(cy+4)}" rx="20" ry="10" fill="#68B830"/>
    <ellipse cx="${p(cx-15)}" cy="${p(cy+22)}" rx="22" ry="14" fill="#F5F5F0"/>
    <circle cx="${p(cx-30)}" cy="${p(cy+13)}" r="10" fill="#F0F0EB"/>
    <circle cx="${p(cx-33)}" cy="${p(cy+10)}" r="6" fill="#E5E5E0"/>
    <ellipse cx="${p(cx-14)}" cy="${p(cy+18)}" rx="6" ry="4" fill="#E0E0DB" opacity="0.6"/>
    <line x1="${p(cx-22)}" y1="${p(cy+36)}" x2="${p(cx-22)}" y2="${p(cy+46)}" stroke="#C8C8C0" stroke-width="2.5"/>
    <line x1="${p(cx-10)}" y1="${p(cy+36)}" x2="${p(cx-10)}" y2="${p(cy+46)}" stroke="#C8C8C0" stroke-width="2.5"/>
    <ellipse cx="${p(cx+28)}" cy="${p(cy+14)}" rx="17" ry="11" fill="#F5F5F0"/>
    <circle cx="${p(cx+41)}" cy="${p(cy+7)}" r="8" fill="#F0F0EB"/>
    <circle cx="${p(cx+43)}" cy="${p(cy+5)}" r="5" fill="#E5E5E0"/>
    <line x1="${p(cx+22)}" y1="${p(cy+25)}" x2="${p(cx+22)}" y2="${p(cy+34)}" stroke="#C8C8C0" stroke-width="2"/>
    <line x1="${p(cx+34)}" y1="${p(cy+25)}" x2="${p(cx+34)}" y2="${p(cy+34)}" stroke="#C8C8C0" stroke-width="2"/>
    <ellipse cx="${p(cx+8)}" cy="${p(cy-2)}" rx="12" ry="8" fill="#F0F0EB" opacity="0.88"/>
    <circle cx="${p(cx+18)}" cy="${p(cy-8)}" r="6" fill="#EEE" opacity="0.88"/>`;
}

function drawDesert(cx, cy) {
  return `
    <rect x="${p(cx-78)}" y="${p(cy-78)}" width="156" height="156" fill="#C8A038"/>
    <rect x="${p(cx-78)}" y="${p(cy-78)}" width="156" height="80" fill="#F0CC50"/>
    <ellipse cx="${p(cx-10)}" cy="${p(cy+38)}" rx="82" ry="30" fill="#D4AC48"/>
    <ellipse cx="${p(cx+22)}" cy="${p(cy+50)}" rx="65" ry="24" fill="#C09830"/>
    <rect x="${p(cx-5)}" y="${p(cy-30)}" width="10" height="46" fill="#5A8030" rx="4"/>
    <rect x="${p(cx-24)}" y="${p(cy-14)}" width="22" height="8" fill="#5A8030" rx="3"/>
    <rect x="${p(cx-24)}" y="${p(cy-26)}" width="8" height="14" fill="#5A8030" rx="3"/>
    <rect x="${p(cx+3)}" y="${p(cy-12)}" width="22" height="8" fill="#5A8030" rx="3"/>
    <rect x="${p(cx+17)}" y="${p(cy-22)}" width="8" height="12" fill="#5A8030" rx="3"/>
    <circle cx="${p(cx+48)}" cy="${p(cy-52)}" r="16" fill="#F0C020" opacity="0.75"/>
    <line x1="${p(cx-60)}" y1="${p(cy+15)}" x2="${p(cx-30)}" y2="${p(cy+18)}" stroke="#A07828" stroke-width="1.5" opacity="0.5"/>
    <line x1="${p(cx+20)}" y1="${p(cy+8)}" x2="${p(cx+62)}" y2="${p(cy+12)}" stroke="#A07828" stroke-width="1.5" opacity="0.5"/>`;
}

const _imgCache = {};

const RES_BG_FILL = {
  ore: '#9EA3A8', brick: '#D06040', sheep: '#68B430',
  wood: '#2A5020', wheat: '#C89810', desert: '#C8A038',
};

function drawResourceTile(resource, cx, cy) {
  const src = RES_IMG[resource];
  const s = HEX_SIZE + 10;
  const hs = HEX_SIZE + 2;
  const bg = RES_BG_FILL[resource] || '#888';
  // Solid background rect first (covers full hex area), then SVG illustration, then image overlay
  return `
    <rect x="${p(cx-hs)}" y="${p(cy-hs)}" width="${p(hs*2)}" height="${p(hs*2)}" fill="${bg}"/>
    ${drawSVGFallback(resource, cx, cy)}
    <image href="${src}" x="${p(cx-s)}" y="${p(cy-s)}" width="${p(s*2)}" height="${p(s*2)}"
      preserveAspectRatio="xMidYMid slice"/>`;
}

function drawSVGFallback(resource, cx, cy) {
  switch (resource) {
    case 'ore':    return drawOre(cx, cy);
    case 'brick':  return drawBrick(cx, cy);
    case 'wood':   return drawWood(cx, cy);
    case 'wheat':  return drawWheat(cx, cy);
    case 'sheep':  return drawSheep(cx, cy);
    case 'desert': return drawDesert(cx, cy);
    default: return `<rect x="${p(cx-78)}" y="${p(cy-78)}" width="156" height="156" fill="#888"/>`;
  }
}

function areAdjacent(a, b) {
  const dq = b.q - a.q, dr = b.r - a.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) === 2;
}

function isValidMap(tiles, opts) {
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      if (!areAdjacent(tiles[i], tiles[j])) continue;
      const n1 = tiles[i].number, n2 = tiles[j].number;
      const r1 = tiles[i].resource, r2 = tiles[j].resource;
      if (opts.no68 && [6,8].includes(n1) && [6,8].includes(n2)) return false;
      if (opts.noSameNum && n1 !== null && n1 === n2) return false;
      if (opts.noSameRes && r1 !== 'desert' && r1 === r2) return false;
    }
  }
  return true;
}

function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Precalcula lista de adyacencias por índice
const ADJ = BOARD_COORDS.map((coord, i) =>
  BOARD_COORDS.reduce((acc, other, j) => {
    if (i !== j && areAdjacent(coord, other)) acc.push(j);
    return acc;
  }, [])
);

// Backtracking para asignar recursos respetando noSameRes
function asignarRecursosBacktrack(noSameRes) {
  const pool = shuffleArr([...MAP_RESOURCES]);
  const asign = new Array(19).fill(null);

  function bt(idx, restantes) {
    if (idx === 19) return true;
    const opciones = shuffleArr([...new Set(restantes)]);
    for (const res of opciones) {
      if (noSameRes && res !== 'desert') {
        const conflicto = ADJ[idx].some(j => j < idx && asign[j] === res);
        if (conflicto) continue;
      }
      asign[idx] = res;
      const resto = [...restantes];
      resto.splice(resto.indexOf(res), 1);
      if (bt(idx + 1, resto)) return true;
      asign[idx] = null;
    }
    return false;
  }

  bt(0, [...MAP_RESOURCES]);
  return asign;
}

// Backtracking para asignar números respetando no68 y noSameNum
function asignarNumerosBacktrack(recursos, opts) {
  const desertIdx = recursos.indexOf('desert');
  const nonDesert = recursos.map((_, i) => i).filter(i => i !== desertIdx);
  const numAsign = new Array(19).fill(null);

  function bt(pos, restantes) {
    if (pos === nonDesert.length) return true;
    const idx = nonDesert[pos];
    const opciones = shuffleArr([...new Set(restantes)]);
    for (const num of opciones) {
      const vecinosNum = ADJ[idx].filter(j => numAsign[j] !== null).map(j => numAsign[j]);
      if (opts.no68 && [6, 8].includes(num) && vecinosNum.some(n => [6, 8].includes(n))) continue;
      if (opts.noSameNum && vecinosNum.includes(num)) continue;
      numAsign[idx] = num;
      const resto = [...restantes];
      resto.splice(resto.indexOf(num), 1);
      if (bt(pos + 1, resto)) return true;
      numAsign[idx] = null;
    }
    return false;
  }

  const exito = bt(0, [...MAP_NUMBERS]);
  return { numAsign, exito };
}

function generarMapa() {
  const opts = {
    no68:      document.getElementById('opt68').checked,
    noSameNum: document.getElementById('optSameNum').checked,
    noSameRes: document.getElementById('optSameRes').checked,
  };

  // 1. Asignar recursos con backtracking si hace falta
  const recursos = asignarRecursosBacktrack(opts.noSameRes);

  // 2. Asignar números con backtracking si hace falta
  let numAsign, exito, intentos = 0;
  do {
    ({ numAsign, exito } = asignarNumerosBacktrack(recursos, opts));
    intentos++;
  } while (!exito && intentos < 100);

  // 3. Construir tiles
  let ni = 0;
  const tiles = BOARD_COORDS.map((coord, i) => ({
    ...coord,
    resource: recursos[i],
    number: recursos[i] === 'desert' ? null : numAsign[i],
  }));

  renderHexBoard(tiles, intentos);
}

function renderHexBoardEn(boardId, infoId, tiles, attempts, prefix) {
  const defs = tiles.map((tile, i) => {
    const {x, y} = axialToPixel(tile.q, tile.r);
    return `<clipPath id="${prefix}${i}"><polygon points="${hexPoints(x, y)}"/></clipPath>`;
  }).join('');

  const svgTiles = tiles.map((tile, i) => {
    const {x, y} = axialToPixel(tile.q, tile.r);
    const pts  = hexPoints(x, y);

    let token = '';
    if (tile.number !== null) {
      const hot = [6, 8].includes(tile.number);
      const numColor = hot ? '#C62828' : '#1a0f0a';
      const dots = '•'.repeat(PIPS[tile.number] || 0);
      token = `
        <circle cx="${p(x)}" cy="${p(y-2)}" r="30" fill="#ECD89C" stroke="${hot ? '#C62828' : '#8B6914'}" stroke-width="${hot ? 3 : 2}"/>
        <text x="${p(x)}" y="${p(y+12)}" text-anchor="middle" font-size="32" font-weight="900" fill="${numColor}" font-family="Teko,sans-serif">${tile.number}</text>
        <text x="${p(x)}" y="${p(y+24)}" text-anchor="middle" font-size="11" fill="${numColor}" letter-spacing="2">${dots}</text>`;
    }

    const ptsInner = hexPointsSize(x, y, HEX_SIZE - 4);
    return `
      <g clip-path="url(#${prefix}${i})">${drawResourceTile(tile.resource, x, y)}</g>
      <polygon points="${pts}" fill="none" stroke="#2c1a08" stroke-width="4"/>
      <polygon points="${ptsInner}" fill="none" stroke="#E8C86A" stroke-width="2.5"/>
      ${token}`;
  }).join('');

  document.getElementById(boardId).innerHTML =
    `<svg viewBox="0 0 790 730" style="width:100%;display:block">
      <defs>${defs}</defs>${svgTiles}
    </svg>`;
  if (infoId) document.getElementById(infoId).textContent =
    `Mapa generado en ${attempts} intento${attempts !== 1 ? 's' : ''}.`;
}

function renderHexBoard(tiles, attempts) {
  renderHexBoardEn('hexBoard', 'mapaInfo', tiles, attempts, 'hclip_main_');
}

function generarMapaDetalle() {
  const opts = {
    no68:      document.getElementById('tOpt68').checked,
    noSameNum: document.getElementById('tOptSameNum').checked,
    noSameRes: document.getElementById('tOptSameRes').checked,
  };
  const recursos = asignarRecursosBacktrack(opts.noSameRes);
  let numAsign, exito, intentos = 0;
  do {
    ({ numAsign, exito } = asignarNumerosBacktrack(recursos, opts));
    intentos++;
  } while (!exito && intentos < 100);

  let ni = 0;
  const tiles = BOARD_COORDS.map((coord, i) => ({
    ...coord,
    resource: recursos[i],
    number: recursos[i] === 'desert' ? null : numAsign[i],
  }));

  if (state.torneoActivo) {
    state.torneoActivo.mapa = tiles;
    guardarEstado();
  }
  renderHexBoardEn('hexBoardDetalle', 'mapaInfoDetalle', tiles, intentos, 'hclip_det_');
}

document.getElementById('btnGenerarMapa').addEventListener('click', generarMapa);
document.getElementById('btnGenerarMapaTorneo').addEventListener('click', generarMapaDetalle);


// --- Modal ---
const overlay = document.getElementById('modalOverlay');
document.getElementById('btnCrearTorneo').addEventListener('click', () => overlay.classList.remove('hidden'));
document.getElementById('btnCerrarModal').addEventListener('click', cerrarModal);
document.getElementById('btnCancelar').addEventListener('click', cerrarModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrarModal(); });

function cerrarModal() {
  overlay.classList.add('hidden');
  document.getElementById('formTorneo').reset();
}

// --- Drag & Drop desempate ---
const desempateList = document.getElementById('desempateList');
let dragSrc = null;

desempateList.addEventListener('dragstart', (e) => {
  dragSrc = e.target.closest('.desempate-item');
  e.dataTransfer.effectAllowed = 'move';
});

desempateList.addEventListener('dragover', (e) => {
  e.preventDefault();
  const target = e.target.closest('.desempate-item');
  if (target && target !== dragSrc) target.classList.add('drag-over');
});

desempateList.addEventListener('dragleave', (e) => {
  const target = e.target.closest('.desempate-item');
  if (target) target.classList.remove('drag-over');
});

desempateList.addEventListener('drop', (e) => {
  e.preventDefault();
  const target = e.target.closest('.desempate-item');
  if (target && target !== dragSrc) {
    target.classList.remove('drag-over');
    const items = [...desempateList.querySelectorAll('.desempate-item')];
    const srcIdx = items.indexOf(dragSrc);
    const tgtIdx = items.indexOf(target);
    if (srcIdx < tgtIdx) target.after(dragSrc);
    else target.before(dragSrc);
    actualizarNumerosDesempate();
  }
});

function actualizarNumerosDesempate() {
  desempateList.querySelectorAll('.desempate-item').forEach((item, i) => {
    item.querySelector('.desempate-num').textContent = i + 1;
  });
}

// --- Crear torneo ---
document.getElementById('formTorneo').addEventListener('submit', (e) => {
  e.preventDefault();
  const nombre = document.getElementById('nombreTorneo').value.trim();
  const numJugadores = parseInt(document.getElementById('numJugadores').value);
  const jugadoresPorPartida = parseInt(document.getElementById('jugadoresPorPartida').value);
  const numRondas = parseInt(document.getElementById('numRondas').value);
  const formato = document.getElementById('formatoTorneo').value;
  const tipo = document.getElementById('tipoTorneo').value;

  if (!nombre) return resaltarError('nombreTorneo');
  if (!numJugadores || numJugadores < 4) return resaltarError('numJugadores');
  if (!numRondas || numRondas < 1) return resaltarError('numRondas');

  const metosDesempate = [...desempateList.querySelectorAll('.desempate-item')].map(i => i.dataset.value);

  const torneo = {
    id: Date.now(),
    nombre,
    numJugadores,
    jugadoresPorPartida,
    numRondas,
    formato,
    tipo,
    metosDesempate,
    fechaCreacion: new Date().toLocaleDateString('es-ES'),
    estado: 'activo',
    jugadores: [],
    rondas: [],
  };

  state.torneos.push(torneo);
  guardarEstado();
  renderTorneos();
  cerrarModal();
  abrirDetalle(torneo.id);
});

function resaltarError(id) {
  const el = document.getElementById(id);
  el.style.borderColor = '#c0392b';
  el.focus();
  setTimeout(() => el.style.borderColor = '', 1500);
}

// --- Render torneos (inicio) ---
function renderTorneos() {
  const lista = document.getElementById('listaTorneos');
  if (state.torneos.length === 0) {
    lista.innerHTML = '<p class="empty-state">No hay torneos creados aún.</p>';
    return;
  }
  lista.innerHTML = state.torneos.map(t => `
    <div class="torneo-card" data-id="${t.id}">
      <button class="btn-delete-torneo" data-id="${t.id}" title="Eliminar torneo">🗑</button>
      <h4>${escapeHtml(t.nombre)}</h4>
      <p class="meta">👥 ${t.numJugadores} jugadores · ${t.jugadoresPorPartida} por partida</p>
      <p class="meta">🎲 ${formatFormato(t.formato)} · ${t.tipo === 'amistoso' ? '🤝 Amistoso' : '🏅 Oficial'}</p>
      <p class="meta">📅 ${t.fechaCreacion}</p>
      <p class="meta">🏆 Desempate: ${t.metosDesempate.map(formatDesempate).join(' › ')}</p>
      <div class="card-footer">
        <span class="badge">${t.estado}</span>
        <button class="btn-sm btn-outline btn-gestionar" data-id="${t.id}">Gestionar →</button>
      </div>
    </div>
  `).join('');

  lista.querySelectorAll('.btn-gestionar').forEach(btn => {
    btn.addEventListener('click', () => abrirDetalle(parseInt(btn.dataset.id)));
  });
  lista.querySelectorAll('.btn-delete-torneo').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      eliminarTorneo(parseInt(btn.dataset.id));
    });
  });
}

let _confirmCallback = null;

function mostrarConfirm(titulo, msg, onOk) {
  document.getElementById('modalConfirmTitle').textContent = titulo;
  document.getElementById('modalConfirmMsg').textContent = msg;
  _confirmCallback = onOk;
  document.getElementById('modalConfirm').classList.remove('hidden');
}

function cerrarConfirm() {
  document.getElementById('modalConfirm').classList.add('hidden');
  _confirmCallback = null;
}

document.getElementById('btnConfirmCancel').addEventListener('click', cerrarConfirm);
document.getElementById('btnConfirmOk').addEventListener('click', () => {
  const cb = _confirmCallback;
  cerrarConfirm();
  if (cb) cb();
});
document.getElementById('modalConfirm').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalConfirm')) cerrarConfirm();
});

function eliminarTorneo(id) {
  const torneo = state.torneos.find(t => t.id === id);
  if (!torneo) return;
  mostrarConfirm(
    `¿Eliminar "${torneo.nombre}"?`,
    'Esta acción no se puede deshacer.',
    () => {
      state.torneos = state.torneos.filter(t => t.id !== id);
      if (state.torneoActivo && state.torneoActivo.id === id) {
        state.torneoActivo = null;
      }
      guardarEstado();
      renderTorneos();
    }
  );
}

// --- Tabs del detalle ---
let detalleTabActiva = 'jugadores';

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => cambiarTab(btn.dataset.tab));
});

function cambiarTab(tab) {
  detalleTabActiva = tab;
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.tab-content').forEach(c =>
    c.classList.toggle('hidden', c.id !== `tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)
  );
  if (tab === 'clasificacion') renderClasificacion();
  if (tab === 'historial') renderHistorial();
}

function calcularStats(t, rondas) {
  rondas = rondas || t.rondas;
  const esAmistoso = t.tipo === 'amistoso';
  const stats = {};
  t.jugadores.forEach(j => {
    stats[j.id] = { nombre: j.nombre, pv: 0, primerPuesto: 0, torneoPoints: 0, desempateVictorias: 0 };
  });
  rondas.forEach(ronda => {
    (ronda.resultadosMesas || []).forEach(resultados => {
      if (!resultados) return;
      resultados.forEach(r => {
        if (!stats[r.id]) return;
        stats[r.id].pv += r.pv || 0;
        if (r.posicion === 1) stats[r.id].primerPuesto++;
        if (!esAmistoso) stats[r.id].torneoPoints += TORNEO_PUNTOS[r.posicion - 1] || 0;
        if (r.desempateGanado) stats[r.id].desempateVictorias++;
      });
    });
  });
  return stats;
}

let _clasificPagina = 0;
let _clasificUltimoIdx = undefined;

function renderClasificacion(hastaRondaIdx, pagina) {
  const t = state.torneoActivo;
  const contenedor = document.getElementById('tablaClasificacion');
  const selectorWrap = document.getElementById('clasificacionSelectorWrap');
  if (!t || t.jugadores.length === 0) {
    contenedor.innerHTML = '<p class="empty-state-tab">No hay jugadores registrados aún.</p>';
    if (selectorWrap) selectorWrap.innerHTML = '';
    return;
  }

  // Calcular la página a mostrar
  const rondasConRes = t.rondas.filter(r => r.resultadosMesas && r.resultadosMesas.length > 0);
  const idxFin = hastaRondaIdx !== undefined ? hastaRondaIdx : rondasConRes.length - 1;

  // Reset page when hastaRondaIdx changes and pagina is not explicitly provided
  if (pagina === undefined && idxFin !== _clasificUltimoIdx) {
    _clasificPagina = 0;
  }
  _clasificUltimoIdx = idxFin;

  const pag = pagina !== undefined ? pagina : _clasificPagina;
  _clasificPagina = pag;

  // Selector de ronda
  if (selectorWrap) {
    if (rondasConRes.length > 1) {
      const idx = hastaRondaIdx !== undefined ? hastaRondaIdx : rondasConRes.length - 1;
      selectorWrap.innerHTML = `
        <select id="selectorRonda" class="select-ronda">
          ${rondasConRes.map((r, i) => `
            <option value="${i}" ${i === idx ? 'selected' : ''}>
              Tras Ronda ${r.numero}${i === rondasConRes.length - 1 ? ' (actual)' : ''}
            </option>`).join('')}
        </select>`;
      document.getElementById('selectorRonda').addEventListener('change', e => {
        renderClasificacion(parseInt(e.target.value), 0);
      });
    } else {
      selectorWrap.innerHTML = '';
    }
  }

  // Calcular stats hasta la ronda seleccionada
  const rondasFiltradas = rondasConRes.slice(0, idxFin + 1);
  const stats = calcularStats(t, rondasFiltradas);

  const esAmistoso = t.tipo === 'amistoso';

  const ordenados = Object.values(stats).sort((a, b) =>
    esAmistoso
      ? (b.pv - a.pv || b.primerPuesto - a.primerPuesto || b.desempateVictorias - a.desempateVictorias)
      : (b.torneoPoints - a.torneoPoints || b.pv - a.pv || b.primerPuesto - a.primerPuesto || b.desempateVictorias - a.desempateVictorias)
  );

  const totalPags = Math.ceil(ordenados.length / 10);
  const slice = ordenados.slice(pag * 10, pag * 10 + 10);
  const offsetIdx = pag * 10;

  contenedor.innerHTML = `
    <table class="clasificacion-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Jugador</th>
          <th title="Suma de puntos de victoria de todas las partidas">Puntos Victoria</th>
          <th title="Veces que ha quedado 1º en una partida">1er Puesto</th>
          <th title="Veces que ha ganado una posición por desempate (criterio secundario de clasificación)">Desempates ⚖️</th>
          ${!esAmistoso ? `<th title="1º→6pts · 2º→4pts · 3º→2pts · 4º→1pt">Puntos Torneo</th>` : ''}
        </tr>
      </thead>
      <tbody>
        ${slice.map((j, i) => {
          const pos = offsetIdx + i;
          return `
          <tr>
            <td class="pos-num ${pos === 0 ? 'top1' : pos === 1 ? 'top2' : pos === 2 ? 'top3' : ''}">${pos + 1}</td>
            <td>${escapeHtml(j.nombre)}</td>
            <td>${j.pv}</td>
            <td>${j.primerPuesto > 0 ? `<span class="primer-puesto-badge">${j.primerPuesto}</span>` : '—'}</td>
            <td>${j.desempateVictorias > 0 ? `<span class="desempate-victoria-badge">${j.desempateVictorias}</span>` : '—'}</td>
            ${!esAmistoso ? `<td class="torneo-pts-cell"><strong>${j.torneoPoints}</strong></td>` : ''}
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="clasif-pagination">
      <button class="btn-pag-prev btn-sm btn-outline" ${pag === 0 ? 'disabled' : ''}>‹ Anterior</button>
      <span class="pag-info">${pag + 1} / ${totalPags || 1}</span>
      <button class="btn-pag-next btn-sm btn-outline" ${pag >= totalPags - 1 ? 'disabled' : ''}>Siguiente ›</button>
    </div>
  `;

  contenedor.querySelector('.btn-pag-prev')?.addEventListener('click', () =>
    renderClasificacion(hastaRondaIdx !== undefined ? hastaRondaIdx : idxFin, pag - 1)
  );
  contenedor.querySelector('.btn-pag-next')?.addEventListener('click', () =>
    renderClasificacion(hastaRondaIdx !== undefined ? hastaRondaIdx : idxFin, pag + 1)
  );
}

function renderHistorial() {
  const t = state.torneoActivo;
  const contenedor = document.getElementById('contenidoHistorial');
  if (!t || t.rondas.length === 0) {
    contenedor.innerHTML = '<div class="panel"><p class="empty-state-tab">No hay rondas disputadas aún.</p></div>';
    return;
  }

  // Initialize accordion state if not present; open last round by default
  if (!state._histAbiertas) {
    state._histAbiertas = new Set([t.rondas.length - 1]);
  }
  const esAmistoso = t.tipo === 'amistoso';

  contenedor.innerHTML = `<div class="hist-acordeon">${t.rondas.map((ronda, rondaIdx) => {
    const isOpen = state._histAbiertas.has(rondaIdx);
    const sistemaLabel = ronda.sistema === 'suizo'
      ? '<span class="hist-badge suizo">🏅 Sistema suizo</span>'
      : '<span class="hist-badge aleatorio">🎲 Aleatorio</span>';

    const total = ronda.mesas.length;
    const completadas = (ronda.resultadosMesas || []).filter(r => r && r.length > 0).length;

    const mesasHtml = ronda.mesas.map((mesa, mesaIdx) => {
      const res = (ronda.resultadosMesas || [])[mesaIdx];
      const filas = res
        ? res.map(r => `
            <div class="hist-fila pos${r.posicion}">
              <span class="hist-pos">${r.posicion}º</span>
              <span class="hist-nombre">${escapeHtml(r.nombre)}</span>
              <span class="hist-pv">${r.pv} PV</span>
              ${!esAmistoso ? `<span class="hist-pts">+${TORNEO_PUNTOS[r.posicion - 1] || 0}pts</span>` : ''}
              ${r.desempateGanado ? '<span class="hist-desempate" title="Ganó por desempate">⚖️</span>' : ''}
            </div>`).join('')
        : '<p class="hist-sin-res">Sin resultado registrado</p>';

      return `
        <div class="hist-mesa">
          <div class="hist-mesa-header">Mesa ${mesaIdx + 1}</div>
          ${filas}
        </div>`;
    }).join('');

    return `
      <div class="hist-card" data-ronda-idx="${rondaIdx}">
        <div class="hist-card-header" data-toggle="${rondaIdx}">
          <div class="hist-card-info">
            <span class="hist-ronda-num">Ronda ${ronda.numero}</span>
            ${sistemaLabel}
            <span class="hist-progress-chip">${completadas}/${total} completadas</span>
          </div>
          <span class="hist-chevron">${isOpen ? '▲' : '▼'}</span>
        </div>
        <div class="hist-card-body ${isOpen ? '' : 'hidden'}">
          <div class="hist-mesas">${mesasHtml}</div>
        </div>
      </div>`;
  }).join('')}</div>`;

  contenedor.querySelectorAll('.hist-card-header').forEach(header => {
    header.addEventListener('click', () => {
      const idx = parseInt(header.dataset.toggle);
      if (state._histAbiertas.has(idx)) {
        state._histAbiertas.delete(idx);
      } else {
        state._histAbiertas.add(idx);
      }
      renderHistorial();
    });
  });
}

// --- Vista detalle ---
function abrirDetalle(id) {
  state.torneoActivo = state.torneos.find(t => t.id === id);
  if (!state.torneoActivo) return;
  cambiarTab('jugadores'); // siempre empieza en la primera tab
  renderDetalle();
  mostrarVista('detalle');
  fbIniciarListener(id); // escuchar resultados en tiempo real
}

document.getElementById('btnVolver').addEventListener('click', () => {
  fbDetenerListener();
  state.torneoActivo = null;
  mostrarVista('inicio');
});

function renderDetalle() {
  const t = state.torneoActivo;
  document.getElementById('detalleName').textContent = t.nombre;
  document.getElementById('detalleMeta').textContent =
    `${t.numJugadores} jugadores · ${t.jugadoresPorPartida} por partida · ${t.numRondas || '?'} rondas · ${formatFormato(t.formato)} · ${t.fechaCreacion}`;
  document.getElementById('detalleBadge').textContent = t.estado;
  actualizarBtnRonda();
  renderJugadores();
  renderRondas();
  // Restaurar mapa guardado si existe
  if (t.mapa && t.mapa.length) {
    renderHexBoardEn('hexBoardDetalle', 'mapaInfoDetalle', t.mapa, '–', 'hclip_det_');
  } else {
    document.getElementById('hexBoardDetalle').innerHTML =
      '<p class="mapa-placeholder">Pulsa <strong>↺ Generar</strong> para crear el mapa.</p>';
    document.getElementById('mapaInfoDetalle').textContent = '';
  }
}

// --- Jugadores ---
document.getElementById('btnToggleJugadores').addEventListener('click', () => {
  const lista = document.getElementById('listaJugadores');
  const form = document.getElementById('addJugadorForm');
  const btn = document.getElementById('btnToggleJugadores');
  const collapsed = lista.classList.toggle('jugadores-collapsed');
  btn.textContent = collapsed ? '▲' : '▼';
  if (collapsed) {
    form.classList.add('hidden');
  }
});

document.getElementById('btnAgregarJugador').addEventListener('click', () => {
  const form = document.getElementById('addJugadorForm');
  form.classList.toggle('hidden');
  if (!form.classList.contains('hidden')) document.getElementById('inputNombreJugador').focus();
});

document.getElementById('btnConfirmarJugador').addEventListener('click', agregarJugador);
document.getElementById('inputNombreJugador').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') agregarJugador();
});

function agregarJugador() {
  const input = document.getElementById('inputNombreJugador');
  const nombre = input.value.trim();
  if (!nombre) return;
  const t = state.torneoActivo;
  t.jugadores.push({ id: Date.now(), nombre });
  guardarEstado();
  input.value = '';
  renderJugadores();
}

const NOMBRES_PRUEBA = [
  'Alejandro García', 'Beatriz López', 'Carlos Martínez', 'Diana Sánchez',
  'Eduardo Pérez', 'Fátima González', 'Gabriel Rodríguez', 'Helena Fernández',
  'Ignacio Torres', 'Julia Ramírez', 'Kevin Morales', 'Laura Jiménez',
  'Marcos Ruiz', 'Natalia Díaz', 'Óscar Hernández', 'Patricia Moreno',
  'Quique Alonso', 'Rosa Navarro', 'Santiago Romero', 'Teresa Domínguez',
  'Ulises Vargas', 'Valentina Castro', 'Willy Suárez', 'Xenia Ortega',
  'Yaiza Ramos', 'Zacarías Reyes', 'Andrés Iglesias', 'Blanca Rubio',
  'Cristóbal Molina', 'Daniela Cruz', 'Emilio Guerrero', 'Francisca Muñoz',
];

document.getElementById('btnJugadoresPrueba').addEventListener('click', () => {
  const t = state.torneoActivo;
  const necesarios = t.numJugadores - t.jugadores.length;
  if (necesarios <= 0) return;
  const disponibles = NOMBRES_PRUEBA.filter(n => !t.jugadores.some(j => j.nombre === n));
  const aAñadir = disponibles.slice(0, necesarios);
  aAñadir.forEach(nombre => t.jugadores.push({ id: Date.now() + Math.random(), nombre }));
  guardarEstado();
  renderJugadores();
});

function renderJugadores() {
  const t = state.torneoActivo;
  document.getElementById('contadorJugadores').textContent = `${t.jugadores.length}/${t.numJugadores}`;
  const lista = document.getElementById('listaJugadores');
  if (t.jugadores.length === 0) {
    lista.innerHTML = '<p class="empty-state">Sin jugadores aún.</p>';
    return;
  }
  lista.innerHTML = t.jugadores.map((j, i) => `
    <div class="jugador-chip">
      <span class="jugador-num">${i + 1}</span>
      <span>${escapeHtml(j.nombre)}</span>
      <button class="jugador-remove" data-id="${j.id}" title="Eliminar">×</button>
    </div>
  `).join('');

  lista.querySelectorAll('.jugador-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state.torneoActivo.jugadores = state.torneoActivo.jugadores.filter(j => j.id !== parseFloat(btn.dataset.id));
      guardarEstado();
      renderJugadores();
    });
  });
}

// --- Emparejamiento ---
document.getElementById('btnGenerarRonda').addEventListener('click', () => {
  const t = state.torneoActivo;
  if (t.jugadores.length < t.jugadoresPorPartida) {
    alert(`Necesitas al menos ${t.jugadoresPorPartida} jugadores para generar una ronda.`);
    return;
  }
  if (t.numRondas && t.rondas.length >= t.numRondas) return;
  if (!rondaActualCompleta(t)) return;
  const ronda = generarRonda(t);
  t.rondas.push(ronda);
  guardarEstado();
  renderRondas();
  actualizarBtnRonda();
});

function rondaActualCompleta(t) {
  if (t.rondas.length === 0) return true;
  const ultima = t.rondas[t.rondas.length - 1];
  return ultima.mesas.every((_, mi) => {
    const res = (ultima.resultadosMesas || [])[mi];
    return res && res.length > 0;
  });
}

function actualizarBtnRonda() {
  const t = state.torneoActivo;
  if (!t) return;
  const btn = document.getElementById('btnGenerarRonda');
  const jugadas = t.rondas.length;
  const total = t.numRondas || null;
  const esSuizo = t.formato === 'suizo' && jugadas > 0;

  const setDisabled = (msg, titulo) => {
    btn.disabled = true;
    btn.style.opacity = '0.45';
    btn.style.cursor = 'not-allowed';
    btn.textContent = msg;
    btn.title = titulo || '';
  };
  const setEnabled = (msg) => {
    btn.disabled = false;
    btn.style.opacity = '';
    btn.style.cursor = '';
    btn.textContent = msg;
    btn.title = '';
  };

  if (total && jugadas >= total) {
    setDisabled(`✓ Torneo completado — ${total} rondas`);
    return;
  }

  const sufijo = esSuizo ? ' 🏅' : '';
  const label = total
    ? `Generar Ronda ${jugadas + 1}/${total}${sufijo}`
    : `Generar Ronda ${jugadas + 1}${sufijo}`;

  if (!rondaActualCompleta(t)) {
    const ultima = t.rondas[t.rondas.length - 1];
    const faltantes = ultima.mesas.filter((_, mi) => {
      const res = (ultima.resultadosMesas || [])[mi];
      return !res || res.length === 0;
    }).length;
    setDisabled(label, `Faltan resultados en ${faltantes} mesa${faltantes > 1 ? 's' : ''} de la Ronda ${ultima.numero}`);
  } else {
    setEnabled(label);
  }
}

function generarRonda(t) {
  const jpp = t.jugadoresPorPartida;
  let jugadores;

  const esSuizo = t.formato === 'suizo' && t.rondas.length > 0;

  if (esSuizo) {
    // Suizo: ordenar por clasificación actual (misma lógica que la tabla)
    const stats = calcularStats(t);
    jugadores = [...t.jugadores].sort((a, b) => {
      const sa = stats[a.id] || {};
      const sb = stats[b.id] || {};
      const byTP = t.tipo === 'amistoso' ? 0 : (sb.torneoPoints || 0) - (sa.torneoPoints || 0);
      return byTP
          || (sb.pv || 0)           - (sa.pv || 0)
          || (sb.primerPuesto || 0) - (sa.primerPuesto || 0)
          || (sb.desempateVictorias || 0) - (sa.desempateVictorias || 0);
    });
    // Pequeño shuffle dentro de cada grupo de puntuación igual para evitar siempre el mismo orden
    const grupos = [];
    let i = 0;
    while (i < jugadores.length) {
      let j = i + 1;
      const sa = stats[jugadores[i].id] || {};
      while (j < jugadores.length) {
        const sb = stats[jugadores[j].id] || {};
        const mismoPts = t.tipo === 'amistoso' ? true : sb.torneoPoints === sa.torneoPoints;
        if (!mismoPts || sb.pv !== sa.pv) break;
        j++;
      }
      grupos.push(shuffleArr(jugadores.slice(i, j)));
      i = j;
    }
    jugadores = grupos.flat();
  } else {
    // Todos contra todos: aleatorio
    jugadores = shuffleArr([...t.jugadores]);
  }

  const mesas = [];
  for (let i = 0; i < jugadores.length; i += jpp) {
    mesas.push(jugadores.slice(i, i + jpp));
  }
  return { numero: t.rondas.length + 1, mesas, sinAsignar: [], sistema: esSuizo ? 'suizo' : 'aleatorio' };
}

const TORNEO_PUNTOS = [6, 4, 2, 1]; // por posición (1º→6, 2º→4, 3º→2, 4º→1)

// --- Resultados de mesas ---
const resultState = { rondaIdx: null, mesaIdx: null };

function toggleResultadoMesa(rondaIdx, mesaIdx) {
  if (resultState.rondaIdx === rondaIdx && resultState.mesaIdx === mesaIdx) {
    resultState.rondaIdx = null; resultState.mesaIdx = null;
  } else {
    resultState.rondaIdx = rondaIdx; resultState.mesaIdx = mesaIdx;
  }
  renderRondas();
}

function guardarResultado(rondaIdx, mesaIdx) {
  const ronda = state.torneoActivo.rondas[rondaIdx];
  const mesa = ronda.mesas[mesaIdx];
  const datos = mesa.map((j, idx) => ({
    id: j.id, nombre: j.nombre,
    pv: parseInt(document.getElementById(`pv-${rondaIdx}-${mesaIdx}-${idx}`)?.value || '0') || 0,
  }));

  // Detectar empates
  const vpCount = {};
  datos.forEach(j => { vpCount[j.pv] = (vpCount[j.pv] || 0) + 1; });
  const hayEmpate = Object.values(vpCount).some(c => c > 1);

  if (hayEmpate) {
    mostrarModalEmpate(rondaIdx, mesaIdx, datos);
    return;
  }

  _finalizarGuardadoResultado(rondaIdx, mesaIdx, datos);
}

function _finalizarGuardadoResultado(rondaIdx, mesaIdx, datos) {
  datos.sort((a, b) => b.pv - a.pv);
  datos.forEach((r, i) => { r.posicion = i + 1; });
  // Marcar ganadores de desempate: jugador que superó a alguien con los mismos PV
  datos.forEach(r => {
    const mismoPV = datos.filter(x => x !== r && x.pv === r.pv);
    r.desempateGanado = mismoPV.length > 0 && mismoPV.some(x => x.posicion > r.posicion);
  });
  const ronda = state.torneoActivo.rondas[rondaIdx];
  ronda.resultadosMesas = ronda.resultadosMesas || [];
  ronda.resultadosMesas[mesaIdx] = datos;
  resultState.rondaIdx = null; resultState.mesaIdx = null;
  guardarEstado();
  renderRondas();
  actualizarBtnRonda();
  if (detalleTabActiva === 'clasificacion') renderClasificacion();
}

// --- Modal de desempate ---
let _empatePendiente = null;

const CRIT_INFO = {
  puntos_victoria: { label: 'PV',         hint: 'Empate — mismo valor',      dir: 'max', readOnly: true  },
  carretera_larga: { label: 'Carretera ↑', hint: 'Mayor longitud gana',       dir: 'max', readOnly: false },
  menos_recursos:  { label: 'Recursos ↓',  hint: 'Menos cartas en mano gana', dir: 'min', readOnly: false },
  cartas_desarrollo:{ label: 'Desarrollo ↑','hint': 'Más cartas en mano gana', dir: 'max', readOnly: false },
};

function mostrarModalEmpate(rondaIdx, mesaIdx, datos) {
  _empatePendiente = { rondaIdx, mesaIdx, datos };
  const torneo = state.torneoActivo;

  // Cabecera de criterios
  document.getElementById('empateDesempateCriterios').innerHTML = `
    <div class="empate-criterios">
      <p class="empate-criterios-titulo">Criterios de desempate configurados:</p>
      <ol class="empate-criterios-lista">
        ${torneo.metosDesempate.map(m => `<li>${formatDesempate(m)}</li>`).join('')}
      </ol>
    </div>`;

  // Agrupar por PV
  const grupos = {};
  datos.forEach(j => { (grupos[j.pv] = grupos[j.pv] || []).push(j); });
  const gruposEmpate = Object.entries(grupos)
    .filter(([, ps]) => ps.length > 1)
    .sort(([a], [b]) => b - a);

  const gruposEl = document.getElementById('empateGrupos');
  gruposEl.innerHTML = gruposEmpate.map(([vp, players]) => `
    <div class="empate-grupo" data-vp="${vp}">
      <p class="empate-grupo-titulo">Empate a <strong>${vp} PV</strong> — arrastra o usa las flechas para ordenar:</p>
      <div class="empate-lista desempate-list" data-vp="${vp}">
        ${players.map(j => `
          <div class="empate-item desempate-item" draggable="true" data-id="${j.id}" data-vp="${vp}">
            <span class="drag-handle">&#8597;</span>
            <span class="empate-nombre">${escapeHtml(j.nombre)}</span>
            <span class="empate-vp-badge">${vp} PV</span>
            <div class="empate-arrows">
              <button class="btn-empate-up" title="Mover arriba">▲</button>
              <button class="btn-empate-down" title="Mover abajo">▼</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`).join('');

  // Drag & drop + flechas en cada lista
  gruposEl.querySelectorAll('.empate-lista').forEach(lista => {
    let src = null;
    lista.addEventListener('dragstart', e => { src = e.target.closest('.empate-item'); });
    lista.addEventListener('dragover', e => {
      e.preventDefault();
      const tgt = e.target.closest('.empate-item');
      if (tgt && tgt !== src) tgt.classList.add('drag-over');
    });
    lista.addEventListener('dragleave', e => {
      const tgt = e.target.closest('.empate-item');
      if (tgt) tgt.classList.remove('drag-over');
    });
    lista.addEventListener('drop', e => {
      e.preventDefault();
      const tgt = e.target.closest('.empate-item');
      if (tgt && tgt !== src) {
        tgt.classList.remove('drag-over');
        const items = [...lista.querySelectorAll('.empate-item')];
        if (items.indexOf(src) < items.indexOf(tgt)) tgt.after(src);
        else tgt.before(src);
      }
    });
    lista.addEventListener('click', e => {
      const upBtn = e.target.closest('.btn-empate-up');
      const downBtn = e.target.closest('.btn-empate-down');
      if (!upBtn && !downBtn) return;
      e.stopPropagation();
      const item = (upBtn || downBtn).closest('.empate-item');
      const items = [...lista.querySelectorAll('.empate-item')];
      const idx = items.indexOf(item);
      if (upBtn && idx > 0) lista.insertBefore(item, items[idx - 1]);
      else if (downBtn && idx < items.length - 1) items[idx + 1].after(item);
    });
  });

  document.getElementById('modalEmpate').classList.remove('hidden');
}

document.getElementById('btnCancelarEmpate').addEventListener('click', () => {
  document.getElementById('modalEmpate').classList.add('hidden');
  _empatePendiente = null;
});

document.getElementById('btnConfirmarEmpate').addEventListener('click', () => {
  if (!_empatePendiente) return;
  const { rondaIdx, mesaIdx, datos } = _empatePendiente;

  // Leer el orden dentro de cada grupo empate
  const ordenGrupo = {};
  document.querySelectorAll('#empateGrupos .empate-lista').forEach(lista => {
    ordenGrupo[lista.dataset.vp] = [...lista.querySelectorAll('.empate-item')].map(el => String(el.dataset.id));
  });

  // Reconstruir lista final ordenada
  const grupos = {};
  datos.forEach(j => { (grupos[j.pv] = grupos[j.pv] || []).push(j); });
  const sortedVPs = Object.keys(grupos).map(Number).sort((a, b) => b - a);

  const finalOrder = [];
  sortedVPs.forEach(vp => {
    const players = grupos[vp];
    if (players.length === 1) {
      finalOrder.push(players[0]);
    } else {
      const order = ordenGrupo[vp] || players.map(p => String(p.id));
      order.forEach(id => {
        const p = players.find(pl => String(pl.id) === id);
        if (p) finalOrder.push(p);
      });
    }
  });

  document.getElementById('modalEmpate').classList.add('hidden');
  _empatePendiente = null;
  _finalizarGuardadoResultado(rondaIdx, mesaIdx, finalOrder);
});

// --- Edición de mesas ---
// mesaIdx === -1 significa que el jugador está en el pool sinAsignar
const editState = { rondaIdx: null, mesaIdx: null, jugadorIdx: null };

function toggleEditRonda(rondaIdx) {
  editState.rondaIdx = editState.rondaIdx === rondaIdx ? null : rondaIdx;
  editState.mesaIdx = null;
  editState.jugadorIdx = null;
  renderRondas();
}

function removeFromMesa(rondaIdx, mesaIdx, jugadorIdx) {
  const ronda = state.torneoActivo.rondas[rondaIdx];
  ronda.sinAsignar = ronda.sinAsignar || [];
  const [jugador] = ronda.mesas[mesaIdx].splice(jugadorIdx, 1);
  ronda.sinAsignar.push(jugador);

  // Si la mesa ya tiene resultado, recalcular posiciones
  if (ronda.resultadosMesas && ronda.resultadosMesas[mesaIdx]) {
    const res = ronda.resultadosMesas[mesaIdx];
    const mesaIds = new Set(ronda.mesas[mesaIdx].map(j => j.id));

    // Jugadores que siguen en la mesa: conservan su PV y orden relativo (posición ya refleja desempates)
    const presentes = res.filter(r => mesaIds.has(r.id)).sort((a, b) => a.posicion - b.posicion);
    // Jugadores que ya no están: van al fondo con 0 PV, en su orden relativo original
    const ausentes  = res.filter(r => !mesaIds.has(r.id)).sort((a, b) => a.posicion - b.posicion);
    ausentes.forEach(r => { r.pv = 0; r.desempateGanado = false; });

    const nuevo = [...presentes, ...ausentes];
    nuevo.forEach((r, i) => { r.posicion = i + 1; });

    // Recalcular desempates solo entre los presentes
    presentes.forEach(r => {
      const mismoPV = presentes.filter(x => x !== r && x.pv === r.pv);
      r.desempateGanado = mismoPV.length > 0 && mismoPV.some(x => x.posicion > r.posicion);
    });

    ronda.resultadosMesas[mesaIdx] = nuevo;
  }

  editState.mesaIdx = null;
  editState.jugadorIdx = null;
  guardarEstado();
  renderRondas();
}

function handlePlayerClick(rondaIdx, mesaIdx, jugadorIdx) {
  if (editState.rondaIdx !== rondaIdx) return;

  // Deseleccionar si se clica el mismo
  if (editState.mesaIdx === mesaIdx && editState.jugadorIdx === jugadorIdx) {
    editState.mesaIdx = null;
    editState.jugadorIdx = null;
    renderRondas();
    return;
  }

  if (editState.jugadorIdx === null) {
    editState.mesaIdx = mesaIdx;
    editState.jugadorIdx = jugadorIdx;
    renderRondas();
    return;
  }

  // Re-seleccionar si ambos están en el pool
  const ronda = state.torneoActivo.rondas[rondaIdx];
  ronda.sinAsignar = ronda.sinAsignar || [];
  const fromPool = editState.mesaIdx === -1;
  const toPool = mesaIdx === -1;

  if (fromPool && toPool) {
    editState.jugadorIdx = jugadorIdx;
    renderRondas();
    return;
  }

  // SWAP entre dos posiciones
  if (fromPool) {
    const jugA = ronda.sinAsignar[editState.jugadorIdx];
    const jugB = ronda.mesas[mesaIdx][jugadorIdx];
    ronda.sinAsignar[editState.jugadorIdx] = jugB;
    ronda.mesas[mesaIdx][jugadorIdx] = jugA;
  } else if (toPool) {
    const jugA = ronda.mesas[editState.mesaIdx][editState.jugadorIdx];
    const jugB = ronda.sinAsignar[jugadorIdx];
    ronda.mesas[editState.mesaIdx][editState.jugadorIdx] = jugB;
    ronda.sinAsignar[jugadorIdx] = jugA;
  } else {
    const jugA = ronda.mesas[editState.mesaIdx][editState.jugadorIdx];
    const jugB = ronda.mesas[mesaIdx][jugadorIdx];
    ronda.mesas[editState.mesaIdx][editState.jugadorIdx] = jugB;
    ronda.mesas[mesaIdx][jugadorIdx] = jugA;
  }

  editState.mesaIdx = null;
  editState.jugadorIdx = null;
  guardarEstado();
  renderRondas();
}

// Mover (sin swap) el jugador seleccionado a una mesa destino
function handleMoverAMesa(rondaIdx, mesaDestino) {
  const ronda = state.torneoActivo.rondas[rondaIdx];
  ronda.sinAsignar = ronda.sinAsignar || [];
  const jpp = state.torneoActivo.jugadoresPorPartida;
  if (ronda.mesas[mesaDestino].length >= jpp) return; // mesa llena
  const fromPool = editState.mesaIdx === -1;

  let jugador;
  if (fromPool) {
    [jugador] = ronda.sinAsignar.splice(editState.jugadorIdx, 1);
  } else {
    [jugador] = ronda.mesas[editState.mesaIdx].splice(editState.jugadorIdx, 1);
  }
  ronda.mesas[mesaDestino].push(jugador);

  editState.mesaIdx = null;
  editState.jugadorIdx = null;
  guardarEstado();
  renderRondas();
}

function renderRondas() {
  const t = state.torneoActivo;
  const contenedor = document.getElementById('listaRondas');
  if (t.rondas.length === 0) {
    contenedor.innerHTML = '<p class="empty-state">Aún no hay rondas generadas.</p>';
    return;
  }

  const esAmistoso = t.tipo === 'amistoso';

  contenedor.innerHTML = t.rondas.map((ronda, rondaIdx) => {
    const enEdicion = editState.rondaIdx === rondaIdx;
    const haySeleccion = enEdicion && editState.jugadorIdx !== null;
    ronda.sinAsignar = ronda.sinAsignar || [];

    const renderJugadorMesa = (j, jugadorIdx, mesaIdx) => {
      const esSeleccionado = haySeleccion && editState.mesaIdx === mesaIdx && editState.jugadorIdx === jugadorIdx;
      return `<li class="${enEdicion ? 'jugador-editable' : ''} ${esSeleccionado ? 'jugador-selected' : ''}"
          data-ronda="${rondaIdx}" data-mesa="${mesaIdx}" data-jugador="${jugadorIdx}">
          <span class="pos-badge">${jugadorIdx + 1}</span>
          <span class="jugador-nombre">${escapeHtml(j.nombre)}</span>
          ${enEdicion ? `
            <span class="swap-icon">⇄</span>
            <button class="btn-remove-mesa" data-ronda="${rondaIdx}" data-mesa="${mesaIdx}" data-jugador="${jugadorIdx}" title="Quitar de la mesa">×</button>
          ` : ''}
        </li>`;
    };

    const hintText = haySeleccion
      ? '👆 Ahora haz clic en otro jugador (mesa o sin asignar) para intercambiarlos.'
      : '👆 Haz clic en × para quitar a un jugador de su mesa, o selecciónalo para intercambiarlo.';

    return `
      <div class="ronda">
        <div class="ronda-header">
          <h4 class="ronda-titulo">Ronda ${ronda.numero}</h4>
          <div class="ronda-header-actions">
            <button class="btn-sm ${enEdicion ? 'btn-primary' : 'btn-outline'} btn-edit-ronda" data-ronda="${rondaIdx}">
              ${enEdicion ? '✓ Guardar cambios' : '✏️ Editar mesas'}
            </button>
          </div>
        </div>
        ${enEdicion ? `<p class="edit-hint">${hintText}</p>` : ''}

        ${enEdicion && ronda.sinAsignar.length > 0 ? `
          <div class="pool-sin-asignar">
            <div class="pool-titulo">Sin asignar (${ronda.sinAsignar.length})</div>
            <ul class="pool-lista">
              ${ronda.sinAsignar.map((j, idx) => {
                const esSeleccionado = haySeleccion && editState.mesaIdx === -1 && editState.jugadorIdx === idx;
                return `<li class="jugador-editable ${esSeleccionado ? 'jugador-selected' : ''}"
                    data-ronda="${rondaIdx}" data-mesa="-1" data-jugador="${idx}">
                    <span class="pool-dot"></span>
                    <span class="jugador-nombre">${escapeHtml(j.nombre)}</span>
                    <span class="swap-icon">⇄</span>
                  </li>`;
              }).join('')}
            </ul>
          </div>
        ` : ''}

        <div class="mesas-grid">
          ${ronda.mesas.map((mesa, mesaIdx) => {
            const esSeleccionadaOrigen = haySeleccion && editState.mesaIdx === mesaIdx;
            const resMesa = (ronda.resultadosMesas || [])[mesaIdx];
            const enResultado = resultState.rondaIdx === rondaIdx && resultState.mesaIdx === mesaIdx;

            let resultadoHtml = '';
            if (!enEdicion) {
              if (enResultado) {
                resultadoHtml = `
                  <div class="resultado-form">
                    ${mesa.map((j, idx) => `
                      <div class="resultado-input-row">
                        <span class="res-nombre">${escapeHtml(j.nombre)}</span>
                        <input class="res-pv-input" id="pv-${rondaIdx}-${mesaIdx}-${idx}" type="number"
                          min="0" max="30" placeholder="PV"
                          value="${resMesa ? (resMesa.find(r => r.id === j.id)?.pv ?? '') : ''}"/>
                      </div>`).join('')}
                    <div class="resultado-form-actions">
                      <button class="btn-guardar-res btn-sm btn-primary" data-ronda="${rondaIdx}" data-mesa="${mesaIdx}">✓ Guardar</button>
                      <button class="btn-cancel-res btn-sm btn-outline" data-ronda="${rondaIdx}" data-mesa="${mesaIdx}">Cancelar</button>
                    </div>
                  </div>`;
              } else if (resMesa && resMesa.length > 0) {
                resultadoHtml = `
                  <div class="resultado-display">
                    ${resMesa.map(r => `
                      <div class="resultado-item pos${r.posicion}">
                        <span class="res-pos">${r.posicion}º</span>
                        <span class="res-nombre">${escapeHtml(r.nombre)}</span>
                        <span class="res-pv">${r.pv} PV</span>
                        ${!esAmistoso ? `<span class="res-pts">${TORNEO_PUNTOS[r.posicion - 1] || 0} pts</span>` : ''}
                      </div>`).join('')}
                    <button class="btn-edit-res btn-sm btn-outline" data-ronda="${rondaIdx}" data-mesa="${mesaIdx}">✏️ Introducir resultado</button>
                  </div>`;
              } else {
                resultadoHtml = `
                  <button class="btn-resultado btn-sm btn-outline" data-ronda="${rondaIdx}" data-mesa="${mesaIdx}">
                    📊 Registrar resultado
                  </button>`;
              }
            }

            return `
            <div class="mesa-card ${enEdicion ? 'mesa-editable' : ''} ${esSeleccionadaOrigen ? 'mesa-origen' : ''}">
              <div class="mesa-header">Mesa ${mesaIdx + 1} <span class="mesa-count">(${mesa.length})</span></div>
              <ul class="mesa-jugadores">
                ${mesa.map((j, jugadorIdx) => renderJugadorMesa(j, jugadorIdx, mesaIdx)).join('')}
              </ul>
              ${haySeleccion && !esSeleccionadaOrigen && mesa.length < t.jugadoresPorPartida ? `
                <button class="btn-add-to-mesa" data-ronda="${rondaIdx}" data-mesa="${mesaIdx}">
                  + Añadir aquí
                </button>
              ` : ''}
              ${resultadoHtml}
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  contenedor.querySelectorAll('.btn-edit-ronda').forEach(btn => {
    btn.addEventListener('click', () => toggleEditRonda(parseInt(btn.dataset.ronda)));
  });

  contenedor.querySelectorAll('.btn-remove-mesa').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromMesa(parseInt(btn.dataset.ronda), parseInt(btn.dataset.mesa), parseInt(btn.dataset.jugador));
    });
  });

  contenedor.querySelectorAll('.jugador-editable').forEach(li => {
    li.addEventListener('click', () => handlePlayerClick(
      parseInt(li.dataset.ronda),
      parseInt(li.dataset.mesa),
      parseInt(li.dataset.jugador)
    ));
  });

  contenedor.querySelectorAll('.btn-add-to-mesa').forEach(btn => {
    btn.addEventListener('click', () => handleMoverAMesa(
      parseInt(btn.dataset.ronda),
      parseInt(btn.dataset.mesa)
    ));
  });

  contenedor.querySelectorAll('.btn-resultado, .btn-edit-res').forEach(btn => {
    btn.addEventListener('click', () =>
      toggleResultadoMesa(parseInt(btn.dataset.ronda), parseInt(btn.dataset.mesa))
    );
  });

  contenedor.querySelectorAll('.btn-guardar-res').forEach(btn => {
    btn.addEventListener('click', () =>
      guardarResultado(parseInt(btn.dataset.ronda), parseInt(btn.dataset.mesa))
    );
  });

  contenedor.querySelectorAll('.btn-cancel-res').forEach(btn => {
    btn.addEventListener('click', () => {
      resultState.rondaIdx = null; resultState.mesaIdx = null;
      renderRondas();
    });
  });

}

// --- Filter mesas ---
function aplicarFiltroMesas(texto) {
  const q = texto.toLowerCase().trim();
  document.querySelectorAll('#listaRondas .mesa-card').forEach(card => {
    const spans = card.querySelectorAll('.jugador-nombre');
    if (!q) {
      card.classList.remove('mesa-filtrada');
      spans.forEach(s => s.classList.remove('nombre-highlight'));
      return;
    }
    let match = false;
    spans.forEach(s => {
      s.classList.remove('nombre-highlight');
      if (s.textContent.toLowerCase().includes(q)) {
        s.classList.add('nombre-highlight');
        match = true;
      }
    });
    card.classList.toggle('mesa-filtrada', !match);
  });
}

document.getElementById('filtroMesas').addEventListener('input', e => aplicarFiltroMesas(e.target.value.trim()));

// --- Helpers ---
function formatFormato(key) {
  const nombres = {
    todos_contra_todos: 'Todos contra todos',
    suizo: 'Sistema suizo',
  };
  return nombres[key] || 'Todos contra todos';
}

function formatDesempate(key) {
  const nombres = {
    puntos_victoria: 'Puntos de victoria',
    carretera_larga: 'Carretera más larga',
    menos_recursos: 'Menos recursos',
    cartas_desarrollo: 'Cartas de desarrollo',
  };
  return nombres[key] || key;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// =============================================
// COMPARTIR / VISTA JUGADOR
// =============================================

function _b64Encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function _b64Decode(str) {
  return decodeURIComponent(escape(atob(str)));
}

function generarLinkRonda(rondaIdx) {
  const t = state.torneoActivo;
  const ronda = t.rondas[rondaIdx];
  const payload = {
    torneoId: t.id,
    torneoNombre: t.nombre,
    rondaNum: ronda.numero,
    mesas: ronda.mesas.map(mesa => mesa.map(j => ({ id: j.id, nombre: j.nombre })))
  };
  state._sharePayload = payload;
  const hash = '#share=' + _b64Encode(JSON.stringify(payload));
  const url = window.location.href.split('#')[0] + hash;
  document.getElementById('shareUrlInput').value = url;
  document.getElementById('shareCopiedMsg').classList.add('hidden');
  document.getElementById('modalShareRonda').classList.remove('hidden');
}

function importarCodigo(rawCode) {
  try {
    const data = JSON.parse(_b64Decode(rawCode.trim()));
    const t = state.torneoActivo;
    if (!t || t.id !== data.torneoId) {
      alert('El código no corresponde al torneo activo.');
      return;
    }
    const rondaIdx = t.rondas.findIndex(r => r.numero === data.rondaNum);
    if (rondaIdx === -1) {
      alert(`No se encontró la Ronda ${data.rondaNum} en este torneo.`);
      return;
    }
    _finalizarGuardadoResultado(rondaIdx, data.mesaIdx, data.resultados.map(r => ({ ...r })));
    cambiarTab('jugadores');
  } catch(e) {
    alert('Código inválido o corrupto. Comprueba que has copiado el código completo.');
  }
}

// ─── HTML torneo autocontenido ────────────────────────────────────────────────
function generarHTMLTorneo(t) {
  const esAmistoso = t.tipo === 'amistoso';
  const embed = {
    torneoId: t.id,
    torneoNombre: t.nombre,
    tipo: t.tipo || 'oficial',
    numRondas: t.numRondas || null,
    jugadores: t.jugadores.map(j => ({ id: j.id, nombre: j.nombre })),
    rondas: t.rondas.map(r => ({
      numero: r.numero,
      mesas: r.mesas.map(m => m.map(j => ({ id: j.id, nombre: j.nombre }))),
      resultadosMesas: r.resultadosMesas || []
    })),
    pts: TORNEO_PUNTOS
  };
  const dj = JSON.stringify(embed).replace(/<\/script>/gi, '<\\/script>');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Catan · ${escapeHtml(t.nombre)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1a0f0a;color:#f0e0c0;font-family:'Segoe UI',Tahoma,sans-serif;min-height:100vh}
.wrap{max-width:700px;margin:0 auto;padding:1.5rem}
.sh{text-align:center;margin-bottom:1.5rem;padding-top:.5rem}
.st{font-size:1.7rem;font-weight:800;color:#d4a017;margin-bottom:.4rem}
.sb{display:inline-block;background:rgba(212,160,23,.12);border:1px solid rgba(212,160,23,.3);color:#d4a017;border-radius:20px;padding:.2rem .9rem;font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:.4rem}
.tabs{display:flex;gap:.2rem;border-bottom:2px solid #5a3520;margin-bottom:1.25rem}
.tb{background:none;border:none;padding:.55rem 1rem;font-size:.85rem;color:#a08060;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;font-weight:600;transition:color .15s,border-color .15s}
.tb.on{color:#d4a017;border-bottom-color:#d4a017}
.tp{display:none}.tp.on{display:block}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th{background:#2c1810;color:#a08060;font-size:.72rem;text-transform:uppercase;letter-spacing:.5px;padding:.45rem .6rem;text-align:left;border-bottom:1px solid #5a3520}
th:not(:first-child){text-align:center}
td{padding:.4rem .6rem;border-bottom:1px solid rgba(90,53,32,.4);text-align:left;vertical-align:middle}
td:not(:first-child){text-align:center}
tr:last-child td{border-bottom:none}
.g1{color:#FFD700;font-weight:800}.g2{color:#C0C0C0;font-weight:800}.g3{color:#CD7F32;font-weight:800}
.gpts{color:#d4a017;font-weight:700}
.rb{background:#2e1a10;border:1px solid #5a3520;border-radius:10px;margin-bottom:.9rem;overflow:hidden}
.rh{background:#2c1810;border-bottom:1px solid #5a3520;padding:.55rem 1rem;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#d4a017}
.mg{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:1px;background:#5a3520}
.mc{background:#2e1a10;padding:.65rem .85rem}
.mch{font-size:.68rem;font-weight:700;text-transform:uppercase;color:#a08060;letter-spacing:1px;margin-bottom:.38rem;padding-bottom:.28rem;border-bottom:1px solid #3d2415}
.rr{display:flex;align-items:center;gap:.35rem;font-size:.8rem;padding:.13rem 0}
.rp{font-weight:800;width:18px;flex-shrink:0;color:#a08060}
.rn2{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rpv{font-size:.73rem;color:#a08060;flex-shrink:0}
.rpt{font-size:.73rem;color:#d4a017;font-weight:700;flex-shrink:0}
.noR{font-size:.78rem;color:#a08060;font-style:italic;padding:.25rem 0}
.mc2{background:#2e1a10;border:1px solid #5a3520;border-radius:10px;overflow:hidden;margin-bottom:.9rem}
.mc2h{background:#2c1810;border-bottom:1px solid #5a3520;padding:.52rem 1rem;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a08060}
.jl{padding:.65rem 1rem;display:flex;flex-direction:column;gap:.42rem}
.jr{display:flex;align-items:center;gap:.7rem}
.jn{flex:1;font-size:.88rem}
.pi{width:66px;background:#3d2415;border:1px solid #5a3520;border-radius:6px;color:#f0e0c0;font-size:.98rem;font-weight:700;text-align:center;padding:.28rem .38rem;outline:none;transition:border-color .2s}
.pi:focus{border-color:#d4a017}.pi:disabled{opacity:.4;cursor:default}
.bp{background:#c0392b;color:#fff;border:none;padding:.6rem 1.1rem;border-radius:8px;font-size:.9rem;font-weight:700;cursor:pointer;width:100%;margin:.25rem 0 .5rem;transition:background .15s}
.bp:hover{background:#a93226}.bp:disabled{opacity:.45;cursor:default}
.cb{background:rgba(39,174,96,.07);border:1px solid rgba(39,174,96,.2);border-radius:8px;padding:.75rem .9rem;margin-top:.5rem;display:none}
.cl{font-size:.78rem;color:#5dca8a;font-weight:600;margin-bottom:.4rem}
.cw{display:flex;gap:.45rem;align-items:flex-start}
.ct{flex:1;background:#3d2415;border:1px solid #5a3520;border-radius:6px;color:#a08060;font-size:.68rem;padding:.32rem .45rem;resize:none;outline:none;font-family:monospace;line-height:1.4}
.bcp{background:rgba(212,160,23,.15);border:1px solid rgba(212,160,23,.35);color:#d4a017;border-radius:6px;padding:.28rem .65rem;font-size:.78rem;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:background .15s}
.bcp:hover{background:rgba(212,160,23,.3)}
.ok{color:#5dca8a;font-size:.83rem;padding:.4rem .8rem .75rem 1rem}
.sec-ronda{font-size:.82rem;font-weight:700;color:#d4a017;text-transform:uppercase;letter-spacing:.5px;margin:1.1rem 0 .6rem}
</style>
</head>
<body>
<div class="wrap">
  <div class="sh">
    <div class="st">&#127942; ${escapeHtml(t.nombre)}</div>
    <div class="sb" id="badge-estado"></div>
  </div>
  <div class="tabs">
    <button class="tb on" onclick="tab('cls',this)">&#127942; Clasificaci&#243;n</button>
    <button class="tb" onclick="tab('mesas',this)">&#127919; Mesas y resultados</button>
  </div>
  <div id="cls" class="tp on"></div>
  <div id="mesas" class="tp"></div>
</div>
<script>
var D=${dj};
function b64(s){return btoa(unescape(encodeURIComponent(s)));}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function tab(id,btn){
  document.querySelectorAll('.tb').forEach(function(b){b.classList.remove('on');});
  document.querySelectorAll('.tp').forEach(function(p){p.classList.remove('on');});
  btn.classList.add('on');document.getElementById(id).classList.add('on');
}
var amistoso=D.tipo==='amistoso';
function calcStats(){
  var s={};
  D.jugadores.forEach(function(j){s[j.id]={nombre:j.nombre,pv:0,pts:0,p1:0};});
  D.rondas.forEach(function(r){
    (r.resultadosMesas||[]).forEach(function(res){
      if(!res)return;
      res.forEach(function(x){
        if(!s[x.id])return;
        s[x.id].pv+=x.pv||0;
        if(!amistoso)s[x.id].pts+=(D.pts[x.posicion-1]||0);
        if(x.posicion===1)s[x.id].p1++;
      });
    });
  });
  return Object.values(s).sort(function(a,b){
    return amistoso?((b.pv-a.pv)||(b.p1-a.p1)):((b.pts-a.pts)||(b.pv-a.pv)||(b.p1-a.p1));
  });
}
function renderCls(){
  var rows=calcStats(),gc=['g1','g2','g3'];
  var h='<table><thead><tr><th>#</th><th>Jugador</th><th>PV</th><th>1&#186;s</th>'+(amistoso?'':'<th>Pts Torneo</th>')+'</tr></thead><tbody>';
  rows.forEach(function(r,i){
    h+='<tr><td class="'+(gc[i]||'')+'">'+( i+1)+'&#186;</td><td>'+esc(r.nombre)+'</td><td>'+r.pv+'</td><td>'+r.p1+'</td>'+(amistoso?'':'<td class="gpts">'+r.pts+'</td>')+'</tr>';
  });
  document.getElementById('cls').innerHTML=h+'</tbody></table>';
}
function renderMesas(){
  if(!D.rondas.length){document.getElementById('mesas').innerHTML='<p style="color:#a08060;font-size:.85rem">Sin rondas generadas.</p>';return;}
  var h='';
  D.rondas.slice().reverse().forEach(function(ronda){
    h+='<div class="sec-ronda">Ronda '+ronda.numero+'</div>';
    ronda.mesas.forEach(function(mesa,mi){
      var res=(ronda.resultadosMesas||[])[mi];
      var cid='cb_'+ronda.numero+'_'+mi;
      h+='<div class="mc2"><div class="mc2h">Mesa '+(mi+1)+'</div><div class="jl">';
      mesa.forEach(function(j){
        var v=res?(res.find(function(x){return x.id==j.id;})||{}).pv:'';
        h+='<div class="jr"><span class="jn">'+esc(j.nombre)+'</span>'
          +'<input type="number" class="pi" id="pv_'+ronda.numero+'_'+mi+'_'+j.id+'" data-id="'+j.id+'" min="0" max="30" placeholder="PV"'
          +(res?' disabled value="'+(v===undefined||v===null?'':v)+'"':'')+'></div>';
      });
      h+='</div>';
      if(res){
        h+='<div class="ok">&#10003; Resultado ya registrado.</div>';
      } else {
        h+='<div style="padding:0 1rem .75rem">'
          +'<button class="bp" onclick="genCod('+ronda.numero+','+mi+')">&#10003; Generar c&#243;digo</button>'
          +'<div class="cb" id="'+cid+'"><div class="cl">&#128203; C&#243;digo listo &#8212; env&#237;aselo al organizador:</div>'
          +'<div class="cw"><textarea class="ct" id="ct_'+cid+'" readonly rows="3"></textarea>'
          +'<button class="bcp" onclick="cop(\'ct_'+cid+'\',this)">Copiar</button></div></div></div>';
      }
      h+='</div>';
    });
  });
  document.getElementById('mesas').innerHTML=h;
}
function genCod(rondaNum,mi){
  var ronda=D.rondas.find(function(r){return r.numero==rondaNum;});
  var mesa=ronda.mesas[mi];
  var res=mesa.map(function(j){
    var v=document.getElementById('pv_'+rondaNum+'_'+mi+'_'+j.id);
    return{id:j.id,nombre:j.nombre,pv:v?parseInt(v.value)||0:0};
  });
  var code=b64(JSON.stringify({torneoId:D.torneoId,rondaNum:rondaNum,mesaIdx:mi,resultados:res}));
  var cid='cb_'+rondaNum+'_'+mi,box=document.getElementById(cid);
  box.style.display='block';document.getElementById('ct_'+cid).value=code;
}
function cop(id,btn){
  navigator.clipboard.writeText(document.getElementById(id).value)
    .then(function(){btn.textContent='&#10003; Copiado';setTimeout(function(){btn.textContent='Copiar';},2200);});
}
(function(){
  var rn=D.rondas.length,tot=D.numRondas;
  document.getElementById('badge-estado').textContent=
    tot&&rn>=tot?'Completado \xb7 '+rn+' rondas':rn?'Ronda '+rn+(tot?' de '+tot:''):'Sin rondas';
  renderCls();
  renderMesas();
})();
<\/script>
</body>
</html>`;
}

function generarHTMLFormulario(shareData) {
  const dataJson = JSON.stringify(shareData).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Catan · ${shareData.torneoNombre} · Ronda ${shareData.rondaNum}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1a0f0a;color:#f0e0c0;font-family:'Segoe UI',sans-serif;min-height:100vh;padding:1.5rem}
.wrap{max-width:640px;margin:0 auto}
.header{text-align:center;margin-bottom:1.5rem}
.tnombre{font-size:1.6rem;font-weight:800;color:#d4a017;margin-bottom:.4rem}
.rbadge{display:inline-block;background:rgba(212,160,23,.12);border:1px solid rgba(212,160,23,.3);color:#d4a017;border-radius:20px;padding:.2rem .9rem;font-size:.82rem;font-weight:700;text-transform:uppercase;letter-spacing:1px}
.hint{color:#a08060;font-size:.87rem;text-align:center;margin-bottom:1.5rem;line-height:1.5}
.mesa{background:#2e1a10;border:1px solid #5a3520;border-radius:10px;overflow:hidden;margin-bottom:1rem}
.mesa-h{background:#2c1810;border-bottom:1px solid #5a3520;padding:.55rem 1rem;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a08060}
.jugadores{padding:.7rem 1rem;display:flex;flex-direction:column;gap:.45rem}
.jrow{display:flex;align-items:center;justify-content:space-between;gap:.75rem}
.jnombre{flex:1;font-size:.93rem}
.pvinput{width:68px;background:#3d2415;border:1px solid #5a3520;border-radius:6px;color:#f0e0c0;font-size:1rem;font-weight:700;text-align:center;padding:.3rem .4rem;outline:none}
.pvinput:focus{border-color:#d4a017}
.btn-gen{display:block;margin:.1rem 1rem .8rem;width:calc(100% - 2rem);background:#c0392b;color:#fff;border:none;padding:.65rem;border-radius:8px;font-size:.95rem;font-weight:700;cursor:pointer;transition:background .15s}
.btn-gen:hover{background:#a93226}
.btn-gen:disabled{opacity:.5;cursor:default}
.cresult{background:rgba(39,174,96,.07);border-top:1px solid rgba(39,174,96,.2);padding:.75rem 1rem;display:none}
.clabel{font-size:.8rem;color:#5dca8a;font-weight:600;margin-bottom:.4rem}
.cwrap{display:flex;gap:.5rem;align-items:flex-start}
.ctext{flex:1;background:#3d2415;border:1px solid #5a3520;border-radius:6px;color:#a08060;font-size:.7rem;padding:.35rem .5rem;resize:none;outline:none;font-family:monospace;line-height:1.4}
.btn-copy{background:rgba(212,160,23,.15);border:1px solid rgba(212,160,23,.35);color:#d4a017;border-radius:6px;padding:.3rem .7rem;font-size:.8rem;cursor:pointer;white-space:nowrap;transition:background .15s}
.btn-copy:hover{background:rgba(212,160,23,.3)}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="tnombre">🏆 ${shareData.torneoNombre}</div>
    <div class="rbadge">Ronda ${shareData.rondaNum}</div>
  </div>
  <p class="hint">Encuentra tu mesa, introduce los puntos de victoria (PV) de cada jugador y pulsa <strong>Generar código</strong>. Envía el código al organizador.</p>
  <div id="mesas"></div>
</div>
<script>
var DATA=${dataJson};
DATA.mesas.forEach(function(mesa,mi){
  var card=document.createElement('div');
  card.className='mesa';card.id='m'+mi;
  var rows=mesa.map(function(j){
    return '<div class="jrow"><span class="jnombre">'+j.nombre+'</span><input type="number" class="pvinput" data-id="'+j.id+'" min="0" max="20" placeholder="PV"></div>';
  }).join('');
  card.innerHTML='<div class="mesa-h">Mesa '+(mi+1)+'</div><div class="jugadores">'+rows+'</div>'
    +'<button class="btn-gen" onclick="gen('+mi+')">✓ Generar código</button>'
    +'<div class="cresult" id="cr'+mi+'"><div class="clabel">📋 Código listo — cópialo y envíaselo al organizador:</div>'
    +'<div class="cwrap"><textarea class="ctext" id="ct'+mi+'" readonly rows="3"></textarea>'
    +'<button class="btn-copy" onclick="cop('+mi+',this)">Copiar</button></div></div>';
  document.getElementById('mesas').appendChild(card);
});
function b64(s){return btoa(unescape(encodeURIComponent(s)));}
function gen(mi){
  var card=document.getElementById('m'+mi);
  var res=DATA.mesas[mi].map(function(j){
    var v=parseInt(card.querySelector('[data-id="'+j.id+'"]').value)||0;
    return{id:j.id,nombre:j.nombre,pv:v};
  });
  var code=b64(JSON.stringify({torneoId:DATA.torneoId,rondaNum:DATA.rondaNum,mesaIdx:mi,resultados:res}));
  var cr=document.getElementById('cr'+mi);
  cr.style.display='block';
  document.getElementById('ct'+mi).value=code;
  card.querySelector('.btn-gen').textContent='✓ Código generado';
  card.querySelector('.btn-gen').disabled=true;
}
function cop(mi,btn){
  navigator.clipboard.writeText(document.getElementById('ct'+mi).value)
    .then(function(){btn.textContent='✓ Copiado';setTimeout(function(){btn.textContent='Copiar';},2000);});
}
<\/script>
</body>
</html>`;
}

// Modal compartir — eventos
document.getElementById('btnCerrarShareRonda').addEventListener('click', () => {
  document.getElementById('modalShareRonda').classList.add('hidden');
});
document.getElementById('btnCopyShareUrl').addEventListener('click', () => {
  const input = document.getElementById('shareUrlInput');
  const mostrarOk = () => {
    const msg = document.getElementById('shareCopiedMsg');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 2500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(input.value).then(mostrarOk).catch(() => {
      input.select();
      document.execCommand('copy');
      mostrarOk();
    });
  } else {
    input.select();
    document.execCommand('copy');
    mostrarOk();
  }
});
document.getElementById('btnCompartirTorneo').addEventListener('click', () => {
  const t = state.torneoActivo;
  if (!t) return;
  const payload = {
    torneoId: t.id,
    torneoNombre: t.nombre,
    tipo: t.tipo || 'oficial',
    numRondas: t.numRondas || null,
    jugadores: t.jugadores.map(j => ({ id: j.id, nombre: j.nombre })),
    rondas: t.rondas.map(r => ({
      numero: r.numero,
      sistema: r.sistema,
      mesas: r.mesas.map(m => m.map(j => ({ id: j.id, nombre: j.nombre }))),
      resultadosMesas: r.resultadosMesas || []
    }))
  };
  const hash = '#share=' + _b64Encode(JSON.stringify(payload));
  const url = window.location.href.split('#')[0] + hash;
  document.getElementById('shareUrlInput').value = url;
  document.getElementById('shareCopiedMsg').classList.add('hidden');
  document.getElementById('modalShareRonda').classList.remove('hidden');
});


// =============================================
// VISTA JUGADOR (hash #share=...)
// =============================================

function mostrarVistaJugador() {
  document.querySelector('.app-layout').classList.add('hidden');
  document.getElementById('vistaJugador').classList.remove('hidden');
}

function renderPlayerView(shareData) {
  const esAmistoso = shareData.tipo === 'amistoso';
  const rondaActual = shareData.rondas.length;
  const totalRondas = shareData.numRondas || '?';

  // --- Tab: Mesas y resultados (todas las rondas, más reciente primero) ---
  const mesasHtml = shareData.rondas.slice().reverse().map(ronda => {
    const mesasGrid = ronda.mesas.map((mesa, mi) => {
      const res = (ronda.resultadosMesas || [])[mi];
      const sfx = `${ronda.numero}_${mi}`;
      if (res && res.length) {
        return `
          <div class="mesa-card">
            <div class="mesa-header">Mesa ${mi + 1} <span class="mesa-count">(${mesa.length})</span></div>
            <div class="resultado-display">
              ${res.map(r => `
                <div class="resultado-item pos${r.posicion}">
                  <span class="res-pos">${r.posicion}º</span>
                  <span class="res-nombre">${escapeHtml(r.nombre)}</span>
                  <span class="res-pv">${r.pv} PV</span>
                  ${!esAmistoso ? `<span class="res-pts">${TORNEO_PUNTOS[r.posicion - 1] || 0} pts</span>` : ''}
                </div>`).join('')}
            </div>
          </div>`;
      }
      return `
        <div class="mesa-card" id="mesa-card-${ronda.numero}-${mi}">
          <div class="mesa-header">Mesa ${mi + 1} <span class="mesa-count">(${mesa.length})</span></div>
          <ul class="mesa-jugadores">
            ${mesa.map(j => `<li><span class="jugador-nombre">${escapeHtml(j.nombre)}</span></li>`).join('')}
          </ul>
          <div class="resultado-form">
            ${mesa.map(j => `
              <div class="resultado-input-row">
                <span class="res-nombre">${escapeHtml(j.nombre)}</span>
                <input class="res-pv-input" type="number" min="0" max="30" placeholder="PV"
                  id="pvg_${sfx}_${j.id}" data-id="${j.id}" />
              </div>`).join('')}
            <div class="resultado-form-actions">
              ${FIREBASE_ENABLED
                ? `<button class="btn-sm btn-primary btn-pv-submit"
                    data-ronda="${ronda.numero}" data-mesa="${mi}">✓ Confirmar resultados</button>`
                : `<button class="btn-sm btn-primary btn-pv-gencode"
                    data-ronda="${ronda.numero}" data-mesa="${mi}">✓ Generar código</button>`
              }
            </div>
          </div>
          ${!FIREBASE_ENABLED ? `
          <div class="player-code-result hidden" id="pvcode-${sfx}">
            <p class="player-code-label">📋 Código listo — envíaselo al organizador:</p>
            <div class="player-code-wrap">
              <textarea class="player-code-text" readonly rows="3"></textarea>
              <button class="btn-sm btn-primary btn-pv-copy" data-sfx="${sfx}">Copiar</button>
            </div>
          </div>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="panel" style="margin-bottom:1.25rem">
        <div class="panel-header"><h3>Ronda ${ronda.numero}</h3></div>
        <div class="mesas-grid">${mesasGrid}</div>
      </div>`;
  }).join('');

  // --- Tab: Historial (solo rondas con resultados, acordeón, solo lectura) ---
  const rondasConResultados = shareData.rondas.filter(r =>
    (r.resultadosMesas || []).some(m => m && m.length)
  );
  const historialHtml = rondasConResultados.length === 0
    ? '<p class="empty-state">Sin resultados registrados aún.</p>'
    : rondasConResultados.slice().reverse().map((ronda, idx) => {
        const mesasBody = ronda.mesas.map((mesa, mi) => {
          const res = (ronda.resultadosMesas || [])[mi];
          if (!res || !res.length) return '';
          return `
            <div class="mesa-card">
              <div class="mesa-header">Mesa ${mi + 1} <span class="mesa-count">(${mesa.length})</span></div>
              <div class="resultado-display">
                ${res.map(r => `
                  <div class="resultado-item pos${r.posicion}">
                    <span class="res-pos">${r.posicion}º</span>
                    <span class="res-nombre">${escapeHtml(r.nombre)}</span>
                    <span class="res-pv">${r.pv} PV</span>
                    ${!esAmistoso ? `<span class="res-pts">${TORNEO_PUNTOS[r.posicion - 1] || 0} pts</span>` : ''}
                  </div>`).join('')}
              </div>
            </div>`;
        }).join('');
        const abierta = idx === 0; // la más reciente abierta por defecto
        return `
          <div class="hist-card">
            <div class="hist-card-header pv-hist-toggle" data-pvhist="${ronda.numero}">
              <span class="hist-ronda-num">Ronda ${ronda.numero}</span>
              <span class="hist-chevron">${abierta ? '▼' : '▶'}</span>
            </div>
            <div class="hist-card-body mesas-grid${abierta ? '' : ' hidden'}" id="pvhist-${ronda.numero}">
              ${mesasBody}
            </div>
          </div>`;
      }).join('');

  const hayHistorial = rondasConResultados.length > 0;

  // Todo el HTML está listo — ahora sí tocamos el DOM
  mostrarVistaJugador();
  const contenedor = document.getElementById('playerViewContent');
  contenedor.innerHTML = `
    <div class="player-header">
      <div class="player-torneo-nombre">🏆 ${escapeHtml(shareData.torneoNombre)}</div>
      <div class="player-ronda-badge">Ronda ${rondaActual} de ${totalRondas}</div>
    </div>
    <div class="detalle-tabs">
      <button class="tab-btn${hayHistorial ? '' : ' active'}" data-pv-tab="mesas">🎯 Mesas y resultados</button>
      ${hayHistorial ? '<button class="tab-btn active" data-pv-tab="historial">📜 Historial</button>' : ''}
    </div>
    <div id="pvTabMesas" class="tab-content${hayHistorial ? ' hidden' : ''}">
      ${mesasHtml || '<p class="empty-state-tab">Sin rondas generadas aún.</p>'}
    </div>
    ${hayHistorial ? `
    <div id="pvTabHistorial" class="tab-content">
      <div class="panel">
        ${historialHtml}
      </div>
    </div>` : ''}
  `;

  // Tabs
  contenedor.querySelectorAll('[data-pv-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      contenedor.querySelectorAll('[data-pv-tab]').forEach(b => b.classList.remove('active'));
      contenedor.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      btn.classList.add('active');
      const tabId = btn.dataset.pvTab === 'historial' ? 'pvTabHistorial' : 'pvTabMesas';
      const tabEl = document.getElementById(tabId);
      if (tabEl) tabEl.classList.remove('hidden');
    });
  });

  // Historial acordeón
  contenedor.querySelectorAll('.pv-hist-toggle').forEach(header => {
    header.addEventListener('click', () => {
      const rondaNum = header.dataset.pvhist;
      const body = document.getElementById(`pvhist-${rondaNum}`);
      const isHidden = body.classList.toggle('hidden');
      header.querySelector('.hist-chevron').textContent = isHidden ? '▶' : '▼';
    });
  });

  // Submit directo a Firebase
  contenedor.querySelectorAll('.btn-pv-submit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const rondaNum = parseInt(btn.dataset.ronda);
      const mi = parseInt(btn.dataset.mesa);
      const ronda = shareData.rondas.find(r => r.numero === rondaNum);
      // Recoger PVs y calcular posiciones
      const rawDatos = ronda.mesas[mi].map(j => ({
        id: j.id, nombre: j.nombre,
        pv: parseInt(document.getElementById(`pvg_${rondaNum}_${mi}_${j.id}`)?.value) || 0
      }));
      const sorted = [...rawDatos].sort((a, b) => b.pv - a.pv);
      sorted.forEach((j, i) => {
        j.posicion = i > 0 && j.pv === sorted[i - 1].pv ? sorted[i - 1].posicion : i + 1;
      });
      btn.textContent = '⏳ Enviando…';
      btn.disabled = true;
      try {
        await fbEnviarResultado(shareData.torneoId, rondaNum, mi, sorted);
        // Reemplazar card por resultado display
        const card = document.getElementById(`mesa-card-${rondaNum}-${mi}`);
        card.innerHTML = `
          <div class="mesa-header">Mesa ${mi + 1} <span class="mesa-count">(${ronda.mesas[mi].length})</span></div>
          <div class="resultado-display">
            ${sorted.map(r => `
              <div class="resultado-item pos${r.posicion}">
                <span class="res-pos">${r.posicion}º</span>
                <span class="res-nombre">${escapeHtml(r.nombre)}</span>
                <span class="res-pv">${r.pv} PV</span>
                ${!esAmistoso ? `<span class="res-pts">${TORNEO_PUNTOS[r.posicion - 1] || 0} pts</span>` : ''}
              </div>`).join('')}
          </div>
          <p class="pv-submit-ok">✅ Resultado enviado al organizador</p>`;
      } catch(e) {
        btn.textContent = '✗ Error al enviar';
        btn.disabled = false;
        console.error('[Firebase] Error al enviar resultado:', e);
      }
    });
  });

  // Generar código (fallback sin Firebase)
  contenedor.querySelectorAll('.btn-pv-gencode').forEach(btn => {
    btn.addEventListener('click', () => {
      const rondaNum = parseInt(btn.dataset.ronda);
      const mi = parseInt(btn.dataset.mesa);
      const ronda = shareData.rondas.find(r => r.numero === rondaNum);
      const resultados = ronda.mesas[mi].map(j => ({
        id: j.id, nombre: j.nombre,
        pv: parseInt(document.getElementById(`pvg_${rondaNum}_${mi}_${j.id}`)?.value) || 0
      }));
      const code = _b64Encode(JSON.stringify({ torneoId: shareData.torneoId, rondaNum, mesaIdx: mi, resultados }));
      const sfx = `${rondaNum}_${mi}`;
      const codeDiv = document.getElementById(`pvcode-${sfx}`);
      codeDiv.classList.remove('hidden');
      codeDiv.querySelector('.player-code-text').value = code;
      btn.textContent = '✓ Código generado';
      btn.disabled = true;
    });
  });

  // Copiar código (fallback sin Firebase)
  contenedor.querySelectorAll('.btn-pv-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const textarea = document.getElementById(`pvcode-${btn.dataset.sfx}`).querySelector('.player-code-text');
      const ok = () => { btn.textContent = '✓ Copiado'; setTimeout(() => btn.textContent = 'Copiar', 2500); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textarea.value).then(ok).catch(() => { textarea.select(); document.execCommand('copy'); ok(); });
      } else {
        textarea.select();
        document.execCommand('copy');
        ok();
      }
    });
  });
}

function checkShareMode() {
  const hash = window.location.hash;
  if (!hash.startsWith('#share=')) return false;
  try {
    const data = JSON.parse(_b64Decode(hash.slice(7)));
    renderPlayerView(data);
    return true;
  } catch(e) {
    console.error('Error al procesar el enlace compartido:', e);
    // Fallback: mostrar mensaje de error en lugar de pantalla en blanco
    mostrarVistaJugador();
    const contenedor = document.getElementById('playerViewContent');
    contenedor.innerHTML = `
      <div class="player-header">
        <div class="player-torneo-nombre">⚠️ Error al cargar el torneo</div>
      </div>
      <div class="panel" style="text-align:center;padding:2rem">
        <p>El enlace no es válido o está desactualizado.</p>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-top:0.5rem">${e.message}</p>
        <button class="btn-primary" style="margin-top:1.5rem"
          onclick="window.location.hash='';window.location.reload()">Ir al inicio</button>
      </div>`;
    return true; // evita que renderTorneos() intente mostrar el layout
  }
}

// Init
if (!checkShareMode()) {
  renderTorneos();
}
