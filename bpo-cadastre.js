/* ============================================================================
   BPO — Cadastre / fond de plan  (bpo-cadastre.js)  v2
   Deux méthodes :
   A) « Depuis un PDF » : rasterise (pdf.js), détecte la grille de coordonnées
      (ticks) pour l'échelle exacte, vectorise bâti (jaune) + limites (encre) par
      marching-squares, fige comme objet « fond de plan » (BPO_import.bake).
   B) « Vecteur officiel » : WFS Géoplateforme IGN (PCI Express) par position,
      géométrie géomètre exacte, calé RGF93CC.
   Dépendances CDN à la demande : proj4 (B), pdf.js (A). Réseau requis pour B et
   pour charger pdf.js (A). Ne fonctionne pas en file://.
   ============================================================================ */
(function () {
  var glob = window;
  var WFS = 'https://data.geopf.fr/wfs/ows';
  var GEOC = 'https://data.geopf.fr/geocodage/search';
  var TN_PARC = 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle';
  var TN_BATI = 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS:batiment';

  /* ---------- chargeurs CDN ---------- */
  function loadScript(src, test) {
    return new Promise(function (res, rej) {
      if (test && test()) return res();
      var s = document.createElement('script'); s.src = src;
      s.onload = function () { res(); }; s.onerror = function () { rej(new Error('Ressource indisponible (hors ligne ?) : ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadProj4() { return loadScript('https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.11.0/proj4.js', function () { return !!glob.proj4; }); }
  function loadPdf() {
    return loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', function () { return !!glob.pdfjsLib; })
      .then(function () { if (glob.pdfjsLib) glob.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; });
  }
  function ccDef(zone) { return '+proj=lcc +lat_0=' + zone + ' +lon_0=3 +lat_1=' + (zone - 0.75) + ' +lat_2=' + (zone + 0.75) + ' +x_0=1700000 +y_0=' + (zone * 1000000 + 200000) + ' +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'; }
  function ccZone(lat) { return Math.max(42, Math.min(50, Math.round(lat))); }

  /* ---------- réseau (méthode B) ---------- */
  function jget(u) { return fetch(u, { headers: { Accept: 'application/json' } }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function geocode(q) { return jget(GEOC + '?q=' + encodeURIComponent(q) + '&limit=1').then(function (j) { if (!j.features || !j.features.length) throw new Error('Adresse introuvable'); var c = j.features[0].geometry.coordinates; return { lon: c[0], lat: c[1] }; }); }
  function wfs(tn, lon, lat, halfm) {
    var dLat = halfm / 111320, dLon = halfm / (111320 * Math.cos(lat * Math.PI / 180));
    var bbox = (lat - dLat) + ',' + (lon - dLon) + ',' + (lat + dLat) + ',' + (lon + dLon);
    return jget(WFS + '?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=' + encodeURIComponent(tn) + '&SRSNAME=EPSG:4326&OUTPUTFORMAT=application/json&COUNT=500&BBOX=' + encodeURIComponent(bbox)).then(function (j) { return (j && j.features) || []; });
  }

  /* ---------- bake d'un fond de plan (rings locaux en m ; y = northing) ---------- */
  function bakeFond(name, ringsParc, ringsBati, note) {
    if (!(glob.BPO_import && glob.BPO_import.bake)) { glob.alert('Module d\'import indisponible.'); return Promise.reject(); }
    var pos = [], idx = [], groups = [];
    function ribbons(rings, w, y) {
      var start = idx.length;
      rings.forEach(function (r) {
        var P = r.pts, n = P.length; if (n < 2) return;
        for (var s = 0; s < n - 1; s++) {
          var a = P[s], b = P[s + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, px = -dy / L * w, py = dx / L * w, base = pos.length / 3;
          pos.push(a[0] + px, y, -(a[1] + py), b[0] + px, y, -(b[1] + py), b[0] - px, y, -(b[1] - py), a[0] - px, y, -(a[1] - py));
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      });
      return idx.length - start;
    }
    var cP = ribbons(ringsParc, 0.12, 0.02); groups.push({ start: 0, count: cP, col: [70, 74, 82], tex: null, name: 'Parcelles' });
    if (ringsBati && ringsBati.length) { var s2 = idx.length, cB = ribbons(ringsBati, 0.16, 0.05); groups.push({ start: s2, count: cB, col: [188, 150, 96], tex: null, name: 'Bâti' }); }
    if (!pos.length) return Promise.reject(new Error('Rien à vectoriser (grille/seuils ?).'));
    return glob.BPO_import.bake(name, Float32Array.from(pos), Uint32Array.from(idx), groups).then(function () {
      glob.alert('Fond de plan « ' + name + ' » importé — Ma bibliothèque › Objets importés.' + (note ? ('\n' + note) : ''));
    });
  }

  /* ================= MÉTHODE B : vecteur officiel ================= */
  function importOfficiel(o) {
    var lat = o.lat, lon = o.lon, zone = ccZone(lat), R = o.radius || 90, def = ccDef(zone);
    return loadProj4().then(function () {
      var oc = glob.proj4('EPSG:4326', def, [lon, lat]), ORX = Math.floor(oc[0] / 10) * 10, ORY = Math.floor(oc[1] / 10) * 10;
      function ringsFrom(feats) {
        var out = [];
        feats.forEach(function (f) {
          var g = f.geometry; if (!g) return;
          var polys = g.type === 'MultiPolygon' ? g.coordinates : (g.type === 'Polygon' ? [g.coordinates] : []);
          polys.forEach(function (poly) { poly.forEach(function (ring) { out.push({ pts: ring.map(function (c) { var xy = glob.proj4('EPSG:4326', def, [c[0], c[1]]); return [xy[0] - ORX, xy[1] - ORY]; }) }); }); });
        });
        return out;
      }
      var jobs = [wfs(TN_PARC, lon, lat, R)]; if (o.bati) jobs.push(wfs(TN_BATI, lon, lat, R).catch(function () { return []; }));
      return Promise.all(jobs).then(function (rr) {
        var parc = rr[0] || [], bati = rr[1] || [];
        if (!parc.length) throw new Error('Aucune parcelle à cette position.');
        return bakeFond(o.name || 'Cadastre', ringsFrom(parc), ringsFrom(bati), 'RGF93CC zone ' + zone + ' · origine ' + Math.round(ORX) + ' / ' + Math.round(ORY) + ' m').then(function () { return { parc: parc.length, bati: bati.length }; });
      });
    });
  }

  /* ================= MÉTHODE A : trace du PDF ================= */
  function renderPdf(file, targetW) {
    return file.arrayBuffer().then(function (buf) {
      return glob.pdfjsLib.getDocument({ data: buf }).promise.then(function (pdf) {
        return pdf.getPage(1).then(function (page) {
          var vp1 = page.getViewport({ scale: 1 }), sc = targetW / vp1.width, vp = page.getViewport({ scale: sc });
          var cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
          var ctx = cv.getContext('2d');
          return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
            var d = ctx.getImageData(0, 0, cv.width, cv.height); return { W: cv.width, H: cv.height, data: d.data };
          });
        });
      });
    });
  }
  /* masques : ink (encre sombre) & yellow (bâti) */
  function masks(px, W, H) {
    var N = W * H, ink = new Uint8Array(N), yel = new Uint8Array(N), gray = new Uint8Array(N);
    for (var i = 0, p = 0; i < N; i++, p += 4) {
      var R = px[p], G = px[p + 1], B = px[p + 2], g = (R * 299 + G * 587 + B * 114) / 1000; gray[i] = g;
      if (g < 110) ink[i] = 1;
      if ((R > 170 && G > 130 && B < 135) || (R > 232 && G > 205 && B > 150 && B < 212)) yel[i] = 1;
    }
    return { ink: ink, yel: yel, gray: gray };
  }
  function clust(v, gap) { if (!v.length) return []; v.sort(function (a, b) { return a - b; }); var o = [], c = [v[0]]; for (var i = 1; i < v.length; i++) { if (v[i] - c[c.length - 1] <= gap) c.push(v[i]); else { o.push(Math.round(c.reduce(function (s, x) { return s + x; }, 0) / c.length)); c = [v[i]]; } } o.push(Math.round(c.reduce(function (s, x) { return s + x; }, 0) / c.length)); return o; }
  /* détecte le cadre (neatline) + l'espacement des ticks (px) */
  function detectGrid(ink, W, H) {
    function rowInk(y, x0) { var s = 0; for (var x = x0; x < W; x++) s += ink[y * W + x]; return s; }
    function colInk(x, y0, y1) { var s = 0; for (var y = y0; y < y1; y++) s += ink[y * W + x]; return s; }
    var mx0 = Math.round(W * 0.22);
    var yT = 0, best = 0; for (var y = 8; y < H * 0.18; y++) { var s = rowInk(y, mx0); if (s > best) { best = s; yT = y; } }
    var yB = H - 1; best = 0; for (var y2 = Math.round(H * 0.82); y2 < H - 8; y2++) { var s2 = rowInk(y2, mx0); if (s2 > best) { best = s2; yB = y2; } }
    var xL = mx0, bl = 0; for (var x = Math.round(W * 0.20); x < W * 0.30; x++) { var c = colInk(x, Math.round(H * 0.1), Math.round(H * 0.9)); if (c > bl) { bl = c; xL = x; } }
    var xR = W - 1, br = 0; for (var x2 = W - 8; x2 > W * 0.9; x2--) { var c2 = colInk(x2, Math.round(H * 0.1), Math.round(H * 0.9)); if (c2 > br) { br = c2; xR = x2; } }
    /* ticks sur le bord haut : segments courts (encre juste sous le cadre, blanc plus bas) */
    var cols = [];
    for (var x3 = xL + 12; x3 < xR - 12; x3++) {
      var a = 0; for (var yy = yT + 8; yy < yT + 28; yy++) a += ink[yy * W + x3];
      var b = ink[(yT + 70) * W + x3] + ink[(yT + 95) * W + x3];
      if (a >= 8 && b === 0) cols.push(x3);
    }
    var tx = clust(cols, 20);
    var sp = 0; if (tx.length >= 2) { var d = []; for (var k = 1; k < tx.length; k++) d.push(tx[k] - tx[k - 1]); d.sort(function (m, n) { return m - n; }); sp = d[Math.floor(d.length / 2)]; }
    return { xL: xL, xR: xR, yT: yT, yB: yB, spacing: sp, ticksX: tx };
  }
  /* enlève cadre, bâti, gros blobs (numéros) et petits blobs (croix/ticks) de l'encre */
  function cleanInk(ink, yel, W, H, gr) {
    var N = W * H, m = new Uint8Array(N);
    for (var i = 0; i < N; i++) m[i] = (ink[i] && !yel[i]) ? 1 : 0;
    for (var y = 0; y <= gr.yT + 3; y++) for (var x = 0; x < W; x++) m[y * W + x] = 0;
    for (var y2 = gr.yB - 3; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) m[y2 * W + x2] = 0;
    for (var y3 = 0; y3 < H; y3++) { for (var x3 = 0; x3 <= gr.xL + 3; x3++) m[y3 * W + x3] = 0; for (var x4 = gr.xR - 3; x4 < W; x4++) m[y3 * W + x4] = 0; }
    /* composantes connexes (BFS) : efface les numéros de parcelles (gros blobs denses)
       et les croix/ticks/points (petits blobs) ; garde les lignes (longues et fines). */
    var lab2 = new Int32Array(N);
    for (var s2 = 0; s2 < N; s2++) {
      if (!m[s2] || lab2[s2]) continue;
      var id2 = s2 + 1, mnx = 1e9, mny = 1e9, mxx = -1, mxy = -1, ar = 0, cells = [];
      var stk = [s2]; lab2[s2] = id2;
      while (stk.length) { var pp = stk.pop(), ppx = pp % W, ppy = (pp - ppx) / W; ar++; cells.push(pp); if (ppx < mnx) mnx = ppx; if (ppx > mxx) mxx = ppx; if (ppy < mny) mny = ppy; if (ppy > mxy) mxy = ppy; var nb2 = [pp - 1, pp + 1, pp - W, pp + W, pp - W - 1, pp - W + 1, pp + W - 1, pp + W + 1]; for (var qq = 0; qq < 8; qq++) { var npp = nb2[qq]; if (npp >= 0 && npp < N && m[npp] && !lab2[npp]) { lab2[npp] = id2; stk.push(npp); } } }
      var ww = mxx - mnx + 1, hh = mxy - mny + 1, digit2 = (hh > 35 && hh < 170 && ww < 140 && (ar / (ww * hh)) > 0.15 && ar < 12000), small2 = (ww < 75 && hh < 75 && ar < 900);
      if (digit2 || small2) { for (var ci = 0; ci < cells.length; ci++) m[cells[ci]] = 0; }
    }
    return m;
  }
  /* marching-squares : segments de bord d'un masque binaire, pas de cellule 'step' px */
  function march(mask, W, H, step, bx) {
    bx = bx || { x0: 0, y0: 0, x1: W, y1: H }; var segs = [];
    function at(x, y) { return (x >= 0 && y >= 0 && x < W && y < H) ? mask[y * W + x] : 0; }
    for (var y = bx.y0; y < bx.y1 - step; y += step) for (var x = bx.x0; x < bx.x1 - step; x += step) {
      var c0 = at(x, y), c1 = at(x + step, y), c2 = at(x + step, y + step), c3 = at(x, y + step);
      var s = (c0 ? 1 : 0) | (c1 ? 2 : 0) | (c2 ? 4 : 0) | (c3 ? 8 : 0); if (s === 0 || s === 15) continue;
      var T = [x + step / 2, y], R = [x + step, y + step / 2], Bt = [x + step / 2, y + step], L = [x, y + step / 2];
      function seg(a, b) { segs.push([a[0], a[1], b[0], b[1]]); }
      switch (s) {
        case 1: case 14: seg(L, T); break; case 2: case 13: seg(T, R); break; case 3: case 12: seg(L, R); break;
        case 4: case 11: seg(R, Bt); break; case 6: case 9: seg(T, Bt); break; case 7: case 8: seg(L, Bt); break;
        case 5: seg(L, T); seg(R, Bt); break; case 10: seg(T, R); seg(L, Bt); break;
      }
    }
    return segs;
  }
  function importPDF(file, o) {
    return loadPdf().then(function () { return renderPdf(file, 2200); }).then(function (im) {
      var mk = masks(im.data, im.W, im.H), gr = detectGrid(mk.ink, im.W, im.H);
      if (!gr.spacing || gr.spacing < 10) throw new Error('Grille non détectée (ticks introuvables). Vérifie que c\'est bien un extrait cadastre.gouv.fr avec la grille de coordonnées.');
      var mPerPx = (o.interval || 20) / gr.spacing;
      function loc(px, py) { return [(px - gr.xL) * mPerPx, (gr.yB - py) * mPerPx]; }
      var bx = { x0: gr.xL, y0: gr.yT, x1: gr.xR, y1: gr.yB };
      var ringsBati = [], ringsParc = [];
      if (o.bati) march(mk.yel, im.W, im.H, 3, bx).forEach(function (s) { ringsBati.push({ pts: [loc(s[0], s[1]), loc(s[2], s[3])] }); });
      if (o.trace) { var clean = cleanInk(mk.ink, mk.yel, im.W, im.H, gr); march(clean, im.W, im.H, 2, bx).forEach(function (s) { ringsParc.push({ pts: [loc(s[0], s[1]), loc(s[2], s[3])] }); }); }
      var site = ((gr.xR - gr.xL) * mPerPx).toFixed(1) + ' × ' + ((gr.yB - gr.yT) * mPerPx).toFixed(1) + ' m';
      return bakeFond(o.name || 'Cadastre PDF', ringsParc, ringsBati, 'Échelle ' + mPerPx.toFixed(4) + ' m/px · emprise ' + site + ' · grille ' + gr.spacing + ' px = ' + (o.interval || 20) + ' m').then(function () { return { site: site }; });
    });
  }

  /* ================= UI ================= */
  function openDialog() {
    if (document.getElementById('bpoCadDlg')) return;
    var ov = document.createElement('div'); ov.id = 'bpoCadDlg';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;background:rgba(10,12,16,.55);font-family:system-ui,sans-serif;';
    var CS = 'width:100%;background:#262b34;border:1px solid #3a4653;border-radius:7px;color:#e8e9ec;font-size:12px;padding:8px;outline:none;box-sizing:border-box;';
    ov.innerHTML = '<div style="width:min(460px,93%);background:#20242c;border:1px solid #3a4653;border-radius:12px;padding:16px 18px 14px;color:#e8e9ec;box-shadow:0 12px 50px rgba(0,0,0,.6);">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:10px;">Fond de plan cadastre</div>' +
      '<div style="display:flex;gap:4px;margin-bottom:12px;"><button id="bpoTabV">Vecteur officiel</button><button id="bpoTabP">Depuis un PDF</button></div>' +
      '<div id="bpoPaneV">' +
      '<div style="font-size:11px;color:#8b92a0;margin-bottom:8px;">Géométrie exacte (IGN Géoplateforme). Réseau requis.</div>' +
      '<label style="font-size:11px;color:#8b92a0;display:block;margin:6px 0 3px;">Adresse ou « lon,lat »</label>' +
      '<input id="bpoQ" type="text" placeholder="adresse…  ·  ou  2.1842,48.7581" style="' + CS + '">' +
      '<div style="display:flex;gap:12px;margin-top:10px;"><div style="flex:1;"><label style="font-size:11px;color:#8b92a0;">Rayon (m)</label><input id="bpoR" type="number" value="90" min="20" max="400" style="' + CS + '"></div><label style="flex:1;display:flex;align-items:flex-end;gap:6px;font-size:12px;padding-bottom:6px;"><input id="bpoBv" type="checkbox" checked> Bâti</label></div>' +
      '</div>' +
      '<div id="bpoPaneP" style="display:none;">' +
      '<div style="font-size:11px;color:#8b92a0;margin-bottom:8px;">Trace un extrait <b>cadastre.gouv.fr</b> (grille de coordonnées requise). Traits polygonisés — pour du géomètre exact, utilise l\'onglet Vecteur officiel.</div>' +
      '<input id="bpoFile" type="file" accept="application/pdf,.pdf" style="' + CS + '">' +
      '<div style="display:flex;gap:12px;margin-top:10px;"><div style="flex:1;"><label style="font-size:11px;color:#8b92a0;">Grille (m entre graduations)</label><input id="bpoInt" type="number" value="20" min="1" max="500" style="' + CS + '"></div><label style="flex:1;display:flex;align-items:flex-end;gap:6px;font-size:12px;padding-bottom:6px;"><input id="bpoBp" type="checkbox" checked> Bâti</label></div>' +
      '<label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:8px;"><input id="bpoTr" type="checkbox" checked> Tracer les limites de parcelles</label>' +
      '</div>' +
      '<div id="bpoMsg" style="font-size:11px;color:#ff8a3d;min-height:16px;margin-top:12px;line-height:1.4;"></div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:12px;"><button id="bpoX" style="background:transparent;border:1px solid #3a4653;color:#e8e9ec;border-radius:7px;font-size:12px;padding:8px 14px;cursor:pointer;">Fermer</button><button id="bpoGo" style="background:#ff8a3d;border:0;color:#201812;border-radius:7px;font-size:12px;font-weight:700;padding:8px 16px;cursor:pointer;">Importer</button></div>' +
      '</div>';
    document.body.appendChild(ov);
    var msg = ov.querySelector('#bpoMsg'), tab = 'V';
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector('#bpoX').onclick = close; ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    function tstyle(b, on) { b.style.cssText = 'flex:1;padding:7px;font-size:12px;border-radius:6px;cursor:pointer;border:1px solid ' + (on ? '#ff8a3d' : '#3a4653') + ';background:' + (on ? '#ff8a3d' : '#232a34') + ';color:' + (on ? '#201812' : '#cdd6e0') + ';font-weight:' + (on ? '700' : '400') + ';'; }
    function setTab(t) { tab = t; tstyle(ov.querySelector('#bpoTabV'), t === 'V'); tstyle(ov.querySelector('#bpoTabP'), t === 'P'); ov.querySelector('#bpoPaneV').style.display = t === 'V' ? '' : 'none'; ov.querySelector('#bpoPaneP').style.display = t === 'P' ? '' : 'none'; }
    setTab('V');
    ov.querySelector('#bpoTabV').onclick = function () { setTab('V'); }; ov.querySelector('#bpoTabP').onclick = function () { setTab('P'); };
    ov.querySelector('#bpoGo').onclick = function () {
      if (tab === 'V') {
        var q = (ov.querySelector('#bpoQ').value || '').trim(), R = +ov.querySelector('#bpoR').value || 90, bati = ov.querySelector('#bpoBv').checked;
        if (!q) { msg.textContent = 'Saisis une adresse ou des coordonnées.'; return; }
        msg.style.color = '#ff8a3d'; msg.textContent = '… position…';
        var m = q.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
        var pp = m ? Promise.resolve({ lon: +m[1], lat: +m[2] }) : loadProj4().then(function () { return geocode(q); });
        pp.then(function (p) { msg.textContent = '… récupération IGN…'; return importOfficiel({ lon: p.lon, lat: p.lat, radius: R, bati: bati, name: 'Cadastre ' + q.slice(0, 22) }); })
          .then(function (r) { msg.style.color = '#8fd39a'; msg.textContent = '✓ ' + r.parc + ' parcelles' + (r.bati ? (' · ' + r.bati + ' bâtiments') : '') + '.'; })
          .catch(function (e) { msg.style.color = '#e06a5a'; msg.textContent = '⚠ ' + (e && e.message || e); });
      } else {
        var f = ov.querySelector('#bpoFile').files[0]; if (!f) { msg.textContent = 'Choisis un PDF cadastre.'; return; }
        var interval = +ov.querySelector('#bpoInt').value || 20, bati2 = ov.querySelector('#bpoBp').checked, trace = ov.querySelector('#bpoTr').checked;
        msg.style.color = '#ff8a3d'; msg.textContent = '… lecture du PDF et vectorisation (quelques secondes)…';
        importPDF(f, { interval: interval, bati: bati2, trace: trace, name: 'Cadastre ' + f.name.replace(/\.pdf$/i, '').slice(0, 22) })
          .then(function (r) { msg.style.color = '#8fd39a'; msg.textContent = '✓ Fond de plan importé · emprise ' + r.site + '.'; })
          .catch(function (e) { msg.style.color = '#e06a5a'; msg.textContent = '⚠ ' + (e && e.message || e); });
      }
    };
  }

  glob.BPO_cadastre = { open: openDialog, importOfficiel: importOfficiel, importPDF: importPDF };
})();
