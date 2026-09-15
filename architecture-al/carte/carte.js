// Carte du quartier : plan de situation (Canvas 2D) et maquette 3D (three.js r128)
// Mêmes données pour les deux vues : quartier.js (IGN BD TOPO, Lambert-93 centré sur l'agence, en décimètres).
var CARTE = (function () {
  'use strict';
  var Q = window.QUARTIER;
  var C = {
    sol: '#ece9e2', voie: '#ffffff', vege: '#dce2d1', sport: '#e3e7d8',
    encre: '#1d1c1a', graphite: '#6f6a62', agence: '#e0662c', agenceTexte: '#e0662c', metro: '#ffcd00',
    bas: [222, 216, 206], haut: [156, 149, 139]
  };
  var siege = Q.bati.filter(function (b) { return b[1] === 1; })[0];
  var siegeC = centre(siege[2]);
  // Repères utiles pour trouver l'agence ; la BD TOPO en nomme 28, dont des aumôneries et des CFA
  var LIEUX = Q.lieux.filter(function (l) {
    return l[3] === 'metro' || /^(Stade|Centre Sportif|Église Sainte|Lycée|Hôpital|Jardin|Square)/.test(l[0]);
  });

  function centre(r) {
    var x = 0, y = 0, n = r.length / 2;
    for (var i = 0; i < r.length; i += 2) { x += r[i]; y += r[i + 1]; }
    return [x / n / 10, y / n / 10];
  }
  function boite(r) {
    var b = [1e9, 1e9, -1e9, -1e9];
    for (var i = 0; i < r.length; i += 2) {
      b[0] = Math.min(b[0], r[i] / 10); b[1] = Math.min(b[1], r[i + 1] / 10);
      b[2] = Math.max(b[2], r[i] / 10); b[3] = Math.max(b[3], r[i + 1] / 10);
    }
    return b;
  }
  function dans(anneaux, x, y) {
    var d = false;
    anneaux.forEach(function (r) {
      for (var n = r.length / 2, i = 0, j = n - 1; i < n; j = i++) {
        var xi = r[2 * i] / 10, yi = r[2 * i + 1] / 10, xj = r[2 * j] / 10, yj = r[2 * j + 1] / 10;
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d;
      }
    });
    return d;
  }
  function trace(p, r) {
    p.moveTo(r[0] / 10, r[1] / 10);
    for (var i = 2; i < r.length; i += 2) p.lineTo(r[i] / 10, r[i + 1] / 10);
    p.closePath();
  }
  function borne(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // Couleurs des lignes : référentiel Île-de-France Mobilités (texte noir sur la 9)
  var LIGNES = { '9': '#b6bd00' };
  // Pastilles « M » puis numéros de ligne, comme sur la signalétique RATP ; lignes = « 9 » ou « 9,10 »
  function pastilles(lignes) {
    var liste = String(lignes || '').split(',').filter(Boolean);
    return '<span class="metro-m" aria-hidden="true">M</span>' + liste.map(function (n) {
      return '<span class="ligne-metro" style="background:' + (LIGNES[n] || '#cfcac2') + '" aria-hidden="true">' + n + '</span>';
    }).join('') + '<span class="vh">Métro' + (liste.length ? ' ligne ' + liste.join(', ') : '') + ', </span>';
  }
  function metres(v) { return v.toFixed(1).replace('.', ',') + ' m'; }

  // ——— Plan de situation ———
  function Plan(cv, info) {
    var ctx = cv.getContext('2d'), dpr = 1, W = 0, H = 0, raf = 0, survol = null;
    var vue = { x: 0, y: 0, s: 2 };
    var bati = Q.bati.map(function (b) {
      var p = new Path2D(), anneaux = b.slice(2);
      anneaux.forEach(function (r) { trace(p, r); });
      var t = Math.min(1, b[0] / 36);
      var rgb = C.bas.map(function (v, k) { return Math.round(v + (C.haut[k] - v) * t); });
      return { p: p, h: b[0], siege: b[1] === 1, anneaux: anneaux, bb: boite(anneaux[0]), teinte: 'rgb(' + rgb + ')' };
    });
    function surfaces(liste) {
      return liste.map(function (anneaux) { var p = new Path2D(); anneaux.forEach(function (r) { trace(p, r); }); return p; });
    }
    var vege = surfaces(Q.vege), sport = surfaces(Q.sport);
    var voies = Q.voies.map(function (v) {
      var p = new Path2D(), a = v[3];
      p.moveTo(a[0] / 10, a[1] / 10);
      for (var i = 2; i < a.length; i += 2) p.lineTo(a[i] / 10, a[i + 1] / 10);
      return { p: p, l: Math.max(3, v[1]), sous: v[2] < 0 };
    });

    function sInit() { return Math.min(W, H) / 300; }
    function ecran(x, y) { return [W / 2 + (x - vue.x) * vue.s, H / 2 - (y - vue.y) * vue.s]; }
    function demander() { if (!raf) raf = requestAnimationFrame(dessiner); }
    function espace(px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px; }
    function halo(t, x, y, coul) {
      ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.strokeText(t, x, y); ctx.fillStyle = coul; ctx.fillText(t, x, y);
    }

    function dessiner() {
      raf = 0;
      if (!W || !H) return;
      var s = vue.s;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = C.sol; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.setTransform(s * dpr, 0, 0, -s * dpr, (W / 2 - vue.x * s) * dpr, (H / 2 + vue.y * s) * dpr);
      ctx.fillStyle = C.vege; vege.forEach(function (p) { ctx.fill(p, 'evenodd'); });
      ctx.fillStyle = C.sport; sport.forEach(function (p) { ctx.fill(p, 'evenodd'); });
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = C.voie;
      voies.forEach(function (v) { if (!v.sous) { ctx.lineWidth = v.l; ctx.stroke(v.p); } });
      ctx.lineWidth = 1 / s; ctx.strokeStyle = 'rgba(111,106,98,.55)'; ctx.setLineDash([5 / s, 4 / s]);
      voies.forEach(function (v) { if (v.sous) ctx.stroke(v.p); });
      ctx.setLineDash([]);
      ctx.lineWidth = 0.7 / s; ctx.strokeStyle = 'rgba(29,28,26,.5)';
      bati.forEach(function (b) { ctx.fillStyle = b.siege ? C.agence : b.teinte; ctx.fill(b.p, 'evenodd'); ctx.stroke(b.p); });
      if (survol) { ctx.lineWidth = 2 / s; ctx.strokeStyle = C.encre; ctx.stroke(survol.p); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nomsDeVoies(s); reperes(s); etiquetteSiege(); nord(); echelle(s);
    }

    function nomsDeVoies(s) {
      if (s < 0.9) return;
      ctx.font = '400 10px "DM Mono", ui-monospace, monospace'; espace('1px');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      Q.noms.forEach(function (n) {
        var e = ecran(n[1] / 10, n[2] / 10);
        if (e[0] < -60 || e[1] < -60 || e[0] > W + 60 || e[1] > H + 60) return;
        if (n[4] / 10 * s < ctx.measureText(n[0]).width + 16) return;
        ctx.save(); ctx.translate(e[0], e[1]); ctx.rotate(-n[3] * Math.PI / 180);
        halo(n[0], 0, 0, C.graphite); ctx.restore();
      });
      espace('0px');
    }

    function reperes(s) {
      if (s < 0.7) return;
      ctx.textBaseline = 'middle';
      var sg = ecran(siegeC[0], siegeC[1]);
      LIEUX.forEach(function (l) {
        var e = ecran(l[1] / 10, l[2] / 10);
        if (e[0] < 0 || e[1] < 0 || e[0] > W || e[1] > H) return;
        // l'étiquette de l'agence a la priorité sur les repères qu'elle couvrirait
        if (e[0] > sg[0] - 90 && e[0] < sg[0] + 280 && e[1] > sg[1] - 90 && e[1] < sg[1] + 12) return;
        if (l[3] === 'metro') {
          var px = e[0];
          pastille(px, e[1], C.metro, 'M');
          String(l[4] || '').split(',').filter(Boolean).forEach(function (n) { px += 19; pastille(px, e[1], LIGNES[n] || C.graphite, n); });
          ctx.textAlign = 'left'; ctx.font = '600 11px "Nunito Sans", sans-serif';
          halo(l[0], px + 12, e[1], C.encre);
        } else {
          ctx.textAlign = 'center'; ctx.font = 'italic 300 12px "Nunito Sans", sans-serif';
          halo(l[0], e[0], e[1], C.graphite);
        }
      });
    }

    function pastille(x, y, fond, texte) {
      ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fillStyle = fond; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = C.encre; ctx.stroke();
      ctx.fillStyle = C.encre; ctx.font = '700 10px "Nunito Sans", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(texte, x, y + 0.5);
    }

    function etiquetteSiege() {
      var e = ecran(siegeC[0], siegeC[1]), bx = e[0] + 38, by = e[1] - 66;
      ctx.font = '700 11px "Nunito Sans", sans-serif'; espace('1.5px');
      var w1 = ctx.measureText('ARCHITECTURE-AL').width;
      espace('0px'); ctx.font = '300 11px "DM Mono", monospace';
      var w = Math.max(w1, ctx.measureText('101 boulevard Murat').width) + 20;
      ctx.strokeStyle = C.encre; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(e[0], e[1]); ctx.lineTo(bx, by + 40); ctx.stroke();
      ctx.beginPath(); ctx.arc(e[0], e[1], 2.5, 0, Math.PI * 2); ctx.fillStyle = C.encre; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(bx, by, w, 40); ctx.strokeRect(bx + 0.5, by + 0.5, w, 40);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '700 11px "Nunito Sans", sans-serif'; espace('1.5px');
      ctx.fillStyle = C.agenceTexte; ctx.fillText('ARCHITECTURE-AL', bx + 10, by + 14);
      espace('0px'); ctx.font = '300 11px "DM Mono", monospace';
      ctx.fillStyle = C.encre; ctx.fillText('101 boulevard Murat', bx + 10, by + 28);
    }

    function nord() {
      var x = W - 36, y = 42;
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.encre; ctx.fillStyle = C.encre; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - 13); ctx.lineTo(x + 5, y + 8); ctx.lineTo(x, y + 4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y - 13); ctx.lineTo(x - 5, y + 8); ctx.lineTo(x, y + 4); ctx.closePath(); ctx.stroke();
      ctx.font = '400 10px "DM Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('N', x, y - 21);
    }

    function echelle(s) {
      var pas = [5, 10, 20, 25, 50, 100, 200, 250, 500], L = 500;
      for (var i = 0; i < pas.length; i++) if (pas[i] * s >= 70) { L = pas[i]; break; }
      var px = L * s, x = 18, y = H - 20;
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(x - 8, y - 20, px + 40, 32);
      ctx.fillStyle = C.encre; ctx.strokeStyle = C.encre; ctx.lineWidth = 1;
      ctx.fillRect(x, y, px / 2, 4); ctx.strokeRect(x + 0.5, y + 0.5, px, 4);
      ctx.font = '400 10px "DM Mono", monospace'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
      ctx.fillText('0', x, y - 5); ctx.fillText(String(L / 2), x + px / 2, y - 5); ctx.fillText(L + ' m', x + px, y - 5);
    }

    function zoomer(f, px, py) {
      var wx = vue.x + (px - W / 2) / vue.s, wy = vue.y - (py - H / 2) / vue.s;
      vue.s = borne(vue.s * f, Math.min(W, H) / 900, 14);
      vue.x = borne(wx - (px - W / 2) / vue.s, -Q.demi, Q.demi);
      vue.y = borne(wy + (py - H / 2) / vue.s, -Q.demi, Q.demi);
      demander();
    }
    function survoler(px, py) {
      var x = vue.x + (px - W / 2) / vue.s, y = vue.y - (py - H / 2) / vue.s, trouve = null;
      for (var i = bati.length - 1; i >= 0; i--) {
        var b = bati[i];
        if (x < b.bb[0] || x > b.bb[2] || y < b.bb[1] || y > b.bb[3]) continue;
        if (dans(b.anneaux, x, y)) { trouve = b; break; }
      }
      if (trouve !== survol) { survol = trouve; demander(); }
      info.hidden = !trouve;
      if (trouve) {
        info.textContent = (trouve.siege ? 'Architecture-AL · ' : 'Bâtiment · ') + 'hauteur ' + metres(trouve.h);
        info.style.left = Math.min(px + 14, W - info.offsetWidth - 8) + 'px';
        info.style.top = (py + 16) + 'px';
      }
    }

    var ptr = new Map();
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      cv.classList.add('saisi'); info.hidden = true;
    });
    cv.addEventListener('pointermove', function (e) {
      var p = ptr.get(e.pointerId);
      if (!p) { survoler(e.offsetX, e.offsetY); return; }
      if (ptr.size === 2) {
        var autre = Array.from(ptr.values()).filter(function (q) { return q !== p; })[0];
        var avant = Math.hypot(p.x - autre.x, p.y - autre.y), apres = Math.hypot(e.offsetX - autre.x, e.offsetY - autre.y);
        if (avant > 0) zoomer(apres / avant, (e.offsetX + autre.x) / 2, (e.offsetY + autre.y) / 2);
      } else {
        vue.x = borne(vue.x - (e.offsetX - p.x) / vue.s, -Q.demi, Q.demi);
        vue.y = borne(vue.y + (e.offsetY - p.y) / vue.s, -Q.demi, Q.demi);
        demander();
      }
      p.x = e.offsetX; p.y = e.offsetY;
    });
    function lacher(e) { ptr.delete(e.pointerId); if (!ptr.size) cv.classList.remove('saisi'); }
    cv.addEventListener('pointerup', lacher);
    cv.addEventListener('pointercancel', lacher);
    cv.addEventListener('pointerleave', function () { if (survol) { survol = null; demander(); } info.hidden = true; });
    cv.addEventListener('wheel', function (e) { e.preventDefault(); zoomer(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });
    cv.addEventListener('dblclick', function (e) { zoomer(2, e.offsetX, e.offsetY); });
    cv.addEventListener('keydown', function (e) {
      var pas = 60 / vue.s, k = e.key;
      if (k === 'ArrowLeft') vue.x -= pas; else if (k === 'ArrowRight') vue.x += pas;
      else if (k === 'ArrowUp') vue.y += pas; else if (k === 'ArrowDown') vue.y -= pas;
      else if (k === '+' || k === '=') return zoomer(1.5, W / 2, H / 2);
      else if (k === '-') return zoomer(1 / 1.5, W / 2, H / 2);
      else return;
      e.preventDefault(); demander();
    });

    function mesurer() {
      var r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var premier = !W;
      W = r.width; H = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      if (premier) vue.s = sInit();
      demander();
    }
    var ro = new ResizeObserver(mesurer);
    ro.observe(cv);
    mesurer();
    if (document.fonts) document.fonts.ready.then(demander);

    return {
      zoom: function (k) {
        if (k === 0) { vue.x = 0; vue.y = 0; vue.s = sInit(); demander(); }
        else zoomer(k > 0 ? 1.6 : 1 / 1.6, W / 2, H / 2);
      },
      redessiner: demander,
      detruire: function () { ro.disconnect(); cancelAnimationFrame(raf); }
    };
  }

  // ——— Maquette 3D : blanche, arêtes à l'encre, ombres du soleil de sud-ouest ———
  function Maquette(hote) {
    var T = window.THREE;
    if (!T) {
      hote.innerHTML = '<p class="carte__erreur">La maquette 3D n’a pas pu se charger (three.js indisponible). Le plan reste consultable.</p>';
      return { zoom: function () {}, redessiner: function () {}, detruire: function () {} };
    }
    var W = hote.clientWidth || 800, H = hote.clientHeight || 500, raf = 0;
    var rendu = new T.WebGLRenderer({ antialias: true });
    rendu.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    rendu.setSize(W, H);
    rendu.shadowMap.enabled = true; rendu.shadowMap.type = T.PCFSoftShadowMap; rendu.shadowMap.autoUpdate = false;
    hote.appendChild(rendu.domElement);
    var cvs = rendu.domElement;
    cvs.setAttribute('tabindex', '0');
    cvs.setAttribute('aria-label', 'Maquette 3D du quartier autour du 101 boulevard Murat');

    var scene = new T.Scene();
    scene.background = new T.Color(0xf3f1ed);
    scene.fog = new T.Fog(0xf3f1ed, 900, 1700);
    var cam = new T.PerspectiveCamera(32, W / H, 2, 5000);
    scene.add(new T.HemisphereLight(0xffffff, 0xd8d2c6, 0.62));
    var soleil = new T.DirectionalLight(0xffffff, 0.72);
    soleil.position.set(-320, 270, 340); // sud-ouest, 30° au-dessus de l'horizon : ombres lisibles
    soleil.castShadow = true;
    soleil.shadow.mapSize.set(2048, 2048);
    var sc = soleil.shadow.camera;
    sc.left = -460; sc.right = 460; sc.top = 460; sc.bottom = -460; sc.near = 50; sc.far = 1600;
    soleil.shadow.bias = -0.0004;
    scene.add(soleil);

    var jetables = [];
    function garder(o) { jetables.push(o); return o; }
    function forme(anneaux) {
      var sh = null;
      anneaux.forEach(function (r, k) {
        var pts = [];
        for (var i = 0; i < r.length; i += 2) pts.push(new T.Vector2(r[i] / 10, r[i + 1] / 10));
        if (k === 0) sh = new T.Shape(pts); else sh.holes.push(new T.Path(pts));
      });
      return sh;
    }
    function fusion(geoms) {
      var n = 0;
      geoms = geoms.map(function (g) { var ng = g.index ? g.toNonIndexed() : g; if (ng !== g) g.dispose(); n += ng.attributes.position.count; return ng; });
      var pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), o = 0;
      geoms.forEach(function (g) {
        pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
        o += g.attributes.position.count; g.dispose();
      });
      var r = new T.BufferGeometry();
      r.setAttribute('position', new T.BufferAttribute(pos, 3));
      r.setAttribute('normal', new T.BufferAttribute(nor, 3));
      return garder(r);
    }
    function nappe(liste, y, couleur) {
      var geoms = [];
      liste.forEach(function (anneaux) {
        try { var g = new T.ShapeGeometry(forme(anneaux)); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); geoms.push(g); } catch (e) {}
      });
      if (!geoms.length) return;
      var m = new T.Mesh(fusion(geoms), garder(new T.MeshLambertMaterial({ color: couleur, side: T.DoubleSide })));
      m.receiveShadow = true; scene.add(m);
    }
    function rubans(y) {
      var pos = [];
      Q.voies.forEach(function (v) {
        if (v[2] < 0) return;
        var a = v[3], w = Math.max(3, v[1]) / 2;
        for (var i = 0; i + 3 < a.length; i += 2) {
          var x1 = a[i] / 10, y1 = a[i + 1] / 10, x2 = a[i + 2] / 10, y2 = a[i + 3] / 10;
          var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
          if (L < 0.01) continue;
          var ux = dx / L, uy = dy / L, nx = -uy * w, ny = ux * w;
          x1 -= ux * w; y1 -= uy * w; x2 += ux * w; y2 += uy * w;
          pos.push(x1 + nx, y, -(y1 + ny), x1 - nx, y, -(y1 - ny), x2 - nx, y, -(y2 - ny),
                   x1 + nx, y, -(y1 + ny), x2 - nx, y, -(y2 - ny), x2 + nx, y, -(y2 + ny));
        }
      });
      var g = garder(new T.BufferGeometry());
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      var m = new T.Mesh(g, garder(new T.MeshLambertMaterial({ color: 0xfbfaf8, side: T.DoubleSide })));
      m.receiveShadow = true; scene.add(m);
    }

    var sol = new T.Mesh(garder(new T.PlaneGeometry(2 * Q.demi + 200, 2 * Q.demi + 200)), garder(new T.MeshLambertMaterial({ color: 0xdcd6cb })));
    sol.rotation.x = -Math.PI / 2; sol.receiveShadow = true; scene.add(sol);
    nappe(Q.vege, 0.06, 0xd3dac4);
    nappe(Q.sport, 0.08, 0xdce1cd);
    rubans(0.12);

    var gBati = [], gSiege = [];
    Q.bati.forEach(function (b) {
      try {
        var g = new T.ExtrudeGeometry(forme(b.slice(2)), { depth: b[0], bevelEnabled: false });
        g.rotateX(-Math.PI / 2);
        (b[1] === 1 ? gSiege : gBati).push(g);
      } catch (e) {}
    });
    var geoBati = fusion(gBati);
    var maisons = new T.Mesh(geoBati, garder(new T.MeshLambertMaterial({ color: 0xf7f5f0 })));
    maisons.castShadow = true; maisons.receiveShadow = true; scene.add(maisons);
    var siegeM = new T.Mesh(fusion(gSiege), garder(new T.MeshLambertMaterial({ color: 0xe0662c })));
    siegeM.castShadow = true; siegeM.receiveShadow = true; scene.add(siegeM);
    scene.add(new T.LineSegments(garder(new T.EdgesGeometry(geoBati, 25)),
      garder(new T.LineBasicMaterial({ color: 0x1d1c1a, transparent: true, opacity: 0.3 }))));
    scene.add(new T.LineSegments(garder(new T.EdgesGeometry(siegeM.geometry, 25)),
      garder(new T.LineBasicMaterial({ color: 0x1d1c1a, transparent: true, opacity: 0.55 }))));

    // Étiquettes HTML accrochées aux points 3D
    var calque = document.createElement('div');
    calque.className = 'carte__etiquettes';
    hote.appendChild(calque);
    var etiquettes = [{ p: new T.Vector3(siegeC[0], siege[0] + 4, -siegeC[1]), t: 'Architecture-AL', c: 'siege' }]
      .concat(LIEUX.map(function (l) { return { p: new T.Vector3(l[1] / 10, 3, -l[2] / 10), t: l[0], c: l[3], lg: l[4] }; }))
      .map(function (e) {
        var el = document.createElement('span');
        el.className = 'carte__etiq carte__etiq--' + e.c;
        if (e.c === 'metro') el.innerHTML = pastilles(e.lg);
        el.appendChild(document.createTextNode(e.t));
        calque.appendChild(el);
        e.el = el; return e;
      });
    // Priorité : l'agence, puis les métros, puis les autres lieux ; une étiquette qui en chevauche une plus prioritaire est masquée
    var PRIORITE = { siege: 0, metro: 1, lieu: 2 };
    etiquettes.forEach(function (e) { e.w = e.el.offsetWidth || e.t.length * 7; e.h = e.el.offsetHeight || 18; });
    etiquettes.sort(function (a, b) { return PRIORITE[a.c] - PRIORITE[b.c]; });
    var v3 = new T.Vector3();
    function etiqueter() {
      var posees = [];
      etiquettes.forEach(function (e) {
        v3.copy(e.p).project(cam);
        var vis = v3.z < 1 && Math.abs(v3.x) < 0.9 && Math.abs(v3.y) < 0.92;
        if (vis) {
          var x = (v3.x + 1) / 2 * W, y = (1 - v3.y) / 2 * H;
          var r = [x - e.w / 2 - 4, y - e.h - 2, x + e.w / 2 + 4, y + 2];
          vis = !posees.some(function (q) { return r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]; });
          if (vis) {
            posees.push(r);
            e.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%)';
          }
        }
        e.el.hidden = !vis;
      });
    }

    var DEPART = { az: -0.62, el: 0.6, d: 640 };
    var orb = { az: DEPART.az, el: DEPART.el, d: DEPART.d, cx: siegeC[0], cz: -siegeC[1] };
    function placer() {
      var c = Math.cos(orb.el);
      cam.position.set(orb.cx + orb.d * c * Math.sin(orb.az), orb.d * Math.sin(orb.el), orb.cz + orb.d * c * Math.cos(orb.az));
      cam.lookAt(orb.cx, 0, orb.cz);
    }
    function rendre() {
      raf = 0; placer();
      rendu.render(scene, cam);
      etiqueter();
    }
    function demander() { if (!raf) raf = requestAnimationFrame(rendre); }
    function decaler(dx, dy) {
      var k = orb.d / H * 0.9, s = Math.sin(orb.az), c = Math.cos(orb.az);
      orb.cx = borne(orb.cx - dx * c * k - dy * s * k, -Q.demi, Q.demi);
      orb.cz = borne(orb.cz + dx * s * k - dy * c * k, -Q.demi, Q.demi);
    }

    var ptr = new Map();
    cvs.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cvs.addEventListener('pointerdown', function (e) {
      cvs.setPointerCapture(e.pointerId);
      ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, decale: e.button === 2 || e.shiftKey });
      cvs.classList.add('saisi');
    });
    cvs.addEventListener('pointermove', function (e) {
      var p = ptr.get(e.pointerId);
      if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (ptr.size === 2) {
        var autre = Array.from(ptr.values()).filter(function (q) { return q !== p; })[0];
        var avant = Math.hypot(p.x - autre.x, p.y - autre.y), apres = Math.hypot(e.clientX - autre.x, e.clientY - autre.y);
        if (apres > 0) orb.d = borne(orb.d * avant / apres, 40, 1500);
      } else if (p.decale) {
        decaler(dx, dy);
      } else {
        orb.az -= dx * 0.006;
        orb.el = borne(orb.el + dy * 0.005, 0.12, 1.5);
      }
      p.x = e.clientX; p.y = e.clientY;
      demander();
    });
    function lacher(e) { ptr.delete(e.pointerId); if (!ptr.size) cvs.classList.remove('saisi'); }
    cvs.addEventListener('pointerup', lacher);
    cvs.addEventListener('pointercancel', lacher);
    cvs.addEventListener('wheel', function (e) {
      e.preventDefault(); orb.d = borne(orb.d * Math.exp(e.deltaY * 0.0012), 40, 1500); demander();
    }, { passive: false });
    cvs.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'ArrowLeft') orb.az += 0.12; else if (k === 'ArrowRight') orb.az -= 0.12;
      else if (k === 'ArrowUp') orb.el = borne(orb.el + 0.08, 0.12, 1.5);
      else if (k === 'ArrowDown') orb.el = borne(orb.el - 0.08, 0.12, 1.5);
      else if (k === '+' || k === '=') orb.d = borne(orb.d * 0.8, 40, 1500);
      else if (k === '-') orb.d = borne(orb.d * 1.25, 40, 1500);
      else return;
      e.preventDefault(); demander();
    });

    var ro = new ResizeObserver(function () {
      var w = hote.clientWidth, h = hote.clientHeight;
      if (!w || !h) return;
      W = w; H = h; rendu.setSize(W, H); cam.aspect = W / H; cam.updateProjectionMatrix(); demander();
    });
    ro.observe(hote);
    rendu.shadowMap.needsUpdate = true;
    demander();

    return {
      zoom: function (k) {
        if (k === 0) { orb.az = DEPART.az; orb.el = DEPART.el; orb.d = DEPART.d; orb.cx = siegeC[0]; orb.cz = -siegeC[1]; }
        else orb.d = borne(orb.d * (k > 0 ? 0.7 : 1.4), 40, 1500);
        demander();
      },
      redessiner: demander,
      detruire: function () {
        ro.disconnect(); cancelAnimationFrame(raf);
        jetables.forEach(function (o) { o.dispose(); });
        rendu.dispose(); rendu.forceContextLoss();
      }
    };
  }

  // ——— Composant : barre Plan / Maquette 3D ———
  function monter(hote, vueInitiale) {
    hote.innerHTML =
      '<div class="carte">' +
        '<div class="carte__barre">' +
          '<div class="bascule" role="group" aria-label="Vue de la carte">' +
            '<button type="button" class="capitales" data-vue="3d" aria-pressed="false">Maquette 3D</button>' +
            '<button type="button" class="capitales" data-vue="plan" aria-pressed="true">Plan</button>' +
          '</div>' +
          '<div class="carte__zoom">' +
            '<button type="button" data-zoom="1" aria-label="Zoomer">+</button>' +
            '<button type="button" data-zoom="-1" aria-label="Dézoomer">−</button>' +
            '<button type="button" data-zoom="0" class="capitales">Recentrer</button>' +
          '</div>' +
        '</div>' +
        '<div class="carte__scene">' +
          '<canvas class="carte__plan" tabindex="0" aria-label="Plan de situation du 101 boulevard Murat"></canvas>' +
          '<div class="carte__3d" hidden></div>' +
          '<div class="carte__info data" hidden></div>' +
        '</div>' +
        '<p class="carte__aide data">' +
          '<span data-aide="plan">Glisser pour se déplacer · molette ou pincement pour zoomer · survoler un bâtiment pour sa hauteur.</span>' +
          '<span data-aide="3d" hidden>Glisser pour tourner · clic droit ou Maj + glisser pour se déplacer · molette pour zoomer.</span>' +
          ' Sources : IGN BD TOPO® (emprises et hauteurs réelles) ; bouches de métro © contributeurs OpenStreetMap.' +
        '</p>' +
      '</div>';
    var barre = hote.querySelector('.carte__barre');
    var cvPlan = hote.querySelector('.carte__plan'), boite3d = hote.querySelector('.carte__3d');
    var info = hote.querySelector('.carte__info');
    var plan = Plan(cvPlan, info), maquette = null, vue = 'plan';

    function basculer(v) {
      vue = v;
      barre.querySelectorAll('[data-vue]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.vue === v)); });
      hote.querySelectorAll('[data-aide]').forEach(function (s) { s.hidden = s.dataset.aide !== v; });
      cvPlan.hidden = v !== 'plan'; boite3d.hidden = v !== '3d'; info.hidden = true;
      if (v === '3d' && !maquette) maquette = Maquette(boite3d);
      (v === 'plan' ? plan : maquette).redessiner();
    }
    barre.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.vue) basculer(b.dataset.vue);
      else if (b.dataset.zoom) (vue === 'plan' ? plan : maquette).zoom(+b.dataset.zoom);
    });
    if (vueInitiale === '3d') basculer('3d');
    return {
      detruire: function () { plan.detruire(); if (maquette) maquette.detruire(); }
    };
  }

  return { monter: monter, pastilles: pastilles };
})();
