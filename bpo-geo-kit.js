/* ============================================================================
   bpo-geo-kit.js — kit de géométrie pour les objets décrits en langage naturel (01/11/2026).
   Un objet est un petit programme : OBJET.make(K, o) construit des pièces avec les primitives du kit K et rend K.finir().
   Le kit tourne tel quel dans Node (module.exports), dans le navigateur (window.BPO_GEO) et dans un Web Worker (self.BPO_GEO) : pas de dépendance, ES5.

   CONVENTIONS (les mêmes que les importateurs privés de BPO) : mètres ; Y vertical ; X = longueur, Z = largeur ;
   sol à y = 0 ; objet centré en X/Z par finir() ; une pièce = un nom + une couleur RVB (0-255) ; normales sortantes
   (les primitives s'en chargent ; il suffit de donner les boîtes par leurs bornes) ; deux pièces ne partagent jamais une
   face dans le même plan (noyer l'une de 2 mm dans l'autre), sinon hachures à l'écran — le contrôle le signale.

   API du contexte K = BPO_GEO.creer() :
     K.part(nom, [r,g,b])                      -> pièce (à passer aux primitives)
     K.bx(p, x0,x1, y0,y1, z0,z1)              boîte par bornes (ordre indifférent)
     K.box(p, cx,cy,cz, sx,sy,sz)              boîte par centre et dimensions
     K.cyl(p, axe, cx,cy,cz, r, longueur, n)   cylindre plein d'axe 'x'|'y'|'z' centré en (cx,cy,cz), n facettes (12-32)
     K.tube(p, [x,y,z], [x,y,z], r, n)         cylindre plein entre deux points quelconques (barres inclinées, cadres)
     K.prisme(p, axe, points, a0, a1)          prisme droit : polygone CONVEXE dans le plan perpendiculaire à l'axe, extrudé de a0 à a1.
                                               Les points sont dans l'ordre cyclique des axes : axe 'z' : [x,y] ; axe 'x' : [y,z] ; axe 'y' : [z,x]
     K.anneau(p, axe, cx,cy,cz, R, r, n, m)    tore (anneau de traction, poignée ronde), n segments, m facettes de section
     K.cone(p, axe, cx,cy,cz, r0, r1, longueur, n)   tronc de cône (pied de lampadaire, plot, entonnoir)
     K.sphere(p, cx,cy,cz, r, n)               sphère (coude de tubes, bouton, rotule), n facettes autour comme cyl et tube (n/2 parallèles)
     K.pyramide(p, cx, cz, y0, y1, sx0, sz0, sx1, sz1)   tronc de pyramide d'axe vertical : base sx0 × sz0 à y0, sommet sx1 × sz1 à y1 (cuve à fruit, socle, chapiteau)
     K.finir()                                 -> { pos, idx, groups, dims:{L,P,H} } centré X/Z, sol à y = 0
   Utilitaires : BPO_GEO.controler(geo) -> rapport { triangles, degeneres, volumesNegatifs:[noms], coplanaires:[{pieces,n}], bbox, ok }
   Limites du contrôle : il ne voit que les faces alignées sur les axes (faces de boîtes, chapeaux de cylindres d'axe x/y/z, côtés
   droits des prismes) ; il compare des boîtes englobantes de triangles ; il ne détecte pas une pièce qui en traverse une autre.
   ============================================================================ */
