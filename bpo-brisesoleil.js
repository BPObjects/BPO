/* ============================================================================
   BPO — CONFIGURATEUR BRISE-SOLEIL À LAMES « AILES D'AVION » (Tellier, gamme AZUR)
   ----------------------------------------------------------------------------
   Produit PARAMÉTRIQUE de la marque Tellier Brise-Soleil (data/fabricants.js,
   proc:'brisesoleil') : il déploie en LONGUEUR et en HAUTEUR les brise-soleil
   fixes à lames ailes d'avion dont data/tellier/ porte 27 tailles figées
   (tools/objets-tellier.mjs). Trois poses du catalogue du fabricant :
     · casquette      brise-soleil horizontal au-dessus d'une baie : des consoles
                      en porte-à-faux portent N lames couchées parallèles à la
                      façade, inclinées vers l'extérieur ;
     · couche         brise-soleil vertical lames couchées : un écran devant la
                      baie, lames horizontales entre flasques verticales ;
     · debout         brise-soleil vertical lames debout : lames verticales entre
                      deux flasques horizontales.
   Ce qui vient du site (tellierbrisesoleil.com, fiches « lames ailes d'avion »,
   12/10/2026) : les SECTIONS (largeur × épaisseur), le poids au mètre, les
   portées « lame couchée » / « lame debout » (charges FT n°45), la matière
   (aluminium 6060 T6 extrudé, profils monoblocs ovoïdes), les positions
   SpeedFix 0/15/30/45°, les finitions. Ce qu'on SUPPOSE (dit dans la fiche) :
   le pas égal à la largeur de lame, l'inclinaison 30°, les flasques en plat
   de 10 mm, le nombre d'appuis déduit de la portée.

   100 % JS, sans dépendance. La géométrie est poussée dans FC (box / face du
   moteur), donc rendue, exportée (IFC, OBJ…) et posée en scène comme tout
   configurateur. Le module ne touche à rien au chargement : app.html l'appelle
   par window.BPO_brisesoleil { PBS, build, buildUI, finishElems, nom,
   designation, ifcDesc, ifcProps, recapHTML, SECTIONS, geometrie } et la
   fonction globale buildBriseSoleilUI (PROC_UI.brisesoleil.ui).
   `geometrie(P)` est PURE (pas de globale du moteur) : tools/objets-tellier.mjs
   s'en sert aussi sous Node pour fabriquer les 27 objets figés — une seule
   source pour les deux.
   ============================================================================ */
