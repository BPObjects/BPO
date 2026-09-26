/* ============================================================================
   BPO — CONFIGURATEUR TERRAIN (MNT depuis DXF de points cotés)
   ----------------------------------------------------------------------------
   Charge un DXF topo (altitudes écrites en MTEXT = points cotés), en extrait les
   cotes, et construit un Modèle Numérique de Terrain éditable :
     · maille (résolution grille), lissage, découpe au contour réel,
     · bande d'altitude (pour écarter profondeurs / fils d'eau),
     · rendu maillé coloré par altitude, posable en scène comme tout objet.
   100 % JS, sans CDN (fonctionne hors-ligne). Le maillage est poussé dans FC,
   donc rendu en logiciel ET WebGL comme les autres configurateurs.
   Exposé : window.BPO_terrain { PTERR, setDXF, buildFC, buildUI, hasData }.
   ============================================================================ */
(function () {
  var glob = window, doc = document;
  function tr(s){ return (typeof glob.tr === 'function') ? glob.tr(s) : s; }

  /* Paramètres du configurateur (objet paramétrique du mode 'terrain'). */
  var PTERR = {
    step: 3.0,        // maille de la grille (m)
    smooth: 1.0,      // lissage (0 = brut)
    cut: 12,          // distance de découpe au contour réel (m)
    bandMin: 18,      // altitude mini retenue (écarte profondeurs ~1-2 m)
    bandMax: 45,      // altitude maxi retenue
    exag: 1.0,        // exagération verticale
    colorByAlt: 1,    // 1 = dégradé d'altitude, 0 = matière unie (FINISH.terrain)
    absolute: 0,      // 1 = garde l'altitude ABSOLUE (base ~ z réel), 0 = base à 0
    drape: 0,         // 1 = drape les lignes du DXF (voiries/bâti) sur le terrain
    drapeLayers: null,// { nomCalque: 1 } couches drapées
    contours: 0,      // 1 = courbes de niveau sur le terrain
    contourInt: 0.5,  // équidistance des courbes (m)
    contourW: 20,     // épaisseur des courbes (cm)
    contourMaster: 5, // courbe maîtresse (plus épaisse) tous les N intervalles (0 = aucune)
    mesh: 0,          // 1 = afficher la maille (lignes de grille)
    thick: 0,         // épaisseur du socle (cm ; 0 = surface seule)
    thickFlat: 1,     // 1 = fond plat horizontal ; 0 = fond parallèle à la surface
    // ---- Terrain CRÉÉ (sans DXF) : plateforme d'une forme donnée ----
    src: 'dxf',       // 'dxf' (points cotés) | 'shape' (forme paramétrique)
    shape: 'rect',    // 'rect' | 'u' | 't' | 'libre'
    sw: 8000, sd: 6000,          // emprise L × P (cm)
    uArm: 2500, tArm: 2500,      // largeur des branches U / T (cm)
    sBase: 0,                    // altitude de base (cm)
    sverts: '-40,-30 40,-30 40,30 -40,30',  // polygone libre (m) "x,y x,y ..."
    ctrlN: 3,                    // points de contrôle du relief par côté (grille ctrlN×ctrlN)
    ctrlZ: null,                 // altitudes des points de contrôle (cm), longueur ctrlN²
    name: 'Terrain',
    plats: [],                   // plateformes plat / creux (14/09) : voir PLATEFORMES
    platShow: 1                  // contour des plateformes + pied de talus dessinés (14/09)
  };
  glob.PTERR = PTERR;

  var RAW = null;       // points bruts {x,y,z} en mètres (toutes cotes numériques)
  var RAWV = 0;         // version de RAW (clé du cache de grille naturelle)
  var NATC = null;      // grille naturelle en cache {key, res} — voir natGrid
  var POLYS = null;     // polylignes/lignes {layer, closed, pts:[[x,y]]} (drapé)
  var LAYERS = null;    // couches présentes [{layer,n}] triées
  var MESH = null;      // maillage en cache {V:[[x,y,z]], F:[[a,b,c],col], grid, dims, sig}
  var _name = '';
  var REG = false;      // grille régulière (relief IGN / SRTM) : ni filtre de creux ni bande d'altitude DXF
  var MINSTEP = 0.5;    // plancher de maille (grille régulière) : au-delà de 900 000 mailles le MNT disparaît sans un mot (tooBig)
  var SITE_LOCAL = null; // point d'implantation (adresse) en coordonnées du maillage {x est, y nord} — null pour un DXF
  var FZ = {};           // tampons d'édition des terrains figés en scène : pid -> paramètres (appliqués par rebakeFrozen)
  var RECOV = {};        // terrains figés d'avant les plateformes : relecture de leurs paramètres déjà lancée
  var BUSY = {};         // refabrication en cours par pid : le gizmo et « Appliquer » attendent (le tampon FZ est remplacé au retour)
  var MAP = null;       // carte drapée {key, ext, cxFrac, cyFrac, dataURL, style} — repère du site, voir siteDemToTerrain

  /* ---- Parse DXF : points d'insertion MTEXT + valeur numérique (mm -> m) ---- */
  function parseDXFall(text) {
    var lines = text.split(/\r?\n/), n = lines.length;
    var sec = null, cur = null, rec = null, pts = [], plys = [];
    var numre = /^-?\d{1,4}\.\d{1,3}$/;
    function clean(s) { return s.replace(/\\[A-Za-z][^;]*;/g, '').replace(/\\P/g, ' ').replace(/[{}]/g, '').trim(); }
    function flushM() { if (cur === 'MTEXT' && rec) { var t = clean(rec.t).replace(',', '.'); if (numre.test(t) && rec.x != null && rec.y != null) { var z = parseFloat(t); if (z > 0 && z < 500) pts.push({ x: rec.x/1000, y: rec.y/1000, z: z }); } } }
    function flushP() { if ((cur === 'LWPOLYLINE' || cur === 'LINE') && rec && rec.v && rec.v.length >= 2) plys.push({ layer: rec.l, closed: rec.c, pts: rec.v }); }
    for (var k = 0; k + 1 < n; k += 2) {
      var c = lines[k].trim(), v = lines[k + 1];
      if (c === '2') { var vv = v.trim(); if (vv === 'HEADER' || vv === 'ENTITIES' || vv === 'BLOCKS' || vv === 'TABLES' || vv === 'OBJECTS' || vv === 'CLASSES') sec = vv; }
      if (sec !== 'ENTITIES') continue;
      if (c === '0') { flushM(); flushP(); cur = v.trim();
        rec = (cur === 'MTEXT') ? { x: null, y: null, t: '' } : ((cur === 'LWPOLYLINE' || cur === 'LINE') ? { l: '?', c: false, v: [], _px: null, _ax: null, _bx: null } : null);
      } else if (rec) {
        if (c === '8') rec.l = v.trim();
        else if (cur === 'MTEXT') { if (c === '10') { var f = parseFloat(v); if (!isNaN(f)) rec.x = f; } else if (c === '20') { var g = parseFloat(v); if (!isNaN(g)) rec.y = g; } else if (c === '1' || c === '3') rec.t += v; }
        else if (cur === 'LWPOLYLINE') { if (c === '70') rec.c = ((parseInt(v, 10) || 0) & 1) === 1; else if (c === '10') rec._px = parseFloat(v) / 1000; else if (c === '20') { var py = parseFloat(v) / 1000; if (rec._px != null && !isNaN(py)) rec.v.push([rec._px, py]); rec._px = null; } }
        else if (cur === 'LINE') { if (c === '10') rec._ax = parseFloat(v)/1000; else if (c === '20') rec._ay = parseFloat(v)/1000; else if (c === '11') rec._bx = parseFloat(v)/1000; else if (c === '21') { rec._by = parseFloat(v)/1000; if (rec._ax != null && rec._bx != null) rec.v = [[rec._ax, rec._ay], [rec._bx, rec._by]]; } }
      }
    }
    flushM(); flushP();
    return { points: pts, polys: plys };
  }

  function setDXF(text, name) {
    var r = parseDXFall(text); RAW = r.points; RAWV++; POLYS = r.polys; _name = name || ''; MESH = null; REG = false; MAP = null; SITE_LOCAL = null; if (+PTERR.colorByAlt === 2) PTERR.colorByAlt = 1;
    var lc = {}; for (var i = 0; i < POLYS.length; i++) { var l = POLYS[i].layer; lc[l] = (lc[l] || 0) + 1; }
    LAYERS = Object.keys(lc).map(function (l) { return { layer: l, n: lc[l] }; }).sort(function (a, b) { return b.n - a.n; });
    if (LAYERS.length && !PTERR.drapeLayers) { PTERR.drapeLayers = {}; PTERR.drapeLayers[LAYERS[0].layer] = 1; }
    return RAW.length;
  }
  function hasData() { return !!(RAW && RAW.length); }
  /* ---- Grille régulière d'altitudes (relief IGN / SRTM importé par Site / Géolocalisation, 12/09/2026) ----
     pts : [{x: m vers l'est, y: m vers le nord, z: m NGF}] ; step : pas de la grille (m). */
  function setGrid(pts, name, step, map) {
    RAW = pts; RAWV++; POLYS = []; LAYERS = []; _name = name || 'Relief'; MESH = null; REG = true; PTERR.src = 'dxf';
    MAP = (map && map.key) ? map : null; if (MAP) PTERR.colorByAlt = 2; else if (+PTERR.colorByAlt === 2) PTERR.colorByAlt = 1;   /* 2 = carte drapée */
    var zmin = Infinity, zmax = -Infinity; for (var i = 0; i < pts.length; i++) { var z = pts[i].z; if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
    PTERR.bandMin = Math.floor(zmin) - 1; PTERR.bandMax = Math.ceil(zmax) + 1;   /* la bande DXF (18–45 m par défaut) viderait un relief de montagne */
    if (step) { PTERR.step = Math.max(0.5, Math.round(step * 10) / 10); PTERR.cut = Math.max(PTERR.step * 3, 6); }
    var xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
    for (var q = 0; q < pts.length; q++) { var p = pts[q]; if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
    MINSTEP = Math.max(0.5, Math.ceil(Math.max(xmax - xmin, ymax - ymin) / 940 * 10) / 10);   /* 940² < 900 000 mailles */
    SITE_LOCAL = { x: -(xmin + xmax) / 2, y: -(ymin + ymax) / 2 };   /* l'adresse est en (0,0) des points ; le maillage est centré sur la grille */
    PTERR.smooth = 0; PTERR.drapeLayers = null;
    return RAW.length;
  }

  /* ---- Rampe d'altitude (vert bas -> jaune -> brun haut), comme une carte topo ---- */
  function altColor(t) { // t 0..1
    t = Math.max(0, Math.min(1, t));
    var stops = [[80,150,90],[150,175,90],[210,200,120],[170,130,86],[150,140,135]];
    var f = t * (stops.length - 1), i = Math.floor(f), a = stops[i], b = stops[Math.min(stops.length - 1, i + 1)], u = f - i;
    return [Math.round(a[0] + (b[0]-a[0])*u), Math.round(a[1] + (b[1]-a[1])*u), Math.round(a[2] + (b[2]-a[2])*u)];
  }

  /* UV d'un sommet [x, y, z] du maillage (repère centré sur (cx,cy) de la grille) dans le
     canevas de la carte : u ouest→est, v nord→sud (ligne 0 de l'image = nord). */
  function mapUV(v) { var g = MESH && MESH.grid; if (!(MAP && g)) return [0, 0];
    return [ (v[0] + (g.cx || 0)) / MAP.ext + MAP.cxFrac, (v[2] - (g.cy || 0)) / MAP.ext + MAP.cyFrac ]; }
  function mapOn() { return !!(+PTERR.colorByAlt === 2 && MAP && glob.TEX_IMAGES && glob.TEX_IMAGES[MAP.key]); }
  /* ============================================================================
     PLATEFORMES (14/09/2026, AL : « créer un plat ou un creux pour y mettre un projet,
     évaluer et conserver une trace des modifications et du volume de terrain modifié »).
     Une plateforme = {shape:'rect'|'cercle', x, y, w, d, r, rot, z, talus, on, name}
       x, y   : m dans le repère du maillage (x vers l'est, y vers le nord, origine = centre
                de la grille = origine de l'objet figé) ;
       z      : altitude visée, dans l'unité de la grille (NGF pour un relief IGN) ;
       talus  : H/V — 1,5 = pente 3/2 ; le sol rejoint le terrain naturel à cette pente ;
       rot    : degrés, positif dans le sens trigonométrique vu de dessus.
     Appliquée sur la grille NATURELLE (g.GZN), dans l'ordre de la liste : la liste EST la
     trace. Volumes : déblai = terrain enlevé, remblai = terrain apporté, par maille
     (pas²) ; net = remblai − déblai (positif = apport).
     ============================================================================ */
  function platDist(p, u, v) {   /* distance signée au bord de la plateforme, dans son repère (≤ 0 = dedans) */
    if (p.shape === 'cercle') return Math.hypot(u, v) - Math.max(0.1, +p.r || 5);
    var hx = Math.max(0.1, +p.w || 10) / 2, hy = Math.max(0.1, +p.d || 10) / 2, ex = Math.abs(u) - hx, ey = Math.abs(v) - hy;
    if (ex <= 0 && ey <= 0) return Math.max(ex, ey);
    return Math.hypot(Math.max(ex, 0), Math.max(ey, 0));
  }
  function platApply(g, plats) {
    if (!g.GZN) g.GZN = new Float32Array(g.GZ); else g.GZ.set(g.GZN);
    var GZ = g.GZ, mask = g.mask, nx = g.nx, ny = g.ny, step = g.step, A = step * step, out = [], cut = 0, fill = 0;
    /* vex : exagération verticale cuite dans la grille d'un terrain figé — talus et volumes restent en mètres réels */
    var vex = +g.vex || 1, zminN = Infinity, zmaxN = -Infinity; for (var q = 0; q < GZ.length; q++) if (mask[q] && GZ[q] === GZ[q]) { if (GZ[q] < zminN) zminN = GZ[q]; if (GZ[q] > zmaxN) zmaxN = GZ[q]; }
    (plats || []).forEach(function (p) {
      var res = { cut: 0, fill: 0, area: 0 };
      if (!p || p.on === 0) { out.push(res); return; }
      var a = (+p.rot || 0) * Math.PI / 180, cr = Math.cos(a), sr = Math.sin(a), tal = Math.max(0.1, +p.talus || 1.5), zt = +p.z || 0;
      var reach = tal * Math.max(Math.abs(zmaxN - zt), Math.abs(zt - zminN)) / vex + step;   /* au-delà, le talus a déjà rejoint le terrain naturel */
      for (var y = 0; y < ny; y++) for (var x = 0; x < nx; x++) {
        var id = y * nx + x; if (!mask[id]) continue;
        var wx = g.minX + x * step - (g.cx || 0) - (+p.x || 0), wy = g.minY + y * step - (g.cy || 0) - (+p.y || 0);
        var u = wx * cr + wy * sr, v = -wx * sr + wy * cr;
        var sd = platDist(p, u, v); if (sd > reach) continue;
        var zn = GZ[id], z;
        if (sd <= 0) { z = zt; res.area += A; }
        else { var dz = sd * vex / tal; z = (zn > zt) ? Math.min(zn, zt + dz) : Math.max(zn, zt - dz); }
        var d = z - zn; if (d < 0) res.cut -= d * A / vex; else res.fill += d * A / vex;
        GZ[id] = z;
      }
      out.push(res); cut += res.cut; fill += res.fill;
      if (zt < zminN) zminN = zt; if (zt > zmaxN) zmaxN = zt;   /* la plateforme suivante peut reprendre ce talus ou ce remblai : ses altitudes entrent dans les bornes de portée */
    });
    return { plats: out, cut: cut, fill: fill, net: fill - cut };
  }
  /* altitude NATURELLE de la grille au point (x est, y nord) du maillage — bilinéaire, null hors masque */
  function gridZAt(g, x, y, nat) {
    if (!g) return null;
    var Z = (nat && g.GZN) ? g.GZN : g.GZ, fx = (x + (g.cx || 0) - g.minX) / g.step, fy = (y + (g.cy || 0) - g.minY) / g.step;
    var ix = Math.floor(fx), iy = Math.floor(fy); if (ix < 0 || iy < 0 || ix >= g.nx - 1 || iy >= g.ny - 1) return null;
    var id = iy * g.nx + ix; if (!(g.mask[id] && g.mask[id + 1] && g.mask[id + g.nx] && g.mask[id + g.nx + 1])) return null;
    var tx = fx - ix, ty = fy - iy;
    return Z[id] * (1 - tx) * (1 - ty) + Z[id + 1] * tx * (1 - ty) + Z[id + g.nx] * (1 - tx) * ty + Z[id + g.nx + 1] * tx * ty;
  }
  function fmtVol(v) { v = Math.round(v || 0); return v.toLocaleString('fr-FR') + ' m³'; }
  function tr(s) { return (typeof glob.T === 'function') ? glob.T(s) : s; }
  /* TEXTE COMPOSÉ traduisible (15/09) : gabarit français {0} {1}… + valeurs, rendu par tplText (app.html) et retraduit
     par translateDOM. Sans valeurs : texte simple et gabarit RETIRÉ — sinon translateDOM remettrait l'ancien texte. */
  function tplSet(el, k, v) { if (v && typeof glob.tplText === 'function') return glob.tplText(el, k, v); if (el.removeAttribute) el.removeAttribute('data-tpl');
    el.textContent = v ? String(k).replace(/\{(\d+)\}/g, function (m, i) { return v[i] != null ? v[i] : m; }) : k; return el; }
  function platsVisible(plats) { return !!(plats && plats.some(function (p) { return p && p.on !== 0; })); }
  /* hauteur EXACTE de la surface maillée au point (wx, wy) [avant recentrage] : les deux triangles de
     chaque maille (a,b,c2 si fx ≥ fy, sinon a,c2,e) — même découpe que buildMesh / meshFromGrid.
     Une interpolation bilinéaire enterrait le trait sur le talus ou le faisait flotter. */
  function surfY(g, wx, wy) {
    var gx = (wx - g.minX) / g.step, gy = (wy - g.minY) / g.step, ix = Math.floor(gx), iy = Math.floor(gy);
    if (ix < 0 || iy < 0 || ix >= g.nx - 1 || iy >= g.ny - 1) return null;
    var id = iy * g.nx + ix, M = g.mask; if (!(M[id] && M[id + 1] && M[id + g.nx] && M[id + g.nx + 1])) return null;
    var fx = gx - ix, fy = gy - iy, Z = g.GZ, z00 = Z[id], z10 = Z[id + 1], z01 = Z[id + g.nx], z11 = Z[id + g.nx + 1];
    var z = (fx >= fy) ? (z00 + fx * (z10 - z00) + fy * (z11 - z10)) : (z00 + fy * (z01 - z00) + fx * (z11 - z01));
    return (g.zbase || 0) + (z - (g.z0 || 0)) * (+g.exag || 1);
  }
  /* nœud valide le plus proche de (x est, y nord) du maillage — altitude NATURELLE, unité de la grille */
  function gridSnap(g, x, y) {
    if (!g) return null; var best = null, bd = Infinity, Z = g.GZN || g.GZ, st = g.step;
    for (var iy = 0; iy < g.ny; iy++) for (var ix = 0; ix < g.nx; ix++) { var id = iy * g.nx + ix; if (!g.mask[id] || Z[id] !== Z[id]) continue;
      var wx = g.minX + ix * st - (g.cx || 0), wy = g.minY + iy * st - (g.cy || 0), d = (wx - x) * (wx - x) + (wy - y) * (wy - y);
      if (d < bd) { bd = d; best = { x: wx, y: wy, z: Z[id] }; } }
    return best;
  }
  /* RAYON × RELIEF (pointage, 15/09) — intersection EXACTE avec le maillage AFFICHÉ (g.GZ, mêmes deux triangles par maille
     que buildMesh / meshFromGrid / surfY). Repère du maillage : o, d = [e, Y affiché, n], t ≥ t0. Les mailles sont parcourues
     dans l'ordre du rayon (DDA) : le PREMIER triangle touché, donc jamais un point caché derrière une crête.
     null = ciel, hors grille, trous du masque. */
  function platRayGrid(g, o, d, t0) {
    if (!g || !g.GZ || !o || !d) return null;
    var nx = g.nx, ny = g.ny, st = g.step, M = g.mask, Z = g.GZ, zb = g.zbase || 0, z0 = g.z0 || 0, ex = +g.exag || 1;
    if (nx < 2 || ny < 2) return null;
    if (g._platYLo == null) { var lo = Infinity, hi = -Infinity; for (var q = 0; q < Z.length; q++) if ((!M || M[q]) && Z[q] === Z[q]) { var yq = zb + (Z[q] - z0) * ex; if (yq < lo) lo = yq; if (yq > hi) hi = yq; } g._platYLo = lo; g._platYHi = hi; }
    if (!(g._platYLo <= g._platYHi)) return null;
    var ax = (o[0] + (g.cx || 0) - g.minX) / st, ay = (o[2] + (g.cy || 0) - g.minY) / st, oy = o[1], ux = d[0] / st, uy = d[2] / st, uz = d[1];
    var ta = (t0 == null) ? 0 : t0, tb = Infinity;
    function slab(p, u, a, b) { if (Math.abs(u) < 1e-12) return p >= a && p <= b;
      var t1 = (a - p) / u, t2 = (b - p) / u; if (t1 > t2) { var tt = t1; t1 = t2; t2 = tt; }
      if (t1 > ta) ta = t1; if (t2 < tb) tb = t2; return ta <= tb; }
    if (!slab(ax, ux, 0, nx - 1) || !slab(ay, uy, 0, ny - 1) || !slab(oy, uz, g._platYLo - 1e-3, g._platYHi + 1e-3) || !isFinite(tb)) return null;
    function cell(ix, iy, tA, tB) {
      var id = iy * nx + ix; if (M && !(M[id] && M[id + 1] && M[id + nx] && M[id + nx + 1])) return null;
      var h00 = zb + (Z[id] - z0) * ex, h10 = zb + (Z[id + 1] - z0) * ex, h01 = zb + (Z[id + nx] - z0) * ex, h11 = zb + (Z[id + nx + 1] - z0) * ex;
      if (!(h00 === h00 && h10 === h10 && h01 === h01 && h11 === h11)) return null;
      var fx0 = ax - ix, fy0 = ay - iy, best = null, E = 1e-6;
      for (var s = 0; s < 2; s++) {   /* s=0 : fx ≥ fy, triangle (a, b, c2) ; s=1 : fx < fy, triangle (a, c2, e) */
        var A = s ? (h11 - h01) : (h10 - h00), Bc = s ? (h01 - h00) : (h11 - h10), den = uz - A * ux - Bc * uy;
        if (den > -1e-12) continue;   /* la surface n'est visée que PAR-DESSUS : paroi du socle, caméra sous le relief = pas un point visé */
        var th = (h00 + A * fx0 + Bc * fy0 - oy) / den; if (th < tA || th > tB) continue;
        var fx = fx0 + ux * th, fy = fy0 + uy * th;
        if (fx < -E || fy < -E || fx > 1 + E || fy > 1 + E || (s === 0 ? fx < fy - E : fx > fy + E)) continue;
        if (best == null || th < best) best = th;
      }
      return best;
    }
    var tc0 = ta, ix = Math.max(0, Math.min(nx - 2, Math.floor(ax + ux * tc0))), iy = Math.max(0, Math.min(ny - 2, Math.floor(ay + uy * tc0)));
    var sx = ux > 0 ? 1 : (ux < 0 ? -1 : 0), sy = uy > 0 ? 1 : (uy < 0 ? -1 : 0);
    var tmx = sx ? ((sx > 0 ? ix + 1 : ix) - ax) / ux : Infinity, tmy = sy ? ((sy > 0 ? iy + 1 : iy) - ay) / uy : Infinity;
    var tdx = sx ? Math.abs(1 / ux) : Infinity, tdy = sy ? Math.abs(1 / uy) : Infinity, tcur = ta;
    for (var k = 0, kmax = nx + ny + 4; k < kmax; k++) {
      var tc = Math.min(tmx, tmy, tb), h = cell(ix, iy, tcur - 1e-9, tc + 1e-9);
      if (h != null) return { t: h, e: o[0] + d[0] * h, Y: oy + uz * h, n: o[2] + d[2] * h };
      if (tc >= tb) break;
      tcur = tc; if (tmx <= tmy) { ix += sx; tmx += tdx; } else { iy += sy; tmy += tdy; }
      if (ix < 0 || iy < 0 || ix > nx - 2 || iy > ny - 2) break;
    }
    return null;
  }
  /* CONTOUR DES PLATEFORMES (14/09) : rubans drapés sur la surface MODIFIÉE —
     edge = bord de chaque plateforme active ; cut / fill = pied de talus, courbe |GZ − GZN| = 2 cm,
     classée déblai ou remblai par le nœud le plus modifié de la maille. {edge, cut, fill} de {V, F}. */
  function platGeo(g, plats) {
    var out = { edge: { V: [], F: [] }, cut: { V: [], F: [] }, fill: { V: [], F: [] } };
    if (!g || !g.GZ || !platsVisible(plats)) return out;
    var vex = +g.vex || 1, hw = Math.max(0.2, Math.min(0.6, g.step * 0.3)), sl = Math.min(g.step / 2, 0.6), cnt = 0, cap = 160000, cx = g.cx || 0, cy = g.cy || 0;
    /* ruban drapé : hauteur des 4 coins sur les triangles réels (null hors maillage : pas de trait dans le
       vide), puis relevé de l'écart mesuré en 5 points intérieurs — le quadrilatère est plan, la surface
       se plie dessous (talus, diagonales des mailles, exagération) */
    function ribbon(dst, ax, ay, bx, by) {
      if (cnt > cap) return; var dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy); if (L < 1e-6) return;
      var ox = dy / L * hw, oy = -dx / L * hw, P1 = [ax + ox, ay + oy], P2 = [ax - ox, ay - oy], P3 = [bx + ox, by + oy], P4 = [bx - ox, by - oy];
      var h1 = surfY(g, P1[0], P1[1]), h2 = surfY(g, P2[0], P2[1]), h3 = surfY(g, P3[0], P3[1]), h4 = surfY(g, P4[0], P4[1]);
      if (h1 == null || h2 == null || h3 == null || h4 == null) return;
      var lift = 0, SMP = [[0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5], [0.5, 0.5]];
      for (var k = 0; k < SMP.length; k++) { var s = SMP[k][0], w = SMP[k][1];
        var wx = (P1[0] * (1 - s) + P3[0] * s) * (1 - w) + (P2[0] * (1 - s) + P4[0] * s) * w, wy = (P1[1] * (1 - s) + P3[1] * s) * (1 - w) + (P2[1] * (1 - s) + P4[1] * s) * w;
        var hq = (h1 * (1 - s) + h3 * s) * (1 - w) + (h2 * (1 - s) + h4 * s) * w, hs = surfY(g, wx, wy); if (hs != null && hs - hq > lift) lift = hs - hq; }
      var e = 0.05 + lift, i0 = dst.V.length;
      dst.V.push([P1[0] - cx, h1 + e, -(P1[1] - cy)], [P2[0] - cx, h2 + e, -(P2[1] - cy)], [P3[0] - cx, h3 + e, -(P3[1] - cy)], [P4[0] - cx, h4 + e, -(P4[1] - cy)]);
      dst.F.push([i0, i0 + 2, i0 + 3]); dst.F.push([i0, i0 + 3, i0 + 1]); cnt += 2;
    }
    function polyline(dst, ax, ay, bx, by) { var m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / sl));
      for (var j = 0; j < m; j++) ribbon(dst, ax + (bx - ax) * j / m, ay + (by - ay) * j / m, ax + (bx - ax) * (j + 1) / m, ay + (by - ay) * (j + 1) / m); }
    var PA = [];
    plats.forEach(function (p) {
      if (!p || p.on === 0) return;
      var a = (+p.rot || 0) * Math.PI / 180, cr = Math.cos(a), sr = Math.sin(a), pts = [], k;
      var A0 = { p: p, c: cr, s: sr, ox: cx + (+p.x || 0), oy: cy + (+p.y || 0) }; PA.push(A0);
      if (p.shape === 'cercle') { var r = Math.max(0.1, +p.r || 5), n = Math.max(24, Math.min(128, Math.ceil(2 * Math.PI * r / sl))); for (k = 0; k < n; k++) { var th = k / n * 2 * Math.PI; pts.push([r * Math.cos(th), r * Math.sin(th)]); } }
      else { var hx = Math.max(0.1, +p.w || 10) / 2, hy = Math.max(0.1, +p.d || 10) / 2; pts = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]]; }
      for (k = 0; k < pts.length; k++) { var U = pts[k], V2 = pts[(k + 1) % pts.length];   /* inverse de la rotation de platApply */
        polyline(out.edge, A0.ox + U[0] * cr - U[1] * sr, A0.oy + U[0] * sr + U[1] * cr, A0.ox + V2[0] * cr - V2[1] * sr, A0.oy + V2[0] * sr + V2[1] * cr); }
    });
    function sdOf(A1, wx, wy) { var qx = wx - A1.ox, qy = wy - A1.oy; return platDist(A1.p, qx * A1.c + qy * A1.s, -qx * A1.s + qy * A1.c); }
    function inAny(wx, wy) { for (var i = 0; i < PA.length; i++) if (sdOf(PA[i], wx, wy) <= 0) return true; return false; }
    /* PIED DE TALUS, par plateforme : là où la pente du talus rejoint le terrain NATUREL,
       f = sd·vex/talus − |zn − zt| = 0 (sd : distance au bord, zn : terrain naturel, zt : altitude visée).
       f est continu et presque linéaire à travers le pied : l'interpolation suit la vraie courbe. Le
       contour de |GZ − GZN| à 2 cm collait aux nœuds (créneaux) et traçait aussi, À L'INTÉRIEUR de la
       plateforme, la ligne où le terrain naturel croise l'altitude visée. Chevauchements : le pied d'une
       plateforme recouverte par une autre est omis là où il tombe dans une emprise. */
    if (g.GZN && PA.length) {
      var nx = g.nx, ny = g.ny, N = g.GZN, M = g.mask, st = g.step, zminN = Infinity, zmaxN = -Infinity, q;
      for (q = 0; q < N.length; q++) if (M[q] && N[q] === N[q]) { if (N[q] < zminN) zminN = N[q]; if (N[q] > zmaxN) zmaxN = N[q]; }
      PA.forEach(function (A1) {
        var p = A1.p, tal = Math.max(0.1, +p.talus || 1.5), zt = +p.z || 0;
        var R0 = (p.shape === 'cercle') ? Math.max(0.1, +p.r || 5) : Math.hypot((+p.w || 10) / 2, (+p.d || 10) / 2);
        var reach = R0 + tal * Math.max(Math.abs(zmaxN - zt), Math.abs(zt - zminN)) / vex + 2 * st;
        var ix0 = Math.max(0, Math.floor((A1.ox - reach - g.minX) / st)), ix1 = Math.min(nx - 1, Math.ceil((A1.ox + reach - g.minX) / st));
        var iy0 = Math.max(0, Math.floor((A1.oy - reach - g.minY) / st)), iy1 = Math.min(ny - 1, Math.ceil((A1.oy + reach - g.minY) / st));
        var W = ix1 - ix0 + 1, Hh = iy1 - iy0 + 1; if (W < 2 || Hh < 2) return;
        var FF = new Float32Array(W * Hh), jx, jy;
        for (jy = 0; jy < Hh; jy++) for (jx = 0; jx < W; jx++) { var gx = ix0 + jx, gy = iy0 + jy, id = gy * nx + gx;
          FF[jy * W + jx] = (M[id] && N[id] === N[id]) ? (sdOf(A1, g.minX + gx * st, g.minY + gy * st) * vex / tal - Math.abs(N[id] - zt)) : NaN; }
        var cp = [], cross = function (fa, fb, xa, ya, xb, yb) { if ((fa < 0) !== (fb < 0)) { var tt = fa / ((fa - fb) || 1e-9); cp.push([xa + (xb - xa) * tt, ya + (yb - ya) * tt]); } };
        for (jy = 0; jy < Hh - 1 && cnt <= cap; jy++) for (jx = 0; jx < W - 1; jx++) {
          var f00 = FF[jy * W + jx], f10 = FF[jy * W + jx + 1], f01 = FF[(jy + 1) * W + jx], f11 = FF[(jy + 1) * W + jx + 1];
          if (!(f00 === f00 && f10 === f10 && f01 === f01 && f11 === f11)) continue;
          var ng = (f00 < 0); if (ng === (f10 < 0) && ng === (f01 < 0) && ng === (f11 < 0)) continue;
          var x0 = g.minX + (ix0 + jx) * st, y0 = g.minY + (iy0 + jy) * st, x1 = x0 + st, y1 = y0 + st; cp.length = 0;
          cross(f00, f10, x0, y0, x1, y0); cross(f10, f11, x1, y0, x1, y1); cross(f11, f01, x1, y1, x0, y1); cross(f01, f00, x0, y1, x0, y0);
          var segs = (cp.length === 2) ? [[cp[0], cp[1]]] : (cp.length === 4 ? [[cp[0], cp[1]], [cp[2], cp[3]]] : []);
          for (var sgi = 0; sgi < segs.length; sgi++) { var S0 = segs[sgi][0], S1 = segs[sgi][1], mx = (S0[0] + S1[0]) / 2, my = (S0[1] + S1[1]) / 2;
            if (sdOf(A1, mx, my) < 0.25 * st) continue;   /* pied confondu avec le bord (terrain déjà à l'altitude visée) : le trait orange suffit */
            if (inAny(mx, my)) continue;                  /* recouvert par une autre plateforme */
            var gid = (iy0 + jy) * nx + ix0 + jx, znat = (N[gid] + N[gid + 1] + N[gid + nx] + N[gid + nx + 1]) / 4;
            polyline((znat > zt) ? out.cut : out.fill, S0[0], S0[1], S1[0], S1[1]); }
        }
      });
    }
    return out;
  }
  var PLAT_COLS = { edge: [255, 138, 61], cut: [200, 70, 50], fill: [70, 120, 210] };
  function platFC(FC, g, plats) {
    var d = platGeo(g, plats);
    ['edge', 'cut', 'fill'].forEach(function (kk) { var G = d[kk], col = PLAT_COLS[kk];
      for (var f = 0; f < G.F.length; f++) { var t3 = G.F[f]; FC.push({ verts: [G.V[t3[0]], G.V[t3[1]], G.V[t3[2]]], n: [0, 1, 0], col: col, al: 1, tex: null }); } });
  }
  /* PROJET voisin en scène (14/09) : l'instance non-terrain la plus proche de (refX est, refY nord) du
     terrain inst, ramenée dans le repère de l'objet figé. scnModel : monde = R·local + T, et pour la seule
     rotation Y : wx = c·lx − s·lz, wz = s·lx + c·lz (même convention que scnBBox) ; est = lx, nord = −lz.
     Une rotation de scène θ vaut une rotation de plateforme −θ (sens trigo vu de dessus, nord en haut). */
  /* NIVEAU ±0 du projet, pas son point le plus bas : fondations, sous-sols, bassin de piscine restent
     enterrés sous la plateforme (même règle que l'emprise au sol de scnFootprint). Import : sa base. */
  function projWorldBase(o) { try { if (o.mode === 'fabprod') return glob.scnYbounds(o).mn + (o.y || 0) / 100; if (o.group) return glob.scnYbounds(o).mn; var fp = glob.scnFootprint(o); return (o.y || 0) / 100 + Math.max(0, fp ? fp.y0 : 0); } catch (e) { return (o.y || 0) / 100; } }
  /* PROJET LE PLUS PROCHE (15/09, AL : « la plateforme n'apparaît pas où j'ai cliqué ») — avant : n'importe quelle instance
     (arbre, personnage…), à n'importe quelle distance, boîte ENTIÈRE ; hors terrain la plateforme finissait au bord.
     Maintenant : jamais le décor ; le bâti (SCN_BATI_MODES, groupes) passe avant le reste ; onT(e, n) écarte ce qui n'est
     pas SUR le terrain ; centre et taille sur l'emprise AU SOL (gx*), comme l'exclusion d'herbe. */
  var PN_DECOR = { arbre: 1, personnage: 1, humain: 1, vegetation: 1 };
  function projectNear(inst, refX, refY, onT) {
    var S = glob.SCENE, list = (S && S.instances) || [], best = null, bd = Infinity, bati = glob.SCN_BATI_MODES || {};
    if (!inst || typeof glob.scnFootprint !== 'function') return null;
    var tx = (inst.x || 0) / 100, tz = (inst.z || 0) / 100, ta = (inst.rotY || 0) * Math.PI / 180, c = Math.cos(ta), s = Math.sin(ta);
    for (var i = 0; i < list.length; i++) { var o = list[i];
      if (!o || o === inst || PN_DECOR[o.mode]) continue;
      if (o.mode === 'fabprod' && glob.TEX_OBJECTS && glob.TEX_OBJECTS[o.prod] && glob.TEX_OBJECTS[o.prod].meta && glob.TEX_OBJECTS[o.prod].meta.tgrid) continue;   /* un autre terrain */
      var fp = null; try { fp = glob.scnFootprint(o); } catch (e) {} if (!fp) continue;
      var gx0 = (fp.gx0 != null) ? fp.gx0 : fp.x0, gx1 = (fp.gx1 != null) ? fp.gx1 : fp.x1, gz0 = (fp.gz0 != null) ? fp.gz0 : fp.z0, gz1 = (fp.gz1 != null) ? fp.gz1 : fp.z1;
      var oa = (o.rotY || 0) * Math.PI / 180, oc = Math.cos(oa), os = Math.sin(oa), lcx = (gx0 + gx1) / 2, lcz = (gz0 + gz1) / 2;
      var wx = (o.x || 0) / 100 + lcx * oc - lcz * os, wz = (o.z || 0) / 100 + lcx * os + lcz * oc;
      var dx = wx - tx, dz = wz - tz, e = c * dx + s * dz, n = -(-s * dx + c * dz);
      if (onT && !onT(e, n)) continue;
      var isBati = !!(bati[o.mode] || o.group || (o.mode === 'fabprod' && /^imp_/.test(o.prod || '')));   /* imp_ : un bâtiment importé (KMZ, IFC…) est du bâti */
      var d2 = (e - refX) * (e - refX) + (n - refY) * (n - refY) + (isBati ? 0 : 1e12);   /* bâti d'abord */
      if (d2 < bd) { bd = d2; best = { x: e, y: n, w: Math.max(2, gx1 - gx0) + 4, d: Math.max(2, gz1 - gz0) + 4, rot: -((o.rotY || 0) - (inst.rotY || 0)), name: o.name || o.label || '', o: o }; }
    }
    return best;
  }
  /* TERRAINS FIGÉS D'AVANT LES PLATEFORMES (sans meta.tparams) : paramètres relus sur l'objet.
     Carte satellite : les UV d'un figeage valent u = x/ext + cxFrac et v' = 1 − (z/ext + cyFrac)
     (bakeParts, cx = cy = 0 dans le repère figé) — un ajustement linéaire les retrouve exactement,
     sinon « Appliquer » remplaçait la carte par un dégradé. Socle : épaisseur lue sur sa géométrie. */
  function recoverFrozen(pid, D) {
    var P = frozenParams(D), gr = D.groups || [], names = gr.map(function (x) { return x.name || ''; }), gi = -1, i;
    for (i = 0; i < gr.length; i++) if (gr[i].tex && /^tmap_/.test(gr[i].tex) && D.tex && D.tex[gr[i].tex]) { gi = i; break; }
    if (names.some(function (nm) { return /^alt \d+$/.test(nm); })) P.colorByAlt = 1;
    else if (gi < 0) { P.colorByAlt = 0; for (i = 0; i < gr.length; i++) if (gr[i].name === 'Terrain' && gr[i].col) { P.col = gr[i].col; break; } }
    if (names.indexOf('Courbes de niveau') >= 0) P.contours = 1;
    if (names.indexOf('Maille') >= 0) P.mesh = 1;
    var si = names.indexOf('Socle');
    if ((gi < 0 && si < 0) || !(glob.BPO_import && glob.BPO_import._gunzip && glob.BPO_import._core)) { FZ[pid] = P; return Promise.resolve(P); }
    return glob.BPO_import._gunzip(D.geo).then(function (raw) {
      var geo = glob.BPO_import._core.dequantize(raw, D.meta), pos = geo.pos, uv = geo.uv, idx = geo.idx, nv = pos.length / 3;
      var ter = gr[gi >= 0 ? gi : 0], seen = new Uint8Array(nv), tmin = Infinity, k, vi;
      var n = 0, sx = 0, su = 0, sxx = 0, sxu = 0, sz = 0, sv = 0, szz = 0, szv = 0;
      for (k = ter.start; k < ter.start + ter.count; k++) { vi = idx[k]; if (seen[vi]) continue; seen[vi] = 1;
        var x = pos[vi * 3], y = pos[vi * 3 + 1], z = pos[vi * 3 + 2]; if (y < tmin) tmin = y;
        if (gi >= 0) { var u = uv[vi * 2], v = uv[vi * 2 + 1]; n++; sx += x; su += u; sxx += x * x; sxu += x * u; sz += z; sv += v; szz += z * z; szv += z * v; } }
      if (gi >= 0 && n > 3) {
        var a = (n * sxu - sx * su) / ((n * sxx - sx * sx) || 1e-12), b = (su - a * sx) / n, pz = (n * szv - sz * sv) / ((n * szz - sz * sz) || 1e-12), qz = (sv - pz * sz) / n;
        var ok = isFinite(a) && isFinite(pz) && Math.abs(a) > 1e-9 && Math.abs(pz + a) < 0.02 * Math.abs(a), res = 0, stp = Math.max(1, Math.floor(ter.count / 2000));
        if (ok) for (k = ter.start; k < ter.start + ter.count; k += stp) { vi = idx[k]; res = Math.max(res, Math.abs(uv[vi * 2] - (a * pos[vi * 3] + b)), Math.abs(uv[vi * 2 + 1] - (pz * pos[vi * 3 + 2] + qz))); }
        if (ok && res < 2e-3) { D.meta.tmap = { key: ter.tex, ext: 1 / a, cxFrac: b, cyFrac: 1 - qz, cx: 0, cy: 0, style: /satellite/i.test(ter.name || '') ? 'satellite' : 'plan' }; P.colorByAlt = 2; }
      }
      /* point bas de la SURFACE sur tous ses groupes (bandes d'altitude comprises), pas le seul premier */
      for (var gj = 0; gj < gr.length; gj++) { if (!/^(alt \d+|Terrain.*)$/.test(gr[gj].name || '')) continue; for (k = gr[gj].start; k < gr[gj].start + gr[gj].count; k++) { var yv = pos[idx[k] * 3 + 1]; if (yv < tmin) tmin = yv; } }
      if (si >= 0 && tmin < Infinity) { var sg = gr[si], seenS = new Uint8Array(nv), ns = 0, bmin = Infinity;
        for (k = sg.start; k < sg.start + sg.count; k++) { vi = idx[k]; if (seenS[vi]) continue; seenS[vi] = 1; ns++; var yy = pos[vi * 3 + 1]; if (yy < bmin) bmin = yy; }
        if (bmin < tmin - 0.005) { var nb = 0; seenS.fill(0);   /* fond plat : la moitié des sommets du socle au plus bas ; fond parallèle : seulement ceux sous le point bas */
          for (k = sg.start; k < sg.start + sg.count; k++) { vi = idx[k]; if (seenS[vi]) continue; seenS[vi] = 1; if (Math.abs(pos[vi * 3 + 1] - bmin) < 0.01) nb++; }
          P.thick = Math.round((tmin - bmin) * 100); P.thickFlat = (2 * nb >= ns - 2) ? 1 : 0; } }
      FZ[pid] = P; return P;
    });
  }
  /* GRILLE NATURELLE EN CACHE (14/09/2026) : filtrage, interpolation IDW et lissage ne dépendent que des
     points et de maille / découpe / bande / lissage — pas des plateformes. Déplacer une plateforme refaisait
     tout : 3,3 s mesurées sur 283 000 points. La grille est réutilisée ; GZ est copiée, jamais modifiée. */
  function natGrid() {
    var key = [RAWV, RAW ? RAW.length : 0, PTERR.step, PTERR.cut, PTERR.bandMin, PTERR.bandMax, PTERR.smooth, REG ? 1 : 0, MINSTEP].join('|');
    if (NATC && NATC.key === key) return NATC.res;
    var res = (function () {
    var step = Math.max(0.5, +PTERR.step || 3), cut = Math.max(step, +PTERR.cut || 12);
    if (REG && step < MINSTEP) step = MINSTEP;   /* le curseur descend à 1 m, l'emprise peut ne pas le permettre */
    var bmin = +PTERR.bandMin, bmax = +PTERR.bandMax;
    // 1) filtre bande d'altitude
    var P = [];
    for (var i = 0; i < RAW.length; i++) { var p = RAW[i]; if (p.z > bmin && p.z < bmax) P.push(p); }
    if (P.length < 3) return null;
    // 2) dédoublonnage (cellule 0.5 m, moyenne z)
    var dd = {}, DP = [];
    for (i = 0; i < P.length; i++) { var kx = Math.round(P[i].x/0.5), ky = Math.round(P[i].y/0.5), key = kx+'_'+ky; if (!dd[key]) { dd[key] = 1; DP.push(P[i]); } }
    P = DP;
    // 3) hash spatial (buckets de côté = cut) pour voisins
    var minX=1e18,minY=1e18,maxX=-1e18,maxY=-1e18;
    for (i=0;i<P.length;i++){ var q=P[i]; if(q.x<minX)minX=q.x; if(q.y<minY)minY=q.y; if(q.x>maxX)maxX=q.x; if(q.y>maxY)maxY=q.y; }
    var bs = cut, hb = {};
    function bkey(bx,by){ return bx+'_'+by; }
    for (i=0;i<P.length;i++){ var bx=Math.floor((P[i].x-minX)/bs), by=Math.floor((P[i].y-minY)/bs), kk=bkey(bx,by); (hb[kk]||(hb[kk]=[])).push(i); }
    function nearK(x,y,K){ var bx=Math.floor((x-minX)/bs), by=Math.floor((y-minY)/bs), res=[], ring=1;
      while(ring<300){ res=[];
        for(var ox=-ring;ox<=ring;ox++)for(var oy=-ring;oy<=ring;oy++){ var arr=hb[bkey(bx+ox,by+oy)]; if(arr) for(var j=0;j<arr.length;j++){ var pi=arr[j], dxp=P[pi].x-x, dyp=P[pi].y-y; res.push([dxp*dxp+dyp*dyp,pi]); } }
        if(res.length>=K) break; ring++; }
      res.sort(function(a,b){return a[0]-b[0];}); return res.slice(0,K); }
    // 4) retrait des creux locaux (fils d'eau / regards) : z < médiane voisins - 1.2 m
    var kept=[];
    if(!REG) for(i=0;i<P.length;i++){ var nb=nearK(P[i].x,P[i].y,9), zz=nb.map(function(e){return P[e[1]].z;}).sort(function(a,b){return a-b;}); var med=zz.length?zz[zz.length>>1]:P[i].z; if(P[i].z > med-1.2) kept.push(P[i]); }
    P = kept.length>=3 ? kept : P;
    // recompute bounds + hash sur P nettoyé
    minX=1e18;minY=1e18;maxX=-1e18;maxY=-1e18; for(i=0;i<P.length;i++){var q2=P[i]; if(q2.x<minX)minX=q2.x; if(q2.y<minY)minY=q2.y; if(q2.x>maxX)maxX=q2.x; if(q2.y>maxY)maxY=q2.y;}
    hb={}; for(i=0;i<P.length;i++){ var bx2=Math.floor((P[i].x-minX)/bs), by2=Math.floor((P[i].y-minY)/bs), kk2=bkey(bx2,by2); (hb[kk2]||(hb[kk2]=[])).push(i); }
    // 5) grille
    var nx=Math.floor((maxX-minX)/step)+1, ny=Math.floor((maxY-minY)/step)+1;
    if (nx<2||ny<2||nx*ny>900000) { if(nx*ny>900000) return {tooBig:true}; return null; }
    var NC=nx*ny;
    // 5a) présence des points sur la grille -> distance transform (chamfer 2 passes)
    var INF=1e9, dt=new Float32Array(NC); for(i=0;i<NC;i++) dt[i]=INF;
    for(i=0;i<P.length;i++){ var gx=Math.round((P[i].x-minX)/step), gy=Math.round((P[i].y-minY)/step); if(gx>=0&&gx<nx&&gy>=0&&gy<ny) dt[gy*nx+gx]=0; }
    var d1=1.0, d2=1.41421356;
    for(var y=0;y<ny;y++)for(var x=0;x<nx;x++){ var idx=y*nx+x, m=dt[idx];
      if(x>0)m=Math.min(m,dt[idx-1]+d1); if(y>0)m=Math.min(m,dt[idx-nx]+d1);
      if(x>0&&y>0)m=Math.min(m,dt[idx-nx-1]+d2); if(x<nx-1&&y>0)m=Math.min(m,dt[idx-nx+1]+d2); dt[idx]=m; }
    for(y=ny-1;y>=0;y--)for(x=nx-1;x>=0;x--){ var idx2=y*nx+x, m2=dt[idx2];
      if(x<nx-1)m2=Math.min(m2,dt[idx2+1]+d1); if(y<ny-1)m2=Math.min(m2,dt[idx2+nx]+d1);
      if(x<nx-1&&y<ny-1)m2=Math.min(m2,dt[idx2+nx+1]+d2); if(x>0&&y<ny-1)m2=Math.min(m2,dt[idx2+nx-1]+d2); dt[idx2]=m2; }
    var cutCells=cut/step;
    var mask=new Uint8Array(NC); for(i=0;i<NC;i++) mask[i]= dt[i]<=cutCells ? 1:0;
    // 5b) fermeture morpho (dilate r, remplir trous, erode r) pour combler les îlots
    var r=Math.max(1, Math.round(cut/step));
    mask=dilate(mask,nx,ny,r); mask=fillHoles(mask,nx,ny); mask=erode(mask,nx,ny,r);
    mask=largest(mask,nx,ny);
    // 6) interpolation IDW sur les cellules du masque
    var GZ=new Float32Array(NC);
    for(y=0;y<ny;y++)for(x=0;x<nx;x++){ var id=y*nx+x; if(!mask[id]) continue;
      var wx=minX+x*step, wy=minY+y*step, nn=nearK(wx,wy,10), sw=0, sz=0;
      for(var t=0;t<nn.length;t++){ var d2v=nn[t][0]; if(d2v<1e-6){ sz=P[nn[t][1]].z; sw=1; break; } var w=1/(d2v*d2v); sw+=w; sz+=w*P[nn[t][1]].z; }
      GZ[id]= sw>0 ? sz/sw : NaN; if(!(GZ[id]===GZ[id])) mask[id]=0;
    }
    // 7) lissage (moyenne pondérée gaussienne séparable) sur le masque
    var sig=+PTERR.smooth||0; if(sig>0.01) GZ=smooth(GZ,mask,nx,ny,sig);
    return { GZ: GZ, mask: mask, nx: nx, ny: ny, minX: minX, minY: minY, maxX: maxX, maxY: maxY, step: step, np: P.length };
    })();
    NATC = { key: key, res: res }; return res;
  }
  /* ---- Construction du MNT (grille) depuis les points, selon PTERR ---- */
  function buildMesh() {
    if (!hasData()) return null;
    var NG = natGrid(); if (!NG || NG.tooBig) return NG;
    var nx = NG.nx, ny = NG.ny, NC = nx * ny, minX = NG.minX, minY = NG.minY, maxX = NG.maxX, maxY = NG.maxY, step = NG.step, mask = NG.mask, i, x, y;
    var GZ = new Float32Array(NG.GZ), P = { length: NG.np };
    // 7b) plateformes (plat / creux) sur la grille NATURELLE, conservée dans GZN ; volumes dans VOL
    var GZN=new Float32Array(GZ), VOL=null;
    if(PTERR.plats&&PTERR.plats.length){ VOL=platApply({GZ:GZ,GZN:GZN,mask:mask,nx:nx,ny:ny,minX:minX,minY:minY,step:step,cx:(minX+maxX)/2,cy:(minY+maxY)/2}, PTERR.plats); }
    // 8) recentrage + altitude relative — bornes prises sur le terrain NATUREL : un creux ne fait pas remonter la base
    var z0=1e18; for(i=0;i<NC;i++) if(mask[i]&&GZN[i]<z0) z0=GZN[i];
    var cx=(minX+maxX)/2, cy=(minY+maxY)/2, exag=+PTERR.exag||1;
    var zmax=-1e18; for(i=0;i<NC;i++) if(mask[i]&&GZN[i]>zmax) zmax=GZN[i]; var zr=Math.max(0.01,zmax-z0);
    // 9) sommets (Y-up : x, altitude, -y) + indices
    var vid=new Int32Array(NC); for(i=0;i<NC;i++) vid[i]=-1;
    var V=[], VZ=[], kv=0, zbase=(+PTERR.absolute)?z0:0;
    for(y=0;y<ny;y++)for(x=0;x<nx;x++){ var iv=y*nx+x; if(!mask[iv]) continue; var wx2=minX+x*step-cx, wy2=minY+y*step-cy, zz2=zbase+(GZ[iv]-z0)*exag; vid[iv]=kv++; V.push([wx2, zz2, -wy2]); VZ.push((GZ[iv]-z0)/zr); }
    // 10) faces (quad -> 2 triangles) colorées par altitude moyenne
    var col=(glob.FINISH&&glob.FINISH.terrain)||[150,160,120], F=[];
    for(y=0;y<ny-1;y++)for(x=0;x<nx-1;x++){ var a=vid[y*nx+x], b=vid[y*nx+x+1], c2=vid[(y+1)*nx+x+1], e=vid[(y+1)*nx+x];
      if(a>=0&&b>=0&&c2>=0&&e>=0){ F.push([a,b,c2]); F.push([a,c2,e]); } }
    return { V:V, VZ:VZ, F:F, z0:z0, vol:VOL, grid:{ GZ:GZ, GZN:GZN, mask:mask, nx:nx, ny:ny, minX:minX, minY:minY, step:step, z0:z0, cx:cx, cy:cy, zbase:zbase, exag:exag }, dims:{ w:(maxX-minX), h:(zmax-z0)*exag, d:(maxY-minY), cy:zbase+((zmax-z0)*exag)/2 }, np:P.length, col:col };
  }

  /* ---- morpho binaire (kernel carré séparable) ---- */
  function dilate(m,nx,ny,r){ return morph(m,nx,ny,r,true); }
  function erode(m,nx,ny,r){ return morph(m,nx,ny,r,false); }
  function morph(m,nx,ny,r,dil){ var a=new Uint8Array(m), b=new Uint8Array(m.length);
    // horizontal
    for(var y=0;y<ny;y++)for(var x=0;x<nx;x++){ var v=dil?0:1; for(var o=-r;o<=r;o++){ var xx=x+o; if(xx<0||xx>=nx)continue; var s=a[y*nx+xx]; v=dil?(v|s):(v&s);} b[y*nx+x]=v; }
    var c=new Uint8Array(m.length);
    for(y=0;y<ny;y++)for(x=0;x<nx;x++){ var v2=dil?0:1; for(var o2=-r;o2<=r;o2++){ var yy=y+o2; if(yy<0||yy>=ny)continue; var s2=b[yy*nx+x]; v2=dil?(v2|s2):(v2&s2);} c[y*nx+x]=v2; }
    return c; }
  function fillHoles(m,nx,ny){ // remplit les trous fermés : flood du bord sur les 0, le reste devient 1
    var out=new Uint8Array(m.length), outside=new Uint8Array(m.length), st=[];
    for(var x=0;x<nx;x++){ st.push(x); st.push((ny-1)*nx+x); } for(var y=0;y<ny;y++){ st.push(y*nx); st.push(y*nx+nx-1); }
    while(st.length){ var id=st.pop(); if(outside[id]||m[id])continue; outside[id]=1; var px=id%nx, py=(id/nx)|0;
      if(px>0)st.push(id-1); if(px<nx-1)st.push(id+1); if(py>0)st.push(id-nx); if(py<ny-1)st.push(id+nx); }
    for(var i=0;i<m.length;i++) out[i]= (m[i]||!outside[i])?1:0; return out; }
  function largest(m,nx,ny){ var lab=new Int32Array(m.length), cur=0, best=0, bestn=0;
    for(var s=0;s<m.length;s++){ if(!m[s]||lab[s])continue; cur++; var cnt=0, st=[s]; lab[s]=cur;
      while(st.length){ var id=st.pop(); cnt++; var px=id%nx,py=(id/nx)|0;
        [[px-1,py],[px+1,py],[px,py-1],[px,py+1]].forEach(function(nn){ var nxp=nn[0],nyp=nn[1]; if(nxp<0||nyp<0||nxp>=nx||nyp>=ny)return; var nid=nyp*nx+nxp; if(m[nid]&&!lab[nid]){lab[nid]=cur; st.push(nid);} }); }
      if(cnt>bestn){bestn=cnt;best=cur;} }
    var out=new Uint8Array(m.length); for(var k=0;k<m.length;k++) out[k]= lab[k]===best?1:0; return out; }
  function smooth(GZ,mask,nx,ny,sig){ var rad=Math.max(1,Math.round(sig*2)), ker=[]; var ss=2*sig*sig; for(var o=-rad;o<=rad;o++) ker.push(Math.exp(-o*o/ss));
    var tmp=new Float32Array(GZ.length), out=new Float32Array(GZ.length);
    for(var y=0;y<ny;y++)for(var x=0;x<nx;x++){ var id=y*nx+x; if(!mask[id]){tmp[id]=GZ[id];continue;} var sw=0,sv=0; for(var o2=-rad;o2<=rad;o2++){ var xx=x+o2; if(xx<0||xx>=nx)continue; var nid=y*nx+xx; if(!mask[nid])continue; var w=ker[o2+rad]; sw+=w; sv+=w*GZ[nid]; } tmp[id]= sw>0?sv/sw:GZ[id]; }
    for(y=0;y<ny;y++)for(x=0;x<nx;x++){ var id2=y*nx+x; if(!mask[id2]){out[id2]=tmp[id2];continue;} var sw2=0,sv2=0; for(var o3=-rad;o3<=rad;o3++){ var yy=y+o3; if(yy<0||yy>=ny)continue; var nid2=yy*nx+x; if(!mask[nid2])continue; var w2=ker[o3+rad]; sw2+=w2; sv2+=w2*tmp[nid2]; } out[id2]= sw2>0?sv2/sw2:tmp[id2]; }
    return out; }

  /* ---- signature de cache : rebuild seulement si un param change ---- */
  function sig(){ return [PTERR.src,PTERR.shape,PTERR.sw,PTERR.sd,PTERR.uArm,PTERR.tArm,PTERR.sBase,PTERR.sverts,PTERR.ctrlN,JSON.stringify(PTERR.ctrlZ||[]), PTERR.step,PTERR.smooth,PTERR.cut,PTERR.bandMin,PTERR.bandMax,PTERR.exag, RAW?RAW.length:0, JSON.stringify(PTERR.plats||[])].join('|'); }
  /* grille de contrôle du relief : (ré)alloue si taille change */
  function ctrlGrid(){ var cn=Math.max(2,PTERR.ctrlN|0), cz=PTERR.ctrlZ; if(!cz||cz.length!==cn*cn){ cz=new Array(cn*cn); for(var q=0;q<cz.length;q++)cz[q]=0; PTERR.ctrlZ=cz; } return {cn:cn,cz:cz}; }

  /* ---- TERRAIN CRÉÉ (sans DXF) : plateforme plate d'une forme donnée ---- */
  function shapePoly(){
    var w=Math.max(1,(PTERR.sw||8000)/100), d=Math.max(1,(PTERR.sd||6000)/100), hw=w/2, hd=d/2, a=Math.max(0.5,(PTERR.uArm||2500)/100), a2=Math.max(0.5,(PTERR.tArm||2500)/100);
    if(PTERR.shape==='rect') return [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]];
    if(PTERR.shape==='u'){ var t=Math.min(a, w/2-0.5); return [[-hw,-hd],[hw,-hd],[hw,hd],[hw-t,hd],[hw-t,-hd+t],[-hw+t,-hd+t],[-hw+t,hd],[-hw,hd]]; }
    if(PTERR.shape==='t'){ var tw=Math.min(a2,w-0.5), th=Math.min(a,d-0.5); return [[-hw,hd],[hw,hd],[hw,hd-th],[tw/2,hd-th],[tw/2,-hd],[-tw/2,-hd],[-tw/2,hd-th],[-hw,hd-th]]; }
    var pts=[]; (PTERR.sverts||'').trim().split(/\s+/).forEach(function(tok){ var xy=tok.split(','); if(xy.length===2){ var x=parseFloat(xy[0]),y=parseFloat(xy[1]); if(!isNaN(x)&&!isNaN(y)) pts.push([x,y]); } });
    return pts.length>=3?pts:[[-40,-30],[40,-30],[40,30],[-40,30]];
  }
  function inPoly(px,py,poly){ var c=false,n=poly.length,j=n-1; for(var i=0;i<n;i++){ var A=poly[i],B=poly[j]; if(((A[1]>py)!==(B[1]>py)) && (px < (B[0]-A[0])*(py-A[1])/((B[1]-A[1])||1e-9)+A[0])) c=!c; j=i; } return c; }
  function _segD(px,py,ax,ay,bx,by){ var dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy,t=L2>0?((px-ax)*dx+(py-ay)*dy)/L2:0; t=t<0?0:(t>1?1:t); return Math.hypot(px-(ax+t*dx),py-(ay+t*dy)); }
  /* distance signée au polygone (>0 dedans) : linéaire près d'une arête droite → passage à 0 exact sur le bord. */
  function polySD(px,py,poly){ var d=1e18,n=poly.length,j=n-1; for(var i=0;i<n;i++){ var dd=_segD(px,py,poly[j][0],poly[j][1],poly[i][0],poly[i][1]); if(dd<d)d=dd; j=i; } return inPoly(px,py,poly)? d : -d; }
  function buildShapeMesh(){
    var poly=shapePoly(), step=Math.max(0.5,+PTERR.step||3), base=(PTERR.sBase||0)/100, exag=+PTERR.exag||1;
    var minX=1e18,minY=1e18,maxX=-1e18,maxY=-1e18; poly.forEach(function(p){ if(p[0]<minX)minX=p[0]; if(p[0]>maxX)maxX=p[0]; if(p[1]<minY)minY=p[1]; if(p[1]>maxY)maxY=p[1]; });
    var nx=Math.floor((maxX-minX)/step)+2, ny=Math.floor((maxY-minY)/step)+2; if(nx<2||ny<2) return null; if(nx*ny>900000) return {tooBig:true};
    var lib=(PTERR.shape==='libre'), cx=lib?0:(minX+maxX)/2, cy=lib?0:(minY+maxY)/2, NC=nx*ny, mask=new Uint8Array(NC), GZ=new Float32Array(NC), i, x, y;
    var cg=ctrlGrid(), cn=cg.cn, cz=cg.cz, spanX=(maxX-minX)||1, spanY=(maxY-minY)||1;
    function ctrlAt(u,v){ var fx=u*(cn-1), fy=v*(cn-1), ix=Math.min(cn-2,Math.max(0,Math.floor(fx))), iy=Math.min(cn-2,Math.max(0,Math.floor(fy))), tx=fx-ix, ty=fy-iy;
      function g(a,b){ return (cz[b*cn+a]||0)/100; }
      return g(ix,iy)*(1-tx)*(1-ty)+g(ix+1,iy)*tx*(1-ty)+g(ix,iy+1)*(1-tx)*ty+g(ix+1,iy+1)*tx*ty; }
    for(y=0;y<ny;y++)for(x=0;x<nx;x++){ var wx=minX+x*step, wy=minY+y*step; if(inPoly(wx,wy,poly)){ var id=y*nx+x; mask[id]=1; GZ[id]=base+ctrlAt((wx-minX)/spanX,(wy-minY)/spanY); } }
    var sg=+PTERR.smooth||0; if(sg>0.01) GZ=smooth(GZ,mask,nx,ny,sg);
    var GZN=new Float32Array(GZ), VOL=null;   /* plateformes (plat / creux), voir PLATEFORMES */
    if(PTERR.plats&&PTERR.plats.length){ VOL=platApply({GZ:GZ,GZN:GZN,mask:mask,nx:nx,ny:ny,minX:minX,minY:minY,step:step,cx:cx,cy:cy}, PTERR.plats); }
    var z0=1e18,zmax=-1e18; for(i=0;i<NC;i++) if(mask[i]){ if(GZ[i]<z0)z0=GZ[i]; if(GZ[i]>zmax)zmax=GZ[i]; } if(z0>zmax){z0=base;zmax=base;} var zr=Math.max(0.01,zmax-z0);
    var V=[], VZ=[], F=[];
    if(!lib){
      var vid=new Int32Array(NC); for(i=0;i<NC;i++) vid[i]=-1;
      for(y=0;y<ny;y++)for(x=0;x<nx;x++){ var iv=y*nx+x; if(!mask[iv]) continue; vid[iv]=V.length; V.push([(minX+x*step)-cx, GZ[iv]*exag, -((minY+y*step)-cy)]); VZ.push((GZ[iv]-z0)/zr); }
      for(y=0;y<ny-1;y++)for(x=0;x<nx-1;x++){ var a=vid[y*nx+x], b=vid[y*nx+x+1], c2=vid[(y+1)*nx+x+1], e=vid[(y+1)*nx+x]; if(a>=0&&b>=0&&c2>=0&&e>=0){ F.push([a,b,c2]); F.push([a,c2,e]); } }
    } else {
      /* MAILLAGE CONFORME AU CONTOUR (Libre) : chaque cellule est remplie par sa partie
         intérieure au polygone, découpée aux passages à 0 de la distance signée → bord net. */
      var sd=new Float32Array(NC);
      for(y=0;y<ny;y++)for(x=0;x<nx;x++){ var sid=y*nx+x; sd[sid]=polySD(minX+x*step, minY+y*step, poly); }
      var vmap={};
      function _nodeV(nx0,ny0){ var k='n'+nx0+'_'+ny0, id=vmap[k]; if(id!=null) return id; var nid=ny0*nx+nx0, g2=GZ[nid]; id=V.length; vmap[k]=id; V.push([(minX+nx0*step)-cx, g2*exag, -((minY+ny0*step)-cy)]); VZ.push((g2-z0)/zr); return id; }
      function _crossV(ax,ay,bx,by){ var kx0=Math.min(ax,bx),ky0=Math.min(ay,by),kx1=Math.max(ax,bx),ky1=Math.max(ay,by), key='c'+kx0+'_'+ky0+'_'+kx1+'_'+ky1, id=vmap[key]; if(id!=null) return id;
        var s0=sd[ay*nx+ax], s1=sd[by*nx+bx], t=s0/(s0-s1); if(!isFinite(t)) t=0.5; t=t<0?0:(t>1?1:t);
        var wx=(minX+ax*step)+((bx-ax)*step)*t, wy=(minY+ay*step)+((by-ay)*step)*t, gz=base+ctrlAt((wx-minX)/spanX,(wy-minY)/spanY);
        id=V.length; vmap[key]=id; V.push([wx-cx, gz*exag, -(wy-cy)]); VZ.push((gz-z0)/zr); return id; }
      for(y=0;y<ny-1;y++)for(x=0;x<nx-1;x++){
        var cs=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]], ring=[];
        for(var ei=0;ei<4;ei++){ var A=cs[ei], B=cs[(ei+1)%4], inA=sd[A[1]*nx+A[0]]>=0, inB=sd[B[1]*nx+B[0]]>=0;
          if(inA) ring.push(_nodeV(A[0],A[1]));
          if(inA!==inB) ring.push(_crossV(A[0],A[1],B[0],B[1])); }
        for(var fi=1;fi+1<ring.length;fi++) F.push([ring[0], ring[fi], ring[fi+1]]);
      }
    }
    var col=(glob.FINISH&&glob.FINISH.terrain)||[150,160,120];
    return { V:V, VZ:VZ, F:F, z0:z0, vol:VOL, grid:{ GZ:GZ,GZN:GZN,mask:mask,nx:nx,ny:ny,minX:minX,minY:minY,step:step,z0:z0,cx:cx,cy:cy,zbase:z0*exag,exag:exag }, dims:{ w:(maxX-minX), h:Math.max(0.2,(zmax-z0)*exag), d:(maxY-minY), cy:(z0*exag+(zmax-z0)*exag/2) }, np:0, col:col };
  }

  /* Positions (repère de rendu = coords de MESH.V) des points de contrôle du relief,
     pour dessiner/dragger les poignées d'altitude côté vue. Renvoie [{i,x,y,z,cm}]. */
  function ctrlHandles(){
    if(PTERR.src!=='shape') return [];
    var poly=shapePoly(), exag=+PTERR.exag||1, base=(PTERR.sBase||0)/100;
    var minX=1e18,minY=1e18,maxX=-1e18,maxY=-1e18; poly.forEach(function(p){ if(p[0]<minX)minX=p[0]; if(p[0]>maxX)maxX=p[0]; if(p[1]<minY)minY=p[1]; if(p[1]>maxY)maxY=p[1]; });
    var lib=(PTERR.shape==='libre'), cx=lib?0:(minX+maxX)/2, cy=lib?0:(minY+maxY)/2, spanX=(maxX-minX)||1, spanY=(maxY-minY)||1;
    var cg=ctrlGrid(), cn=cg.cn, cz=cg.cz, out=[];
    for(var r=0;r<cn;r++)for(var c=0;c<cn;c++){ var i=r*cn+c, u=cn>1?c/(cn-1):0.5, v=cn>1?r/(cn-1):0.5;
      var wx=minX+u*spanX, wy=minY+v*spanY, cm=cz[i]||0, yy=(base+cm/100)*exag;
      out.push({ i:i, x:wx-cx, y:yy, z:-(wy-cy), cm:cm }); }
    return out;
  }
  /* Fixe l'altitude (cm) d'un point de contrôle et invalide le maillage (rebuild au prochain build). */
  function setCtrlCm(i, cm){ var cg=ctrlGrid(), cz=cg.cz; if(i<0||i>=cz.length) return false; cz[i]=cm; PTERR.ctrlZ=cz; MESH=null; return true; }

  /* ---- Édition d'emprise (forme « Libre ») : sommets au sol draggables comme la dalle.
     sverts = "x,y x,y …" en mètres (plan). Repère de rendu (Libre non recentré) : x=wx, z=-wy. ---- */
  function _svParse(){ var pts=[]; (PTERR.sverts||'').trim().split(/\s+/).forEach(function(t){ var xy=t.split(','); if(xy.length===2){ var a=parseFloat(xy[0]), b=parseFloat(xy[1]); if(!isNaN(a)&&!isNaN(b)) pts.push([a,b]); } }); return pts; }
  function _svWrite(pts){ PTERR.sverts=pts.map(function(p){ return (Math.round(p[0]*100)/100)+','+(Math.round(p[1]*100)/100); }).join(' '); MESH=null; }
  function _distSeg2(px,py,ax,ay,bx,by){ var dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy,t=L2>0?((px-ax)*dx+(py-ay)*dy)/L2:0; t=t<0?0:(t>1?1:t); return Math.hypot(px-(ax+t*dx),py-(ay+t*dy)); }
  function footHandles(){ if(PTERR.src!=='shape'||PTERR.shape!=='libre') return []; var pts=_svParse(), out=[]; for(var i=0;i<pts.length;i++) out.push({ i:i, x:pts[i][0], z:-pts[i][1] }); return out; }
  function setFoot(i,X,Z){ var pts=_svParse(); if(i<0||i>=pts.length) return false; pts[i]=[X,-Z]; _svWrite(pts); return true; }
  function insertFoot(X,Z){ var pts=_svParse(); if(pts.length<2) return false; var px=X, py=-Z, n=pts.length, bi=0, bd=1e18;
    for(var i=0;i<n;i++){ var A=pts[i], B=pts[(i+1)%n], d=_distSeg2(px,py,A[0],A[1],B[0],B[1]); if(d<bd){bd=d;bi=i;} }
    pts.splice(bi+1,0,[px,py]); _svWrite(pts); return pts.length; }
  function removeFoot(i){ var pts=_svParse(); if(pts.length<=3||i<0||i>=pts.length) return false; pts.splice(i,1); _svWrite(pts); return true; }

  /* ---- construit le maillage et le pousse dans FC ; renvoie DIMS ---- */
  function buildFC() {
    var shapeMode=(PTERR.src==='shape');
    if (!shapeMode && !hasData()) { glob.DIMS = { w:1, h:0.1, d:1 }; return glob.DIMS; }
    if (!MESH || MESH.sig !== sig()) { var m = shapeMode ? buildShapeMesh() : buildMesh(); if (m) m.sig = sig(); MESH = m; }
    if (!MESH || MESH.tooBig) { glob.DIMS = { w:1, h:0.1, d:1 }; return glob.DIMS; }
    var FC = glob.FC, V = MESH.V, VZ = MESH.VZ, mapped = mapOn(), uni = !mapped && !(+PTERR.colorByAlt);
    var texKey = (glob.FINISH_TEX && glob.FINISH_TEX.terrain) || null;
    var uCol = (glob.FINISH && glob.FINISH.terrain) || MESH.col;
    for (var f = 0; f < MESH.F.length; f++) {
      var tri = MESH.F[f], a = V[tri[0]], b = V[tri[1]], c = V[tri[2]];
      // normale
      var ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2], vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
      var nx2=uy*vz-uz*vy, ny2=uz*vx-ux*vz, nz2=ux*vy-uy*vx, nl=Math.hypot(nx2,ny2,nz2)||1;
      var col = mapped ? [190,190,182] : (uni ? uCol : altColor((VZ[tri[0]]+VZ[tri[1]]+VZ[tri[2]])/3));
      var fc = { verts:[a,b,c], n:[nx2/nl,ny2/nl,nz2/nl], col:col, al:1, tex: mapped ? MAP.key : (uni?texKey:null) };
      if (mapped) { fc.uv = [mapUV(a), mapUV(b), mapUV(c)]; fc.txm = 1; fc.rgh = 0.95; fc.met = 0; fc.uvTop = 1; }   /* uvTop : UV comptées depuis la ligne du HAUT (convention pixels), même si la carte a une data-URI — l'export retourne V */   /* carte drapée : UV par sommet ; txm = le rendu photo lit l'albédo au texel (canal des carrosseries) */
      FC.push(fc);
    }
    if (+PTERR.thick > 0) solidFC(FC, MESH);
    if (+PTERR.drape && MESH.grid) drapeFC(FC, MESH.grid);
    if (+PTERR.contours && MESH.grid) contourFC(FC, MESH.grid);
    if (+PTERR.mesh && MESH.grid) gridFC(FC, MESH.grid);
    if ((PTERR.platShow == null || +PTERR.platShow) && MESH.grid && platsVisible(PTERR.plats)) platFC(FC, MESH.grid, PTERR.plats);   /* contour des plateformes (14/09) */
    glob.DIMS = MESH.dims; return MESH.dims;
  }

  /* altitude du terrain au point monde (wx,wy) [avant recentrage], interpolée bilinéaire. */
  function sampleZ(g, wx, wy) {
    var gx=(wx-g.minX)/g.step, gy=(wy-g.minY)/g.step, ix=Math.floor(gx), iy=Math.floor(gy);
    if (ix<0||iy<0||ix>=g.nx-1||iy>=g.ny-1) { var rx=Math.max(0,Math.min(g.nx-1,Math.round(gx))), ry=Math.max(0,Math.min(g.ny-1,Math.round(gy))), rid=ry*g.nx+rx; return g.mask[rid]? g.zbase+(g.GZ[rid]-g.z0)*g.exag : null; }
    var id=iy*g.nx+ix, m00=g.mask[id], m10=g.mask[id+1], m01=g.mask[id+g.nx], m11=g.mask[id+g.nx+1];
    if(!(m00&&m10&&m01&&m11)){ var arr=[id,id+1,id+g.nx,id+g.nx+1]; for(var q=0;q<4;q++) if(g.mask[arr[q]]) return g.zbase+(g.GZ[arr[q]]-g.z0)*g.exag; return null; }
    var fx=gx-ix, fy=gy-iy;
    var z=g.GZ[id]*(1-fx)*(1-fy)+g.GZ[id+1]*fx*(1-fy)+g.GZ[id+g.nx]*(1-fx)*fy+g.GZ[id+g.nx+1]*fx*fy;
    return g.zbase+(z-g.z0)*g.exag;
  }
  /* Géométrie du drapé (rubans plats surélevés épousant le terrain) : {V,F}. */
  function drapeGeo(g) {
    if(!POLYS||!POLYS.length) return null; var sel=PTERR.drapeLayers||{}, w=0.22, eps=0.05, V=[], F=[], cnt=0, cap=140000;
    for(var pi=0;pi<POLYS.length;pi++){ var Pl=POLYS[pi]; if(!sel[Pl.layer]) continue; var v=Pl.pts, m=v.length; if(m<2) continue; var loop=Pl.closed?m:m-1;
      for(var s=0;s<loop;s++){ var a=v[s], b=v[(s+1)%m], za=sampleZ(g,a[0],a[1]), zb=sampleZ(g,b[0],b[1]); if(za==null||zb==null) continue;
        var dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1, px=-dy/L*w, py=dx/L*w, i0=V.length;
        V.push([a[0]+px-g.cx, za+eps, -(a[1]+py-g.cy)]); V.push([a[0]-px-g.cx, za+eps, -(a[1]-py-g.cy)]);
        V.push([b[0]+px-g.cx, zb+eps, -(b[1]+py-g.cy)]); V.push([b[0]-px-g.cx, zb+eps, -(b[1]-py-g.cy)]);
        F.push([i0, i0+2, i0+3]); F.push([i0, i0+3, i0+1]);   /* A1,B1,B2 ; A1,B2,A2 */
        if((cnt+=2)>cap) return {V:V,F:F}; } }
    return {V:V, F:F};
  }
  /* Pousse le drapé dans FC (rendu vivant). */
  function drapeFC(FC, g) { var d=drapeGeo(g); if(!d||!d.F.length) return; var col=[64,66,72];
    for(var f=0;f<d.F.length;f++){ var t=d.F[f]; FC.push({verts:[d.V[t[0]],d.V[t[1]],d.V[t[2]]], n:[0,1,0], col:col, al:1, tex:null}); } }

  /* COURBES DE NIVEAU (marching squares sur la grille) : rubans fins à chaque
     altitude multiple de l'équidistance, épousant le relief. Renvoie {V,F}. */
  function contourGeo(g, interval) {
    interval = Math.max(0.05, interval || 0.5);
    var nx=g.nx, ny=g.ny, GZ=g.GZ, mask=g.mask, step=g.step, minX=g.minX, minY=g.minY;
    var zmin=1e18, zmax=-1e18, i;
    for(i=0;i<GZ.length;i++){ if(mask[i]){ if(GZ[i]<zmin)zmin=GZ[i]; if(GZ[i]>zmax)zmax=GZ[i]; } }
    if(zmax<=zmin) return null;
    var V=[], F=[], w=Math.max(0.02,(PTERR.contourW||20)/100/2), eps=0.09, cnt=0, cap=200000, pts=[];
    var master=Math.max(0,PTERR.contourMaster|0), curW=w;
    function mp(wx,wy,L){ return [wx-g.cx, g.zbase+(L-g.z0)*g.exag+eps, -(wy-g.cy)]; }
    function seg(p1,p2){ var i0=V.length, dx=p2[0]-p1[0], dz=p2[2]-p1[2], L=Math.hypot(dx,dz)||1, px=-dz/L*curW, pz=dx/L*curW;
      V.push([p1[0]+px,p1[1],p1[2]+pz]); V.push([p1[0]-px,p1[1],p1[2]-pz]); V.push([p2[0]+px,p2[1],p2[2]+pz]); V.push([p2[0]-px,p2[1],p2[2]-pz]);
      F.push([i0,i0+2,i0+3]); F.push([i0,i0+3,i0+1]); cnt+=2; }
    var l0=Math.ceil(zmin/interval)*interval, ln=0;
    for(var L=l0; L<=zmax && cnt<cap; L+=interval, ln++){
      curW = (master>1 && (Math.round((L-l0)/interval)%master===0)) ? w*2.4 : w;
      for(var y=0;y<ny-1 && cnt<cap;y++) for(var x=0;x<nx-1;x++){
        var id=y*nx+x; if(!(mask[id]&&mask[id+1]&&mask[id+nx]&&mask[id+nx+1])) continue;
        var z00=GZ[id], z10=GZ[id+1], z01=GZ[id+nx], z11=GZ[id+nx+1];
        var x0=minX+x*step, y0=minY+y*step, x1=x0+step, y1=y0+step; pts.length=0;
        function cr(za,zb,xa,ya,xb,yb){ if((za<L)!==(zb<L)){ var t=(L-za)/(zb-za||1e-9); pts.push([xa+(xb-xa)*t, ya+(yb-ya)*t]); } }
        cr(z00,z10, x0,y0, x1,y0); cr(z10,z11, x1,y0, x1,y1); cr(z11,z01, x1,y1, x0,y1); cr(z01,z00, x0,y1, x0,y0);
        if(pts.length===2) seg(mp(pts[0][0],pts[0][1],L), mp(pts[1][0],pts[1][1],L));
        else if(pts.length===4){ seg(mp(pts[0][0],pts[0][1],L), mp(pts[1][0],pts[1][1],L)); seg(mp(pts[2][0],pts[2][1],L), mp(pts[3][0],pts[3][1],L)); }
      }
    }
    return {V:V, F:F};
  }
  function contourFC(FC, g) { var d=contourGeo(g, +PTERR.contourInt); if(!d||!d.F.length) return; var col=[96,64,42];
    for(var f=0;f<d.F.length;f++){ var t=d.F[f]; FC.push({verts:[d.V[t[0]],d.V[t[1]],d.V[t[2]]], n:[0,1,0], col:col, al:1, tex:null}); } }

  /* MAILLE VISIBLE : lignes de grille (rangées + colonnes) posées sur la surface,
     rubans fins surélevés. Renvoie {V,F}. */
  function gridGeo(g) {
    if(!g||!g.GZ) return null;
    var nx=g.nx, ny=g.ny, GZ=g.GZ, mask=g.mask, step=g.step;
    var w=Math.max(0.01, step*0.02), eps=0.05, V=[], F=[], cnt=0, cap=90000;
    function pt(x,y){ var id=y*nx+x; return [ (g.minX+x*step)-g.cx, g.zbase+(GZ[id]-g.z0)*g.exag+eps, -((g.minY+y*step)-g.cy) ]; }
    function seg(x0,y0,x1,y1){ var p1=pt(x0,y0), p2=pt(x1,y1), i0=V.length, dx=p2[0]-p1[0], dz=p2[2]-p1[2], L=Math.hypot(dx,dz)||1, px=-dz/L*w, pz=dx/L*w;
      V.push([p1[0]+px,p1[1],p1[2]+pz]); V.push([p1[0]-px,p1[1],p1[2]-pz]); V.push([p2[0]+px,p2[1],p2[2]+pz]); V.push([p2[0]-px,p2[1],p2[2]-pz]);
      F.push([i0,i0+2,i0+3]); F.push([i0,i0+3,i0+1]); cnt+=2; }
    var x,y;
    for(y=0;y<ny && cnt<cap;y++) for(x=0;x<nx-1;x++){ if(mask[y*nx+x]&&mask[y*nx+x+1]){ seg(x,y,x+1,y); if(cnt>=cap) break; } }
    for(x=0;x<nx && cnt<cap;x++) for(y=0;y<ny-1;y++){ if(mask[y*nx+x]&&mask[(y+1)*nx+x]){ seg(x,y,x,y+1); if(cnt>=cap) break; } }
    return {V:V, F:F};
  }
  function gridFC(FC, g) { var d=gridGeo(g); if(!d||!d.F.length) return; var col=[95,98,105];
    for(var f=0;f<d.F.length;f++){ var t=d.F[f]; FC.push({verts:[d.V[t[0]],d.V[t[1]],d.V[t[2]]], n:[0,1,0], col:col, al:1, tex:null}); } }

  /* SOCLE (épaisseur) : fond + parois autour du contour, à partir du maillage de surface.
     flat=1 -> fond plat horizontal ; flat=0 -> fond parallèle (surface décalée vers le bas).
     Renvoie {V,F}. t en mètres (déjà exagéré). */
  function solidGeo(MESH, t, flat) {
    var V=MESH.V, F=MESH.F; if(!t||t<=0||!F.length) return null;
    var n=V.length, i, minY=1e18; for(i=0;i<n;i++) if(V[i][1]<minY) minY=V[i][1];
    var floorY=minY-t, BV=new Array(n);
    for(i=0;i<n;i++) BV[i]= flat ? [V[i][0],floorY,V[i][2]] : [V[i][0],V[i][1]-t,V[i][2]];
    var outV=[], outF=[];
    for(i=0;i<n;i++) outV.push(BV[i]);            // 0..n-1 : fond
    for(var f=0;f<F.length;f++){ var tr=F[f]; outF.push([tr[0],tr[2],tr[1]]); }  // fond, winding inversé (normale vers le bas)
    // arêtes de bord = arêtes appartenant à un seul triangle (orientation conservée)
    var em={}; function ek(a,b){ return a<b? a+'_'+b : b+'_'+a; }
    for(f=0;f<F.length;f++){ var tr2=F[f], es=[[tr2[0],tr2[1]],[tr2[1],tr2[2]],[tr2[2],tr2[0]]];
      for(var e=0;e<3;e++){ var k=ek(es[e][0],es[e][1]); if(em[k]) em[k].c++; else em[k]={a:es[e][0],b:es[e][1],c:1}; } }
    var topBase=outV.length; for(i=0;i<n;i++) outV.push([V[i][0],V[i][1],V[i][2]]); // n..2n-1 : dessus
    for(var kk in em){ if(em[kk].c!==1) continue; var a=em[kk].a, b=em[kk].b;
      outF.push([topBase+a, topBase+b, b]); outF.push([topBase+a, b, a]); }   // paroi topA,topB,botB / topA,botB,botA
    return {V:outV, F:outF};
  }
  function solidFC(FC, MESH) {
    var t=(+PTERR.thick||0)/100; if(t<=0) return; t*=(+PTERR.exag||1);
    var d=solidGeo(MESH, t, +PTERR.thickFlat); if(!d||!d.F.length) return;
    var col=(glob.FINISH&&glob.FINISH.terrain)||MESH.col, tk=(glob.FINISH_TEX&&glob.FINISH_TEX.terrain)||null;
    for(var f=0;f<d.F.length;f++){ var tr=d.F[f], A=d.V[tr[0]], B=d.V[tr[1]], C=d.V[tr[2]];
      var ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2], vx=C[0]-A[0],vy=C[1]-A[1],vz=C[2]-A[2];
      var nx2=uy*vz-uz*vy, ny2=uz*vx-ux*vz, nz2=ux*vy-uy*vx, nl=Math.hypot(nx2,ny2,nz2)||1;
      FC.push({verts:[A,B,C], n:[nx2/nl,ny2/nl,nz2/nl], col:col, al:1, tex:tk}); } }

  /* ---- Fige le terrain courant en OBJET IMPORTÉ (bake) : posable/sauvegardable/exportable.
     Groupé par bandes d'altitude pour conserver le dégradé topo une fois figé. ---- */
  /* ---- Assemblage pos / idx / groupes / UV d'un terrain à figer (14/09 : partagé par
     freeze() et rebakeFrozen()). o : {colorByAlt (0/1/2), col, tex, map:{key,ext,cxFrac,cyFrac,cx,cy}|null,
     drape, contours, contourInt, mesh, thick (cm), thickFlat, exag}. Les groupes ajoutés
     (drapé, courbes, maille, socle) restent à UV (0,0) : couleur unie. */
  function bakeParts(M, o) {
    var V = M.V, F = M.F, VZ = M.VZ, i;
    var pos = new Float32Array(V.length * 3);
    for (i = 0; i < V.length; i++) { pos[i*3]=V[i][0]; pos[i*3+1]=V[i][1]; pos[i*3+2]=V[i][2]; }
    var idx, groups, mapped = !!(o.map && o.map.key && +o.colorByAlt === 2);
    if (mapped) {
      var flatM = []; for (var fm = 0; fm < F.length; fm++) flatM.push(F[fm][0], F[fm][1], F[fm][2]);
      idx = Uint32Array.from(flatM);
      groups = [{ start: 0, count: idx.length, col: [190,190,182], tex: o.map.key, name: 'Terrain (' + (o.map.style === 'satellite' ? 'satellite' : 'plan') + ')' }];
    } else if (+o.colorByAlt) {
      var N = 10, bands = []; for (var k = 0; k < N; k++) bands.push([]);
      for (var f = 0; f < F.length; f++) { var tri = F[f], av = (VZ[tri[0]]+VZ[tri[1]]+VZ[tri[2]])/3, bi = Math.max(0, Math.min(N-1, Math.floor(av*N))); bands[bi].push(tri); }
      var flat = []; groups = []; var start = 0;
      for (k = 0; k < N; k++) { var bd = bands[k]; if (!bd.length) continue; for (var t = 0; t < bd.length; t++) flat.push(bd[t][0], bd[t][1], bd[t][2]); var cnt = bd.length*3; groups.push({ start: start, count: cnt, col: altColor((k+0.5)/N), tex: null, name: 'alt ' + k }); start += cnt; }
      idx = Uint32Array.from(flat);
    } else {
      var flat2 = []; for (var f2 = 0; f2 < F.length; f2++) flat2.push(F[f2][0], F[f2][1], F[f2][2]);
      idx = Uint32Array.from(flat2);
      groups = [{ start: 0, count: idx.length, col: o.col || M.col || [150,160,120], tex: o.tex || null, name: 'Terrain' }];
    }
    function addGeo(gd, col, name) {
      if (!gd || !gd.F.length) return;
      var baseV = pos.length / 3, pos2 = new Float32Array(pos.length + gd.V.length * 3); pos2.set(pos);
      for (var di = 0; di < gd.V.length; di++) { pos2[(baseV+di)*3]=gd.V[di][0]; pos2[(baseV+di)*3+1]=gd.V[di][1]; pos2[(baseV+di)*3+2]=gd.V[di][2]; }
      pos = pos2;
      var dstart = idx.length, dflat = [];
      for (var dfi = 0; dfi < gd.F.length; dfi++) dflat.push(gd.F[dfi][0]+baseV, gd.F[dfi][1]+baseV, gd.F[dfi][2]+baseV);
      var idx2 = new Uint32Array(idx.length + dflat.length); idx2.set(idx); idx2.set(dflat, idx.length); idx = idx2;
      groups.push({ start: dstart, count: dflat.length, col: col, tex: null, name: name });
    }
    if (o.drape && M.grid) addGeo(drapeGeo(M.grid), [64,66,72], 'Plan (drapé)');
    if (+o.contours && M.grid) addGeo(contourGeo(M.grid, +o.contourInt), [96,64,42], 'Courbes de niveau');
    if (+o.mesh && M.grid) addGeo(gridGeo(M.grid), [95,98,105], 'Maille');
    if (+o.thick > 0) addGeo(solidGeo(M, (+o.thick||0)/100 * (+o.exag||1), +o.thickFlat), o.col || M.col || [150,160,120], 'Socle');
    if (o.platShow !== 0 && M.grid && platsVisible(o.plats)) { var _pg = platGeo(M.grid, o.plats); addGeo(_pg.edge, PLAT_COLS.edge, 'Plateformes'); addGeo(_pg.cut, PLAT_COLS.cut, 'Pied de talus (déblai)'); addGeo(_pg.fill, PLAT_COLS.fill, 'Pied de talus (remblai)'); }
    var uv = null;
    if (mapped) {
      uv = new Float32Array((pos.length / 3) * 2);
      for (var ui = 0; ui < V.length; ui++) { var u = (V[ui][0] + (o.map.cx||0)) / o.map.ext + o.map.cxFrac, v = (V[ui][2] - (o.map.cy||0)) / o.map.ext + o.map.cyFrac; uv[ui*2] = u; uv[ui*2+1] = 1 - v; }
    }
    return { pos: pos, idx: idx, groups: groups, uv: uv };
  }
  /* grille figée (cm entiers, -100000 = hors masque, origines PRÉ-CENTRÉES) — même formule que les sommets figés */
  function gridPack(g, Z) {
    var ex = (+g.exag || 1), z = [];
    for (var gi = 0; gi < Z.length; gi++) { var on = (!g.mask || g.mask[gi]) && (Z[gi] === Z[gi]); z.push(on ? Math.round((g.zbase + (Z[gi] - g.z0) * ex) * 100) : -100000); }
    return { nx: g.nx, ny: g.ny, step: g.step, minX: g.minX - (g.cx || 0), minY: g.minY - (g.cy || 0), z: z };
  }
  /* ADRESSE dans le repère courant du maillage (15/09) : les points du relief ont l'adresse pour origine et le maillage est
     centré sur (cx, cy) de la grille FILTRÉE — les curseurs d'altitude retenue déplacent ce centre ; SITE_LOCAL, figé dans
     setGrid, restait en arrière. null pour un DXF (pas d'adresse). */
  function siteNow(g) { if (!SITE_LOCAL) return null; g = g || (MESH && MESH.grid); return (g && g.cx != null) ? { x: -g.cx, y: -g.cy } : { x: SITE_LOCAL.x, y: SITE_LOCAL.y }; }
  /* paramètres d'affichage qui voyagent avec l'objet figé */
  function packParams(vol, g) {
    /* les altitudes visées des plateformes passent dans le repère de l'OBJET (base, exagération), comme la grille figée */
    var ex = (g && +g.exag) || 1, plats = JSON.parse(JSON.stringify(PTERR.plats || []));
    if (g) plats.forEach(function (p) { p.z = Math.round((g.zbase + ((+p.z || 0) - g.z0) * ex) * 100) / 100; });
    return { colorByAlt: mapOn() ? 2 : (+PTERR.colorByAlt ? 1 : 0), col: (glob.FINISH && glob.FINISH.terrain) || (MESH && MESH.col) || null,
      contours: +PTERR.contours || 0, contourInt: +PTERR.contourInt || 0.5, contourW: +PTERR.contourW || 20, contourMaster: +PTERR.contourMaster || 0,
      mesh: +PTERR.mesh || 0, thick: +PTERR.thick || 0, thickFlat: (PTERR.thickFlat == null ? 1 : +PTERR.thickFlat),
      plats: plats, platShow: (PTERR.platShow == null ? 1 : +PTERR.platShow), vexag: ex, vol: vol || null, site: siteNow(g) };
  }
  function freeze() {
    if (!MESH || MESH.sig !== sig()) { var m = buildMesh(); if (m) m.sig = sig(); MESH = m; }
    if (!MESH || MESH.tooBig || !MESH.V.length) { glob.alert(tr('Aucun terrain à figer (charge un DXF d\'abord).')); return; }
    if (!(glob.BPO_import && glob.BPO_import.bake)) { glob.alert(tr('Module d\'import indisponible.')); return; }
    var _mappedF = mapOn();
    var _parts = bakeParts(MESH, { colorByAlt: _mappedF ? 2 : (+PTERR.colorByAlt ? 1 : 0), col: (glob.FINISH && glob.FINISH.terrain) || MESH.col, tex: (glob.FINISH_TEX && glob.FINISH_TEX.terrain) || null,
      map: _mappedF ? { key: MAP.key + 'b', ext: MAP.ext, cxFrac: MAP.cxFrac, cyFrac: MAP.cyFrac, cx: MESH.grid.cx, cy: MESH.grid.cy, style: MAP.style } : null,
      drape: +PTERR.drape, contours: +PTERR.contours, contourInt: +PTERR.contourInt, mesh: +PTERR.mesh, thick: +PTERR.thick, thickFlat: +PTERR.thickFlat, exag: +PTERR.exag, plats: PTERR.plats, platShow: (PTERR.platShow == null ? 1 : +PTERR.platShow) });
    var pos = _parts.pos, idx = _parts.idx, groups = _parts.groups;
    var def = _name ? ('Terrain ' + _name.replace(/\.dxf$/i, '')) : 'Terrain';
    var nm = glob.prompt(tr('Nom du terrain figé :'), def); if (nm === null) return; nm = nm.trim() || def;
    /* v2.7 : la GRILLE accompagne l'objet figé (registre runtime, cle = pid).
       L'export IFC la propage en pset BPO_Terrain -> le plugin ArchiCAD rebatit
       un OUTIL MAILLAGE natif. Alt. finale par noeud (cm), -100000 = hors masque.
       Meme formule que les sommets figes : y = zbase + (GZ - z0) * exag,
       origines PRE-CENTREES (minX-cx / minY-cy) comme la geometrie. */
    var _tg = null, _tgN = null;
    if (MESH.grid && MESH.grid.GZ) { _tg = gridPack(MESH.grid, MESH.grid.GZ); if (MESH.grid.GZN && PTERR.plats && PTERR.plats.length) _tgN = gridPack(MESH.grid, MESH.grid.GZN); }
    var _extra = _tg ? { tgrid: _tg } : {};
    if (_tgN) _extra.tgridNat = _tgN;                 /* grille NATURELLE : la trace des plateformes reste éditable sur l'objet figé */
    _extra.tparams = packParams(MESH.vol, MESH.grid);           /* couleur, courbes, maille, socle, plateformes, volumes : le panneau de scène les relit */
    if (_mappedF) {   /* UV inversées en V : WGL.makeTex charge les data-URL avec UNPACK_FLIP_Y, contrairement aux pixels bruts du mode Terrain ;
                         clé « b » distincte de la texture vivante (deux conventions, deux entrées TEX_IMAGES) */
      _extra.uv = _parts.uv; _extra.tex = {}; _extra.tex[MAP.key + 'b'] = MAP.dataURL;
      _extra.tmap = { key: MAP.key + 'b', ext: MAP.ext, cxFrac: MAP.cxFrac, cyFrac: MAP.cyFrac, cx: MESH.grid.cx, cy: MESH.grid.cy, style: MAP.style };
    }
    glob.BPO_import.bake(nm, pos, idx, groups, _extra).then(function (pid) {
      if (_tg && pid) { glob.BPO_TERRAIN_GRIDS = glob.BPO_TERRAIN_GRIDS || {}; glob.BPO_TERRAIN_GRIDS[pid] = _tg; }
      glob.alert(tr(_tg ? 'Terrain figé — disponible dans « Ma bibliothèque › Objets importés ». Posable en scène, sauvegardable, exportable (OBJ/DAE/IFC ; maillage natif ArchiCAD via le plugin).' : 'Terrain figé — disponible dans « Ma bibliothèque › Objets importés ». Posable en scène, sauvegardable, exportable (OBJ/DAE/IFC).'));   /* deux phrases entières : une clé chacune */
    }).catch(function (e) { glob.alert(tr('Échec du figeage :') + ' ' + (e && e.message || e)); });
  }

  /* ---- Panneau du configurateur ---- */
  /* Bloc partagé : maille apparente + épaisseur (socle). mkSlider(label,unit,key,min,max,step). */
  function meshThickUI(host, mkSlider) {
    function rb(){ if(typeof glob.build==='function'){try{glob.build();}catch(e){}} glob.DIRTY=true; buildUI(host); }
    var mh=doc.createElement('div'); mh.className='slbl'; mh.style.marginTop='8px'; mh.textContent='Maille apparente'; host.appendChild(mh);
    var mtg=doc.createElement('div'); mtg.className='finish-tabs';
    [['0','Sans'],['1','Voir la maille']].forEach(function(o){ var b=doc.createElement('button'); b.textContent=o[1]; if(String(PTERR.mesh)===o[0]) b.className='on'; b.onclick=function(){ PTERR.mesh=+o[0]; rb(); }; mtg.appendChild(b); });
    host.appendChild(mtg);
    var th=doc.createElement('div'); th.className='slbl'; th.style.marginTop='8px'; th.textContent='Épaisseur (socle)'; host.appendChild(th);
    mkSlider('Épaisseur du socle','cm','thick',0,2000,10);
    if(+PTERR.thick>0){
      var ftg=doc.createElement('div'); ftg.className='finish-tabs';
      [['1','Fond plat'],['0','Fond parallèle']].forEach(function(o){ var b=doc.createElement('button'); b.textContent=o[1]; if(String(PTERR.thickFlat)===o[0]) b.className='on'; b.onclick=function(){ PTERR.thickFlat=+o[0]; rb(); }; ftg.appendChild(b); });
      host.appendChild(ftg);
      var tn=doc.createElement('div'); tn.className='exp-note'; tn.textContent='Fond plat : base horizontale (bloc à poser). Fond parallèle : dalle d\'épaisseur constante épousant le relief.'; host.appendChild(tn);
    }
  }


  /* ---- Liste des plateformes : mode Terrain (plats = PTERR.plats, live) et terrain figé (tampon FZ[pid]) ----
     ctx : { zAt(x,y) altitude naturelle | null, volumes() -> {plats:[{cut,fill,area}], cut, fill, net} | null,
            addAt() -> {x,y}, change() rappelé après toute édition, unit 'NGF' | 'objet' } */
  /* plateforme neuve : SOURCE UNIQUE (bouton « + … », pointage au clic, aperçu du pointage) */
  function platDraft(at, zn, n) { return { name: 'Plateforme ' + (n + 1), shape: 'rect', x: Math.round(at.x * 10) / 10, y: Math.round(at.y * 10) / 10, w: at.w ? Math.round(at.w * 10) / 10 : 20, d: at.d ? Math.round(at.d * 10) / 10 : 15, r: 10, rot: at.rot ? Math.round(at.rot) : 0, z: Math.round(zn * 10) / 10, talus: 1.5, on: 1 }; }
  function platNewPlat(plats, at, zn) { plats.push(platDraft(at, zn, plats.length)); return plats.length - 1; }
  function platsUI(host, plats, ctx) {
    var wrap = doc.createElement('div'); wrap.style.cssText = 'border-top:1px dashed var(--ln);margin-top:8px;padding-top:6px;';
    wrap.innerHTML = '<div class="slbl" style="font-size:10px;margin:2px 0 3px;">Plateformes (plat / creux)</div>';
    var vol = null; try { vol = ctx.volumes ? ctx.volumes() : null; } catch (e) {}
    if (ctx.getShow) { var tgS = doc.createElement('div'); tgS.className = 'wall-toggle'; var shOn = +ctx.getShow();
      tgS.innerHTML = '<span>Contour des plateformes</span><button class="' + (shOn ? 'on' : '') + '"><span>' + (shOn ? 'Activé' : 'Désactivé') + '</span></button>';
      tgS.querySelector('button').onclick = function () { ctx.setShow(shOn ? 0 : 1); ctx.change(); }; wrap.appendChild(tgS); }
    function num(parent, lbl, obj, key, step, unit) {
      var f = doc.createElement('div'); f.style.cssText = 'display:flex;align-items:center;gap:4px;margin:1px 0;font-size:10px;';
      var l = doc.createElement('span'); l.textContent = lbl; l.style.cssText = 'flex:1;color:var(--dm);';
      var inp = doc.createElement('input'); inp.type = 'number'; inp.step = step; inp.value = (obj[key] == null ? '' : Math.round(obj[key] * 100) / 100);
      inp.style.cssText = 'width:74px;font-size:10px;background:var(--p2);color:var(--tx);border:1px solid var(--ln);border-radius:4px;padding:2px 3px;text-align:right;';
      inp.onchange = function () { var v = parseFloat(inp.value); if (!isNaN(v)) { obj[key] = v; ctx.change(); } };
      var u = doc.createElement('span'); u.textContent = unit || ''; u.style.cssText = 'width:22px;color:var(--dm);';
      f.appendChild(l); f.appendChild(inp); f.appendChild(u); parent.appendChild(f);
    }
    plats.forEach(function (p, i) {
      var card = doc.createElement('div'); card.style.cssText = 'border:1px solid var(--ln);border-radius:6px;padding:5px 6px;margin:4px 0;' + (p.on === 0 ? 'opacity:.55;' : '');
      var hd = doc.createElement('div'); hd.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:3px;';
      var nm = doc.createElement('input'); nm.type = 'text'; nm.value = p.name || ('Plateforme ' + (i + 1)); nm.style.cssText = 'flex:1;font-size:10.5px;font-weight:600;background:transparent;color:var(--tx);border:0;border-bottom:1px solid var(--ln);padding:1px 2px;outline:none;';
      nm.onchange = function () { p.name = nm.value.trim(); };
      var bOn = doc.createElement('button'); bOn.textContent = (p.on === 0) ? 'Inactive' : 'Active'; bOn.className = (p.on === 0) ? '' : 'on'; bOn.style.cssText = 'font-size:9.5px;padding:1px 6px;';
      bOn.onclick = function () { p.on = (p.on === 0) ? 1 : 0; ctx.change(); };
      var bDel = doc.createElement('button'); bDel.textContent = '✕'; bDel.title = 'Supprimer'; bDel.style.cssText = 'font-size:10px;padding:1px 5px;';
      bDel.onclick = function () { plats.splice(i, 1); ctx.change(); };
      hd.appendChild(nm);
      if (ctx.gizmo && p.on !== 0) { var bG = doc.createElement('button'), gOn = !!(ctx.gizmoOn && ctx.gizmoOn(i)); bG.textContent = '✥'; bG.title = tr('Manipuler dans la vue'); bG.className = gOn ? 'on' : ''; bG.style.cssText = 'font-size:12px;padding:0 6px;';
        bG.onclick = function () { ctx.gizmo(i); }; hd.appendChild(bG); }
      hd.appendChild(bOn); hd.appendChild(bDel); card.appendChild(hd);
      if (ctx.gizmoOn && ctx.gizmoOn(i)) { var gh = doc.createElement('div'); gh.className = 'exp-note'; gh.style.cssText = 'color:#5eb8ff;margin:0 0 3px;'; gh.textContent = 'Glissez les poignées dans la vue : point = déplacer, flèches = le long des côtés, carrés = dimensions, rond = rotation, flèche verticale = altitude. Maj : sans pas. Échap pour quitter.'; card.appendChild(gh); }
      var sh = doc.createElement('div'); sh.className = 'finish-tabs';
      [['rect', 'Rectangle'], ['cercle', 'Cercle']].forEach(function (o) { var b = doc.createElement('button'); b.textContent = o[1]; if ((p.shape || 'rect') === o[0]) b.className = 'on'; b.onclick = function () { p.shape = o[0]; ctx.change(); }; sh.appendChild(b); });
      card.appendChild(sh);
      num(card, 'X (est)', p, 'x', 0.5, 'm'); num(card, 'Y (nord)', p, 'y', 0.5, 'm');
      if ((p.shape || 'rect') === 'cercle') num(card, 'Rayon', p, 'r', 0.5, 'm'); else { num(card, 'Largeur', p, 'w', 0.5, 'm'); num(card, 'Profondeur', p, 'd', 0.5, 'm'); num(card, 'Rotation', p, 'rot', 1, '°'); }
      num(card, 'Altitude visée', p, 'z', 0.1, 'm'); num(card, 'Talus (H/V)', p, 'talus', 0.1, '');
      var pr = ctx.project ? ctx.project(p) : null;
      if (pr) { var pb = doc.createElement('div'); pb.style.cssText = 'display:flex;gap:4px;margin-top:3px;';
        var b1 = doc.createElement('button'); b1.textContent = '↧ Altitude du projet'; b1.title = pr.name || ''; b1.style.cssText = 'flex:1;font-size:9.5px;padding:2px 4px;';
        b1.onclick = function () { p.z = Math.round(ctx.projectBase(pr) * 100) / 100; ctx.change(); };
        var b2 = doc.createElement('button'); b2.textContent = '⇡ Poser le projet sur la plateforme'; b2.title = pr.name || ''; b2.style.cssText = 'flex:1;font-size:9.5px;padding:2px 4px;';
        b2.onclick = function () { ctx.placeProject(pr, p); ctx.change(); };
        pb.appendChild(b1); pb.appendChild(b2); card.appendChild(pb); }
      var zn = (ctx.zAt ? ctx.zAt(+p.x || 0, +p.y || 0) : null);
      var inf = doc.createElement('div'); inf.className = 'exp-note'; inf.style.margin = '3px 0 0';
      var vp = vol && vol.plats && vol.plats[i];
      inf.innerHTML = (zn != null ? ('<span>Terrain naturel au centre</span> : ' + (Math.round(zn * 100) / 100).toString().replace('.', ',') + ' m — <span>' + ((+p.z || 0) < zn - 0.05 ? 'creux' : ((+p.z || 0) > zn + 0.05 ? 'remblai' : 'au niveau')) + '</span><br>') : '')
        + (vp ? ('<span>Déblai</span> ' + fmtVol(vp.cut) + ' · <span>remblai</span> ' + fmtVol(vp.fill) + ' · <span>emprise</span> ' + Math.round(vp.area).toLocaleString('fr-FR') + ' m²') : '');
      card.appendChild(inf); wrap.appendChild(card);
    });
    /* POINTAGE (15/09) : la plateforme se pose là où l'on clique sur le relief */
    if (ctx.pick) { var pOn = !!(ctx.pickOn && ctx.pickOn());
      var bPk = doc.createElement('button'); bPk.className = 'tex-none'; bPk.style.cssText = 'width:100%;font-size:10.5px;padding:4px;margin-top:4px;' + (pOn ? 'border-color:#5eb8ff;color:#5eb8ff;' : '');
      bPk.textContent = pOn ? '✕ Annuler le pointage' : '⌖ Placer en cliquant sur le terrain';
      bPk.onclick = function () { ctx.pick(); }; wrap.appendChild(bPk);
      if (pOn) { var pht = doc.createElement('div'); pht.className = 'exp-note'; pht.style.cssText = 'color:#5eb8ff;margin:2px 0 3px;';
        pht.textContent = 'Cliquez sur le relief dans la vue : la plateforme sera centrée sur le point visé, à l\'altitude du terrain naturel. Glisser = orbiter · Échap = annuler.'; wrap.appendChild(pht); } }
    var bAdd = doc.createElement('button'); bAdd.className = 'tex-none'; bAdd.style.cssText = 'width:100%;font-size:10.5px;padding:4px;margin-top:2px;';
    var addLbl = ctx.addLabel ? ctx.addLabel() : null;
    bAdd.textContent = addLbl || (plats.length ? '+ Ajouter une plateforme' : '+ Plateforme au point d\'implantation');
    bAdd.onclick = function () { var at = ctx.addAt ? ctx.addAt() : { x: 0, y: 0 }; var zn = ctx.zAt ? ctx.zAt(at.x, at.y) : null;
      /* hors du masque (bord, contour en U d'un DXF) : le nœud valide le plus proche — jamais z = 0, qui creusait tout le terrain */
      if (zn == null && ctx.snap) { var sn = ctx.snap(at.x, at.y); if (sn) { at = { x: sn.x, y: sn.y, w: at.w, d: at.d, rot: at.rot }; zn = sn.z; } }
      if (zn == null) { glob.alert(tr('Aucun terrain sous ce point.')); return; }
      platNewPlat(plats, at, zn); ctx.change(); };
    wrap.appendChild(bAdd);
    if (vol && plats.length) { var tot = doc.createElement('div'); tot.className = 'exp-note'; tot.style.cssText = 'color:var(--am);margin-top:4px;';
      tot.innerHTML = '<span>Total</span> — <span>déblai</span> ' + fmtVol(vol.cut) + ' · <span>remblai</span> ' + fmtVol(vol.fill) + ' · <span>net</span> ' + (vol.net >= 0 ? '+' : '−') + fmtVol(Math.abs(vol.net)) + (Math.abs(vol.net) < 1 ? ' (<span>équilibre</span>)' : (vol.net > 0 ? ' (<span>apport</span>)' : ' (<span>évacuation</span>)'));
      wrap.appendChild(tot); }
    var note = doc.createElement('div'); note.className = 'exp-note'; note.textContent = 'Le sol rejoint le terrain naturel en talus à la pente H/V indiquée. Les volumes sont comptés sur la grille, maille par maille ; la liste est la trace des modifications, elle voyage avec le terrain figé et dans l\'IFC.'; wrap.appendChild(note);
    if (plats.length && (!ctx.getShow || +ctx.getShow())) { var lg = doc.createElement('div'); lg.className = 'exp-note'; lg.textContent = 'Trait orange : bord de la plateforme ; rouge : pied de talus en déblai ; bleu : pied de talus en remblai.'; wrap.appendChild(lg); }
    host.appendChild(wrap);
  }
  /* mode Terrain : contexte live */
  function platsUILive(host) {
    platsUI(host, (PTERR.plats = PTERR.plats || []), {
      zAt: function (x, y) { return (MESH && MESH.grid) ? gridZAt(MESH.grid, x, y, true) : null; },
      volumes: function () { return MESH ? MESH.vol : null; },
      addAt: function () { return siteNow() || { x: 0, y: 0 }; },
      snap: function (x, y) { return (MESH && MESH.grid) ? gridSnap(MESH.grid, x, y) : null; },
      getShow: function () { return (PTERR.platShow == null) ? 1 : +PTERR.platShow; },
      setShow: function (v) { PTERR.platShow = v; },
      gizmo: function (i) { if (typeof glob.platGizToggle === 'function') glob.platGizToggle({ ctx: 'terrain', i: i }); },
      gizmoOn: function (i) { return typeof glob.platGizOn === 'function' && glob.platGizOn('terrain', i); },
      pick: function () { if (typeof glob.platPointageToggle === 'function') glob.platPointageToggle({ ctx: 'terrain' }); },
      pickOn: function () { return typeof glob.platPointageOn === 'function' && glob.platPointageOn('terrain'); },
      change: function () { MESH = null; if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } glob.DIRTY = true; setTimeout(function () { if (glob.MODE === 'terrain') buildUI(host); }, 30); }
    });
  }

  /* ============================================================================
     TERRAIN FIGÉ EN SCÈNE (14/09/2026) — le panneau relit meta.tparams de l'objet, édite un
     tampon FZ[pid], et « Appliquer » REFABRIQUE l'objet depuis sa grille figée (meta.tgridNat
     si des plateformes existent, sinon meta.tgrid) sans changer son pid : instances, scènes
     et bibliothèque le suivent. L'exagération verticale est cuite dans la grille : pas rééditable.
     ============================================================================ */
  function frozenGrid(D, nat) {
    var tg = (nat && D.meta.tgridNat) || D.meta.tgrid; if (!tg) return null;
    var n = tg.nx * tg.ny, GZ = new Float32Array(n), mask = new Uint8Array(n);
    for (var i = 0; i < n; i++) { var z = tg.z[i]; if (z != null && z > -99999) { GZ[i] = z / 100; mask[i] = 1; } else { GZ[i] = NaN; } }
    var g = { GZ: GZ, mask: mask, nx: tg.nx, ny: tg.ny, minX: tg.minX, minY: tg.minY, step: tg.step, cx: 0, cy: 0, z0: 0, zbase: 0, exag: 1 };
    if (nat && D.meta.tgridNat && D.meta.tgrid) { var GF = new Float32Array(n); for (var k = 0; k < n; k++) { var zf = D.meta.tgrid.z[k]; GF[k] = (zf != null && zf > -99999) ? zf / 100 : NaN; } g.GZN = GZ; g.GZ = GF; }
    return g;
  }
  function meshFromGrid(g) {
    var nx = g.nx, ny = g.ny, GZ = g.GZ, mask = g.mask, NC = nx * ny, i, y, x;
    var z0 = 1e18, zmax = -1e18, Z = g.GZN || GZ; for (i = 0; i < NC; i++) if (mask[i] && Z[i] === Z[i]) { if (Z[i] < z0) z0 = Z[i]; if (Z[i] > zmax) zmax = Z[i]; }
    var zr = Math.max(0.01, zmax - z0), vid = new Int32Array(NC), V = [], VZ = [], kv = 0;
    for (i = 0; i < NC; i++) vid[i] = -1;
    for (y = 0; y < ny; y++) for (x = 0; x < nx; x++) { var iv = y * nx + x; if (!mask[iv] || GZ[iv] !== GZ[iv]) continue; vid[iv] = kv++; V.push([g.minX + x * g.step, GZ[iv], -(g.minY + y * g.step)]); VZ.push((GZ[iv] - z0) / zr); }
    var F = []; for (y = 0; y < ny - 1; y++) for (x = 0; x < nx - 1; x++) { var a = vid[y*nx+x], b = vid[y*nx+x+1], c2 = vid[(y+1)*nx+x+1], e = vid[(y+1)*nx+x]; if (a >= 0 && b >= 0 && c2 >= 0 && e >= 0) { F.push([a, b, c2]); F.push([a, c2, e]); } }
    return { V: V, VZ: VZ, F: F, z0: z0, grid: g, col: [150,160,120] };
  }
  function frozenParams(D) {
    var p = D.meta.tparams ? JSON.parse(JSON.stringify(D.meta.tparams)) : { colorByAlt: 1, col: null, contours: 0, contourInt: 0.5, contourW: 20, contourMaster: 5, mesh: 0, thick: 0, thickFlat: 1, plats: [], vol: null, site: null };
    if (!p.plats) p.plats = []; if (p.platShow == null) p.platShow = 1; if (!p.vexag) p.vexag = 1; return p;
  }
  function rebakeFrozen(pid, P) {
    var D = glob.TEX_OBJECTS && glob.TEX_OBJECTS[pid];
    if (!(D && D.meta && D.meta.tgrid)) return Promise.reject(new Error('grille figée absente'));
    if (!(glob.BPO_import && glob.BPO_import.rebake)) return Promise.reject(new Error('module d\'import sans rebake'));
    var g = frozenGrid(D, true); if (!g) return Promise.reject(new Error('grille illisible'));
    if (!g.GZN) g.GZN = new Float32Array(g.GZ);
    g.vex = +P.vexag || 1;
    var vol = platApply(g, P.plats);
    var M = meshFromGrid(g);
    var map = (P.colorByAlt === 2 && D.meta.tmap && D.tex && D.tex[D.meta.tmap.key]) ? D.meta.tmap : null;
    var parts = bakeParts(M, { colorByAlt: map ? 2 : (+P.colorByAlt ? 1 : 0), col: P.col || null, tex: null, map: map, drape: 0, contours: +P.contours, contourInt: +P.contourInt, mesh: +P.mesh, thick: +P.thick, thickFlat: +P.thickFlat, exag: 1, plats: P.plats, platShow: (P.platShow == null ? 1 : +P.platShow) });
    P.vol = vol;
    var snap = JSON.stringify(P);   /* instantané : les éditions faites PENDANT la refabrication survivent — le tampon n'est libéré que s'il n'a pas bougé */
    var extra = { tgrid: gridPack(g, g.GZ), tparams: JSON.parse(snap) };
    if (P.plats.length) extra.tgridNat = gridPack(g, g.GZN);
    if (parts.uv) extra.uv = parts.uv;
    return glob.BPO_import.rebake(pid, parts.pos, parts.idx, parts.groups, extra).then(function () { if (FZ[pid] === P && JSON.stringify(P) === snap) FZ[pid] = null; return vol; });
  }
  /* ACCÈS POUR LE GIZMO (15/09) — le tampon d'édition d'un terrain figé, sa refabrication gardée, le maillage vivant */
  function frozenBuf(pid) { var D = glob.TEX_OBJECTS && glob.TEX_OBJECTS[pid]; if (!(D && D.meta && D.meta.tgrid)) return null; if (!D.meta.tparams && !FZ[pid]) return null; return FZ[pid] || (FZ[pid] = frozenParams(D)); }
  function frozenApply(pid) { var P = frozenBuf(pid); if (!P) return Promise.reject(new Error('terrain figé indisponible')); if (BUSY[pid]) return Promise.reject(new Error('refabrication en cours'));
    BUSY[pid] = 1; return rebakeFrozen(pid, P).then(function (v) { BUSY[pid] = 0; return v; }, function (e) { BUSY[pid] = 0; throw e; }); }
  function meshGrid() { return (MESH && !MESH.tooBig && MESH.grid) ? MESH.grid : null; }
  /* grille du terrain FIGÉ pour le pointage en scène (même lecture que le panneau : tgrid affiché, tgridNat naturel) */
  function platPickGrid(pid) { var D = glob.TEX_OBJECTS && glob.TEX_OBJECTS[pid]; if (!(D && D.meta && D.meta.tgrid)) return null;
    var g = null; try { g = frozenGrid(D, true); if (g && !g.GZN) g.GZN = new Float32Array(g.GZ); } catch (e) { g = null; } return g; }
  function buildFrozenUI(host, inst, idx) {
    var pid = inst && inst.prod, D = glob.TEX_OBJECTS && glob.TEX_OBJECTS[pid];
    if (!(D && D.meta && D.meta.tgrid)) return;
    if (!D.meta.tparams && !FZ[pid]) {   /* terrain figé d'avant : paramètres relus sur l'objet, puis le panneau se refait */
      if (!RECOV[pid]) { RECOV[pid] = 1; recoverFrozen(pid, D).then(function () { if (glob.MODE === 'scene' && typeof glob.buildSceneUI === 'function') glob.buildSceneUI(); }, function () { FZ[pid] = frozenParams(D); if (glob.MODE === 'scene' && typeof glob.buildSceneUI === 'function') glob.buildSceneUI(); }); }
      var wt = doc.createElement('div'); wt.className = 'exp-note'; wt.textContent = 'Lecture du terrain figé…'; host.appendChild(wt); return;
    }
    var P = FZ[pid] || (FZ[pid] = frozenParams(D));
    var box = doc.createElement('div'); box.style.cssText = 'border-top:1px solid var(--ln);margin-top:6px;padding-top:5px;';
    box.innerHTML = '<div class="slbl" style="font-size:10px;margin:2px 0 3px;">⛰ Terrain figé — affichage et plateformes</div>';
    function rer() { if (typeof glob.buildSceneUI === 'function') glob.buildSceneUI(); }
    function tabs(opts, get, set) { var tg = doc.createElement('div'); tg.className = 'finish-tabs'; tg.style.marginTop = '4px'; opts.forEach(function (o) { var b = doc.createElement('button'); b.textContent = o[1]; if (String(get()) === String(o[0])) b.className = 'on'; b.onclick = function () { set(o[0]); rer(); }; tg.appendChild(b); }); box.appendChild(tg); }
    function num(lbl, key, step, unit) { var f = doc.createElement('div'); f.style.cssText = 'display:flex;align-items:center;gap:4px;margin:1px 0;font-size:10px;'; var l = doc.createElement('span'); l.textContent = lbl; l.style.cssText = 'flex:1;color:var(--dm);'; var inp = doc.createElement('input'); inp.type = 'number'; inp.step = step; inp.value = P[key]; inp.style.cssText = 'width:64px;font-size:10px;background:var(--p2);color:var(--tx);border:1px solid var(--ln);border-radius:4px;padding:2px 3px;text-align:right;'; inp.onchange = function () { var v = parseFloat(inp.value); if (!isNaN(v)) { P[key] = v; rer(); } }; var u = doc.createElement('span'); u.textContent = unit; u.style.cssText = 'width:22px;color:var(--dm);'; f.appendChild(l); f.appendChild(inp); f.appendChild(u); box.appendChild(f); }
    var cols = [['1', 'Dégradé altitude'], ['0', 'Matière unie']]; if (D.meta.tmap && D.tex && D.tex[D.meta.tmap.key]) cols.push(['2', 'Carte / satellite']);
    tabs(cols, function () { return P.colorByAlt; }, function (v) { P.colorByAlt = +v; });
    tabs([['0', 'Courbes off'], ['1', 'Courbes de niveau']], function () { return +P.contours; }, function (v) { P.contours = +v; });
    if (+P.contours) num('Équidistance', 'contourInt', 0.1, 'm');
    tabs([['0', 'Maille off'], ['1', 'Maille apparente']], function () { return +P.mesh; }, function (v) { P.mesh = +v; });
    num('Épaisseur du socle', 'thick', 5, 'cm');
    if (+P.thick > 0) tabs([['1', 'Fond plat'], ['0', 'Fond parallèle']], function () { return +P.thickFlat; }, function (v) { P.thickFlat = +v; });
    var gN = null; try { gN = frozenGrid(D, true); if (gN && !gN.GZN) gN.GZN = new Float32Array(gN.GZ); } catch (e) {}
    function onTer(x, y) { return !gN || gridZAt(gN, x, y, true) != null; }   /* un projet hors du terrain ne reçoit pas de plateforme (elle finissait au bord) */
    platsUI(box, P.plats, {
      zAt: function (x, y) { return gN ? gridZAt(gN, x, y, true) : null; },
      volumes: function () { if (!gN) return null; var gg = { GZ: new Float32Array(gN.GZN), GZN: gN.GZN, mask: gN.mask, nx: gN.nx, ny: gN.ny, minX: gN.minX, minY: gN.minY, step: gN.step, cx: 0, cy: 0, vex: +P.vexag || 1 }; return platApply(gg, P.plats); },
      addAt: function () { var sx = P.site ? +P.site.x || 0 : 0, sy = P.site ? +P.site.y || 0 : 0, pr = projectNear(inst, sx, sy, onTer); return pr || { x: sx, y: sy }; },
      addLabel: function () { var sx = P.site ? +P.site.x || 0 : 0, sy = P.site ? +P.site.y || 0 : 0; return projectNear(inst, sx, sy, onTer) ? '+ Plateforme sous le projet' : null; },
      snap: function (x, y) { return gN ? gridSnap(gN, x, y) : null; },
      getShow: function () { return (P.platShow == null) ? 1 : +P.platShow; },
      setShow: function (v) { P.platShow = v; },
      gizmo: function (i) { if (typeof glob.platGizToggle === 'function') glob.platGizToggle({ ctx: 'scene', ix: idx, pid: pid, i: i }); },
      gizmoOn: function (i) { return typeof glob.platGizOn === 'function' && glob.platGizOn('scene', i) && !!glob.PLAT_GIZ && glob.PLAT_GIZ.pid === pid; },
      pick: function () { if (typeof glob.platPointageToggle === 'function') glob.platPointageToggle({ ctx: 'scene', ix: idx, pid: pid }); },
      pickOn: function () { return typeof glob.platPointageOn === 'function' && glob.platPointageOn('scene') && !!glob.PLAT_POINTAGE && glob.PLAT_POINTAGE.pid === pid; },
      project: function (p) { return projectNear(inst, +p.x || 0, +p.y || 0, onTer); },   /* un projet hors du terrain n'est ni mesuré ni posé */
      projectBase: function (pr) { return projWorldBase(pr.o) - (inst.y || 0) / 100; },   /* terrain sans inclinaison : y objet = y monde − y instance */
      placeProject: function (pr, p) { var o = pr.o; o.y = (o.y || 0) + Math.round(((inst.y || 0) / 100 + (+p.z || 0) - projWorldBase(o)) * 100); if (typeof glob.scnLive === 'function') { try { glob.scnLive(); } catch (e) {} } glob.DIRTY = true; },
      change: rer
    });
    var bA = doc.createElement('button'); bA.className = 'save-add'; bA.style.marginTop = '6px'; bA.textContent = '↻ Appliquer au terrain figé';
    if (BUSY[pid]) { bA.disabled = true; bA.textContent = 'Refabrication…'; }   /* refabrication lancée par le gizmo en cours */
    bA.onclick = function () { bA.textContent = 'Refabrication…'; bA.disabled = true;
      frozenApply(pid).then(function () { rer(); }).catch(function (e) {
        /* écriture avortée (quota, disque plein) : l'objet EST refabriqué en mémoire mais reviendra au rechargement — le dire ; le tampon reste pour réessayer */
        if (e && e.saveFailed) glob.alert(tr('Terrain refabriqué mais non enregistré (espace de stockage ?) : il reviendra à son état précédent au rechargement.') + ' ' + (e.message || ''));
        else glob.alert(tr('Refabrication impossible :') + ' ' + (e && e.message || e));
        rer(); }); };
    box.appendChild(bA);
    var n2 = doc.createElement('div'); n2.className = 'exp-note'; n2.textContent = 'L\'objet est refabriqué en place : ses instances en scène, les scènes enregistrées et la bibliothèque le suivent. L\'exagération verticale et le lissage sont figés.'; box.appendChild(n2);
    host.appendChild(box);
  }
  function buildUI(host) {
    host.innerHTML = '';
    /* SOURCE : DXF (points cotés) ou forme paramétrique créée */
    var srcTg = doc.createElement('div'); srcTg.className = 'finish-tabs'; srcTg.style.marginBottom = '6px';
    [['dxf', 'Depuis DXF'], ['shape', 'Créer une forme']].forEach(function (o) { var b = doc.createElement('button'); b.textContent = o[1]; if (PTERR.src === o[0]) b.className = 'on';
      b.onclick = function () { PTERR.src = o[0]; MESH = null; if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } if (typeof glob.fitCamera === 'function') { try { glob.fitCamera(glob.DIMS); } catch (e) {} } glob.DIRTY = true; buildUI(host); }; srcTg.appendChild(b); });
    host.appendChild(srcTg);
    var bcad = doc.createElement('button'); bcad.className = 'save-add'; bcad.textContent = '⭳ Importer cadastre (fond de plan)'; bcad.style.margin = '2px 0 8px';
    bcad.onclick = function () { if (glob.BPO_cadastre) glob.BPO_cadastre.open(); else glob.alert(tr('Module cadastre non chargé (recharge la page).')); };
    host.appendChild(bcad);
    /* PDF -> DXF (26/09/2026, AL) : le trace vectoriel d'un plan PDF, ecrit en DXF a l'echelle. bpo-pdf2dxf.js */
    var bpdx = doc.createElement('button'); bpdx.className = 'save-add'; bpdx.textContent = '\u{1F4D0} ' + tr('Convertir un PDF en DXF'); bpdx.style.margin = '0 0 8px';
    bpdx.onclick = function () { if (glob.BPO_pdf2dxf) glob.BPO_pdf2dxf.ouvrir(); else glob.alert(tr('Module cadastre non charg\u00e9 (recharge la page).')); };
    host.appendChild(bpdx);
    if (PTERR.src === 'shape') { buildShapeUI(host); return; }
    var card = doc.createElement('div'); card.className = 'fld';
    card.innerHTML = '<div class="fh"><span>Terrain — MNT depuis DXF</span></div>' +
      '<div style="font-size:10.5px;color:var(--dm);line-height:1.5;margin:2px 0 8px;">Chargez un DXF topographique dont les altitudes sont écrites en <b>points cotés</b> (texte). BPO extrait les cotes et construit un terrain maillé, éditable ci-dessous.</div>';
    host.appendChild(card);
    // charger DXF
    var fin = doc.createElement('input'); fin.type = 'file'; fin.accept = '.dxf'; fin.style.display = 'none';
    var bLoad = doc.createElement('button'); bLoad.className = 'save-add'; bLoad.textContent = '⭳Charger un DXF (points cotés)'; bLoad.style.margin = '2px 0 6px';
    bLoad.onclick = function () { fin.click(); };
    fin.onchange = function () { var file = fin.files && fin.files[0]; if (!file) return; tplSet(bLoad, '… lecture {0}', [file.name]);
      var rd = new FileReader(); rd.onload = function () { try { var nb = setDXF(rd.result, file.name); tplSet(bLoad, '⭳{0} — {1} cotes', [file.name, nb]);
        if (nb) tplSet(info, '{0} points cotés lus.', [nb]); else tplSet(info, 'Aucun point coté trouvé (le DXF doit contenir des altitudes en texte).');
        if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } if (typeof glob.updateDims === 'function') glob.updateDims(); if (typeof glob.fitCamera === 'function') { try{ glob.fitCamera(glob.DIMS); }catch(e){} } glob.DIRTY = true; buildUI(host);
      } catch (e) { tplSet(info, 'Erreur de lecture : {0}', [String(e && e.message || e)]); } };
      rd.readAsText(file, 'windows-1252'); };   /* DXF AutoCAD = ANSI_1252 : accents des calques OK */
    host.appendChild(bLoad); host.appendChild(fin);
    var info = doc.createElement('div'); info.className = 'exp-note'; if (hasData()) tplSet(info, '{0} points cotés en mémoire.', [RAW.length]); else tplSet(info, 'Aucun terrain chargé.'); host.appendChild(info);
    /* RELIEF IGN / SRTM autour d'une adresse (12/09/2026) — même chaîne que Site / Géolocalisation (loadSiteMap → loadSiteDEM → setGrid) */
    var gcard = doc.createElement('div'); gcard.className = 'fld'; gcard.style.marginTop = '8px';
    gcard.innerHTML = '<div class="fh"><label>Adresse du site</label></div>';
    var gin = doc.createElement('input'); gin.type = 'text'; gin.value = (glob.SITE && glob.SITE.addr) || ''; gin.placeholder = 'ex. 12 rue de la Paix, Lyon';
    gin.style.cssText = 'width:100%;font-size:11px;background:var(--p2);color:var(--tx);border:1px solid var(--ln);border-radius:4px;padding:5px;box-sizing:border-box;outline:none;';
    gcard.appendChild(gin); host.appendChild(gcard);
    var rsel = doc.createElement('div'); rsel.className = 'finish-tabs';   /* emprise ≈ 3 tuiles : le zoom de la carte fait le rayon */
    [[18, '≈ 300 m'], [17, '≈ 600 m'], [16, '≈ 1,2 km'], [15, '≈ 2,4 km']].forEach(function (o) { var b = doc.createElement('button'); b.textContent = o[1]; if (((glob.SITE && glob.SITE.zoom) || 18) === o[0]) b.className = 'on'; b.onclick = function () { if (glob.SITE) glob.SITE.zoom = o[0]; buildUI(host); }; rsel.appendChild(b); });
    host.appendChild(rsel);
    var msel = doc.createElement('div'); msel.className = 'finish-tabs';   /* fond drapé sur le relief (et conservé dans l'objet figé) */
    [['satellite', 'Satellite'], ['plan', 'Plan OSM']].forEach(function (o) { var b = doc.createElement('button'); b.textContent = o[1]; if ((PTERR.mapStyle || 'satellite') === o[0]) b.className = 'on'; b.onclick = function () { PTERR.mapStyle = o[0]; buildUI(host); }; msel.appendChild(b); });
    host.appendChild(msel);
    var bign = doc.createElement('button'); bign.className = 'save-add'; bign.textContent = '⛰ Relief IGN à cette adresse'; bign.style.margin = '2px 0 6px';
    bign.onclick = function () {
      if (!(glob.SITE && typeof glob.loadSiteMap === 'function' && typeof glob.siteDemToTerrain === 'function' && typeof glob.geocodeAddr === 'function')) { glob.alert('Module Site / Géolocalisation indisponible.'); return; }
      var S = glob.SITE, addr = gin.value.trim();
      function go() { bign.textContent = 'Chargement du relief…'; S._demWant = 1; S.mapStyle = PTERR.mapStyle || 'satellite';
        S._mapCb = function () { if (!S.dem) { bign.textContent = 'Relief indisponible ici.'; return; } glob.siteDemToTerrain(); };
        glob.loadSiteMap(); }
      if (addr && (addr !== S.addr || !S.on)) { bign.textContent = 'Géocodage…'; S.addr = addr; glob.geocodeAddr(addr, function (r) { if (!r) { bign.textContent = 'Adresse introuvable'; return; } S.lat = r.lat; S.lon = r.lon; go(); }); }
      else if (S.on) go(); else glob.alert('Indiquez une adresse.');
    };
    host.appendChild(bign);
    var gnote = doc.createElement('div'); gnote.className = 'exp-note'; gnote.textContent = 'Relief autour de l\'adresse : IGN RGE ALTI (1 m) en France, sinon SRTM (~30 m). Remplace les points cotés du DXF.'; host.appendChild(gnote);
    if (!hasData()) return;
    // stats
    if (MESH && !MESH.tooBig) { var st = doc.createElement('div'); st.className = 'exp-note'; st.style.color = 'var(--am)';
      tplSet(st, 'Emprise {0} × {1} m · relief {2} m · {3} faces', [Math.round(MESH.dims.w), Math.round(MESH.dims.d), (MESH.dims.h/(+PTERR.exag||1)).toFixed(2), MESH.F.length]); host.appendChild(st); }
    // sliders (rebuild à la validation pour éviter de recalculer à chaque pixel)
    function slider(label, unit, key, min, max, step, live) {
      var fld = doc.createElement('div'); fld.className = 'fld';
      fld.innerHTML = '<div class="fh"><label>' + label + (unit ? ' <span class="u">' + unit + '</span>' : '') + '</label>' +
        '<input type="number" min="' + min + '" max="' + max + '" step="' + step + '" value="' + PTERR[key] + '"></div>' +
        '<input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + PTERR[key] + '">';
      var num = fld.querySelector('input[type=number]'), rng = fld.querySelector('input[type=range]');
      function apply(v, rebuild) { v = Math.max(min, Math.min(max, v)); PTERR[key] = v; num.value = v; rng.value = v; if (rebuild) { MESH = null; if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } glob.DIRTY = true; refreshStats(); } }
      rng.oninput = function () { num.value = rng.value; }; rng.onchange = function () { apply(+rng.value, true); };
      num.onchange = function () { if (!isNaN(parseFloat(num.value))) apply(parseFloat(num.value), true); };
      host.appendChild(fld);
    }
    function refreshStats(){ /* recalcule et rafraîchit le panneau après build */ setTimeout(function(){ if (glob.MODE==='terrain') buildUI(host); }, 30); }
    slider('Maille (résolution)', 'm', 'step', 1, 8, 0.5);
    slider('Lissage', '', 'smooth', 0, 6, 0.5);
    slider('Découpe au contour', 'm', 'cut', 4, 40, 1);
    slider('Exagération verticale', '×', 'exag', 1, 20, 0.5);
    slider('Altitude mini retenue', 'm', 'bandMin', 0, 100, 1);
    slider('Altitude maxi retenue', 'm', 'bandMax', 0, 200, 1);
    // couleur : dégradé altitude / matière unie
    var tg = doc.createElement('div'); tg.className = 'finish-tabs'; tg.style.marginTop = '6px';
    [['1', 'Dégradé altitude'], ['0', 'Matière unie']].concat(MAP ? [['2', 'Carte / satellite']] : []).forEach(function (o) {
      var b = doc.createElement('button'); b.textContent = o[1]; if (String(PTERR.colorByAlt) === o[0]) b.className = 'on';
      b.onclick = function () { PTERR.colorByAlt = +o[0]; MESH = null; if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } glob.DIRTY = true; buildUI(host); }; tg.appendChild(b);
    });
    host.appendChild(tg);
    // altitude : base à 0 (défaut) ou absolue (cale le bâti au bon niveau)
    var ta = doc.createElement('div'); ta.className = 'finish-tabs'; ta.style.marginTop = '6px';
    [['0', 'Base à 0'], ['1', 'Altitude absolue']].forEach(function (o) {
      var b = doc.createElement('button'); b.textContent = o[1]; if (String(PTERR.absolute) === o[0]) b.className = 'on';
      b.onclick = function () { PTERR.absolute = +o[0]; MESH = null; if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } glob.DIRTY = true; buildUI(host); }; ta.appendChild(b);
    });
    host.appendChild(ta);
    if (MESH && MESH.z0 != null) { var za = doc.createElement('div'); za.className = 'exp-note'; tplSet(za, +PTERR.absolute ? 'Altitude de base : {0} m (conservée — cale le bâti au bon niveau)' : 'Altitude de base : {0} m (ramenée à 0)', [MESH.z0.toFixed(2)]); host.appendChild(za); }
    var note = doc.createElement('div'); note.className = 'exp-note'; note.textContent = 'En « Matière unie », la couleur/texture se règle dans Finitions (élément Terrain).'; host.appendChild(note);
    // Drapé du plan DXF sur le relief
    if (POLYS && POLYS.length && LAYERS && LAYERS.length) {
      var dh = doc.createElement('div'); dh.className = 'slbl'; dh.style.marginTop = '8px'; dh.textContent = 'Drapé du plan (lignes DXF)'; host.appendChild(dh);
      var dtg = doc.createElement('div'); dtg.className = 'finish-tabs';
      [['0', 'Sans'], ['1', 'Draper']].forEach(function (o) { var b = doc.createElement('button'); b.textContent = o[1]; if (String(PTERR.drape) === o[0]) b.className = 'on';
        b.onclick = function () { PTERR.drape = +o[0]; if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } glob.DIRTY = true; buildUI(host); }; dtg.appendChild(b); });
      host.appendChild(dtg);
      if (+PTERR.drape) {
        if (!PTERR.drapeLayers) PTERR.drapeLayers = {};
        LAYERS.slice(0, 8).forEach(function (L) {
          var row = doc.createElement('label'); row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:10px;color:var(--dm);margin:2px 0;';
          var cb = doc.createElement('input'); cb.type = 'checkbox'; cb.checked = !!PTERR.drapeLayers[L.layer];
          cb.onchange = function () { PTERR.drapeLayers[L.layer] = cb.checked ? 1 : 0; if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } glob.DIRTY = true; };
          row.appendChild(cb); row.appendChild(doc.createTextNode(L.layer.slice(0, 30) + ' (' + L.n + ')')); host.appendChild(row);
        });
        var dn = doc.createElement('div'); dn.className = 'exp-note'; dn.textContent = 'Projette les polylignes des calques cochés sur le relief (voiries, bâti, parcelles).'; host.appendChild(dn);
      }
    }
    // Courbes de niveau
    var ch = doc.createElement('div'); ch.className = 'slbl'; ch.style.marginTop = '8px'; ch.textContent = 'Courbes de niveau'; host.appendChild(ch);
    var ctg = doc.createElement('div'); ctg.className = 'finish-tabs';
    [['0', 'Sans'], ['1', 'Afficher']].forEach(function (o) { var b = doc.createElement('button'); b.textContent = o[1]; if (String(PTERR.contours) === o[0]) b.className = 'on';
      b.onclick = function () { PTERR.contours = +o[0]; if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } glob.DIRTY = true; buildUI(host); }; ctg.appendChild(b); });
    host.appendChild(ctg);
    if (+PTERR.contours) { slider('Équidistance', 'm', 'contourInt', 0.1, 5, 0.1); slider('Épaisseur courbes', 'cm', 'contourW', 3, 80, 1); slider('Courbe maîtresse tous les', '', 'contourMaster', 0, 10, 1); }
    // Maille apparente + épaisseur (socle)
    meshThickUI(host, slider);
    // Figer -> objet
    platsUILive(host);   /* plateformes plat / creux + volumes (14/09) */
    var bf = doc.createElement('button'); bf.className = 'save-add'; bf.textContent = '❄ Figer le terrain (→ objet réutilisable)'; bf.style.marginTop = '8px'; bf.onclick = freeze; host.appendChild(bf);
    var nf = doc.createElement('div'); nf.className = 'exp-note'; nf.textContent = 'Fige le maillage comme objet importé : posable en scène, sauvegardable, exportable OBJ/DAE/IFC. Re-fige après un réglage pour actualiser.'; host.appendChild(nf);
  }

  /* ---- Panneau du mode « Créer une forme » ---- */
  function buildShapeUI(host){
    var card=doc.createElement('div'); card.className='fld';
    card.innerHTML='<div class="fh"><span>Terrain — plateforme paramétrique</span></div>'+
      '<div style="font-size:10.5px;color:var(--dm);line-height:1.5;margin:2px 0 8px;">Crée une plateforme plate d\'une forme choisie, maillée. Forme, maille et altitude éditables. « Figer » pour la poser en scène / l\'exporter.</div>';
    host.appendChild(card);
    var stg=doc.createElement('div'); stg.className='finish-tabs';
    [['rect','Rectangle'],['u','U'],['t','T'],['libre','Libre']].forEach(function(o){ var b=doc.createElement('button'); b.textContent=o[1]; if(PTERR.shape===o[0]) b.className='on';
      b.onclick=function(){ PTERR.shape=o[0]; MESH=null; if(typeof glob.build==='function'){try{glob.build();}catch(e){}} if(typeof glob.fitCamera==='function'){try{glob.fitCamera(glob.DIMS);}catch(e){}} glob.DIRTY=true; buildUI(host); }; stg.appendChild(b); });
    host.appendChild(stg);
    // Bascule Vue 3D / Vue plan (dessus) — plan pratique pour tracer/caler l'emprise, 3D pour les altitudes
    var vtg=doc.createElement('div'); vtg.className='finish-tabs'; vtg.style.marginTop='6px';
    [['persp','Vue 3D'],['top','Vue plan']].forEach(function(o){ var b=doc.createElement('button'); b.textContent=o[1]; var cur=(glob.SINGLEVIEW==='top')?'top':'persp'; if(cur===o[0]) b.className='on';
      b.onclick=function(){ if(o[0]==='top'){ glob.SINGLEVIEW='top'; glob.LAYOUT='single'; } else { glob.SINGLEVIEW='persp'; } glob.DIRTY=true; buildUI(host); }; vtg.appendChild(b); });
    host.appendChild(vtg);
    function sl(label,unit,key,min,max,step){ var fld=doc.createElement('div'); fld.className='fld';
      fld.innerHTML='<div class="fh"><label>'+label+(unit?' <span class="u">'+unit+'</span>':'')+'</label><input type="number" min="'+min+'" max="'+max+'" step="'+step+'" value="'+PTERR[key]+'"></div><input type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+PTERR[key]+'">';
      var num=fld.querySelector('input[type=number]'), rng=fld.querySelector('input[type=range]');
      function ap(v){ v=Math.max(min,Math.min(max,v)); PTERR[key]=v; num.value=v; rng.value=v; MESH=null; if(typeof glob.build==='function'){try{glob.build();}catch(e){}} glob.DIRTY=true; setTimeout(function(){ if(glob.MODE==='terrain') buildUI(host); },30); }
      rng.oninput=function(){ num.value=rng.value; }; rng.onchange=function(){ ap(+rng.value); }; num.onchange=function(){ if(!isNaN(parseFloat(num.value))) ap(parseFloat(num.value)); };
      host.appendChild(fld); }
    sl('Emprise L','cm','sw',200,80000,50);
    sl('Emprise P','cm','sd',200,80000,50);
    if(PTERR.shape==='u') sl('Largeur des branches','cm','uArm',100,40000,50);
    if(PTERR.shape==='t'){ sl('Hauteur de la barre','cm','uArm',100,40000,50); sl('Largeur du pied','cm','tArm',100,40000,50); }
    sl('Maille','m','step',1,10,0.5);
    sl('Altitude de base','cm','sBase',-5000,5000,10);
    if(PTERR.shape==='libre'){
      var lbl=doc.createElement('div'); lbl.className='slbl'; lbl.style.marginTop='6px'; lbl.textContent='Sommets (m) : « x,y x,y … »'; host.appendChild(lbl);
      var ta=doc.createElement('textarea'); ta.value=PTERR.sverts; ta.style.cssText='width:100%;height:52px;font-size:10px;background:var(--p2);color:var(--tx);border:1px solid var(--ln);border-radius:5px;padding:4px;';
      ta.onchange=function(){ PTERR.sverts=ta.value; MESH=null; if(typeof glob.build==='function'){try{glob.build();}catch(e){}} if(typeof glob.fitCamera==='function'){try{glob.fitCamera(glob.DIMS);}catch(e){}} glob.DIRTY=true; }; host.appendChild(ta);
      var eh=doc.createElement('div'); eh.className='exp-note'; eh.textContent='Emprise à la souris : glisse un sommet orange au sol · double-clic sur un bord = ajouter un sommet · clic droit = supprimer. « Vue plan » facilite le tracé.'; host.appendChild(eh);
    }
    // RELIEF : grille de points de contrôle (altitudes cm) + adoucissement
    var rh=doc.createElement('div'); rh.className='slbl'; rh.style.marginTop='8px'; rh.textContent='Relief — points de contrôle (altitude cm)'; host.appendChild(rh);
    sl('Points de contrôle / côté','','ctrlN',2,8,1);
    sl('Adoucissement','','smooth',0,6,0.5);
    var cg=ctrlGrid(), cn=cg.cn, cz=cg.cz;
    var gwrap=doc.createElement('div'); gwrap.style.cssText='display:grid;grid-template-columns:repeat('+cn+',1fr);gap:3px;margin:4px 0 4px;';
    for(var rr=cn-1;rr>=0;rr--){ for(var cc=0;cc<cn;cc++){ (function(idx){
      var inp=doc.createElement('input'); inp.type='number'; inp.step=10; inp.value=Math.round(cz[idx]||0);
      inp.style.cssText='width:100%;font-size:10px;background:var(--p2);color:var(--tx);border:1px solid var(--ln);border-radius:4px;padding:2px 1px;text-align:center;';
      inp.onchange=function(){ cz[idx]=parseFloat(inp.value)||0; PTERR.ctrlZ=cz; MESH=null; if(typeof glob.build==='function'){try{glob.build();}catch(e){}} glob.DIRTY=true; setTimeout(function(){ if(glob.MODE==='terrain') buildUI(host); },30); };
      gwrap.appendChild(inp);
    })(rr*cn+cc); } }
    host.appendChild(gwrap);
    var rn=doc.createElement('div'); rn.className='exp-note'; rn.textContent='Chaque case = altitude d\'un point de contrôle (grille orientée comme le plan, haut = Nord). Interpolé en relief lisse. Astuce : les pastilles vertes dans la vue se glissent verticalement à la souris (Maj = pas fin) pour sculpter le relief directement.'; host.appendChild(rn);
    // Courbes de niveau (marchent aussi sur le terrain créé)
    var ctg=doc.createElement('div'); ctg.className='finish-tabs'; ctg.style.marginTop='6px';
    [['0','Courbes off'],['1','Courbes de niveau']].forEach(function(o){ var b=doc.createElement('button'); b.textContent=o[1]; if(String(PTERR.contours)===o[0]) b.className='on'; b.onclick=function(){ PTERR.contours=+o[0]; if(typeof glob.build==='function'){try{glob.build();}catch(e){}} glob.DIRTY=true; buildUI(host); }; ctg.appendChild(b); });
    host.appendChild(ctg);
    if(+PTERR.contours){ sl('Équidistance','m','contourInt',0.1,5,0.1); sl('Épaisseur courbes','cm','contourW',3,80,1); sl('Courbe maîtresse tous les','','contourMaster',0,10,1); }
    // Maille apparente + épaisseur (socle)
    meshThickUI(host, sl);
    if(MESH && !MESH.tooBig){ var st=doc.createElement('div'); st.className='exp-note'; st.style.color='var(--am)'; tplSet(st, 'Emprise {0} × {1} m · {2} faces', [Math.round(MESH.dims.w), Math.round(MESH.dims.d), MESH.F.length]); host.appendChild(st); }
    var note=doc.createElement('div'); note.className='exp-note'; note.textContent='Couleur/texture dans Finitions (élément Terrain). Plateforme plate — l\'édition du relief par points viendra ensuite.'; host.appendChild(note);
    platsUILive(host);   /* plateformes plat / creux + volumes (14/09) */
    var bf=doc.createElement('button'); bf.className='save-add'; bf.textContent='❄ Figer le terrain (→ objet réutilisable)'; bf.style.marginTop='8px'; bf.onclick=freeze; host.appendChild(bf);
  }

  glob.BPO_terrain = { PTERR: PTERR, setDXF: setDXF, setGrid: setGrid, meshGrid: meshGrid, frozenBuf: frozenBuf, frozenApply: frozenApply, frozenBusy: function (pid) { return !!BUSY[pid]; }, buildFrozenUI: buildFrozenUI, rebakeFrozen: rebakeFrozen, platApply: platApply, platGeo: platGeo, surfY: surfY, recoverFrozen: recoverFrozen, projectNear: projectNear, buildFC: buildFC, buildUI: buildUI, hasData: hasData, ctrlHandles: ctrlHandles, setCtrlCm: setCtrlCm, footHandles: footHandles, setFoot: setFoot, insertFoot: insertFoot, removeFoot: removeFoot, platRayGrid: platRayGrid, platDraft: platDraft, platNewPlat: platNewPlat, platPickGrid: platPickGrid, gridZAt: gridZAt, gridSnap: gridSnap, _parse: parseDXFall };
})();
