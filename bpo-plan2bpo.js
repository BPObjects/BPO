/* bpo-plan2bpo.js — « Importer un plan scanné » (08/09/2026).
   Portage navigateur de CODE/plan2bpo/plan2bpo.py : d'un scan de plan (image ou PDF) aux
   éléments BPO — enveloppe (contour libre), cloisons, menuiseries de façade — et pose du
   scan calibré en fond de plan.
   Chaîne : poché gris (faible saturation, valeur moyenne, faible variance locale)
            → bandes de murs H/V (ouverture morphologique = suppression des runs < 1 m)
            → trous entre morceaux colinéaires = ouvertures (< 3 m)
            → pièces (remplissage) + enveloppe (contour extérieur rectilinéarisé)
            → plan {enveloppe, murs, ouvertures, pieces} en mètres, Y vers le haut (nord).
   Tout est en pixels de l'image source jusqu'à l'export ; mmpx = mm réels par pixel.
   API : BPO_P2B.charger(file) → Promise<canvas> ; BPO_P2B.extraire(canvas, mmpx) → plan ;
         BPO_P2B.importer(plan, opts) → compte-rendu ; BPO_P2B.controle(canvas, res) → canvas. */
(function(){
'use strict';
var FORMATS = { A0: 1189, A1: 841, A2: 594, A3: 420, A4: 297 };   /* largeur paysage, mm */

/* ------------------------------------------------------------ 1. chargement image / PDF */
function chargerImage(file){
  return new Promise(function(res, rej){
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function(){ URL.revokeObjectURL(url); var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); res(source(c)); };
    im.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('image illisible')); };
    im.src = url;
  });
}
function pdfjs(){
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise(function(res, rej){
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = function(){ window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); };
    s.onerror = function(){ rej(new Error('pdf.js indisponible (hors ligne ?)')); };
    document.head.appendChild(s);
  });
}
function chargerPDF(file, page, largeurPx){
  return file.arrayBuffer().then(function(buf){ return pdfjs().then(function(lib){ return lib.getDocument({ data: buf }).promise; }); })
  .then(function(doc){ return doc.getPage(page || 1); })
  .then(function(pg){
    var v1 = pg.getViewport({ scale: 1 }), sc = (largeurPx || 2500) / v1.width, v = pg.getViewport({ scale: sc });
    var c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
    return pg.render({ canvasContext: c.getContext('2d'), viewport: v }).promise.then(function(){ var S = source(c); S.pdfLargeurMm = v1.width / 72 * 25.4; return S; });
  });
}
/* une SOURCE = {canvas, img, W, H} : on garde l'ImageData, car Chrome peut vider le
   contenu d'un canvas détaché du document sous pression mémoire (vécu le 08/09) */
function source(c){ var W = c.width, H = c.height; return { canvas: c, img: c.getContext('2d').getImageData(0, 0, W, H), W: W, H: H }; }
function charger(file){
  var nom = (file.name || '').toLowerCase();
  if (nom.slice(-4) === '.pdf' || file.type === 'application/pdf') return chargerPDF(file);
  return chargerImage(file);
}

/* ------------------------------------------------------------ 2. poché gris */
function masquePoche(img, W, H, o){
  o = o || {};
  var satMax = o.satMax || 60, vMin = o.vMin || 90, vMax = o.vMax || 185, sdMax = o.sdMax || 26, aireMin = o.aireMin || 2500;
  var N = W * H, d = img.data, g = new Float32Array(N), gris = new Uint8Array(N);
  for (var i = 0, p = 0; i < N; i++, p += 4){
    var r = d[p], gg = d[p + 1], b = d[p + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    var s = mx ? (mx - mn) * 255 / mx : 0;
    g[i] = 0.299 * r + 0.587 * gg + 0.114 * b;
    gris[i] = (s < satMax && mx > vMin && mx < vMax) ? 1 : 0;
  }
  /* écart-type local 11×11 par sommes intégrales séparables */
  var K = o.sdK || 5, mu = boxMean(g, W, H, K), g2 = new Float32Array(N);
  for (i = 0; i < N; i++) g2[i] = g[i] * g[i];
  var mu2 = boxMean(g2, W, H, K), m = new Uint8Array(N);
  for (i = 0; i < N; i++){ var v = mu2[i] - mu[i] * mu[i]; m[i] = (gris[i] && Math.sqrt(v > 0 ? v : 0) < sdMax) ? 1 : 0; }
  m = morphOuvrir(m, W, H, 3); m = morphFermer(m, W, H, 5);
  return composantesMin(m, W, H, aireMin);
}
function boxMean(a, W, H, K){
  var N = W * H, t = new Float32Array(N), out = new Float32Array(N), x, y, s, k = 2 * K + 1;
  for (y = 0; y < H; y++){                       /* horizontal */
    var row = y * W; s = 0;
    for (x = 0; x < W; x++){ s += a[row + x]; if (x >= k) s -= a[row + x - k]; t[row + Math.max(0, x - K)] = s / Math.min(k, x + 1); }
    for (x = Math.max(0, W - K); x < W; x++) t[row + x] = t[row + Math.max(0, W - K - 1)];
  }
  for (x = 0; x < W; x++){                       /* vertical */
    s = 0;
    for (y = 0; y < H; y++){ s += t[y * W + x]; if (y >= k) s -= t[(y - k) * W + x]; out[Math.max(0, y - K) * W + x] = s / Math.min(k, y + 1); }
    for (y = Math.max(0, H - K); y < H; y++) out[y * W + x] = out[Math.max(0, H - K - 1) * W + x];
  }
  return out;
}
function minmax(m, W, H, K, isMax){            /* min/max séparable carré (2K+1) */
  var N = W * H, t = new Uint8Array(N), out = new Uint8Array(N), x, y, i, j, v;
  for (y = 0; y < H; y++) for (x = 0; x < W; x++){
    v = isMax ? 0 : 1;
    for (j = Math.max(0, x - K); j <= Math.min(W - 1, x + K); j++){ var q = m[y * W + j]; if (isMax ? q > v : q < v) v = q; }
    t[y * W + x] = v;
  }
  for (y = 0; y < H; y++) for (x = 0; x < W; x++){
    v = isMax ? 0 : 1;
    for (i = Math.max(0, y - K); i <= Math.min(H - 1, y + K); i++){ var q2 = t[i * W + x]; if (isMax ? q2 > v : q2 < v) v = q2; }
    out[y * W + x] = v;
  }
  return out;
}
function morphOuvrir(m, W, H, K){ return minmax(minmax(m, W, H, K, false), W, H, K, true); }
function morphFermer(m, W, H, K){ return minmax(minmax(m, W, H, K, true), W, H, K, false); }

/* composantes connexes 8-voisins ; rend {lab:Int32Array, n, stats:[{x0,y0,x1,y1,area}]} */
function composantes(m, W, H){
  var N = W * H, lab = new Int32Array(N), n = 0, stats = [null], pile = new Int32Array(N);
  for (var s0 = 0; s0 < N; s0++){
    if (!m[s0] || lab[s0]) continue;
    n++; var top = 0; pile[top++] = s0; lab[s0] = n;
    var st = { x0: W, y0: H, x1: 0, y1: 0, area: 0 };
    while (top){
      var p = pile[--top], x = p % W, y = (p - x) / W; st.area++;
      if (x < st.x0) st.x0 = x; if (x > st.x1) st.x1 = x; if (y < st.y0) st.y0 = y; if (y > st.y1) st.y1 = y;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++){
        var xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        var q = yy * W + xx; if (m[q] && !lab[q]){ lab[q] = n; pile[top++] = q; }
      }
    }
    stats.push(st);
  }
  return { lab: lab, n: n, stats: stats };
}
function composantesMin(m, W, H, aireMin){
  var c = composantes(m, W, H), keep = new Uint8Array(W * H), ok = new Uint8Array(c.n + 1);
  for (var i = 1; i <= c.n; i++) ok[i] = c.stats[i].area > aireMin ? 1 : 0;
  for (var p = 0; p < W * H; p++) keep[p] = ok[c.lab[p]];
  return keep;
}

