/* ============================================================================
   BPO — pont d'intégration du moteur path tracing dans le viewer
   ----------------------------------------------------------------------------
   Ajoute un bouton « Rendu photo » sur le viewer. Au clic :
     - extrait la scène courante (faces FC -> triangles + matériaux),
     - lit la caméra (cam) et le ciel/soleil (PREFS / WGL),
     - lance BPO_RT (WebGPU) en surimpression, convergence progressive,
     - panneau : échantillons, export PNG, fermer.
   Aucune dépendance interne à meuble.html au-delà des globales lues.
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
  /* Mode du sol du rendu : 0 = aplat (couleur PREFS), 1 = herbe, 2 = béton. */
  var GROUND_MODE = 1;
  /* Éclairage intérieur auto (toggle) + lampes manuelles (issues de la scène). */
  var INTERIOR_ON = false;

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
        out.push({ pos: [(L.x || 0) / 100, (L.y || 0) / 100, (L.z || 0) / 100], radius: (L.radius || 0.2), color: (L.color || [1.0, 0.86, 0.66]), intensity: (L.intensity == null ? 30 : L.intensity) });
      }
    } catch (e) {}
    return out;
  }
  function extractScene() {
    var faces = gatherFaces();
    var tris = [], mats = [], matMap = {};
    var bb = [1e30, 1e30, 1e30, -1e30, -1e30, -1e30];
    function matIndex(col, al) {
      var r = (col && col[0]) | 0, g = (col && col[1]) | 0, b = (col && col[2]) | 0;
      var glass = (al != null && al < 0.98);
      var key = r + '_' + g + '_' + b + '_' + (glass ? 'v' : 'o');
      if (matMap[key] != null) return matMap[key];
      var alb = [srgb2lin(r / 255), srgb2lin(g / 255), srgb2lin(b / 255)];
      // heuristique métal : gris clair peu saturé -> inox / alu / acier
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      var sat = mx > 0 ? (mx - mn) / mx : 0;
      var metallic = (!glass && mx > 150 && sat < 0.14) ? 0.75 : 0.0;
      var m = { albedo: alb, metal: metallic, rough: metallic > 0 ? 0.22 : 0.62,
                alpha: glass ? 0.25 : 1.0, ior: 1.5, emissive: [0, 0, 0] };
      var idx = mats.length; mats.push(m); matMap[key] = idx; return idx;
    }
    for (var i = 0; i < faces.length; i++) {
      var f = faces[i], vs = f.verts; if (!vs || vs.length < 3) continue;
      var mi = matIndex(f.col, f.al);
      for (var k = 1; k < vs.length - 1; k++) {
        tris.push({ a: vs[0], b: vs[k], c: vs[k + 1], mat: mi });
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
    return { triangles: tris, materials: mats, bb: bb };
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
    var top = hexOr(window.prefHex01, (window.PREFS && PREFS.skyTop), [0.40, 0.60, 0.86]);
    var hor = hexOr(window.prefHex01, (window.PREFS && PREFS.skyHor), [0.87, 0.91, 0.96]);
    /* Défaut : lumière RASANTE de trois-quarts (hauteur ~34°) plutôt qu'un soleil
       quasi zénithal. Un soleil bas donne de longues ombres portées qui posent le
       bâtiment au sol, et du relief sur les trumeaux — c'est ce qui manquait. */
    var sd = dirFromAzEl(126, 34), sc = sunTint(34);
    try {
      var e = window.WGL && WGL.ENVS ? WGL.ENVS[WGL.env] : null;
      /* on ne prend le soleil de la scène QUE s'il est réellement activé : sinon
         `WGL.sunVec` renvoie une lumière d'ambiance molle, et on perd le rasant. */
      if (e && WGL.sunVec && window.SUN && SUN.on) { var s = WGL.sunVec(e.L[0]); if (s) { sd = s.slice(); if (sd[1] < 0) { sd[0] = -sd[0]; sd[1] = -sd[1]; sd[2] = -sd[2]; } sc = sunTint(azElFromDir(sd)[1]); } }
    } catch (err) {}
    return {
      sunDir: sd, sunColor: sc, sunIntensity: 3.4, sunAngle: 0.025,
      skyTop: top, skyHor: hor, skyGround: [hor[0] * 0.5, hor[1] * 0.47, hor[2] * 0.42], skyInt: 0.58,
      expo: 0.45, warm: 0.5
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

    panel = document.createElement('div');
    panel.style.cssText = 'position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;' +
      'background:rgba(26,29,35,.92);border:1px solid #343a45;border-radius:10px;padding:8px 12px;color:#e8e9ec;font:12px system-ui;';
    var lbl = document.createElement('span'); lbl.textContent = tr('Rendu photo') + ' — 0 ' + tr('échantillons');
    lbl.style.cssText = 'min-width:180px;';
    var bPng = mkBtn('⬇ ' + tr('Exporter PNG'));
    var bClose = mkBtn('✕ ' + tr('Fermer'));
    panel.appendChild(lbl); panel.appendChild(bPng); panel.appendChild(bClose);
    host.appendChild(panel);
    vp.appendChild(host);

    try {
      renderer = await BPO_RT.create(overlay);
    } catch (e) { alert('Init WebGPU échouée : ' + e.message); close(); return; }

    var env = getEnv();
    try {
      try { await ensureMeshesDecoded(); } catch (e) {}
      var sc = extractScene();
      if (!sc.triangles.length) { alert('Aucune géométrie à rendre.'); close(); return; }
      renderer.setScene({ triangles: sc.triangles, materials: sc.materials });
      renderer.setCamera(getCamera(W / H));
      renderer.setEnv(env);
      renderer.setOpts({ bounces: 5 });
    } catch (e) { console.error('Rendu photo :', e); alert('Rendu photo — erreur : ' + e.message); close(); return; }
    /* Curseurs. Ceux qui changent la LUMIÈRE (soleil, direction) vident
       l'accumulateur via setEnv/reset ; exposition et ambiance sont du
       post-traitement, instantanés (pas de reset). */
    var ae = azElFromDir(env.sunDir), az = ae[0], el = ae[1];
    function applySun() {
      env.sunDir = dirFromAzEl(az, el);
      env.sunColor = sunTint(el);
      renderer.setEnv(env);                 // recharge les uniformes + reset
    }
    var sSun = mkSlider('☀', 0, 6, 0.1, env.sunIntensity, function (v) { env.sunIntensity = v; renderer.setEnv(env); });
    var sEl  = mkSlider('↕', 4, 85, 1, el, function (v) { el = v; applySun(); });                // hauteur
    var sAmb = mkSlider(tr('Amb'), 0, 1, 0.05, env.warm, function (v) { env.warm = v; });
    /* Sélecteur de SOL : change le mode du matériau sol et recharge la scène
       (rebuild BVH + reset accumulateur). herbe / béton / aplat. */
    var groundMat = null; for (var _gi = 0; _gi < sc.materials.length; _gi++) { if (sc.materials[_gi]._ground) groundMat = sc.materials[_gi]; }
    panel.appendChild(mkGroundSelect(function (mode) {
      GROUND_MODE = mode;
      if (groundMat) { groundMat.grass = mode; renderer.setScene({ triangles: sc.triangles, materials: sc.materials }); }
    }));
    /* Lumières : éclairage intérieur auto (toggle) + lampes manuelles de la scène. */
    function applyLights() { renderer.setLights((INTERIOR_ON ? autoInteriorLights(sc.bb) : []).concat(gatherManualLights())); }
    applyLights();
    var bInt = mkBtn('Intérieur'); bInt.title = 'Éclairage intérieur automatique (lampes chaudes au plafond)';
    bInt.onmouseenter = null; bInt.onmouseleave = null;
    function updIntBtn() { bInt.style.background = INTERIOR_ON ? 'rgba(255,138,61,.95)' : '#242a33'; bInt.style.color = INTERIOR_ON ? '#151515' : '#e8e9ec'; bInt.style.borderColor = INTERIOR_ON ? '#ff8a3d' : '#3a4150'; }
    updIntBtn();
    bInt.onclick = function () { INTERIOR_ON = !INTERIOR_ON; updIntBtn(); applyLights(); };
    panel.appendChild(bInt);
    /* Sélecteur d'AMBIANCE DE CIEL : applique un preset (dégradé + soleil) et
       resynchronise les curseurs soleil/hauteur/ambiance. */
    panel.appendChild(mkSkySelect(function (p) {
      env.skyTop = p.top.slice(); env.skyHor = p.hor.slice(); env.skyGround = p.gnd.slice(); env.skyInt = p.skyInt;
      env.sunIntensity = p.sun; env.sunAngle = p.ang; env.warm = p.warm; el = p.el;
      env.sunColor = sunTint(el); env.sunDir = dirFromAzEl(az, el);
      renderer.setEnv(env);
      setSliderVal(sSun, p.sun); setSliderVal(sEl, p.el); setSliderVal(sAmb, p.warm);
    }));
    panel.appendChild(sSun);
    panel.appendChild(mkSlider('⟳', 0, 360, 1, az, function (v) { az = v; applySun(); }));        // azimut
    panel.appendChild(sEl);
    panel.appendChild(mkSlider(tr('Expo'), 0.1, 2, 0.05, env.expo, function (v) { env.expo = v; }));
    panel.appendChild(sAmb);
    renderer.onProgress(function (n) { lbl.textContent = tr('Rendu photo') + ' — ' + n + ' ' + tr('échantillons'); });
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

  /* Point d'entrée global : permet à un bouton de meuble.html (celui qui a remplacé
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
    b.style.cssText = pos + 'font:600 12px system-ui;padding:6px 11px;' +
      'border-radius:8px;border:1px solid #ff8a3d;background:rgba(255,138,61,.95);color:#151515;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.4);';
    b.onclick = launch;
    root.appendChild(b);
    /* petit libellé « beta » juste sous le bouton, aligné à droite */
    var bt = document.createElement('div'); bt.id = 'bpo-pt-beta'; bt.textContent = 'beta';
    var bpos = vp ? 'position:absolute;top:35px;right:10px;z-index:8;'
                  : 'position:fixed;top:35px;right:10px;z-index:99998;';
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