(function (root) {
  'use strict';
  function creer() {
    var pos = [], parts = [];
    function part(name, col) { var p = { name: String(name), col: col || [160, 160, 160], tris: [] }; parts.push(p); return p; }
    function V(x, y, z) { pos.push(x, y, z); return pos.length / 3 - 1; }
    function P(i) { return [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]; }
    function nrm(a, b, c) { var A = P(a), B = P(b), C = P(c); var u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]]; return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function T(p, a, b, c, out) { if (dot(nrm(a, b, c), out) < 0) { var t = b; b = c; c = t; } p.tris.push(a, b, c); }
    function Q(p, a, b, c, d, out) { T(p, a, b, c, out); T(p, a, c, d, out); }
    function box(p, cx, cy, cz, sx, sy, sz) {
      sx = Math.abs(sx); sy = Math.abs(sy); sz = Math.abs(sz);
      if (sx < 1e-6 || sy < 1e-6 || sz < 1e-6) return;
      var x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
      function f(a, b, c, d, out) { Q(p, V.apply(null, a), V.apply(null, b), V.apply(null, c), V.apply(null, d), out); }
      f([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
      f([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
      f([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]);
      f([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
      f([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
      f([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1]);
    }
    function bx(p, x0, x1, y0, y1, z0, z1) { box(p, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0); }
    function cyl(p, ax, cx, cy, cz, r, len, n) { cone(p, ax, cx, cy, cz, r, r, len, n); }
    function cone(p, ax, cx, cy, cz, r0, r1, len, n) {
      n = Math.max(3, Math.round(n || 16)); var ia = { x: 0, y: 1, z: 2 }[ax], iu = (ia + 1) % 3, iv = (ia + 2) % 3, c = [cx, cy, cz], k;
      function ring(h, r) { var ids = [], q; for (k = 0; k < n; k++) { q = [0, 0, 0]; q[ia] = c[ia] + h; q[iu] = c[iu] + r * Math.cos(k / n * 2 * Math.PI); q[iv] = c[iv] + r * Math.sin(k / n * 2 * Math.PI); ids.push(V(q[0], q[1], q[2])); } return ids; }
      var a = ring(-len / 2, r0), b = ring(len / 2, r1);
      for (k = 0; k < n; k++) { var A = P(a[k]), B = P(b[k]), out = [A[0] + B[0] - 2 * cx, A[1] + B[1] - 2 * cy, A[2] + B[2] - 2 * cz]; out[ia] = (r0 - r1) * 0.5; if (r0 > 1e-9 || r1 > 1e-9) { if (r0 < 1e-9) T(p, a[0], b[(k + 1) % n], b[k], out); else if (r1 < 1e-9) T(p, a[k], a[(k + 1) % n], b[0], out); else Q(p, a[k], a[(k + 1) % n], b[(k + 1) % n], b[k], out); } }
      [[-1, a, r0], [1, b, r1]].forEach(function (e) { var s = e[0], rr = e[1], r = e[2]; if (r < 1e-9) return; var q = [cx, cy, cz]; q[ia] += s * len / 2; var ctr = V(q[0], q[1], q[2]), out = [0, 0, 0]; out[ia] = s; var r2 = ring(s * len / 2, r); for (k = 0; k < n; k++) T(p, ctr, r2[k], r2[(k + 1) % n], out); });
    }
    function tube(p, a, b, r, n) {
      n = Math.max(3, Math.round(n || 12));
      var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], Ln = Math.hypot(d[0], d[1], d[2]); if (Ln < 1e-9) return; d = [d[0] / Ln, d[1] / Ln, d[2] / Ln];
      var u = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      var e1 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]], l1 = Math.hypot(e1[0], e1[1], e1[2]); e1 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
      var e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
      function ring(c) { var ids = [], k; for (k = 0; k < n; k++) { var th = k / n * 2 * Math.PI, cs = Math.cos(th), sn = Math.sin(th); ids.push(V(c[0] + r * (cs * e1[0] + sn * e2[0]), c[1] + r * (cs * e1[1] + sn * e2[1]), c[2] + r * (cs * e1[2] + sn * e2[2]))); } return ids; }
      var A = ring(a), B = ring(b), k;
      for (k = 0; k < n; k++) { var pa = P(A[k]), out = [pa[0] - a[0], pa[1] - a[1], pa[2] - a[2]]; Q(p, A[k], A[(k + 1) % n], B[(k + 1) % n], B[k], out); }
      var ca = V(a[0], a[1], a[2]), cb = V(b[0], b[1], b[2]), A2 = ring(a), B2 = ring(b);
      for (k = 0; k < n; k++) { T(p, ca, A2[k], A2[(k + 1) % n], [-d[0], -d[1], -d[2]]); T(p, cb, B2[k], B2[(k + 1) % n], d); }
    }
    /* prisme droit : polygone convexe (découpage en éventail depuis le centre) dans le plan ⟂ axe, extrudé de a0 à a1 */
    function prisme(p, ax, pts, a0, a1) {
      var ia = { x: 0, y: 1, z: 2 }[ax], iu = (ia + 1) % 3, iv = (ia + 2) % 3, n = pts.length, k;
      if (n < 3) return;
      var aire = 0; for (k = 0; k < n; k++) { var q1 = pts[k], q2 = pts[(k + 1) % n]; aire += q1[0] * q2[1] - q2[0] * q1[1]; }
      if (aire < 0) pts = pts.slice().reverse();
      var cu = 0, cv = 0; for (k = 0; k < n; k++) { cu += pts[k][0] / n; cv += pts[k][1] / n; }
      function mk(u, v, a) { var q = [0, 0, 0]; q[iu] = u; q[iv] = v; q[ia] = a; return V(q[0], q[1], q[2]); }
      var lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      var c0 = mk(cu, cv, lo), c1 = mk(cu, cv, hi), A = pts.map(function (q) { return mk(q[0], q[1], lo); }), B = pts.map(function (q) { return mk(q[0], q[1], hi); });
      var nlo = [0, 0, 0], nhi = [0, 0, 0]; nlo[ia] = -1; nhi[ia] = 1;
      for (k = 0; k < n; k++) { var j = (k + 1) % n; T(p, c0, A[k], A[j], nlo); T(p, c1, B[k], B[j], nhi);
        var a = pts[k], b = pts[j], out = [0, 0, 0]; out[iu] = b[1] - a[1]; out[iv] = -(b[0] - a[0]); Q(p, A[k], A[j], B[j], B[k], out); }
    }
    function anneau(p, ax, cx, cy, cz, R, r, n, m) {
      n = Math.max(6, Math.round(n || 24)); m = Math.max(3, Math.round(m || 8));
      var ia = { x: 0, y: 1, z: 2 }[ax], iu = (ia + 1) % 3, iv = (ia + 2) % 3, c = [cx, cy, cz], rings = [], i, j;
      for (i = 0; i < n; i++) { var th = i / n * 2 * Math.PI, cu = Math.cos(th), su = Math.sin(th), ids = [];
        for (j = 0; j < m; j++) { var ph = j / m * 2 * Math.PI, q = [0, 0, 0]; q[iu] = c[iu] + (R + r * Math.cos(ph)) * cu; q[iv] = c[iv] + (R + r * Math.cos(ph)) * su; q[ia] = c[ia] + r * Math.sin(ph); ids.push(V(q[0], q[1], q[2])); }
        rings.push(ids); }
      for (i = 0; i < n; i++) for (j = 0; j < m; j++) { var i2 = (i + 1) % n, j2 = (j + 1) % m, A = P(rings[i][j]), th2 = i / n * 2 * Math.PI, ctr = [0, 0, 0]; ctr[iu] = c[iu] + R * Math.cos(th2); ctr[iv] = c[iv] + R * Math.sin(th2); ctr[ia] = c[ia];
        Q(p, rings[i][j], rings[i2][j], rings[i2][j2], rings[i][j2], [A[0] - ctr[0], A[1] - ctr[1], A[2] - ctr[2]]); }
    }
    /* sphère : n facettes autour (méridiens) comme cyl et tube, m = max(2, ceil(n / 2)) parallèles (tranches d'un pôle à l'autre),
       facettes à peu près carrées : 2 · n · (m − 1) triangles, 120 à n = 12 ; G1 (02/11) : n comptait les tranches (2n méridiens, 528 à n = 12) */
    function sphere(p, cx, cy, cz, r, n) {
      n = Math.max(4, Math.round(n || 12)); var m = Math.max(2, Math.ceil(n / 2)), i, j, rows = [];
      for (i = 0; i <= m; i++) { var ph = i / m * Math.PI, y = cy + r * Math.cos(ph), rr = r * Math.sin(ph), ids = [];
        for (j = 0; j < n; j++) { var th = j / n * 2 * Math.PI; ids.push(V(cx + rr * Math.cos(th), y, cz + rr * Math.sin(th))); }
        rows.push(ids); }
      for (i = 0; i < m; i++) for (j = 0; j < n; j++) { var j2 = (j + 1) % n, A = P(rows[i][j]), B = P(rows[i + 1][j2]), out = [(A[0] + B[0]) / 2 - cx, (A[1] + B[1]) / 2 - cy, (A[2] + B[2]) / 2 - cz];
        if (i === 0) T(p, rows[0][0], rows[1][j], rows[1][j2], out); else if (i === m - 1) T(p, rows[m][0], rows[m - 1][j2], rows[m - 1][j], out); else Q(p, rows[i][j], rows[i][j2], rows[i + 1][j2], rows[i + 1][j], out); }
    }
    function pyramide(p, cx, cz, y0, y1, sx0, sz0, sx1, sz1) {
      var lo = Math.min(y0, y1), hi = Math.max(y0, y1); if (hi - lo < 1e-6) return;
      var a = [V(cx - sx0 / 2, lo, cz - sz0 / 2), V(cx + sx0 / 2, lo, cz - sz0 / 2), V(cx + sx0 / 2, lo, cz + sz0 / 2), V(cx - sx0 / 2, lo, cz + sz0 / 2)];
      var b = [V(cx - sx1 / 2, hi, cz - sz1 / 2), V(cx + sx1 / 2, hi, cz - sz1 / 2), V(cx + sx1 / 2, hi, cz + sz1 / 2), V(cx - sx1 / 2, hi, cz + sz1 / 2)];
      Q(p, a[0], a[1], a[2], a[3], [0, -1, 0]); if (sx1 > 1e-6 && sz1 > 1e-6) Q(p, b[0], b[1], b[2], b[3], [0, 1, 0]);
      var outs = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]], k;
      for (k = 0; k < 4; k++) { var k2 = (k + 1) % 4; if (sx1 > 1e-6 && sz1 > 1e-6) Q(p, a[k], a[k2], b[k2], b[k], outs[k]); else T(p, a[k], a[k2], b[0], outs[k]); }
    }
    function finir() {
      var idx = [], groups = [];
      /* E3 (02/11) : pas de push.apply (dépassement de pile au-delà de ~100 000 indices dans une seule pièce) : une pièce très lourde doit
         arriver entière au plafond du harnais (« geometrie trop lourde »), pas s'arrêter sur une erreur de pile */
      parts.forEach(function (p) { var i; if (!p.tris.length) return; groups.push({ start: idx.length, count: p.tris.length, col: p.col, tex: null, name: p.name }); for (i = 0; i < p.tris.length; i++) idx.push(p.tris[i]); });
      var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], k, a;
      for (k = 0; k < pos.length; k += 3) for (a = 0; a < 3; a++) { if (pos[k + a] < mn[a]) mn[a] = pos[k + a]; if (pos[k + a] > mx[a]) mx[a] = pos[k + a]; }
      if (!isFinite(mn[0])) return { pos: [], idx: [], groups: [], dims: { L: 0, P: 0, H: 0 } };
      var cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
      for (k = 0; k < pos.length; k += 3) { pos[k] -= cx; pos[k + 1] -= mn[1]; pos[k + 2] -= cz; }
      return { pos: pos, idx: idx, groups: groups, dims: { L: mx[0] - mn[0], P: mx[2] - mn[2], H: mx[1] - mn[1] } };
    }
    return { part: part, box: box, bx: bx, cyl: cyl, cone: cone, tube: tube, prisme: prisme, anneau: anneau, sphere: sphere, pyramide: pyramide, finir: finir };
  }
  /* contrôle : dégénérés, volume signé par pièce (normales rentrantes), faces coplanaires de pièces différentes qui se recouvrent, boîte */
  function controler(g) {
    var faces = [], degen = 0, vol = {}, t, k, a;
    g.groups.forEach(function (grp) {
      var v = 0;
      /* E3d (02/11) : bornes tenues à idx — un groupe start/count hors bornes (start -7, count 9e9) ne fait plus tourner la boucle à vide */
      var fin = Math.min(grp.start + grp.count, g.idx.length);
      for (t = Math.max(0, grp.start | 0); t + 2 < fin; t += 3) {
        var Vv = [0, 1, 2].map(function (q) { var i = g.idx[t + q] * 3; return [g.pos[i], g.pos[i + 1], g.pos[i + 2]]; });
        var u = [Vv[1][0] - Vv[0][0], Vv[1][1] - Vv[0][1], Vv[1][2] - Vv[0][2]], w = [Vv[2][0] - Vv[0][0], Vv[2][1] - Vv[0][1], Vv[2][2] - Vv[0][2]];
        var n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        if (Math.hypot(n[0], n[1], n[2]) < 1e-10) { degen++; continue; }
        v += (Vv[0][0] * n[0] + Vv[0][1] * n[1] + Vv[0][2] * n[2]) / 6;
        for (a = 0; a < 3; a++) if (Math.abs(Vv[0][a] - Vv[1][a]) < 1e-9 && Math.abs(Vv[0][a] - Vv[2][a]) < 1e-9) {
          var iu = (a + 1) % 3, iv = (a + 2) % 3;
          faces.push({ grp: grp.name, axe: a, c: Math.round(Vv[0][a] * 1e4) / 1e4, bb: [Math.min(Vv[0][iu], Vv[1][iu], Vv[2][iu]), Math.min(Vv[0][iv], Vv[1][iv], Vv[2][iv]), Math.max(Vv[0][iu], Vv[1][iu], Vv[2][iu]), Math.max(Vv[0][iv], Vv[1][iv], Vv[2][iv])] });
        }
      }
      vol[grp.name] = (vol[grp.name] || 0) + v;
    });
    var byPlane = {}; faces.forEach(function (f) { var key = f.axe + '@' + f.c; (byPlane[key] = byPlane[key] || []).push(f); });
    var copl = {};
    Object.keys(byPlane).forEach(function (key) {
      var fs = byPlane[key], i, j;
      for (i = 0; i < fs.length; i++) for (j = i + 1; j < fs.length; j++) {
        var A = fs[i], B = fs[j]; if (A.grp === B.grp) continue;
        var ov = Math.max(0, Math.min(A.bb[2], B.bb[2]) - Math.max(A.bb[0], B.bb[0])) * Math.max(0, Math.min(A.bb[3], B.bb[3]) - Math.max(A.bb[1], B.bb[1]));
        if (ov > 1e-7) { var kk = A.grp + ' / ' + B.grp + ' @ ' + 'xyz'[A.axe] + '=' + A.c; copl[kk] = (copl[kk] || 0) + 1; }
      }
    });
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (k = 0; k < g.pos.length; k += 3) for (a = 0; a < 3; a++) { if (g.pos[k + a] < mn[a]) mn[a] = g.pos[k + a]; if (g.pos[k + a] > mx[a]) mx[a] = g.pos[k + a]; }
    var negs = Object.keys(vol).filter(function (n) { return vol[n] < -1e-7; });
    var coplList = Object.keys(copl).map(function (k2) { return { pieces: k2, n: copl[k2] }; });
    return { triangles: g.idx.length / 3, sommets: g.pos.length / 3, degeneres: degen, volumes: vol, volumesNegatifs: negs, coplanaires: coplList,
             bbox: { L: mx[0] - mn[0], H: mx[1] - mn[1], P: mx[2] - mn[2], ymin: mn[1] }, ok: !degen && !negs.length && !coplList.length && g.idx.length > 0 };
  }
  var api = { creer: creer, controler: controler, version: '2026-11-02' };
  /* UMD (02/11) : module.exports quand il existe (Node, essai.js) ET la globale BPO_GEO sur la racine (navigateur : window ;
     Web Worker : self ; Node : globalThis) — le même fichier sert le fil principal, le worker bac à sable et les tests Node,
     où worker_threads charge en CommonJS (module défini) et où la globale manquait. */
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && (typeof root === 'object' || typeof root === 'function')) { try { root.BPO_GEO = api; } catch (e) {} }
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));