/* ------------------------------------------------------------ 3. murs et ouvertures */
function runsLongs(m, W, H, L, horiz){        /* ouverture binaire par segment 1×L : on garde les runs ≥ L */
  var out = new Uint8Array(W * H), a, b;
  if (horiz){ for (var y = 0; y < H; y++){ a = 0; while (a < W){ if (!m[y * W + a]){ a++; continue; } b = a; while (b < W && m[y * W + b]) b++; if (b - a >= L) for (var x = a; x < b; x++) out[y * W + x] = 1; a = b; } } }
  else { for (var x2 = 0; x2 < W; x2++){ a = 0; while (a < H){ if (!m[a * W + x2]){ a++; continue; } b = a; while (b < H && m[b * W + x2]) b++; if (b - a >= L) for (var yy = a; yy < b; yy++) out[yy * W + x2] = 1; a = b; } } }
  return out;
}
function bandes(bin, W, H, dir){
  var c = composantes(bin, W, H), out = [];
  for (var i = 1; i <= c.n; i++){ var s = c.stats[i];
    if (dir === 'h') out.push({ dir: 'h', s0: s.x0, s1: s.x1 + 1, c: (s.y0 + s.y1 + 1) / 2, t: s.y1 - s.y0 + 1 });
    else             out.push({ dir: 'v', s0: s.y0, s1: s.y1 + 1, c: (s.x0 + s.x1 + 1) / 2, t: s.x1 - s.x0 + 1 });
  }
  return out;
}
function fusion(bs){
  bs.sort(function(a, b){ return a.c - b.c; }); var lignes = [];
  bs.forEach(function(b){
    for (var i = 0; i < lignes.length; i++){ var L = lignes[i];
      if (Math.abs(L.c - b.c) < Math.max(L.t, b.t) * 0.6 && !L.parts.some(function(p){ return !(b.s1 < p[0] - 1 || b.s0 > p[1] + 1); })){
        var w = b.s1 - b.s0; L.c = (L.c * L.w + b.c * w) / (L.w + w); L.w += w; L.t = Math.max(L.t, b.t); L.parts.push([b.s0, b.s1]); return; }
    }
    lignes.push({ dir: b.dir, c: b.c, t: b.t, w: b.s1 - b.s0, parts: [[b.s0, b.s1]] });
  });
  lignes.forEach(function(L){ L.parts.sort(function(a, b){ return a[0] - b[0]; }); });
  return lignes;
}
function mursEtOuvertures(mask, W, H, mmpx){
  var L = Math.round(1000 / mmpx), G = Math.round(3000 / mmpx), murs = [], ouv = [];
  var lignes = fusion(bandes(runsLongs(mask, W, H, L, true), W, H, 'h')).concat(fusion(bandes(runsLongs(mask, W, H, L, false), W, H, 'v')));
  lignes.forEach(function(Lg){ var p = Lg.parts;
    for (var i = 0; i + 1 < p.length; i++) if (p[i + 1][0] - p[i][1] < G) ouv.push({ dir: Lg.dir, c: Lg.c, s0: p[i][1], s1: p[i + 1][0], t: Lg.t });
    murs.push({ dir: Lg.dir, c: Lg.c, s0: p[0][0], s1: p[p.length - 1][1], t: Lg.t });
  });
  /* traits fins et courts (marches, mobilier) : pas des murs */
  murs = murs.filter(function(w){ return !(w.t * mmpx < 120 && (w.s1 - w.s0) * mmpx < 1500); });
  ouv = ouv.filter(function(o){ return o.t * mmpx >= 120 || (o.s1 - o.s0) * mmpx >= 1500; });
  return { murs: murs, ouv: ouv };
}
function rect(m, W, H, x0, y0, x1, y1, v){
  x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
  for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) m[y * W + x] = v;
}
function rasterMurs(murs, W, H){
  var m = new Uint8Array(W * H);
  murs.forEach(function(w){ var t = w.t | 0;
    if (w.dir === 'h') rect(m, W, H, w.s0, w.c - t / 2, w.s1, w.c + t / 2, 1); else rect(m, W, H, w.c - t / 2, w.s0, w.c + t / 2, w.s1, 1); });
  return m;
}