(function (glob) {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  Les sections du site (mm, g/ml). `couchee` / `debout` : portées en mm.
   *  est : la portée n'est pas publiée sur la fiche, valeur interpolée.
   * ------------------------------------------------------------------ */
  var SECTIONS = [
    { id: "AS70x15",    l: 70,  e: 15, poids: 675,  couchee: 1700, debout: 1770 },
    { id: "AS100x23",   l: 100, e: 23, poids: 991,  couchee: 2250, debout: 2350 },
    { id: "AS120x24",   l: 120, e: 24, poids: 1059, couchee: 2340, debout: 2420 },
    { id: "AS150x30",   l: 150, e: 30, poids: 1148, couchee: 2650, debout: 2750, est: 1 },
    { id: "AS160x31",   l: 160, e: 31, poids: 1623, couchee: 2930, debout: 3050 },
    { id: "AS200x36",   l: 200, e: 36, poids: 2037, couchee: 3260, debout: 3400 },
    { id: "AS200x36-R", l: 200, e: 36, poids: 2218, couchee: 3650, debout: 3810, rect: 1 },
    { id: "AS200x50",   l: 200, e: 50, poids: 2827, couchee: 4380, debout: 4630 },
    { id: "AS250x42",   l: 250, e: 42, poids: 3127, couchee: 3950, debout: 4160 },
    { id: "AS300x52",   l: 300, e: 52, poids: 4316, couchee: 3740, debout: 3740, note: "fiche produit, calcul à 1 050 Pa ; brochure 2025 : 4 770 / 5 050" },
    { id: "AS360x60",   l: 360, e: 60, poids: 5034, couchee: 4980, debout: 5260 },
    { id: "AS400x68",   l: 400, e: 68, poids: 6590, couchee: 5910, debout: 6310 },
    { id: "AS600x70",   l: 600, e: 70, poids: 0,    couchee: 6050, debout: 6490, deux: 1 }
  ];
  var SEC_BY = {};
  SECTIONS.forEach(function (s) { SEC_BY[s.id] = s; });
  function section(id) { return SEC_BY[id] || SEC_BY.AS300x52; }

  var POSES = [
    { id: "casquette", l: "Horizontal (casquette)" },
    { id: "couche",    l: "Vertical, lames couchées" },
    { id: "debout",    l: "Vertical, lames debout" }
  ];
  function poseLabel(id) { for (var i = 0; i < POSES.length; i++) if (POSES[i].id === id) return POSES[i].l; return id; }

  /* Paramètres du configurateur (objet paramétrique du mode 'brisesoleil').
     Longueurs en CENTIMÈTRES, comme tous les curseurs « cm » de BPO. */
  var PBS = {
    pose: "casquette",
    section: "AS300x52",
    L: 300,          // longueur le long de la façade (cm)
    H: 220,          // hauteur de l'écran (cm) — poses verticales
    P: 120,          // débord de la casquette (cm)
    hPose: 230,      // casquette : hauteur de pose (cm), dessous des consoles
    hBas: 0,         // écrans : hauteur du bas de l'écran (cm)
    pasAuto: 1,      // 1 : entraxe = largeur de la lame (hypothèse, le site ne le chiffre pas)
    pas: 30,         // entraxe (cm) quand pasAuto = 0
    incl: 30,        // inclinaison des lames (degrés) — SpeedFix : 0, 15, 30, 45
    appuisAuto: 1,   // 1 : nombre d'appuis déduit de la portée « lame couchée » de la fiche
    nAppuis: 2,      // appuis (consoles / flasques) quand appuisAuto = 0
    retrait: 10,     // écrans : distance du nu de façade (cm)
    platines: 1,     // 1 : platines murales et têtes de vis dessinées
    designation: ""  // désignation libre (vide = automatique)
  };
  glob.PBS = PBS;

  var EP = 0.010;                 // plat des flasques, consoles, platines (m) — à confirmer
  var RAD = Math.PI / 180;
  var TEINTES = { bsLame: [165, 165, 165], bsFlasque: [143, 143, 143], bsFix: [154, 159, 163] };   // RAL 9006 #A5A5A5, RAL 9007 #8F8F8F (nuancier de l'application), zingué
  var FINISH_ELEMS = [
    { id: "bsLame",    l: "Lames aluminium" },
    { id: "bsFlasque", l: "Flasques et consoles" },
    { id: "bsFix",     l: "Platines et visserie" }
  ];

  /* ------------------------------------------------------------------ *
   *  Dérivés d'un jeu de paramètres : tout en MÈTRES.
   * ------------------------------------------------------------------ */
  function derive(P) {
    var S = section(P.section), pose = POSES.some(function (p) { return p.id === P.pose; }) ? P.pose : "casquette";
    var L = Math.max(0.3, (+P.L || 300) / 100), H = Math.max(0.3, (+P.H || 220) / 100), Pd = Math.max(0.2, (+P.P || 120) / 100);
    var c = S.l / 1000, t = S.e / 1000;
    var incl = Math.max(0, Math.min(90, +P.incl || 0));
    var pas = +P.pasAuto ? c : Math.max(t + 0.005, Math.min(1, (+P.pas || 30) / 100));
    var retrait = Math.max(0, Math.min(0.6, (+P.retrait || 0) / 100));
    var hPose = Math.max(pose === "casquette" ? 0.03 : 0, Math.min(4, (+(pose === "casquette" ? P.hPose : P.hBas) || 0) / 100));   // casquette : la platine descend 3 cm sous la console, jamais sous le sol
    var portee = (pose === "debout" ? S.debout : S.couchee) / 1000;
    var lameL = pose === "debout" ? H - 2 * EP : L - 2 * EP;          // longueur d'une lame
    var appuisMin = pose === "debout" ? 2 : Math.ceil(L / portee - 1e-9) + 1;
    var nAppuis = pose === "debout" ? 2 : +P.appuisAuto ? appuisMin : Math.max(2, Math.min(12, Math.round(+P.nAppuis || 2)));   // debout : deux flasques, toujours
    var sinI = Math.sin(incl * RAD), cosI = Math.cos(incl * RAD);
    var env = { h: c * sinI + t * cosI, p: c * cosI + t * sinI };    // enveloppe d'une lame couchée inclinée
    /* le support tient au moins une lame : débord ≥ enveloppe (casquette), hauteur ≥ enveloppe (écran couché) */
    if (pose === "casquette") Pd = Math.max(Pd, env.p + EP + 0.004);
    else if (pose === "couche") H = Math.max(H, env.h + 0.1);
    /* pas automatique : la largeur de lame, mais jamais moins qu'un centimètre de jour
       (à 0° en casquette ou debout, à 90° en écran couché, les lames seraient jointives) */
    if (+P.pasAuto) pas = Math.max(c, (pose === "couche" ? env.h : pose === "debout" ? c * cosI + t * sinI : env.p) + 0.01);
    var nL, D = { S: S, pose: pose, L: L, H: H, P: Pd, c: c, t: t, incl: incl, pas: pas, retrait: retrait, hPose: hPose,   // H et P éventuellement bornés ci-dessus
                  portee: portee, lameL: lameL, nAppuis: nAppuis, appuisMin: appuisMin, env: env, platines: +P.platines !== 0 };
    if (pose === "casquette") {
      D.hBarre = env.h + 0.04;                                  // la barre de la console, qui enferme les lames
      D.hMur = D.hBarre + Pd * 0.28;                            // la console s'élargit vers la platine (gousset)
      nL = Math.max(1, Math.floor((Pd - EP - env.p + 0.002) / pas + 1 + 1e-9));
      /* les lames tiennent sur la console (de zMur+EP à zMur+P) : (nL−1)·pas + env.p ≤ P − EP, à 2 mm près */
      while (nL > 1 && (nL - 1) * pas + env.p > Pd - EP + 0.002) nL--;
      D.hauteur = hPose + D.hMur + 0.03;                          // la platine dépasse la console de 3 cm en haut (et en bas)
      D.yMin = hPose - 0.03;
      D.profondeur = Pd;
    } else if (pose === "couche") {
      D.pF = env.p + 0.04;                                      // largeur du plat (profondeur de l'écran)
      nL = Math.max(1, Math.floor((H - 0.2) / pas + 1e-9));
      while (nL > 1 && (nL - 1) * pas + env.h > H - 0.1 + 1e-9) nL--;
      D.hauteur = hPose + H;
      D.profondeur = retrait + EP + D.pF;
    } else {
      D.pF = c * sinI + t * cosI + 0.04;                        // corde à `incl` du plan de façade
      var marge = c / 2 + 0.02;
      nL = Math.max(1, Math.floor((L - 2 * marge) / pas + 1e-9) + 1);
      while (nL > 1 && (nL - 1) * pas + c * cosI + t * sinI > L - 0.04 + 1e-9) nL--;
      D.nConsoles = Math.ceil(L / 1.5 - 1e-9) + 1;              // consoles tous les 1,50 m au plus (à confirmer)
      D.hauteur = hPose + H;
      D.profondeur = retrait + EP + D.pF;
    }
    D.nL = nL;
    D.largeur = L;
    D.mlLames = nL * lameL;                                     // mètres linéaires de lames
    D.kgLames = S.poids ? D.mlLames * S.poids / 1000 : 0;
    D.surface = pose === "casquette" ? L * Pd : L * H;
    return D;
  }

  /* ------------------------------------------------------------------ *
   *  Géométrie PURE : une liste de faces {verts:[[x,y,z]…], n:[…], vn:[…]|null, key}
   *  en mètres, Y vers le haut, façade à l'arrière (−Z), extérieur vers +Z,
   *  objet centré en X et Z, posé au sol (y ≥ 0). `key` est la matière
   *  (bsLame / bsFlasque / bsFix) : app.html y applique sa finition, le
   *  générateur Node y met sa teinte.
   * ------------------------------------------------------------------ */
  var N_PROFIL = 36;
  function profil(c, t) {
    var a = 0.38, pts = [];
    for (var k = 0; k < N_PROFIL; k++) {
      var ph = k / N_PROFIL * 2 * Math.PI, cs = Math.cos(ph), sn = Math.sin(ph);
      var u = cs < 0 ? a + a * cs : a + (1 - a) * cs;           // abscisse 0..1 : bord d'attaque (−Z) → bord de fuite (+Z)
      pts.push([u * c - c / 2, (t / 2) * sn]);                   // (z, y) centrés sur l'axe de la lame
    }
    return pts;
  }
  function profilRect(c, t) {                                    // la variante rectangulaire (AS200x36-R)
    var pts = [], n = N_PROFIL / 4;
    for (var side = 0; side < 4; side++) for (var k = 0; k < n; k++) {
      var f = k / n;
      pts.push(side === 0 ? [c / 2, -t / 2 + t * f] : side === 1 ? [c / 2 - c * f, t / 2] : side === 2 ? [-c / 2, t / 2 - t * f] : [-c / 2 + c * f, -t / 2]);
    }
    return pts;
  }
  /* Une lame : longueur `L` le long de X, profil (z, y) ; `R` = rotation 3×3
     (lignes) appliquée aux points et aux normales, puis translation (cx,cy,cz). */
  function lame(out, L, S, R, cx, cy, cz) {
    var c = S.l / 1000, t = S.e / 1000, Pf = S.rect ? profilRect(c, t) : profil(c, t), n = Pf.length;
    var rot = function (v) { return [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]]; };
    var pt = function (x, k) { var p = rot([x, Pf[k][1], Pf[k][0]]); return [p[0] + cx, p[1] + cy, p[2] + cz]; };
    var nrm = [];
    for (var k = 0; k < n; k++) {
      var p0 = Pf[(k + n - 1) % n], p1 = Pf[(k + 1) % n], tz = p1[0] - p0[0], ty = p1[1] - p0[1], l = Math.hypot(tz, ty) || 1;
      nrm.push(rot([0, -tz / l, ty / l]));                       // tangente tournée de −90° : vers l'extérieur
    }
    /* Sens de parcours : HORAIRE vu de l'extérieur, la convention du box() du
       moteur (boite / plaqueZY la suivent aussi) — l'export IFC/OBJ écrit les
       boucles telles quelles, une coque mixte éclairerait à l'envers. */
    for (k = 0; k < n; k++) {
      var j = (k + 1) % n, a = pt(-L / 2, k), b = pt(L / 2, k), c2 = pt(L / 2, j), d = pt(-L / 2, j);
      var nf = [(nrm[k][0] + nrm[j][0]) / 2, (nrm[k][1] + nrm[j][1]) / 2, (nrm[k][2] + nrm[j][2]) / 2], nl = Math.hypot(nf[0], nf[1], nf[2]) || 1;
      out.push({ verts: [a, d, c2, b], n: [nf[0] / nl, nf[1] / nl, nf[2] / nl], vn: [nrm[k], nrm[j], nrm[j], nrm[k]], key: "bsLame" });
    }
    for (var s = -1; s <= 1; s += 2) {                           // les bouts : un éventail depuis le centre
      var nx = rot([s, 0, 0]), ctr = rot([s * L / 2, 0, 0]); ctr = [ctr[0] + cx, ctr[1] + cy, ctr[2] + cz];
      for (k = 0; k < n; k++) {
        var i2 = (k + 1) % n, pk = pt(s * L / 2, k), pj = pt(s * L / 2, i2);
        out.push({ verts: s > 0 ? [ctr, pk, pj] : [ctr, pj, pk], n: nx, vn: null, key: "bsLame" });
      }
    }
  }
  /* Une boîte (centre x,y,z ; cotes w,h,d), six quads. */
  function boite(out, key, x, y, z, w, h, d) {
    var hw = w / 2, hh = h / 2, hd = d / 2,
      vt = [[x - hw, y - hh, z - hd], [x + hw, y - hh, z - hd], [x + hw, y + hh, z - hd], [x - hw, y + hh, z - hd],
            [x - hw, y - hh, z + hd], [x + hw, y - hh, z + hd], [x + hw, y + hh, z + hd], [x - hw, y + hh, z + hd]],
      fi = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 3, 7, 4], [1, 5, 6, 2], [0, 4, 5, 1], [3, 2, 6, 7]],
      nm = [[0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0]];
    for (var i = 0; i < 6; i++) out.push({ verts: fi[i].map(function (j) { return vt[j]; }), n: nm[i], vn: null, key: key });
  }
  /* Une plaque découpée dans le plan (Z, Y) — polygone `pts` = [[z, y]…] convexe,
     parcouru dans le sens trigonométrique du plan (z, y), soit HORAIRE vu de +X —,
     d'épaisseur EP le long de X, centrée en x. Chant : normale sortante. */
  function plaqueZY(out, key, pts, x) {
    var n = pts.length, x0 = x - EP / 2, x1 = x + EP / 2, i;
    var A = pts.map(function (p) { return [x1, p[1], p[0]]; }), B = pts.map(function (p) { return [x0, p[1], p[0]]; });
    for (i = 1; i < n - 1; i++) {                                  // les deux grandes faces, en éventail
      out.push({ verts: [A[0], A[i], A[i + 1]], n: [1, 0, 0], vn: null, key: key });
      out.push({ verts: [B[0], B[i + 1], B[i]], n: [-1, 0, 0], vn: null, key: key });
    }
    for (i = 0; i < n; i++) {                                      // le chant
      var j = (i + 1) % n, dz = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1], l = Math.hypot(dz, dy) || 1;
      out.push({ verts: [A[i], B[i], B[j], A[j]], n: [0, -dz / l, dy / l], vn: null, key: key });
    }
  }
  /* Une platine murale (face arrière au nu de façade zMur) et quatre têtes de vis. */
  function platine(out, D, w, h, x, yBas, zMur) {
    boite(out, "bsFix", x, yBas + h / 2, zMur + EP / 2, w, h, EP);
    if (!D.platines) return;
    for (var sx = -1; sx <= 1; sx += 2) for (var sy = 0; sy < 2; sy++)
      boite(out, "bsFix", x + sx * (w / 2 - 0.018), yBas + h * (sy ? 0.8 : 0.2), zMur + EP + 0.003, 0.012, 0.012, 0.006);
  }
  var Rx = function (a) { var c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
  var Ry = function (a) { var c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
  var Rz = function (a) { var c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
  var mul = function (A, B) { var M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) M[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]; return M; };

  function geometrie(P) {
    var D = derive(P), out = [], S = D.S, L = D.L, k, i, x;
    var y0 = D.hPose;
    if (D.pose === "casquette") {
      var Pd = D.P, zMur = -Pd / 2, hB = D.hBarre, hM = D.hMur, yLame = y0 + hM - hB / 2;
      for (i = 0; i < D.nAppuis; i++) {
        x = -L / 2 + EP / 2 + i * (L - EP) / (D.nAppuis - 1);
        plaqueZY(out, "bsFlasque", [[zMur + EP, y0], [zMur + Pd, y0 + hM - hB], [zMur + Pd, y0 + hM], [zMur + EP, y0 + hM]], x);
        platine(out, D, 0.12, hM + 0.06, Math.max(-L / 2 + 0.06, Math.min(L / 2 - 0.06, x)), y0 - 0.03, zMur);
      }
      var zc = zMur + EP + (Pd - EP) / 2, R = Rx(D.incl * RAD);
      for (k = 0; k < D.nL; k++) lame(out, D.lameL, S, R, 0, yLame, zc + (k - (D.nL - 1) / 2) * D.pas);
    } else if (D.pose === "couche") {
      var H = D.H, pF = D.pF, zMur2 = -(D.retrait + EP + pF) / 2, zF0 = zMur2 + EP + D.retrait, yL0 = y0 + (H - (D.nL - 1) * D.pas) / 2;
      for (i = 0; i < D.nAppuis; i++) {
        x = -L / 2 + EP / 2 + i * (L - EP) / (D.nAppuis - 1);
        var xp = Math.max(-L / 2 + 0.06, Math.min(L / 2 - 0.06, x));
        plaqueZY(out, "bsFlasque", [[zF0, y0], [zF0 + pF, y0], [zF0 + pF, y0 + H], [zF0, y0 + H]], x);
        [[0.06, "basse"], [H - 0.12, "haute"]].forEach(function (cy) {
          boite(out, "bsFlasque", x, y0 + cy[0] + 0.03, zMur2 + EP + (D.retrait + EP) / 2, EP, 0.06, D.retrait + EP);
          platine(out, D, 0.12, 0.12, xp, y0 + cy[0] - 0.03, zMur2);
        });
      }
      var R2 = Rx(D.incl * RAD), zL = zF0 + pF / 2;
      for (k = 0; k < D.nL; k++) lame(out, D.lameL, S, R2, 0, yL0 + k * D.pas, zL);
    } else {
      var H2 = D.H, pF2 = D.pF, zMur3 = -(D.retrait + EP + pF2) / 2, zF02 = zMur3 + EP + D.retrait, x0 = -((D.nL - 1) * D.pas) / 2;
      [[y0, "basse"], [y0 + H2 - EP, "haute"]].forEach(function (fl) {
        boite(out, "bsFlasque", 0, fl[0] + EP / 2, zF02 + pF2 / 2, L, EP, pF2);
        for (var j = 0; j < D.nConsoles; j++) {
          var xc = -L / 2 + 0.06 + j * (L - 0.12) / (D.nConsoles - 1), haute = fl[1] === "haute";
          boite(out, "bsFlasque", xc, (haute ? y0 + H2 - 0.06 : y0) + 0.03, zMur3 + EP + (D.retrait + EP) / 2, EP, 0.06, D.retrait + EP);
          platine(out, D, 0.12, 0.12, xc, haute ? y0 + H2 - 0.12 : y0, zMur3);
        }
      });
      /* la lame est extrudée le long de X : on la dresse (Z, 90°) puis on tourne sa corde autour de Y */
      var R3 = mul(Ry((90 - D.incl) * RAD), Rz(Math.PI / 2));
      for (k = 0; k < D.nL; k++) lame(out, D.lameL, S, R3, x0 + k * D.pas, y0 + H2 / 2, zF02 + pF2 / 2);
    }
    return { faces: out, D: D };
  }

  /* ------------------------------------------------------------------ *
   *  Le côté app.html : build() pousse les faces dans FC avec les finitions,
   *  renseigne DIMS / DIMS_BB / BS_INFO.
   * ------------------------------------------------------------------ */
  function defautsFinitions() {
    try {
      if (glob.FINISH) for (var k in TEINTES) if (glob.FINISH[k] == null) glob.FINISH[k] = TEINTES[k].slice();
      if (glob.FINISH_TEX) for (var k2 in TEINTES) if (!(k2 in glob.FINISH_TEX)) glob.FINISH_TEX[k2] = null;
    } catch (e) {}
  }
  function build() {
    defautsFinitions();
    var fs = glob.FC.length, G = geometrie(PBS), D = G.D, K = {};
    for (var k in TEINTES) K[k] = typeof glob.fcol === "function" ? glob.fcol(k, TEINTES[k]) : TEINTES[k];
    glob._IFCTAG = null;
    var cur = null;
    G.faces.forEach(function (f) {
      if (f.key !== cur) { cur = f.key; glob._CURTEX = typeof glob.ftex === "function" ? glob.ftex(cur, null) : null; }
      glob.face(f.verts, f.n, K[f.key], 1, f.vn);
    });
    glob._CURTEX = null;
    var bb = typeof glob._facesBBox === "function" ? glob._facesBBox(glob.FC, fs) : null;
    if (!bb || !(bb.mn[0] <= bb.mx[0])) bb = { mn: [-D.largeur / 2, 0, -D.profondeur / 2], mx: [D.largeur / 2, D.hauteur, D.profondeur / 2] };
    glob.BS_INFO = { nL: D.nL, nAppuis: D.nAppuis, appuisMin: D.appuisMin, pas: D.pas, incl: D.incl, lameL: D.lameL, mlLames: D.mlLames,
      kgLames: D.kgLames, surface: D.surface, portee: D.portee, section: D.S.id, pose: D.pose, faces: glob.FC.length - fs,
      L: D.largeur, H: D.hauteur, P: D.profondeur, hPose: D.hPose, nConsoles: D.nConsoles || D.nAppuis };
    glob.DIMS = { w: Math.max(0.1, bb.mx[0] - bb.mn[0]), h: Math.max(0.1, bb.mx[1] - bb.mn[1]), d: Math.max(0.1, bb.mx[2] - bb.mn[2]), cy: (bb.mn[1] + bb.mx[1]) / 2 };
    glob.DIMS_BB = bb;
    try { if (!glob.INST_FACEONLY) (glob._sfxUpd || []).forEach(function (u) { u(); }); } catch (e) {}
    return glob.DIMS;
  }

  /* ------------------------------------------------------------------ *
   *  Nom, désignation, récapitulatif, IFC
   * ------------------------------------------------------------------ */
  var f2 = function (v, d) { return (+v || 0).toFixed(d == null ? 2 : d).replace(".", ","); };
  var f0 = function (v) { return String(Math.round(+v || 0)); };
  function nom() { return "Brise-soleil Tellier AZUR BPO"; }
  function designation(P, auto) {
    P = P || PBS;
    if (!auto && P.designation && String(P.designation).replace(/\s+/g, "")) return String(P.designation).trim();
    var D = derive(P);
    return "Brise-soleil fixe Tellier AZUR " + D.S.id + ", " + poseLabel(D.pose).toLowerCase() + ", " + D.nL + " lames au pas de " + f0(D.pas * 1000) + " mm inclinées à " + f0(D.incl) + "°, "
      + (D.pose === "casquette" ? "longueur " + f2(D.L) + " m × débord " + f2(D.P) + " m" : "longueur " + f2(D.L) + " m × hauteur " + f2(D.H) + " m")
      + ", " + D.nAppuis + " appuis";
  }
  function recapHTML() {
    var D = derive(PBS), S = D.S, w = "";
    if (!(+PBS.appuisAuto) && D.nAppuis < D.appuisMin) w += '<div style="color:#e08a2e;margin-top:3px;">⚠ ' + D.nAppuis + " appuis pour une portée de " + f2(D.portee) + " m : la fiche en demande " + D.appuisMin + ".</div>";
    if (D.pose !== "debout" && D.L / (D.nAppuis - 1) > D.portee + 1e-6) w += '<div style="color:#e08a2e;margin-top:3px;">⚠ Entre appuis ' + f2(D.L / (D.nAppuis - 1)) + " m &gt; portée " + f2(D.portee) + " m.</div>";
    if (D.pose === "debout" && D.lameL > D.portee + 1e-6) w += '<div style="color:#e08a2e;margin-top:3px;">⚠ Lame de ' + f2(D.lameL) + " m &gt; portée debout " + f2(D.portee) + " m.</div>";
    if (!(+PBS.pasAuto) && D.pas < D.c * 0.7) w += '<div style="color:#e08a2e;margin-top:3px;">⚠ Entraxe serré : les lames se chevauchent fortement.</div>';
    return "<b>" + poseLabel(D.pose) + " — lame AZUR " + S.id + "</b> · " + S.l + " × " + S.e + " mm, aluminium 6060 T6 extrudé" + (S.deux ? " (deux parties)" : "") + "<br>"
      + D.nL + " lames de " + f2(D.lameL) + " m (" + f2(D.mlLames, 1) + " ml" + (S.poids ? ", ≈ " + f0(D.kgLames) + " kg" : "") + "), pas " + f0(D.pas * 1000) + " mm, " + f0(D.incl) + "°, "
      + (D.pose === "debout" ? "2 flasques + " + 2 * D.nConsoles + " consoles (" + D.nConsoles + " par flasque)" : D.nAppuis + " appuis") + ", " + f2(D.surface, 1) + " m² protégés<br>"
      + "<span style=\"opacity:.8\">Portée fiche " + (D.pose === "debout" ? "lame debout " : "lame couchée ") + f2(D.portee) + " m" + (S.est ? " (estimée)" : "") + (S.note ? " — " + S.note : "") + " ; "
      + (S.poids ? S.poids + " g/ml ; " : "") + "pas et flasques à confirmer avec le fabricant.</span>" + w;
  }
  /* Les paramètres que l'export décrit : ceux de la configuration partagée quand
     app.html en exporte une (partExporte pose _PART_ACTIF / _PART_PARAMS), sinon PBS. */
  function paramsExport() {
    return glob._PART_ACTIF && glob._PART_PARAMS && typeof glob._PART_PARAMS === "object" ? Object.assign({}, PBS, glob._PART_PARAMS) : PBS;
  }
  /* Description de l'entité IFC : la désignation (saisie ou automatique), pliée en
     ASCII comme celle du palan (_plAscii du moteur) — un lecteur IFC affiche mal les \X2\…\X0\. */
  function ifcDesc() { var P = paramsExport(); return (typeof glob._plAscii === "function" ? glob._plAscii : String)(designation(P)); }
  /* [nom, valeur STEP] pour le pset BPO_BriseSoleil — app.html les enveloppe dans IFCPROPERTYSINGLEVALUE.
     L'unité d'angle du fichier est le radian : Inclinaison en radians, InclinaisonDeg en clair. */
  function ifcProps() {
    var P = paramsExport(), D = derive(P), esc = typeof glob.stepEsc === "function" ? glob.stepEsc : function (s) { return String(s).replace(/'/g, "''"); };
    var n = function (v) { return (+v || 0).toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0"); };
    return [["Fabricant", "IFCLABEL('Tellier Brise-Soleil')"], ["Gamme", "IFCLABEL('AZUR')"], ["Designation", "IFCTEXT('" + esc(designation(P)) + "')"],
      ["Pose", "IFCLABEL('" + esc(poseLabel(D.pose)) + "')"], ["SectionLame", "IFCLABEL('" + D.S.id + "')"],
      ["LargeurLame", "IFCPOSITIVELENGTHMEASURE(" + n(D.c) + ")"], ["EpaisseurLame", "IFCPOSITIVELENGTHMEASURE(" + n(D.t) + ")"],
      ["LargeurLameMm", "IFCREAL(" + n(D.S.l) + ")"], ["EpaisseurLameMm", "IFCREAL(" + n(D.S.e) + ")"],
      ["NombreDeLames", "IFCCOUNTMEASURE(" + D.nL + ")"], ["EntraxeM", "IFCPOSITIVELENGTHMEASURE(" + n(D.pas) + ")"],
      ["Inclinaison", "IFCPLANEANGLEMEASURE(" + n(D.incl * RAD) + ")"], ["InclinaisonDeg", "IFCREAL(" + n(D.incl) + ")"], ["LongueurM", "IFCPOSITIVELENGTHMEASURE(" + n(D.L) + ")"],
      [D.pose === "casquette" ? "DebordM" : "HauteurM", "IFCPOSITIVELENGTHMEASURE(" + n(D.pose === "casquette" ? D.P : D.H) + ")"],
      ["NombreAppuis", "IFCCOUNTMEASURE(" + D.nAppuis + ")"], ["PorteeFicheM", "IFCPOSITIVELENGTHMEASURE(" + n(D.portee) + ")"],
      ["LamesMetresLineaires", "IFCREAL(" + n(D.mlLames) + ")"], D.S.poids ? ["MasseLamesKg", "IFCREAL(" + n(D.kgLames) + ")"] : null,
      ["Materiau", "IFCLABEL('Aluminium 6060 T6 extrude')"]].filter(Boolean);
  }
  function finishElems() { defautsFinitions(); return FINISH_ELEMS; }

  /* ------------------------------------------------------------------ *
   *  Le panneau de paramètres (PROC_UI.brisesoleil.ui = "buildBriseSoleilUI")
   * ------------------------------------------------------------------ */
  function fiches() {
    var out = [];
    try {
      (glob.FABRICANTS_DB || []).forEach(function (c) {
        if (c.locked || (typeof glob._fabVis === "function" && !glob._fabVis(c))) return;
        (c.subs || []).forEach(function (p) { if (p.proc === "brisesoleil") out.push({ c: c, p: p }); });
      });
    } catch (e) {}
    return out;
  }
  function ficheCourante() {
    var F = fiches();
    for (var i = 0; i < F.length; i++) if (glob.AL_PRODUCT !== undefined && F[i].p.id === glob.AL_PRODUCT) return F[i];
    return null;
  }
  function noteAppuis(D) {
    var S = D.S;
    return D.pose === "debout"
      ? "Lames debout : deux flasques (haut et bas), consoles tous les 1,50 m au plus (" + D.nConsoles + " par flasque, à confirmer). Portée « lame debout » de la fiche : "
        + f2(D.portee) + " m" + (S.est ? " (estimée)" : "") + " pour des lames de " + f2(D.lameL) + " m. Flasques et consoles rendues en plat de 10 mm — « dimensionnées selon étude » chez le fabricant."
      : "Appuis déduits de la portée « lame couchée » de la fiche (" + f2(D.portee) + " m" + (S.est ? ", estimée" : "") + ") : " + D.appuisMin + " au moins pour "
        + f2(D.L) + " m. Flasques et consoles rendues en plat de 10 mm — « dimensionnées selon étude » chez le fabricant.";
  }
  var host0 = function () { return document.getElementById("params") || document.createElement("div"); };
  function buildUI(again) {
    var P = PBS, self = typeof again === "function" ? again : buildUI;
    /* la fiche ouverte impose son set (la pose) : « Réinitialiser » restaure
       l'instantané du premier affichage du mode, pose comprise, et désaccorderait
       la carte « lames debout » d'une géométrie de casquette */
    var fc0 = ficheCourante(), chg = false;
    if (fc0 && fc0.p.set) for (var k0 in fc0.p.set) if (Object.prototype.hasOwnProperty.call(fc0.p.set, k0) && P[k0] !== fc0.p.set[k0]) { P[k0] = fc0.p.set[k0]; chg = true; }
    if (chg) { glob.build(); if (typeof glob.updateDims === "function") glob.updateDims(); }
    var D = derive(P), S = D.S, groups = [];
    var casq = D.pose === "casquette";
    var secOpts = SECTIONS.map(function (s) { return { id: s.id, l: s.id.replace("AS", "") }; });
    groups.push({ title: "Lame AZUR", fields: [
      { type: "choice", label: "Section (largeur × épaisseur, mm)", key: "section", options: secOpts,
        pick: function (id) { if (+P.pasAuto) P.pas = Math.round(section(id).l / 10); } },
      { type: "note", text: "<b>" + S.id + "</b> : " + S.l + " × " + S.e + " mm, " + (S.poids ? S.poids + " g/ml, " : "") + "portées fiche "
        + f2(S.couchee / 1000) + " m couchée / " + f2(S.debout / 1000) + " m debout" + (S.est ? " (estimées)" : "") + (S.note ? " (" + S.note + ")" : "")
        + (S.deux ? ", profil en deux parties" : "") + ". Aluminium 6060 T6 extrudé, profil monobloc ovoïde « aile d'avion »." }
    ] });
    var fD = [{ type: "slider", label: "Longueur (le long de la façade)", unit: "cm", key: "L", min: 60, max: 1200, step: 5 }];
    if (casq) fD.push({ type: "slider", label: "Débord (profondeur de la casquette)", unit: "cm", key: "P", min: 30, max: 250, step: 5 });
    else fD.push({ type: "slider", label: "Hauteur de l'écran", unit: "cm", key: "H", min: 50, max: 600, step: 5 });
    fD.push(casq ? { type: "slider", label: "Hauteur de pose (dessous des consoles)", unit: "cm", key: "hPose", min: 0, max: 400, step: 5 }
               : { type: "slider", label: "Hauteur du bas de l'écran", unit: "cm", key: "hBas", min: 0, max: 400, step: 5 });
    if (!casq) fD.push({ type: "slider", label: "Retrait du nu de façade", unit: "cm", key: "retrait", min: 0, max: 60, step: 1 });
    groups.push({ title: "Déploiement du brise-soleil", fields: fD });
    var fL = [{ type: "choice", label: "Entraxe (pas) des lames", key: "pasAuto", options: [{ id: 1, l: "Auto : largeur de lame (jour ≥ 1 cm)" }, { id: 0, l: "Réglé" }],
      pick: function (v) { if (+v) P.pas = Math.round(S.l / 10); } }];
    if (!(+P.pasAuto)) fL.push({ type: "slider", label: "Pas réglé (entraxe)", unit: "cm", key: "pas", min: Math.max(2, Math.ceil(S.e / 10) + 1), max: 100, step: 1,
      suffix: function (v) { return v < S.l / 10 ? "chevauchement" : v > S.l / 10 * 1.6 ? "lames espacées" : ""; } });
    fL.push({ type: "slider", label: "Inclinaison des lames", unit: "°", key: "incl", min: 0, max: 90, step: 5,
      suffix: function (v) { return [0, 15, 30, 45].indexOf(+v) >= 0 ? "position SpeedFix" : "hors positions SpeedFix 0/15/30/45"; } });
    groups.push({ title: "Lames ailes d'avion", fields: fL });
    var fA = [];
    if (D.pose !== "debout") {                                   // lames debout : deux flasques, toujours — rien à régler
      fA.push({ type: "choice", label: "Appuis (consoles / flasques)", key: "appuisAuto", options: [{ id: 1, l: "Auto : selon la portée" }, { id: 0, l: "Réglé" }],
        pick: function (v) { var m = derive(P).appuisMin; if (+v) P.nAppuis = m; else P.nAppuis = Math.max(+P.nAppuis || 2, m); } });
      if (!(+P.appuisAuto)) fA.push({ type: "slider", label: "Nombre d'appuis", unit: "", key: "nAppuis", min: 2, max: 12, step: 1,
        suffix: function (v) { return v < derive(P).appuisMin ? "⚠ portée dépassée" : ""; } });   // vivant : la longueur bouge sous les curseurs
    }
    fA.push({ type: "choice", label: "Platines murales et visserie", key: "platines", options: [{ id: 1, l: "Dessinées" }, { id: 0, l: "Masquées" }] });
    fA.push({ type: "note", text: noteAppuis(D) });
    groups.push({ title: "Appuis", fields: fA });
    glob.buildObjUI(P, groups, self);
    /* ce que les curseurs changent sans rebâtir le panneau : la note des appuis, la
       carte produit (« Dimensions », écrite une fois par buildProcProductUI) */
    var notes = host0().querySelectorAll(".exp-note"), nA = notes[notes.length - 1];
    if (glob._sfxUpd) glob._sfxUpd.push(function () {
      if (nA) nA.innerHTML = noteAppuis(derive(P));
      var b = document.querySelector("#params .pc-spec b"), d = glob.DIMS;
      if (b && d) b.textContent = Math.round(100 * d.w) + " × " + Math.round(100 * d.d) + " × " + Math.round(100 * d.h) + " cm";
    });
    /* base d'annulation du mode courant (idempotent ; la branche proc de refreshView
       ne l'appelait pas : un Ctrl+Z versait les paramètres du mode précédent) */
    if (typeof glob.undoOnView === "function") glob.undoOnView();

    var host = document.getElementById("params");
    if (!host) return;
    /* après un undo d'une bascule de pose, la liste du catalogue surligne encore l'ancienne fiche */
    var fc = ficheCourante(), on = document.querySelector("#cat-list .subcat-item.on");
    if (fc && on && on.textContent.trim() !== fc.p.label && typeof glob.buildCatList === "function") glob.buildCatList();
    /* la désignation libre */
    var dz = document.createElement("div"); dz.className = "fld"; dz.style.marginTop = "8px";
    dz.innerHTML = '<div class="fh"><label>Désignation (vide = automatique)</label></div>';
    var inp = document.createElement("input");
    inp.type = "text"; inp.id = "bs-designation"; inp.value = P.designation || ""; inp.placeholder = designation(P, true);
    inp.style.cssText = "width:100%;box-sizing:border-box;font-size:11px;background:var(--p2);color:var(--tx);border:1px solid var(--ln);border-radius:4px;padding:4px;";
    inp.onchange = function () { P.designation = inp.value; glob.DIRTY = true; if (typeof glob.undoSchedule === "function") glob.undoSchedule(); };
    /* vivant sous les curseurs ; translateDOM (autres langues) réécrit l'attribut depuis
       son cache __fr_placeholder à chaque mutation : on tient le cache à jour aussi */
    if (glob._sfxUpd) glob._sfxUpd.push(function () { inp.__fr_placeholder = inp.placeholder = designation(P, true); });
    dz.appendChild(inp); host.appendChild(dz);
    /* le récapitulatif, vivant */
    var rc = document.createElement("div"); rc.className = "exp-note"; rc.style.cssText = "margin:0 0 8px;line-height:1.45;";
    rc.innerHTML = recapHTML();
    if (glob._sfxUpd) glob._sfxUpd.push(function () { rc.innerHTML = recapHTML(); });
    host.insertBefore(rc, host.firstChild);
    /* la pose : trois boutons, qui basculent sur la fiche de la marque qui la porte */
    var wrap = document.createElement("div");
    wrap.className = "ral-fam"; wrap.style.marginBottom = "8px";
    POSES.forEach(function (o) {
      var b = document.createElement("button");
      b.textContent = o.l; if (D.pose === o.id) b.className = "on";
      b.onclick = function () {
        var cible = null;
        fiches().forEach(function (F) { if (!cible && F.p.set && F.p.set.pose === o.id && (!fc || F.c.id === fc.c.id)) cible = F; });
        P.pose = o.id;
        if (fc && cible) {
          glob.AL_PRODUCT = cible.p.id;
          if (typeof glob.vfProcSet === "function") glob.vfProcSet(cible.p);
          glob.build();
          if (typeof glob.buildCatList === "function") glob.buildCatList();
          glob.buildProcProductUI(cible.p);
          if (typeof glob.buildFinishElems === "function") glob.buildFinishElems();
          if (typeof glob.buildFinishPanel === "function") glob.buildFinishPanel();
        } else { glob.build(); self(); }
        if (typeof glob.updateDims === "function") glob.updateDims();
        glob.DIRTY = true;
      };
      wrap.appendChild(b);
    });
    host.insertBefore(wrap, host.firstChild);
  }
  glob.buildBriseSoleilUI = buildUI;

  var API = { PBS: PBS, SECTIONS: SECTIONS, POSES: POSES, derive: derive, geometrie: geometrie, build: build, buildUI: buildUI,
    finishElems: finishElems, nom: nom, designation: designation, recapHTML: recapHTML, ifcDesc: ifcDesc, ifcProps: ifcProps, TEINTES: TEINTES, EP: EP };
  glob.BPO_brisesoleil = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
