/* ============================================================================
   BPO — Cadastre / fond de plan  (bpo-cadastre.js)
   Route B (v1) : récupère le VECTEUR OFFICIEL (PCI Express) par position, via le
   WFS de la Géoplateforme IGN, le cale en RGF93CC49 → coords locales (m), et le
   fige comme objet « fond de plan » (BPO_import.bake) posable/exportable.
   Route A (PDF trace) : à venir en incrément 2.
   Dépendances chargées à la demande depuis cdnjs : proj4.
   Réseau requis (app en https/localhost/Electron, pas file://).
   ============================================================================ */
(function () {
  var glob = window;
  var WFS = 'https://data.geopf.fr/wfs/ows';
  var GEOC = 'https://data.geopf.fr/geocodage/search';
  var TN_PARC = 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle';
  var TN_BATI = 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS:batiment';
  /* définition proj4 des 9 zones coniques CC (lat_0 = n° de zone, 42..50) */
  function ccDef(zone) {
    return '+proj=lcc +lat_0=' + zone + ' +lon_0=3 +lat_1=' + (zone - 0.75) +
      ' +lat_2=' + (zone + 0.75) + ' +x_0=1700000 +y_0=' + (zone * 1000000 + 200000) +
      ' +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
  }
  var _proj4 = null;
  function loadProj4() {
    return new Promise(function (res, rej) {
      if (glob.proj4) { _proj4 = glob.proj4; return res(_proj4); }
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.11.0/proj4.js';
      s.onload = function () { _proj4 = glob.proj4; res(_proj4); };
      s.onerror = function () { rej(new Error('proj4 indisponible (hors ligne ?)')); };
      document.head.appendChild(s);
    });
  }
  function ccZoneForLat(lat) { return Math.max(42, Math.min(50, Math.round(lat))); }

  /* --- réseau --- */
  function jget(url) {
    return fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
    });
  }
  function geocode(q) {
    return jget(GEOC + '?q=' + encodeURIComponent(q) + '&limit=1&returntruegeometry=false')
      .then(function (j) {
        if (!j.features || !j.features.length) throw new Error('Adresse introuvable');
        var c = j.features[0].geometry.coordinates; return { lon: c[0], lat: c[1] };
      });
  }
  function wfsBBox(typename, lon, lat, halfm) {
    /* halfm : demi-côté en mètres → convertit en degrés approx */
    var dLat = halfm / 111320.0, dLon = halfm / (111320.0 * Math.cos(lat * Math.PI / 180));
    var bbox = (lat - dLat) + ',' + (lon - dLon) + ',' + (lat + dLat) + ',' + (lon + dLon);
    var u = WFS + '?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=' + encodeURIComponent(typename) +
      '&SRSNAME=EPSG:4326&OUTPUTFORMAT=application/json&COUNT=400&BBOX=' + encodeURIComponent(bbox);
    return jget(u).then(function (j) { return (j && j.features) || []; });
  }

  /* --- géométrie : polylignes locales (m) à partir des features WGS84 --- */
  function featuresToLocal(feats, originCC, zone) {
    var p4 = _proj4, def = ccDef(zone), rings = [];
    function ring(coords) {
      var out = [];
      for (var i = 0; i < coords.length; i++) {
        var xy = p4('EPSG:4326', def, [coords[i][0], coords[i][1]]);
        out.push([xy[0] - originCC[0], xy[1] - originCC[1]]);
      }
      return out;
    }
    feats.forEach(function (f) {
      var g = f.geometry; if (!g) return;
      var polys = g.type === 'MultiPolygon' ? g.coordinates : (g.type === 'Polygon' ? [g.coordinates] : []);
      polys.forEach(function (poly) { poly.forEach(function (r) { rings.push({ pts: ring(r), num: (f.properties && (f.properties.numero || '')) }); }); });
    });
    return rings;
  }
  function originForLatLon(lon, lat, zone) {
    var c = _proj4('EPSG:4326', ccDef(zone), [lon, lat]);
    /* origine locale = coin arrondi 10 m pour des coords propres */
    return [Math.floor(c[0] / 10) * 10, Math.floor(c[1] / 10) * 10];
  }

  /* --- construit un maillage plat (rubans) et le bake comme objet importé ---
     ringsParc / ringsBati : [{pts:[[x,y]...]}] en mètres locaux (y = northing).
     Repère scène BPO : pos = [x, eps, -y]. --- */
  function bakeFond(name, ringsParc, ringsBati, meta) {
    if (!(glob.BPO_import && glob.BPO_import.bake)) { glob.alert('Module d\'import indisponible.'); return Promise.reject(); }
    var pos = [], idx = [], groups = [];
    function ribbons(rings, w, y) {
      var start = idx.length;
      rings.forEach(function (r) {
        var P = r.pts, n = P.length;
        for (var s = 0; s < n - 1; s++) {
          var a = P[s], b = P[s + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
          var px = -dy / L * w, py = dx / L * w, base = pos.length / 3;
          pos.push(a[0] + px, y, -(a[1] + py), b[0] + px, y, -(b[1] + py), b[0] - px, y, -(b[1] - py), a[0] - px, y, -(a[1] - py));
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      });
      return idx.length - start;
    }
    var cP = ribbons(ringsParc, 0.14, 0.02);
    groups.push({ start: 0, count: cP, col: [70, 74, 82], tex: null, name: 'Parcelles' });
    if (ringsBati && ringsBati.length) {
      var s2 = idx.length; var cB = ribbons(ringsBati, 0.16, 0.05);
      groups.push({ start: s2, count: cB, col: [188, 150, 96], tex: null, name: 'Bâti' });
    }
    var fpos = Float32Array.from(pos), fidx = Uint32Array.from(idx);
    return glob.BPO_import.bake(name, fpos, fidx, groups).then(function () {
      glob.alert('Fond de plan cadastre importé (« ' + name + ' ») — dans Ma bibliothèque › Objets importés. ' +
        (meta ? ('Origine RGF93CC49 : ' + Math.round(meta.origin[0]) + ' / ' + Math.round(meta.origin[1]) + ' m (zone CC' + meta.zone + ').') : ''));
    });
  }

  /* --- pipeline route B : position → WFS → bake --- */
  function importOfficiel(opts) {
    /* opts : {lon,lat,radius,name,bati} */
    var lat = opts.lat, lon = opts.lon, zone = ccZoneForLat(lat), R = opts.radius || 90;
    return loadProj4().then(function () {
      var origin = originForLatLon(lon, lat, zone);
      var jobs = [wfsBBox(TN_PARC, lon, lat, R)];
      if (opts.bati) jobs.push(wfsBBox(TN_BATI, lon, lat, R).catch(function () { return []; }));
      return Promise.all(jobs).then(function (res) {
        var parc = res[0] || [], bati = res[1] || [];
        if (!parc.length) throw new Error('Aucune parcelle trouvée à cette position (zone bâtie ? réseau ?).');
        var rP = featuresToLocal(parc, origin, zone), rB = featuresToLocal(bati, origin, zone);
        return bakeFond(opts.name || 'Cadastre', rP, rB, { origin: origin, zone: zone })
          .then(function () { return { parc: parc.length, bati: bati.length }; });
      });
    });
  }

  /* --- UI : petit panneau modal --- */
  function openDialog() {
    if (document.getElementById('bpoCadDlg')) return;
    var ov = document.createElement('div'); ov.id = 'bpoCadDlg';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;background:rgba(10,12,16,.55);font-family:system-ui,sans-serif;';
    ov.innerHTML = '<div style="width:min(440px,92%);background:var(--pn,#20242c);border:1px solid var(--ln,#343a45);border-radius:12px;padding:18px 18px 14px;color:var(--tx,#e8e9ec);box-shadow:0 12px 50px rgba(0,0,0,.6);">' +
      '<div style="font-size:14px;font-weight:600;margin-bottom:2px;">Fond de plan cadastre</div>' +
      '<div style="font-size:11px;color:var(--dm,#8b92a0);margin-bottom:12px;">Vecteur officiel PCI (IGN Géoplateforme), calé à l\'échelle en RGF93CC. Réseau requis.</div>' +
      '<label style="font-size:11px;color:var(--dm,#8b92a0);display:block;margin:8px 0 3px;">Adresse ou « lon,lat »</label>' +
      '<input id="bpoCadQ" type="text" placeholder="ex. 1 rue de la Libération, Jouy-en-Josas  ·  ou  2.1842,48.7581" style="width:100%;background:var(--p2,#262b34);border:1px solid var(--ln,#343a45);border-radius:7px;color:var(--tx,#e8e9ec);font-size:12px;padding:8px;outline:none;">' +
      '<div style="display:flex;gap:12px;margin-top:10px;">' +
      '<div style="flex:1;"><label style="font-size:11px;color:var(--dm,#8b92a0);display:block;margin-bottom:3px;">Rayon (m)</label><input id="bpoCadR" type="number" value="90" min="20" max="400" style="width:100%;background:var(--p2,#262b34);border:1px solid var(--ln,#343a45);border-radius:7px;color:var(--tx,#e8e9ec);font-size:12px;padding:7px;"></div>' +
      '<label style="flex:1;display:flex;align-items:flex-end;gap:6px;font-size:12px;padding-bottom:6px;"><input id="bpoCadB" type="checkbox" checked> Bâti</label></div>' +
      '<div id="bpoCadMsg" style="font-size:11px;color:var(--am,#ff8a3d);min-height:16px;margin-top:10px;"></div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:12px;">' +
      '<button id="bpoCadX" style="background:transparent;border:1px solid var(--ln,#343a45);color:var(--tx,#e8e9ec);border-radius:7px;font-size:12px;padding:8px 14px;cursor:pointer;">Fermer</button>' +
      '<button id="bpoCadGo" style="background:var(--am,#ff8a3d);border:0;color:#201812;border-radius:7px;font-size:12px;font-weight:700;padding:8px 16px;cursor:pointer;">Importer</button>' +
      '</div></div>';
    document.body.appendChild(ov);
    var msg = ov.querySelector('#bpoCadMsg');
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector('#bpoCadX').onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('#bpoCadGo').onclick = function () {
      var q = (ov.querySelector('#bpoCadQ').value || '').trim();
      var R = Math.max(20, Math.min(400, +ov.querySelector('#bpoCadR').value || 90));
      var bati = ov.querySelector('#bpoCadB').checked;
      if (!q) { msg.textContent = 'Saisis une adresse ou des coordonnées.'; return; }
      msg.style.color = 'var(--am,#ff8a3d)'; msg.textContent = '… recherche de la position…';
      var m = q.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
      var posP = m ? Promise.resolve({ lon: +m[1], lat: +m[2] }) : loadProj4().then(function () { return geocode(q); });
      posP.then(function (p) {
        msg.textContent = '… récupération du cadastre (IGN)…';
        return importOfficiel({ lon: p.lon, lat: p.lat, radius: R, bati: bati, name: 'Cadastre ' + q.slice(0, 24) });
      }).then(function (r) {
        msg.style.color = '#8fd39a'; msg.textContent = '✓ ' + r.parc + ' parcelles' + (r.bati ? (' · ' + r.bati + ' bâtiments') : '') + ' importés.';
      }).catch(function (e) {
        msg.style.color = '#e06a5a'; msg.textContent = '⚠ ' + (e && e.message || e);
      });
    };
    var qi = ov.querySelector('#bpoCadQ'); if (qi) qi.focus();
  }

  glob.BPO_cadastre = { open: openDialog, importOfficiel: importOfficiel, _geocode: geocode };
})();