/* ------------------------------------------------------------ 4. pièces et enveloppe */
function piecesEtEnveloppe(img, W, H, murs, mmpx){
  var wm = rasterMurs(murs, W, H), inv = new Uint8Array(W * H), i;
  for (i = 0; i < W * H; i++) inv[i] = wm[i] ? 0 : 1;
  var c = composantes(inv, W, H), ext = new Uint8Array(c.n + 1);
  for (i = 0; i < W; i++){ ext[c.lab[i]] = 1; ext[c.lab[(H - 1) * W + i]] = 1; }
  for (i = 0; i < H; i++){ ext[c.lab[i * W]] = 1; ext[c.lab[i * W + W - 1]] = 1; }
  var pieces = [], okP = new Uint8Array(c.n + 1), som = {};
  for (i = 1; i <= c.n; i++){ var s = c.stats[i], a = s.area * mmpx * mmpx / 1e6; if (ext[i] || a < 1.5) continue; okP[i] = 1;
    pieces.push({ id: i, aire_m2: Math.round(a * 10) / 10, bbox: [s.x0, s.y0, s.x1 - s.x0 + 1, s.y1 - s.y0 + 1], rgb: [0, 0, 0], n: 0 }); som[i] = pieces[pieces.length - 1]; }
  var d = img.data;
  for (i = 0; i < W * H; i++){ var l = c.lab[i]; if (okP[l]){ var P = som[l]; P.rgb[0] += d[i * 4]; P.rgb[1] += d[i * 4 + 1]; P.rgb[2] += d[i * 4 + 2]; P.n++; } }
  pieces.forEach(function(P){ P.rgb = P.rgb.map(function(v){ return Math.round(v / Math.max(1, P.n)); }); delete P.n; });
  var env = new Uint8Array(W * H);
  for (i = 0; i < W * H; i++) env[i] = (wm[i] || okP[c.lab[i]]) ? 1 : 0;
  env = morphFermer(env, W, H, 7);
  var ce = composantes(env, W, H), big = 1;
  if (!ce.n) throw new Error("aucun mur trouvé : pas de poché gris uniforme sur ce plan, ou échelle fausse");
  for (i = 2; i <= ce.n; i++) if (ce.stats[i].area > ce.stats[big].area) big = i;
  var contour = tracer(ce.lab, W, H, big, ce.stats[big]);
  var poly = rectilineariser(douglasPeucker(contour, 300 / mmpx), 300 / mmpx);
  return { pieces: pieces, env: poly, lab: c.lab, okP: okP };
}
/* suivi de contour extérieur (Moore, 8-voisins) d'une composante */
function tracer(lab, W, H, id, st){
  var x = st.x0, y = st.y0; while (lab[y * W + x] !== id) x++;   /* premier pixel de la ligne haute */
  var dirs = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]], pts = [[x, y]], sx = x, sy = y, d = 6, n = 0, maxN = 4 * (W + H) * 4;
  while (n++ < maxN){
    var trouve = false;
    for (var k = 0; k < 8; k++){ var dd = (d + 5 + k) % 8, nx = x + dirs[dd][0], ny = y + dirs[dd][1];
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && lab[ny * W + nx] === id){ x = nx; y = ny; d = dd; trouve = true; break; } }
    if (!trouve) break;
    if (x === sx && y === sy) break;
    pts.push([x, y]);
  }
  return pts;
}
function douglasPeucker(pts, eps){
  if (pts.length < 3) return pts.slice();
  var keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; var pile = [[0, pts.length - 1]];
  while (pile.length){ var seg = pile.pop(), a = seg[0], b = seg[1], A = pts[a], B = pts[b], dmax = 0, im = -1;
    var dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
    for (var i = a + 1; i < b; i++){ var P = pts[i], dist = L > 1 ? Math.abs(dy * P[0] - dx * P[1] + B[0] * A[1] - B[1] * A[0]) / L : Math.hypot(P[0] - A[0], P[1] - A[1]); if (dist > dmax){ dmax = dist; im = i; } }
    if (dmax > eps){ keep[im] = 1; pile.push([a, im]); pile.push([im, b]); } }
  var out = []; for (var j = 0; j < pts.length; j++) if (keep[j]) out.push(pts[j].slice());
  if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  return out;
}
function rectilineariser(poly, epsJog){
  var P = poly.map(function(p){ return [p[0], p[1]]; }), chg = true, n, i;
  /* 1. orientation de chaque arête par son axe dominant ; deux arêtes consécutives de même
        orientation n'ont pas d'angle entre elles : le sommet saute (les orientations alternent ensuite) */
  while (chg && P.length > 4){ chg = false; n = P.length;
    for (i = 0; i < n; i++){ var a = P[(i + n - 1) % n], b = P[i], c = P[(i + 1) % n];
      var h0 = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]), h1 = Math.abs(c[0] - b[0]) >= Math.abs(c[1] - b[1]);
      if (h0 === h1){ P.splice(i, 1); chg = true; break; } } }
  /* 2. projection : une arête horizontale prend le y moyen de ses bouts, une verticale le x moyen ;
        comme les orientations alternent, chaque sommet reçoit un y et un x, sans conflit */
  n = P.length;
  for (i = 0; i < n; i++){ var p = P[i], q = P[(i + 1) % n];
    if (Math.abs(q[0] - p[0]) >= Math.abs(q[1] - p[1])){ var y = (p[1] + q[1]) / 2; p[1] = y; q[1] = y; }
    else { var x = (p[0] + q[0]) / 2; p[0] = x; q[0] = x; } }
  return degommer(P, epsJog || 0);
}
/* un décrochement plus court que eps entre deux arêtes parallèles = tremblement du trait :
   on aligne les deux arêtes longues et on supprime le jog */
