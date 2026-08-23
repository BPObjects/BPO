/* ============================================================================
   BPO — pont d'intégration du moteur path tracing dans le viewer
   ----------------------------------------------------------------------------
   Ajoute un bouton « Rendu photo » sur le viewer. Au clic :
     - extrait la scène courante (faces FC -> triangles + matériaux),
     - lit la caméra (cam) et le ciel/soleil (PREFS / WGL),
     - lance BPO_RT (WebGPU) en surimpression, convergence progressive,
     - panneau : échantillons, export PNG, fermer.
   Aucune dépendance interne à app.html au-delà des globales lues.
   Repli : si WebGPU absent, message clair (le viewer WebGL reste dispo).
   ============================================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  function srgb2lin(c) { return Math.pow(Math.max(0, Math.min(1, c)), 2.2); }
  function hexOr(fn, val, dflt) { try { var r = fn && fn(val); return (r && r.length === 3) ? r : dflt; } catch (e) { return dflt; } }

  /* ---- faces courantes : en mode Scène, on assemble tous les éléments
     (instanceFaces reconstruit chacun en coordonnées monde) ; sinon FC. ---- */
  function gatherFaces() {
    try {
      if (typeof MODE !== 'undefined' && MODE === 'scene' &&
          typeof SCENE !== 'undefined' && SCENE.instances && SCENE.instances.length &&
          typeof instanceFaces === 'function') {
        var out = [];
        for (var i = 0; i < SCENE.instances.length; i++) {
          var fs; try { fs = instanceFaces(SCENE.instances[i]); } catch (e) { fs = null; }
          if (fs) for (var k = 0; k < fs.length; k++) out.push(fs[k]);
        }
        if (out.length) return out;
      }
    } catch (e) {}
    return (typeof FC !== 'undefined' && FC) ? FC : [];
  }

  /* ---- extraction de la scène (triangles + matériaux) ---- */
  /* Mode du sol du rendu : 0 = aplat (couleur PREFS), 1 = herbe, 2 = béton.
     (3 = gazon photo mappé, choisi automatiquement quand la tuile est chargée.) */
  var GROUND_MODE = 1;
  /* Tuile de gazon du viewer (data/textures/gazon.jpg) pour le rendu : chargée
     une fois, poussée au moteur (setGroundTex). Tant qu'elle n'est pas là,
     l'herbe reste procédurale — jamais bloquant. */
  var GAZON_BMP = null;
  function loadGazon(renderer, done) {
    if (GAZON_BMP) { try { renderer.setGroundTex(GAZON_BMP); } catch (e) {} if (done) done(); return; }
    var v = (typeof DATA_VER !== 'undefined') ? ('?v=' + DATA_VER) : '';
    fetch('data/textures/gazon.jpg' + v).then(function (r) { return r.ok ? r.blob() : null; })
      .then(function (b) { return b ? createImageBitmap(b) : null; })
      .then(function (bmp) { if (!bmp) return; GAZON_BMP = bmp; try { renderer.setGroundTex(bmp); } catch (e) {} if (done) done(); })
      .catch(function () {});
  }
  /* Éclairage intérieur auto (toggle) + lampes manuelles (issues de la scène). */
  var INTERIOR_ON = false;
  /* Réglages du panneau PERSISTANTS (16/08, demande AL « mettre ces paramètres
     par défaut ») : chaque changement est mémorisé, l'ouverture suivante repart
     des DERNIERS réglages de l'utilisateur — ses valeurs sont ses défauts. */
  var RP_KEY = 'BPO_RENDER_PREFS';
  function rpLoad() { try { return JSON.parse(localStorage.getItem(RP_KEY)) || null; } catch (e) { return null; } }
  function rpSave(o) { try { localStorage.setItem(RP_KEY, JSON.stringify(o)); } catch (e) {} }

  /* Grille de lampes chaudes près des plafonds, dans le volume du bâtiment (bbox).
     Pos en mètres (repère monde du rendu). Intensité ~ selon la taille de maille. */
  function autoInteriorLights(bb) {
    if (!bb) return [];
    var x0 = bb[0], y0 = bb[1], z0 = bb[2], x1 = bb[3], y1 = bb[4], z1 = bb[5];
    var w = x1 - x0, h = y1 - y0, d = z1 - z0;
    if (!(w > 0.2 && h > 0.2 && d > 0.2)) return [];
    var nx = Math.max(1, Math.min(3, Math.round(w / 4)));
    var nz = Math.max(1, Math.min(3, Math.round(d / 4)));
    var ny = Math.max(1, Math.min(2, Math.round(h / 3.2)));
    var warm = [1.0, 0.86, 0.66], cell = (w / nx) * (d / nz);
    var inten = Math.max(12, Math.min(90, cell * 3.0));
    var out = [];
    for (var iy = 0; iy < ny; iy++) {
      var fy = y0 + h * (iy + 0.9) / ny;                 // juste sous le plafond de chaque niveau
      for (var ix = 0; ix < nx; ix++) {
        for (var iz = 0; iz < nz; iz++) {
          out.push({ pos: [x0 + w * (ix + 0.5) / nx, fy, z0 + d * (iz + 0.5) / nz], radius: 0.25, color: warm, intensity: inten });
        }
      }
    }
    return out;
  }
  /* Lampes manuelles définies dans la scène de l'app (SCENE.lights, en cm). */
  function gatherManualLights() {
    var out = [];
    try {
      var arr = (window.SCENE && SCENE.lights) ? SCENE.lights : [];
      for (var i = 0; i < arr.length; i++) {
        var L = arr[i]; if (!L || L.on === false) continue;
        var c = L.color || [255, 220, 170];   // RVB 0-255 (sRGB) -> linéaire 0-1
        out.push({ pos: [(L.x || 0) / 100, (L.y || 0) / 100, (L.z || 0) / 100], radius: (L.radius || 0.2), color: [srgb2lin(c[0] / 255), srgb2lin(c[1] / 255), srgb2lin(c[2] / 255)], intensity: (L.intensity == null ? 30 : L.intensity) });
      }
    } catch (e) {}
    return out;
  }
  /* Feuillage végétation (16/08) : teinte moyenne PONDÉRÉE PAR L'ALPHA et taux de
     couverture de la tuile (TEX_IMAGES[nom].data, RGBA brut) — le moteur en fait
     des cartes à trous stochastiques translucides au lieu de panneaux pleins. */
  var VEG_STATS = {};
  function vegStat(tex) {
    if (VEG_STATS[tex]) return VEG_STATS[tex];
    var out = { col: [88, 132, 62], cover: 0.55 };
    try {
      var T = (window.TEX_IMAGES && TEX_IMAGES[tex]);
      if (T && T.data && T.data.length) {
        var d = T.data, r = 0, g = 0, b = 0, a = 0, n = d.length / 4;
        for (var i = 0; i < d.length; i += 4) { var w = d[i + 3] / 255; r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; a += w; }
        if (a > 1) out.col = [r / a, g / a, b / a];
        out.cover = Math.min(0.92, Math.max(0.15, a / n));
      }
    } catch (e) {}
    VEG_STATS[tex] = out; return out;
  }
  function extractScene() {
    var faces = gatherFaces();
    var tris = [], mats = [], matMap = {};
    var vegLayers = {}, vegList = [];   /* tuile -> couche du tableau de textures */
    var bb = [1e30, 1e30, 1e30, -1e30, -1e30, -1e30];
    function matIndex(f) {
      var col = f.col, al = f.al, tex = f.tex || '';
      /* carte de FEUILLAGE (veg:1 posé par le volet paysager) : un matériau par
         tuile — découpe stochastique + translucidité côté moteur (mode 4). */
      if (f.veg && tex) {
        var kV = 'veg_' + tex;
        if (matMap[kV] != null) return matMap[kV];
        if (vegLayers[tex] == null) { vegLayers[tex] = vegList.length; vegList.push(tex); }
        var vs = vegStat(tex);
        var mV = { albedo: [srgb2lin(vs.col[0] / 255), srgb2lin(vs.col[1] / 255), srgb2lin(vs.col[2] / 255)],
                   metal: 0, rough: 0.85, alpha: 1, ior: 1.5,
                   leaf: 1, leafLayer: vegLayers[tex] + 1, emissive: [0, 0, 0] };
        var iV = mats.length; mats.push(mV); matMap[kV] = iV; return iV;
      }
      var r = (col && col[0]) | 0, g = (col && col[1]) | 0, b = (col && col[2]) | 0;
      var glass = (al != null && al < 0.98);
      var key = r + '_' + g + '_' + b + '_' + (glass ? 'v' : 'o') + (tex ? ('_t' + tex) : '');
      if (matMap[key] != null) return matMap[key];
      /* Face TEXTURÉE (16/08) : le rendu photo ne sait pas encore échantillonner
         les textures — on prend au moins leur TEINTE MOYENNE (TEX_AVGCOL) plutôt
         que la couleur de base, et une texture d'herbe passe en HERBE PROCÉDURALE
         du moteur (grassColor est en coordonnées monde : marche sur toute face). */
      try { var av = (window.TEX_AVGCOL && TEX_AVGCOL[tex]);
        if (av && av.length === 3) { r = av[0] | 0; g = av[1] | 0; b = av[2] | 0; } } catch (e) {}
      var alb = [srgb2lin(r / 255), srgb2lin(g / 255), srgb2lin(b / 255)];
      // heuristique métal : gris clair peu saturé -> inox / alu / acier.
      // JAMAIS sur une face texturée, ni sur un PLANCHER (normale verticale) :
      // une grande dalle gris clair devenait un miroir qui reflétait la façade.
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      var sat = mx > 0 ? (mx - mn) / mx : 0;
      var horiz = !!(f.n && Math.abs(f.n[1]) > 0.5);
      var metallic = (!glass && !tex && !horiz && mx > 150 && sat < 0.14) ? 0.75 : 0.0;
      var m = { albedo: alb, metal: metallic, rough: metallic > 0 ? 0.22 : 0.62,
                alpha: glass ? 0.25 : 1.0, ior: 1.5, emissive: [0, 0, 0] };
      if (/gazon|grass/i.test(String(tex))) m.grass = 3;   /* gazon au sol : tuile photo mappée au rendu */
      var idx = mats.length; mats.push(m); matMap[key] = idx; return idx;
    }
    for (var i = 0; i < faces.length; i++) {
      var f = faces[i], vs = f.verts; if (!vs || vs.length < 3) continue;
      var mi = matIndex(f);
      var hasUV = !!(f.veg && f.uv && f.uv.length === vs.length);
      for (var k = 1; k < vs.length - 1; k++) {
        tris.push({ a: vs[0], b: vs[k], c: vs[k + 1], mat: mi,
                    uv: hasUV ? [f.uv[0], f.uv[k], f.uv[k + 1]] : null });
      }
      for (var v = 0; v < vs.length; v++) {
        var p = vs[v];
        bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.min(bb[2], p[2]);
        bb[3] = Math.max(bb[3], p[0]); bb[4] = Math.max(bb[4], p[1]); bb[5] = Math.max(bb[5], p[2]);
      }
    }
    // Sol : plan d'herbe à y = 0, EXACTEMENT comme le plancher du viewer WebGL
    // (WGL.floorBuf est un quad à Y=0). L'ancien `min(0, bb[1])` suivait le point
    // le plus bas et décrochait dès qu'un plot passait sous zéro — d'où un sol à
    // la mauvaise altitude par rapport à la vue temps réel.
    var gy = 0;
    var gCol = hexOr(window.prefHex01, (window.PREFS && PREFS.ground), null);
    var gAlb = gCol ? [srgb2lin(gCol[0]), srgb2lin(gCol[1]), srgb2lin(gCol[2])] : [0.10, 0.14, 0.07];
    var gm = mats.length; mats.push({ albedo: gAlb, metal: 0, rough: 0.92, alpha: 1, ior: 1.5, grass: GROUND_MODE, emissive: [0, 0, 0], _ground: true });
    /* Sol assez grand pour que son bord tombe SOUS l'horizon visible : sinon on
       voit une bande de ciel « bas » entre la fin du sol et l'horizon. 8 km
       suffisent pour toute caméra d'architecture, sans gêner le BVH (f32). */
    var S = 8000;
    tris.push({ a: [-S, gy, -S], b: [S, gy, -S], c: [S, gy, S], mat: gm });
    tris.push({ a: [-S, gy, -S], b: [S, gy, S], c: [-S, gy, S], mat: gm });
    /* HERBE 3D (22/08, demande AL) : les touffes du viewer ENTRENT AU RENDU —
       mêmes brins (tampons de WGL.tuftBuild, réglages Préférences), avec de
       vraies ombres. Construites autour de la caméra du rendu ; jamais bloquant. */
    try {
      var W3 = window.WGL, Tt = W3 && W3.TUFT;
      if (Tt && !Tt.off && W3.gl && typeof W3.tuftBuild === 'function' &&
          !(window.PREFS && PREFS.grass === 0)) {
        var camT = getCamera(1);
        if (camT.origin[1] <= 30) {
          /* PORTÉE ÉTENDUE AU RENDU : 45 m au lieu des 8 m du viewer. Ici chaque
             brin est un volume avec son ombre, donc la limite du semis SE VOIT —
             alors que dans le viewer elle est masquée par le relief de la texture
             (mesuré : profils de grain superposés entre 8 m et 22 m).
             `finally` est indispensable : sans lui, une construction qui lève
             laisserait le VIEWER à 45 m, soit 82 ms de reconstruction tous les
             trois mètres, sans que rien n'en explique la cause. */
          var rOv0 = Tt.rOv;
          try { Tt.rOv = 45; W3.tuftBuild(camT.origin[0], camT.origin[2]); }
          finally { Tt.rOv = rOv0 || 0; Tt.bx = 1e9; }
          var Pb = Tt._P;
          if (Pb && Pb.length >= 9) {
            var mB = mats.length;
            mats.push({ albedo: [srgb2lin(0.36), srgb2lin(0.55), srgb2lin(0.12)],
                        metal: 0, rough: 0.7, alpha: 1, ior: 1.5, emissive: [0, 0, 0] });
            for (var ib = 0; ib + 8 < Pb.length; ib += 9) {
              tris.push({ a: [Pb[ib], Pb[ib + 1], Pb[ib + 2]],
                          b: [Pb[ib + 3], Pb[ib + 4], Pb[ib + 5]],
                          c: [Pb[ib + 6], Pb[ib + 7], Pb[ib + 8]], mat: mB });
            }
          }
        }
      }
    } catch (e) {}
    return { triangles: tris, materials: mats, bb: bb, vegTiles: vegList };
  }

  /* ---- caméra : WGL.cam (vue WebGL à l'écran), repli sur cam global ---- */
  function getCamera(aspect) {
    var c = (window.WGL && WGL.cam) ? WGL.cam : window.cam;
    if (!c) throw new Error('caméra introuvable (WGL.cam)');
    var tx = c.tx || 0, tz = c.tz || 0;
    var o = [tx + c.r * Math.sin(c.ph) * Math.sin(c.th),
             c.ty + c.r * Math.cos(c.ph),
             tz + c.r * Math.sin(c.ph) * Math.cos(c.th)];
    return { origin: o, target: [tx, c.ty, tz], up: [0, 1, 0], fovY: 0.95, aspect: aspect };
  }

  /* ---- soleil : conversion direction <-> (azimut, hauteur) --------------------
     azimut a en degrés (0 = +Z, sens horaire vu de dessus), hauteur el en degrés
     au-dessus de l'horizon. La direction pointe VERS le soleil (convention du
     moteur : `sampleSun` et le NEE l'utilisent ainsi). */
  function dirFromAzEl(a, el) {
    var ar = a * Math.PI / 180, er = el * Math.PI / 180, ce = Math.cos(er);
    return [ce * Math.sin(ar), Math.sin(er), ce * Math.cos(ar)];
  }
  function azElFromDir(d) {
    var el = Math.asin(Math.max(-1, Math.min(1, d[1]))) * 180 / Math.PI;
    var a = Math.atan2(d[0], d[2]) * 180 / Math.PI; if (a < 0) a += 360;
    return [a, el];
  }
  /* Teinte du soleil selon la hauteur : dorée à l'horizon, blanche au zénith.
     C'est ce qui vend l'« heure dorée » quand on baisse le soleil. */
  function sunTint(el) {
    var t = Math.max(0, Math.min(1, (el - 4) / 40));           // 0 bas … 1 haut
    return [1.0, 0.72 + 0.26 * t, 0.45 + 0.5 * t];
  }

  /* ---- ciel + soleil depuis PREFS / WGL ---- */
  function getEnv() {
    var top = hexOr(window.prefHex01, (window.PREFS && PREFS.skyTop), [0.20, 0.45, 0.83]);   /* défauts = « Grand beau » */
    var hor = hexOr(window.prefHex01, (window.PREFS && PREFS.skyHor), [0.72, 0.83, 0.94]);
    /* Défaut (16/08, réglages retenus par AL) : preset « Grand beau » — soleil
       franc à 62°, expo 0,75. Les derniers réglages de l'utilisateur (persistés)
       reprennent ensuite la main. */
    var sd = dirFromAzEl(126, 62), sc = sunTint(62);
    try {
      var e = window.WGL && WGL.ENVS ? WGL.ENVS[WGL.env] : null;
      /* on ne prend le soleil de la scène QUE s'il est réellement activé : sinon
         `WGL.sunVec` renvoie une lumière d'ambiance molle, et on perd le rasant. */
      if (e && WGL.sunVec && window.SUN && SUN.on) { var s = WGL.sunVec(e.L[0]); if (s) { sd = s.slice(); if (sd[1] < 0) { sd[0] = -sd[0]; sd[1] = -sd[1]; sd[2] = -sd[2]; } sc = sunTint(azElFromDir(sd)[1]); } }
    } catch (err) {}
    return {
      sunDir: sd, sunColor: sc, sunIntensity: 4.4, sunAngle: 0.020,
      skyTop: top, skyHor: hor, skyGround: [hor[0] * 0.5, hor[1] * 0.47, hor[2] * 0.42], skyInt: 0.64,
      expo: 0.75, warm: 0.45
    };
  }

  /* ---- UI : bouton + overlay + panneau ---- */
  var renderer = null, overlay = null, panel = null, host = null;

  function tr(s) { try { return (typeof I18N !== 'undefined' && typeof LANG !== 'undefined' && I18N[LANG] && I18N[LANG][s]) || s; } catch (e) { return s; } }

  /* S'assurer que les maillages fabricants / objets importes sont decodes (FAB_CACHE)
     AVANT l'extraction : la scene WebGL les rend via un autre cache, donc sans ca
     instanceFaces() renvoie du vide pour eux et ils manquent au rendu photo. */
  function ensureMeshesDecoded() {
    return new Promise(function (resolve) {
      try {
        if (typeof MODE === 'undefined' || MODE !== 'scene' || typeof SCENE === 'undefined' || !SCENE.instances || typeof fabDecode !== 'function') { resolve(); return; }
        var pids = [];
        (function collect(list) { list.forEach(function (i) { if (!i) return; if (i.group && i.children) collect(i.children); else if (i.mode === 'fabprod' && i.prod && pids.indexOf(i.prod) < 0) pids.push(i.prod); }); })(SCENE.instances);
        if (!pids.length) { resolve(); return; }
        var left = pids.length, done = false;
        var to = setTimeout(function () { if (!done) { done = true; resolve(); } }, 8000);
        pids.forEach(function (pid) { fabDecode(pid, function () { if (done) return; if (--left <= 0) { done = true; clearTimeout(to); resolve(); } }); });
      } catch (e) { resolve(); }
    });
  }

  async function launch() {
    if (!window.BPO_RT) { alert('Moteur de rendu non chargé (bpo-raytrace.js absent).'); return; }
    /* Diagnostic précis : au lieu d'un « WebGPU requis » opaque, on dit POURQUOI.
       - navigator.gpu absent  -> la fonctionnalité n'est pas activée (mauvais
         binaire, ou GPU coupé) ;
       - présent mais adaptateur null -> WebGPU actif mais aucun GPU utilisable
         (liste noire / pilote / session distante). */
    if (!navigator.gpu) {
      alert('WebGPU indisponible : navigator.gpu est absent.\n\n' +
            'L’app ne tourne probablement pas avec le main.js à jour (relance « npm start » dans desktop/), ' +
            'ou le GPU est désactivé. Test rapide : ouvre cette scène dans Chrome/Edge récent.');
      return;
    }
    try {
      var _ad = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!_ad) {
        alert('WebGPU présent mais aucun adaptateur GPU disponible.\n\n' +
              'Le GPU est probablement en liste noire ou indisponible (pilote, bureau à distance, machine virtuelle). ' +
              'Dans l’app desktop : les commutateurs de main.js (enable-unsafe-webgpu / ignore-gpu-blocklist) doivent être actifs — relance depuis les sources.');
        return;
      }
    } catch (e) {
      alert('WebGPU : échec de requestAdapter — ' + (e && e.message || e)); return;
    }
    if (!BPO_RT.available()) {
      alert('Le rendu photo nécessite WebGPU (application BPO desktop, ou Chrome/Edge récent).');
      return;
    }
    var vp = document.getElementById('vp') || document.body;
    var rect = vp.getBoundingClientRect();
    var scale = Math.min(1, 1280 / Math.max(1, rect.width));
    var W = Math.max(320, Math.round(rect.width * scale));
    var H = Math.max(240, Math.round(rect.height * scale));

    host = document.createElement('div');
    host.style.cssText = 'position:absolute;inset:0;z-index:500;background:#0d0f13;display:flex;align-items:center;justify-content:center;';
    overlay = document.createElement('canvas'); overlay.width = W; overlay.height = H;
    overlay.style.cssText = 'max-width:100%;max-height:100%;box-shadow:0 8px 50px rgba(0,0,0,.6);';
    host.appendChild(overlay);

    /* Barre COMPACTE : juste l'échantillonnage + « Options ▾ » + Fermer. Tout le
       reste (export, sol, intérieur, ciel, curseurs) est dans un menu déroulant. */
    panel = document.createElement('div');
    panel.style.cssText = 'position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;' +
      'background:rgba(26,29,35,.92);border:1px solid #343a45;border-radius:10px;padding:8px 12px;color:#e8e9ec;font:12px system-ui;';
    var lbl = document.createElement('span'); lbl.textContent = '0 ' + tr('échantillons');
    lbl.style.cssText = 'min-width:120px;text-align:center;';
    var bOpts = mkBtn('⚙ Options ▾');
    var bClose = mkBtn('✕ ' + tr('Fermer'));
    panel.appendChild(lbl); panel.appendChild(bOpts); panel.appendChild(bClose);
    host.appendChild(panel);
    /* Menu déroulant des options (masqué par défaut, ouvert au clic sur « Options »). */
    var menu = document.createElement('div');
    menu.style.cssText = 'position:absolute;top:58px;left:50%;transform:translateX(-50%);display:none;flex-wrap:wrap;gap:10px 14px;align-items:center;justify-content:center;max-width:min(92vw,880px);' +
      'background:rgba(26,29,35,.97);border:1px solid #343a45;border-radius:10px;padding:11px 15px;color:#e8e9ec;font:12px system-ui;box-shadow:0 10px 34px rgba(0,0,0,.55);';
    host.appendChild(menu);
    var bPng = mkBtn('⬇ ' + tr('Exporter PNG')); menu.appendChild(bPng);
    var _menuOpen = false;
    bOpts.onclick = function () { _menuOpen = !_menuOpen; menu.style.display = _menuOpen ? 'flex' : 'none'; bOpts.style.background = _menuOpen ? 'rgba(255,138,61,.95)' : '#242a33'; bOpts.style.color = _menuOpen ? '#151515' : '#e8e9ec'; bOpts.style.borderColor = _menuOpen ? '#ff8a3d' : '#3a4150'; };
    vp.appendChild(host);

    try {
      renderer = await BPO_RT.create(overlay);
    } catch (e) { alert('Init WebGPU échouée : ' + e.message); close(); return; }

    var env = getEnv();
    /* les DERNIERS réglages de l'utilisateur priment sur les défauts */
    var RP = rpLoad();
    if (RP) {
      if (RP.sun != null) env.sunIntensity = RP.sun;
      if (RP.warm != null) env.warm = RP.warm;
      if (RP.expo != null) env.expo = RP.expo;
      if (RP.skyTop && RP.skyHor && RP.skyGround) {
        env.skyTop = RP.skyTop; env.skyHor = RP.skyHor; env.skyGround = RP.skyGround;
        if (RP.skyInt != null) env.skyInt = RP.skyInt;
        if (RP.sunAngle != null) env.sunAngle = RP.sunAngle;
      }
      if (RP.ground != null) GROUND_MODE = RP.ground;
      if (RP.interior != null) INTERIOR_ON = !!RP.interior;
    }
    try {
      try { await ensureMeshesDecoded(); } catch (e) {}
      var sc = extractScene();
      if (!sc.triangles.length) { alert('Aucune géométrie à rendre.'); close(); return; }
      renderer.setScene({ triangles: sc.triangles, materials: sc.materials });
      /* tuiles de feuillage -> tableau de textures du moteur (ordre = couches) */
      if (sc.vegTiles && sc.vegTiles.length && renderer.setVegTiles) {
        renderer.setVegTiles(sc.vegTiles.map(function (n) {
          var T = (window.TEX_IMAGES && TEX_IMAGES[n]); return (T && T.data) ? T : null;
        }));
      }
      renderer.setCamera(getCamera(W / H));
      renderer.setEnv(env);
      renderer.setOpts({ bounces: 5 });
    } catch (e) { console.error('Rendu photo :', e); alert('Rendu photo — erreur : ' + e.message); close(); return; }
    /* Curseurs. Ceux qui changent la LUMIÈRE (soleil, direction) vident
       l'accumulateur via setEnv/reset ; exposition et ambiance sont du
       post-traitement, instantanés (pas de reset). */
    var ae = azElFromDir(env.sunDir), az = ae[0], el = ae[1];
    /* soleil mémorisé — sauf si la scène impose le sien (SUN.on) */
    if (RP && RP.az != null && !(window.SUN && SUN.on)) { az = RP.az; el = RP.el != null ? RP.el : el;
      env.sunDir = dirFromAzEl(az, el); env.sunColor = sunTint(el); renderer.setEnv(env); }
    function rpSnap() {
      rpSave({ sun: env.sunIntensity, warm: env.warm, expo: env.expo, az: az, el: el,
        skyTop: env.skyTop, skyHor: env.skyHor, skyGround: env.skyGround, skyInt: env.skyInt,
        sunAngle: env.sunAngle, ground: GROUND_MODE, interior: INTERIOR_ON });
    }
    function applySun() {
      env.sunDir = dirFromAzEl(az, el);
      env.sunColor = sunTint(el);
      renderer.setEnv(env);                 // recharge les uniformes + reset
    }
    var sSun = mkSlider('☀', 0, 6, 0.1, env.sunIntensity, function (v) { env.sunIntensity = v; renderer.setEnv(env); rpSnap(); });
    var sEl  = mkSlider('↕', 4, 85, 1, el, function (v) { el = v; applySun(); rpSnap(); });      // hauteur
    var sAmb = mkSlider(tr('Amb'), 0, 1, 0.05, env.warm, function (v) { env.warm = v; rpSnap(); });
    /* Sélecteur de SOL : change le mode du matériau sol et recharge la scène
       (rebuild BVH + reset accumulateur). herbe / béton / aplat. */
    var groundMat = null; for (var _gi = 0; _gi < sc.materials.length; _gi++) { if (sc.materials[_gi]._ground) groundMat = sc.materials[_gi]; }
    /* herbe = tuile photo mappée dès qu'elle est chargée (repli : procédurale) */
    function solEffectif(mode) { return (mode === 1 && GAZON_BMP) ? 3 : mode; }
    menu.appendChild(mkGroundSelect(function (mode) {
      GROUND_MODE = mode;
      if (groundMat) { groundMat.grass = solEffectif(mode); renderer.setScene({ triangles: sc.triangles, materials: sc.materials }); }
      rpSnap();
    }));
    loadGazon(renderer, function () {
      if (GROUND_MODE === 1 && groundMat && groundMat.grass !== 3) { groundMat.grass = 3; renderer.setScene({ triangles: sc.triangles, materials: sc.materials }); }
    });
    /* Lumières : éclairage intérieur auto (toggle) + lampes manuelles de la scène. */
    function applyLights() { renderer.setLights((INTERIOR_ON ? autoInteriorLights(sc.bb) : []).concat(gatherManualLights())); }
    applyLights();
    var bInt = mkBtn('Intérieur'); bInt.title = 'Éclairage intérieur automatique (lampes chaudes au plafond)';
    bInt.onmouseenter = null; bInt.onmouseleave = null;
    function updIntBtn() { bInt.style.background = INTERIOR_ON ? 'rgba(255,138,61,.95)' : '#242a33'; bInt.style.color = INTERIOR_ON ? '#151515' : '#e8e9ec'; bInt.style.borderColor = INTERIOR_ON ? '#ff8a3d' : '#3a4150'; }
    updIntBtn();
    bInt.onclick = function () { INTERIOR_ON = !INTERIOR_ON; updIntBtn(); applyLights(); rpSnap(); };
    menu.appendChild(bInt);
    /* Sélecteur d'AMBIANCE DE CIEL : applique un preset (dégradé + soleil) et
       resynchronise les curseurs soleil/hauteur/ambiance. */
    menu.appendChild(mkSkySelect(function (p) {
      env.skyTop = p.top.slice(); env.skyHor = p.hor.slice(); env.skyGround = p.gnd.slice(); env.skyInt = p.skyInt;
      env.sunIntensity = p.sun; env.sunAngle = p.ang; env.warm = p.warm; el = p.el;
      env.sunColor = sunTint(el); env.sunDir = dirFromAzEl(az, el);
      renderer.setEnv(env);
      setSliderVal(sSun, p.sun); setSliderVal(sEl, p.el); setSliderVal(sAmb, p.warm);
      rpSnap();
    }));
    menu.appendChild(sSun);
    menu.appendChild(mkSlider('⟳', 0, 360, 1, az, function (v) { az = v; applySun(); rpSnap(); }));   // azimut
    menu.appendChild(sEl);
    menu.appendChild(mkSlider(tr('Expo'), 0.1, 2, 0.05, env.expo, function (v) { env.expo = v; rpSnap(); }));
    menu.appendChild(sAmb);
    renderer.onProgress(function (n) { lbl.textContent = n + ' ' + tr('échantillons'); });
    bPng.onclick = function () { var a = document.createElement('a'); a.download = 'BPO-rendu.png'; a.href = renderer.toPNG(); a.click(); };
    bClose.onclick = close;
    renderer.start();
  }

  function close() {
    try { if (renderer) renderer.stop(); } catch (e) {}
    renderer = null;
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
  }

  /* Point d'entrée global : permet à un bouton de app.html (celui qui a remplacé
     le rendu IA dans les paramètres) de lancer le rendu photo. */
  try { window.BPO_photoRender = launch; } catch (e) {}

  function mkBtn(txt) {
    var b = document.createElement('button'); b.textContent = txt;
    b.style.cssText = 'font:12px system-ui;padding:5px 10px;border-radius:7px;border:1px solid #3a4150;background:#242a33;color:#e8e9ec;cursor:pointer;';
    b.onmouseenter = function () { b.style.borderColor = '#ff8a3d'; };
    b.onmouseleave = function () { b.style.borderColor = '#3a4150'; };
    return b;
  }
  function mkSlider(name, min, max, step, val, fn) {
    var w = document.createElement('label');
    w.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;color:#cfd3da;';
    var s = document.createElement('input'); s.type = 'range'; s.min = min; s.max = max; s.step = step; s.value = val;
    s.style.width = '66px';
    var t = document.createElement('span'); t.textContent = (+val).toFixed(2);
    t.style.cssText = 'min-width:30px;text-align:right;color:#8b92a0;';
    s.oninput = function () { t.textContent = (+s.value).toFixed(2); fn(+s.value); };
    w.appendChild(document.createTextNode(name)); w.appendChild(s); w.appendChild(t); return w;
  }
  /* recale la valeur affichée d'un curseur (sans déclencher son oninput) */
  function setSliderVal(w, v) { if (!w) return; var inp = w.querySelector('input'), sp = w.querySelector('span'); if (inp) inp.value = v; if (sp) sp.textContent = (+v).toFixed(2); }

  /* Ambiances de ciel : chaque preset pilote le dégradé (zénith/horizon/sol),
     l'intensité du ciel, et le soleil (intensité, taille angulaire, hauteur).
     top/hor/gnd en linéaire 0..1 ; el = hauteur du soleil en degrés. */
  var SKY_PRESETS = [
    { id: 'clair',      label: 'Ciel clair',        top: [0.34, 0.55, 0.85], hor: [0.80, 0.87, 0.95], gnd: [0.42, 0.44, 0.42], skyInt: 0.60, sun: 3.6, ang: 0.025, el: 34, warm: 0.50 },
    { id: 'beau',       label: 'Grand beau',        top: [0.20, 0.45, 0.83], hor: [0.72, 0.83, 0.94], gnd: [0.40, 0.43, 0.42], skyInt: 0.64, sun: 4.4, ang: 0.020, el: 62, warm: 0.45 },
    { id: 'couvert',    label: 'Couvert',           top: [0.70, 0.72, 0.76], hor: [0.80, 0.82, 0.85], gnd: [0.55, 0.56, 0.57], skyInt: 0.95, sun: 0.7, ang: 0.120, el: 55, warm: 0.60 },
    { id: 'brume',      label: 'Brumeux',           top: [0.62, 0.66, 0.72], hor: [0.86, 0.88, 0.90], gnd: [0.55, 0.56, 0.56], skyInt: 0.90, sun: 1.4, ang: 0.070, el: 40, warm: 0.55 },
    { id: 'doree',      label: 'Heure dorée',       top: [0.34, 0.42, 0.62], hor: [0.98, 0.74, 0.48], gnd: [0.50, 0.40, 0.30], skyInt: 0.60, sun: 3.2, ang: 0.030, el: 9,  warm: 0.62 },
    { id: 'couchant',   label: 'Coucher de soleil', top: [0.18, 0.22, 0.42], hor: [1.00, 0.54, 0.30], gnd: [0.45, 0.32, 0.26], skyInt: 0.55, sun: 2.6, ang: 0.035, el: 3,  warm: 0.70 },
    { id: 'crepuscule', label: 'Crépuscule',        top: [0.05, 0.08, 0.19], hor: [0.19, 0.25, 0.44], gnd: [0.12, 0.14, 0.20], skyInt: 0.50, sun: 0.5, ang: 0.050, el: 2,  warm: 0.55 },
    { id: 'studio',     label: 'Studio neutre',     top: [0.55, 0.56, 0.58], hor: [0.62, 0.63, 0.65], gnd: [0.40, 0.40, 0.42], skyInt: 0.85, sun: 1.6, ang: 0.060, el: 48, warm: 0.50 }
  ];
  function mkSkySelect(fn) {
    var w = document.createElement('label');
    w.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;color:#cfd3da;';
    var s = document.createElement('select');
    s.style.cssText = 'font:11px system-ui;background:#242a33;color:#e8e9ec;border:1px solid #3a4150;border-radius:6px;padding:3px 6px;cursor:pointer;';
    SKY_PRESETS.forEach(function (p, i) { var o = document.createElement('option'); o.value = i; o.textContent = p.label; s.appendChild(o); });
    s.onmouseenter = function () { s.style.borderColor = '#ff8a3d'; };
    s.onmouseleave = function () { s.style.borderColor = '#3a4150'; };
    s.onchange = function () { fn(SKY_PRESETS[+s.value]); };
    w.appendChild(document.createTextNode('Ciel')); w.appendChild(s); return w;
  }
  /* Sélecteur de SOL : herbe / béton / aplat (procéduraux dans le path tracer). */
  function mkGroundSelect(fn) {
    var w = document.createElement('label');
    w.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;color:#cfd3da;';
    var s = document.createElement('select');
    s.style.cssText = 'font:11px system-ui;background:#242a33;color:#e8e9ec;border:1px solid #3a4150;border-radius:6px;padding:3px 6px;cursor:pointer;';
    [['1', 'Herbe'], ['2', 'Béton'], ['0', 'Uni']].forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); });
    s.onmouseenter = function () { s.style.borderColor = '#ff8a3d'; };
    s.onmouseleave = function () { s.style.borderColor = '#3a4150'; };
    s.value = String(GROUND_MODE);   /* affiche le mode courant (restauré des préférences) */
    s.onchange = function () { fn(+s.value); };
    w.appendChild(document.createTextNode('Sol')); w.appendChild(s); return w;
  }

  function addButton() {
    if (document.getElementById('bpo-pt-btn')) return;
    /* On le place DANS le viewport (#vp), juste sous la barre supérieure — donc
       aligné à droite comme le bouton WebGL (barre à ~8px, hauteur ~30px). Si le
       viewer est reconstruit, le bouton disparaît et ensure() le ré-ajoute (cf.
       MutationObserver plus bas). Repli sur le body si #vp est absent. */
    var vp = document.getElementById('vp');
    var root = vp || document.body || document.documentElement; if (!root) return;
    var b = document.createElement('button'); b.id = 'bpo-pt-btn';
    b.innerHTML = '🎞 ' + tr('Rendu photo');
    b.title = tr('Rendu photoréaliste (path tracing)');
    var pos = vp ? 'position:absolute;top:8px;right:8px;z-index:8;'
                 : 'position:fixed;top:8px;right:8px;z-index:99998;';
    b.style.cssText = pos + 'height:var(--tbH,30px);font:600 11px system-ui;padding:0 11px;display:inline-flex;align-items:center;' +
      'border-radius:6px;border:1px solid #ff8a3d;background:rgba(255,138,61,.95);color:#151515;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.4);';
    b.onclick = launch;
    root.appendChild(b);
    /* petit libellé « beta » juste sous le bouton, aligné à droite */
    var bt = document.createElement('div'); bt.id = 'bpo-pt-beta'; bt.textContent = 'beta';
    var bpos = vp ? 'position:absolute;top:40px;right:10px;z-index:8;'
                  : 'position:fixed;top:40px;right:10px;z-index:99998;';
    bt.style.cssText = bpos + 'font:600 9px system-ui;letter-spacing:.5px;text-transform:uppercase;' +
      'color:#ff8a3d;opacity:.85;pointer-events:none;text-align:right;';
    root.appendChild(bt);
  }

  function ensure() { try { addButton(); } catch (e) {} }
  ensure();
  document.addEventListener('DOMContentLoaded', ensure);
  window.addEventListener('load', ensure);
  var _n = 0, _iv = setInterval(function () { ensure(); if (++_n > 40) clearInterval(_iv); }, 500);
  try {
    var _mo = new MutationObserver(function () { if (!document.getElementById('bpo-pt-btn')) ensure(); });
    _mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();