function degommer(P, eps){
  var chg = true, n;
  while (chg && P.length > 4){ chg = false; n = P.length;
    for (var i = 0; i < n; i++){ var a = P[i], b = P[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L >= eps || L === 0) continue;
      var p0 = P[(i + n - 1) % n], p3 = P[(i + 2) % n], vert = Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1]);
      if (vert){ var y = (a[1] + b[1]) / 2; p0[1] = y; p3[1] = y; } else { var x = (a[0] + b[0]) / 2; p0[0] = x; p3[0] = x; }
      if (i === n - 1){ P.pop(); P.shift(); } else P.splice(i, 2);
      chg = true; break; }
  }
  return P;
}

/* ------------------------------------------------------------ 5. export en mètres */
function exporter(W, H, mmpx, murs, ouv, pieces, env){
  var ox = Math.min.apply(null, env.map(function(p){ return p[0]; })), oy = Math.max.apply(null, env.map(function(p){ return p[1]; }));
  var M = function(x, y){ return [Math.round((x - ox) * mmpx) / 1000, Math.round((oy - y) * mmpx) / 1000]; };
  var seg = function(w){ return w.dir === 'h' ? [M(w.s0, w.c), M(w.s1, w.c)] : [M(w.c, w.s0), M(w.c, w.s1)]; };
  var aretes = env.map(function(p, i){ return [p, env[(i + 1) % env.length]]; });
  function surEnv(w){ var rec = 800 / mmpx;
    for (var i = 0; i < aretes.length; i++){ var a = aretes[i][0], b = aretes[i][1];
      if (w.dir === 'h' && Math.abs(a[1] - b[1]) < 2 && Math.abs(a[1] - w.c) < w.t && Math.min(w.s1, Math.max(a[0], b[0])) - Math.max(w.s0, Math.min(a[0], b[0])) > rec) return true;
      if (w.dir === 'v' && Math.abs(a[0] - b[0]) < 2 && Math.abs(a[0] - w.c) < w.t && Math.min(w.s1, Math.max(a[1], b[1])) - Math.max(w.s0, Math.min(a[1], b[1])) > rec) return true; }
    return false; }
  function partsInt(w){ var iv = [], libre = [[w.s0, w.s1]];
    aretes.forEach(function(ar){ var a = ar[0], b = ar[1];
      if (w.dir === 'h' && Math.abs(a[1] - b[1]) < 2 && Math.abs(a[1] - w.c) < w.t) iv.push([Math.min(a[0], b[0]) - w.t, Math.max(a[0], b[0]) + w.t]);
      if (w.dir === 'v' && Math.abs(a[0] - b[0]) < 2 && Math.abs(a[0] - w.c) < w.t) iv.push([Math.min(a[1], b[1]) - w.t, Math.max(a[1], b[1]) + w.t]); });
    iv.forEach(function(I){ var nx = []; libre.forEach(function(Lb){ if (I[1] <= Lb[0] || I[0] >= Lb[1]){ nx.push(Lb); return; } if (Lb[0] < I[0]) nx.push([Lb[0], I[0]]); if (I[1] < Lb[1]) nx.push([I[1], Lb[1]]); }); libre = nx; });
    return libre.filter(function(Lb){ return (Lb[1] - Lb[0]) * mmpx > 800; }).map(function(Lb){ return { dir: w.dir, c: w.c, t: w.t, s0: Lb[0] | 0, s1: Lb[1] | 0 }; }); }
  var out = [];
  murs.forEach(function(w){ var fa = surEnv(w), s = seg(w); out.push({ a: s[0], b: s[1], epaisseur: Math.round(w.t * mmpx / 10) / 100, facade: fa });
    if (fa) partsInt(w).forEach(function(p){ var q = seg(p); out.push({ a: q[0], b: q[1], epaisseur: Math.round(p.t * mmpx / 10) / 100, facade: false, interieur: true }); }); });
  return {
    source: { largeur_px: W, hauteur_px: H, mm_par_px: mmpx, origine_px: [ox, oy] },
    enveloppe: env.map(function(p){ return M(p[0], p[1]); }),
    murs: out,
    ouvertures: ouv.map(function(o){ var s = seg(o); return { a: s[0], b: s[1], largeur: Math.round((o.s1 - o.s0) * mmpx / 10) / 100, type: surEnv(o) ? 'fenetre' : 'porte' }; }),
    pieces: pieces.map(function(p){ return { id: p.id, aire_m2: p.aire_m2, sol_rgb: p.rgb, centre: M(p.bbox[0] + p.bbox[2] / 2, p.bbox[1] + p.bbox[3] / 2) }; })
  };
}

/* ------------------------------------------------------------ 6. tout enchaîner */
function extraire(src, mmpx, opts){
  if (src && src.getContext) src = source(src);
  var W = src.W, H = src.H, img = src.img;
  var mask = masquePoche(img, W, H, opts);
  var mo = mursEtOuvertures(mask, W, H, mmpx);
  var pe = piecesEtEnveloppe(img, W, H, mo.murs, mmpx);
  var plan = exporter(W, H, mmpx, mo.murs, mo.ouv, pe.pieces, pe.env);
  return { plan: plan, mask: mask, murs: mo.murs, ouv: mo.ouv, env: pe.env, pieces: pe.pieces, lab: pe.lab, okP: pe.okP, W: W, H: H };
}
/* image de contrôle : pièces teintées, murs rouges, ouvertures cyan, enveloppe noire */
function controle(src, R){
  var W = R.W, H = R.H, c = document.createElement('canvas'); c.width = W; c.height = H;
  var ctx = c.getContext('2d');
  var img = new ImageData(new Uint8ClampedArray(src.img.data), W, H), d = img.data, cols = {}, seed = 7;
  for (var i = 0; i < W * H; i++){ var l = R.lab[i]; if (!R.okP[l]) continue;
    if (!cols[l]){ seed = (seed * 9301 + 49297) % 233280; cols[l] = [90 + (seed % 140), 90 + ((seed >> 3) % 140), 90 + ((seed >> 6) % 140)]; }
    d[i * 4] = (d[i * 4] + cols[l][0]) >> 1; d[i * 4 + 1] = (d[i * 4 + 1] + cols[l][1]) >> 1; d[i * 4 + 2] = (d[i * 4 + 2] + cols[l][2]) >> 1; }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(230,30,30,0.85)';
  R.murs.forEach(function(w){ var t = w.t; if (w.dir === 'h') ctx.fillRect(w.s0, w.c - t / 2, w.s1 - w.s0, t); else ctx.fillRect(w.c - t / 2, w.s0, t, w.s1 - w.s0); });
  ctx.fillStyle = 'rgba(0,200,255,0.95)';
  R.ouv.forEach(function(o){ var t = o.t; if (o.dir === 'h') ctx.fillRect(o.s0, o.c - t / 2, o.s1 - o.s0, t); else ctx.fillRect(o.c - t / 2, o.s0, t, o.s1 - o.s0); });
  ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(3, W / 500); ctx.beginPath();
  R.env.forEach(function(p, i){ if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.stroke();
  return c;
}

/* ------------------------------------------------------------ 7. import dans BPO (PIM) */
function importer(plan, opts){
  opts = opts || {};
  var Hc = opts.hauteur || 350;
  var xs = plan.enveloppe.map(function(p){ return p[0]; }), ys = plan.enveloppe.map(function(p){ return p[1]; });
  var cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, cy = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
  var X = function(p){ return [p[0] - cx, -(p[1] - cy)]; };                 /* plan Y vers le haut → BPO [x,z], z− = nord */
  var cm = function(v){ return Math.round(v * 100); };
  var str = function(pts){ return pts.map(function(p){ return cm(p[0]) + ',' + cm(p[1]); }).join(' '); };
  var mid = function(o){ return X([(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2]); };
  var env = plan.enveloppe.map(X), A = 0;
  for (var i = 0; i < env.length; i++){ var a = env[i], b = env[(i + 1) % env.length]; A += a[0] * b[1] - b[0] * a[1]; }
  if (A < 0) env.reverse();                                                 /* même sens que outlinePoly('rect') */
  if (typeof selectCat === 'function'){ try { selectCat('immeuble'); } catch (e) {} }
  PIM.shape = 'libre'; PIM.verts = str(env); PIM.bulges = [];
  PIM.nFloors = 1; PIM.heights = [Hc];
  if (opts.toit) PIM.toit = opts.toit;
  var fac = opts.facade || 'mur'; PIM.facN = PIM.facS = PIM.facE = PIM.facO = fac;
  PIM.partitions = []; PIM.imOpenings = []; PIM.tremies = []; PIM.terrasses = [];
  PIM.wallCfg = {}; PIM.dalleCfg = {};
  plan.murs.forEach(function(m){ if (m.facade) return; var t = Math.round(m.epaisseur * 100);
    PIM.partitions.push({ floor: 0, verts: str([X(m.a), X(m.b)]), type: t >= 20 ? 'refend' : (t >= 10 ? 'brique' : 'placo'), thick: t, height: 0, doors: [] }); });
  var nPortes = 0;
  plan.ouvertures.forEach(function(o){ if (o.type !== 'porte') return; var c = mid(o), best = null;
    PIM.partitions.forEach(function(pt){ var v = pt.verts.split(' ').map(function(s){ var q = s.split(','); return [q[0] / 100, q[1] / 100]; });
      var a = v[0], b = v[1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; if (!L2) return;
      var s = ((c[0] - a[0]) * dx + (c[1] - a[1]) * dz) / L2; if (s < 0 || s > 1) return;
      var d = Math.hypot(c[0] - (a[0] + s * dx), c[1] - (a[1] + s * dz)); if (!best || d < best.d) best = { d: d, s: s, pt: pt }; });
    if (!best || best.d > 0.6) return;
    best.pt.doors.push({ s: 0, t: best.s, w: Math.round(o.largeur * 100), hinge: 0, swing: 0, open: 80 }); nPortes++; });
  build();                                                                  /* IM_EDGES reconstruites */
  var cat = (typeof IM_MENUIS !== 'undefined') ? IM_MENUIS : [];
  var PF = cat.filter(function(m){ return m.id === 'm-pf'; })[0] || { kind: 'fenetre', l: 'Porte-fenêtre', w: 140, h: 215, sill: 0, pov: { type: 'battant', nv: 2 } };
  var nOuv = 0, perdues = 0;
  plan.ouvertures.forEach(function(o){ if (o.type !== 'fenetre') return; var c = mid(o), best = null;
    IM_EDGES.forEach(function(ed){ if ((ed.floor | 0) !== 1) return;
      var ax = ed.a[0], az = ed.a[1], dx = ed.b[0] - ax, dz = ed.b[1] - az, L2 = dx * dx + dz * dz; if (!L2) return;
      var s = ((c[0] - ax) * dx + (c[1] - az) * dz) / L2; if (s < 0 || s > 1) return;
      var d = Math.hypot(c[0] - (ax + s * dx), c[1] - (az + s * dz)); if (!best || d < best.d) best = { d: d, s: s, ed: ed }; });
    if (!best || best.d > 1.0){ perdues++; return; }
    var cfg = (typeof imMenuisCfg === 'function') ? imMenuisCfg(PF) : { id: '', mode: 'fenetre', name: PF.l, preset: PF, params: null };
    var op = { kind: 'fenetre', cfgId: '', fac: best.ed.o, floor: best.ed.floor | 0, seg: best.ed.seg || 0, pos: Math.round(best.s * 1000) / 10, sill: 0, off: 0, flip: 0 };
    if (typeof imOpPreset === 'function') imOpPreset(op, cfg); else { op.bayW = PF.w; op.bayH = PF.h; op.pov = PF.pov; }
    op.bayW = Math.round(o.largeur * 100);
    PIM.imOpenings.push(op); nOuv++; });
  build();
  if (typeof refreshView === 'function'){ try { refreshView(); } catch (e) {} }
  return { sommets: env.length, cloisons: PIM.partitions.length, portes: nPortes, menuiseries: nOuv, perdues: perdues, centre: [cx, cy] };
}


/* ------------------------------------------------------------ 8. fond de plan calibré */
/* pose le scan sous le plan, à l'échelle, centré comme le bâtiment importé (IMG_UL = m/px, repère monde) */
function poserFond(S, plan, rep, nom){
  if (typeof IMG_UL === 'undefined') return false;
  var c = document.createElement('canvas'); c.width = S.W; c.height = S.H;
  c.getContext('2d').putImageData(S.img, 0, 0);
  var sc = plan.source.mm_par_px / 1000, ox = plan.source.origine_px[0], oy = plan.source.origine_px[1];
  IMG_UL.img = c; IMG_UL.w = S.W; IMG_UL.h = S.H; IMG_UL.name = nom || 'plan';
  IMG_UL.on = true; IMG_UL.rot = 0; IMG_UL.dpi = 0; IMG_UL.ech = 0; IMG_UL.cal = 1; IMG_UL.scale = sc;
  IMG_UL.x = (S.W / 2 - ox) * sc - rep.centre[0];
  IMG_UL.z = (S.H / 2 - oy) * sc + rep.centre[1];
  try { imgBuildTex(); } catch (e) {}
  try { imgPersistImage(); imgPersist(); } catch (e) {}
  return true;
}

/* ------------------------------------------------------------ 9. fenêtre « Importer un plan scanné » */
var UI = null, ETAT = { S: null, nom: '', R: null, mmpx: 0 };
function el(tag, css, txt){ var e = document.createElement(tag); if (css) e.style.cssText = css; if (txt != null) e.textContent = txt; return e; }
function ouvrir(){
  if (UI){ UI.style.display = ''; return; }
  var ov = el('div', 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:inherit;');
  var box = el('div', 'background:var(--pn,#20242c);color:var(--tx,#e8e9ec);border:1px solid var(--ln,#343a45);border-radius:10px;width:min(1180px,96vw);height:min(760px,92vh);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5);');
  var hd = el('div', 'display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--ln,#343a45);');
  var ttl = el('div', 'font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--am,#ff8a3d);flex:1;'); ttl.textContent = 'Importer un plan scanné'; hd.appendChild(ttl);
  var bx = el('button', 'background:transparent;border:0;color:var(--dm,#8b92a0);font-size:18px;cursor:pointer;', '×'); bx.title = 'Fermer'; bx.onclick = fermer; hd.appendChild(bx);
  box.appendChild(hd);
  var body = el('div', 'display:flex;flex:1;min-height:0;');
  /* aperçu */
  var left = el('div', 'flex:1;min-width:0;background:#15171c;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;');
  var cv = document.createElement('canvas'); cv.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;'; left.appendChild(cv);
  var vide = el('div', 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--dm,#8b92a0);font-size:12px;text-align:center;padding:30px;pointer-events:none;');
  vide.textContent = 'Dépose ici un plan scanné (JPG, PNG ou PDF) : les murs pochés en gris deviennent le contour et les cloisons, les interruptions du poché deviennent les portes-fenêtres.'; left.appendChild(vide);
  body.appendChild(left);
  /* commandes */
  var right = el('div', 'width:290px;flex:none;padding:12px 14px;overflow:auto;font-size:11px;display:flex;flex-direction:column;gap:8px;border-left:1px solid var(--ln,#343a45);');
  function lab(t){ var d = el('div', 'font-size:9px;letter-spacing:.04em;text-transform:uppercase;color:var(--dm,#8b92a0);margin-top:4px;'); d.textContent = t; return d; }
  function btn(t, prim){ var b = el('button', prim ? 'font-size:11px;padding:7px 11px;border-radius:6px;cursor:pointer;color:#151515;background:var(--am,#ff8a3d);border:1px solid var(--am,#ff8a3d);font-weight:600;width:100%;'
                                              : 'font-size:11px;padding:6px 10px;border-radius:6px;cursor:pointer;color:var(--tx,#e8e9ec);background:transparent;border:1px solid var(--dm,#8b92a0);opacity:.9;width:100%;'); b.textContent = t; return b; }
  var bFile = btn('Choisir un fichier…'); right.appendChild(bFile);
  var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,.pdf'; inp.style.display = 'none'; right.appendChild(inp);
  bFile.onclick = function(){ inp.click(); }; inp.onchange = function(){ if (inp.files && inp.files[0]) chargerFichier(inp.files[0]); };
  var nomF = el('div', 'font-size:10px;color:var(--dm,#8b92a0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', ''); right.appendChild(nomF);
  right.appendChild(lab('Feuille et échelle'));
  var r1 = el('div', 'display:flex;align-items:center;gap:5px;');
  var selF = document.createElement('select'); selF.style.fontSize = '11px';
  [['A4', 'A4'], ['A3', 'A3'], ['A2', 'A2'], ['A1', 'A1'], ['A0', 'A0'], ['pdf', 'Page PDF'], ['mm', 'Largeur en mm']].forEach(function(o){ var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; selF.appendChild(op); });
  selF.value = 'A3'; r1.appendChild(selF);
  var inMm = document.createElement('input'); inMm.type = 'number'; inMm.min = '50'; inMm.max = '5000'; inMm.step = '1'; inMm.value = '420'; inMm.style.cssText = 'width:64px;font-size:11px;'; inMm.title = 'Largeur du papier scanné, en mm'; r1.appendChild(inMm);
  var mmU = el('span', 'color:var(--dm,#8b92a0)', 'mm'); r1.appendChild(mmU); right.appendChild(r1);
  var r2 = el('div', 'display:flex;align-items:center;gap:5px;');
  r2.appendChild(el('span', 'color:var(--dm,#8b92a0)', 'Échelle 1 :'));
  var inE = document.createElement('input'); inE.type = 'number'; inE.min = '1'; inE.max = '2000'; inE.step = '1'; inE.value = '100'; inE.style.cssText = 'width:64px;font-size:11px;'; r2.appendChild(inE);
  right.appendChild(r2);
  var mmInfo = el('div', 'font-size:9.5px;color:var(--dm,#8b92a0);', ''); right.appendChild(mmInfo);
  right.appendChild(lab('Réglages'));
  var r3 = el('div', 'display:flex;align-items:center;gap:5px;');
  r3.appendChild(el('span', 'color:var(--dm,#8b92a0);flex:1', 'Sensibilité au poché'));
  var inS = document.createElement('input'); inS.type = 'range'; inS.min = '16'; inS.max = '40'; inS.step = '1'; inS.value = '26'; inS.style.width = '100px'; inS.title = 'Plus haut = accepte un gris moins uniforme (hachures, crayon) ; plus bas = ne garde que le poché franc'; r3.appendChild(inS);
  var sV = el('span', 'width:18px;text-align:right', '26'); r3.appendChild(sV); inS.oninput = function(){ sV.textContent = inS.value; };
  right.appendChild(r3);
  var r4 = el('div', 'display:flex;align-items:center;gap:5px;');
  r4.appendChild(el('span', 'color:var(--dm,#8b92a0);flex:1', "Hauteur d'étage"));
  var inH = document.createElement('input'); inH.type = 'number'; inH.min = '200'; inH.max = '800'; inH.step = '5'; inH.value = '300'; inH.style.cssText = 'width:64px;font-size:11px;'; r4.appendChild(inH); r4.appendChild(el('span', 'color:var(--dm,#8b92a0)', 'cm'));
  right.appendChild(r4);
  var r5 = el('label', 'display:flex;align-items:center;gap:6px;cursor:pointer;');
  var ckF = document.createElement('input'); ckF.type = 'checkbox'; ckF.checked = true; r5.appendChild(ckF); r5.appendChild(el('span', '', 'Poser le scan en fond de plan')); right.appendChild(r5);
  var bAna = btn('Analyser le plan'); bAna.disabled = true; right.appendChild(bAna);
  var res = el('div', 'font-size:10.5px;line-height:1.5;color:var(--tx,#e8e9ec);min-height:60px;'); right.appendChild(res);
  var note = el('div', 'font-size:9px;color:var(--dm,#8b92a0);line-height:1.4;');
  note.textContent = "Rouge = murs, cyan = ouvertures, noir = contour du bâtiment, couleurs = pièces. Deux murs parallèles proches peuvent fusionner ; une marche ou un meuble gris peut passer pour un mur court : retouche ensuite dans le plan d'étage."; right.appendChild(note);
  var sp = el('div', 'flex:1'); right.appendChild(sp);
  var bGo = btn('Créer le bâtiment', true); bGo.disabled = true; right.appendChild(bGo);
  body.appendChild(right); box.appendChild(body); ov.appendChild(box); document.body.appendChild(ov); UI = ov;
  /* glisser-déposer */
  ['dragenter', 'dragover'].forEach(function(evn){ left.addEventListener(evn, function(e){ e.preventDefault(); left.style.outline = '2px dashed var(--am,#ff8a3d)'; }); });
  ['dragleave', 'drop'].forEach(function(evn){ left.addEventListener(evn, function(e){ e.preventDefault(); left.style.outline = ''; }); });
  left.addEventListener('drop', function(e){ var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) chargerFichier(f); });
  ov.addEventListener('keydown', function(e){ if (e.key === 'Escape') fermer(); });

  function largeurMm(){
    var v = selF.value;
    if (v === 'pdf') return ETAT.S && ETAT.S.pdfLargeurMm || 0;
    if (v === 'mm') return parseFloat(inMm.value) || 0;
    return FORMATS[v];
  }
  function majMm(){ inMm.style.display = mmU.style.display = (selF.value === 'mm') ? '' : 'none';
    var L = largeurMm(), E = parseFloat(inE.value) || 0;
    if (ETAT.S && L > 0 && E > 0){ ETAT.mmpx = L / ETAT.S.W * E; mmInfo.textContent = (ETAT.mmpx / 10).toFixed(2) + ' cm réels par pixel — image ' + ETAT.S.W + ' × ' + ETAT.S.H + ' px'; }
    else { ETAT.mmpx = 0; mmInfo.textContent = ''; } }
  selF.onchange = majMm; inMm.oninput = majMm; inE.oninput = majMm; majMm();

  function montrer(canvas){ var k = Math.min(1, 1600 / canvas.width); cv.width = Math.round(canvas.width * k); cv.height = Math.round(canvas.height * k); cv.getContext('2d').drawImage(canvas, 0, 0, cv.width, cv.height); vide.style.display = 'none'; }
  function chargerFichier(f){
    res.textContent = 'Lecture…'; bGo.disabled = true; ETAT.R = null;
    charger(f).then(function(S){ ETAT.S = S; ETAT.nom = f.name;
      nomF.textContent = f.name;
      if (S.pdfLargeurMm){ selF.value = 'pdf'; }
      majMm();
      var c = document.createElement('canvas'); c.width = S.W; c.height = S.H; c.getContext('2d').putImageData(S.img, 0, 0); montrer(c);
      res.textContent = ''; bAna.disabled = false;
    }).catch(function(e){ res.textContent = 'Lecture impossible : ' + (e && e.message || e); });
  }
  bAna.onclick = function(){
    if (!ETAT.S) return; majMm();
    if (!(ETAT.mmpx > 0)){ res.textContent = "Indique la largeur de la feuille et l'échelle."; return; }
    res.textContent = 'Analyse…'; bAna.disabled = true;
    setTimeout(function(){
      try {
        var t0 = performance.now(), R = extraire(ETAT.S, ETAT.mmpx, { sdMax: parseInt(inS.value, 10) }); ETAT.R = R;
        montrer(controle(ETAT.S, R));
        var P = R.plan, A = 0; for (var i = 0; i < P.enveloppe.length; i++){ var a = P.enveloppe[i], b = P.enveloppe[(i + 1) % P.enveloppe.length]; A += a[0] * b[1] - b[0] * a[1]; }
        res.innerHTML = '';
        [['Contour', P.enveloppe.length + ' sommets, ' + Math.round(Math.abs(A) / 2) + ' m²'],
         ['Murs intérieurs', String(P.murs.filter(function(m){ return !m.facade; }).length)],
         ['Ouvertures', P.ouvertures.filter(function(o){ return o.type === 'fenetre'; }).length + ' en façade, ' + P.ouvertures.filter(function(o){ return o.type === 'porte'; }).length + ' intérieures'],
         ['Pièces', String(P.pieces.length)]].forEach(function(l){ var d = el('div'); d.appendChild(el('span', 'color:var(--dm,#8b92a0)', l[0])); d.appendChild(document.createTextNode(' : ')); d.appendChild(el('span', '', l[1])); res.appendChild(d); });
        res.appendChild(el('div', 'color:var(--dm,#8b92a0);font-size:9px', Math.round(performance.now() - t0) + ' ms'));
        bGo.disabled = false;
      } catch (e){ res.textContent = 'Analyse impossible : ' + (e && e.message || e); }
      bAna.disabled = false;
    }, 30);
  };
  bGo.onclick = function(){
    if (!ETAT.R) return;
    var rep = importer(ETAT.R.plan, { hauteur: parseInt(inH.value, 10) || 300 });
    if (ckF.checked) poserFond(ETAT.S, ETAT.R.plan, rep, ETAT.nom);
    if (typeof buildCatList === 'function'){ try { buildCatList(); } catch (e) {} }
    try { if (typeof LAYOUT !== 'undefined' && LAYOUT !== 'quad' && typeof SINGLEVIEW !== 'undefined' && SINGLEVIEW !== 'top'){ SINGLEVIEW = 'top'; LAYOUT = 'single'; } } catch (e) {}
    try { build(); } catch (e) {}
    if (typeof DIRTY !== 'undefined') DIRTY = true;
    if (typeof imgUiRefresh === 'function'){ try { imgUiRefresh(); } catch (e) {} }
    fermer();
    var msg = 'Plan importé : ' + rep.sommets + ' sommets, ' + rep.cloisons + ' cloisons, ' + rep.menuiseries + ' menuiseries de façade' + (rep.perdues ? ' (' + rep.perdues + ' non accrochée(s))' : '') + '.';
    if (typeof toast === 'function'){ try { toast(msg); return; } catch (e) {} }
    console.log(msg);
  };
}
function fermer(){ if (UI) UI.style.display = 'none'; }

window.BPO_P2B = { FORMATS: FORMATS, charger: charger, extraire: extraire, controle: controle, importer: importer, poserFond: poserFond, ouvrir: ouvrir, fermer: fermer,
  _: { masquePoche: masquePoche, mursEtOuvertures: mursEtOuvertures, piecesEtEnveloppe: piecesEtEnveloppe, composantes: composantes },
  mmpxDe: function(largeurMm, W, echelle){ return largeurMm / W * echelle; } };
})();
