/* tools/objets-tellier.mjs — fabrique les produits TELLIER BRISE-SOLEIL du
 * catalogue (data/tellier/) : brise-soleil FIXES à lames « ailes d'avion » de
 * la gamme AZUR, d'après la page du fabricant
 *   https://www.tellierbrisesoleil.com/protection-solaire/brise-soleil-fixes/lames-ailes-avion/
 * et ses fiches par section (…/lames-ailes-avion/<n>-ref-asXXXxYY.html),
 * lues le 12/10/2026 — par moteur de recherche, le proxy de la session ne
 * laissant pas joindre tellierbrisesoleil.com. Demande AL du 12/10/2026,
 * précisée le même jour : « notamment la gamme AZUR ».
 *
 *   cd tools && npm install                 (three, en devDependency — rien n'entre dans app.html)
 *   node objets-tellier.mjs                 -> data/tellier/<id>.js, l'entrée de marque dans
 *                                              data/fabricants.js, les tailles dans data/tailles.js,
 *                                              et un .glb intermédiaire par objet dans tools/sortie/
 *   node objets-tellier.mjs --verifier      -> relit chaque data/tellier/<id>.js comme app.html
 *   node objets-tellier.mjs --vignettes     -> data/tellier/thumbs/<id>.png (Chromium sans tête)
 *
 * LA MARQUE EST PRIVÉE (prive:'compte') : visible du seul compte propriétaire
 * (bpo-config.js, OWNER_EMAILS), comme Anjou Tôlerie, Vitra ou Mecalux en
 * attente d'accord. Les rubriques sont celles du catalogue du fabricant
 * (brise-soleil fixes → lames ailes d'avion, gamme AZUR, et ses trois poses :
 * brise-soleil horizontal, vertical lames couchées, vertical lames debout) et
 * RIEN N'Y NOMME UN PROJET NI UN CLIENT — ⚠ le dépôt est public et Pages sert
 * data/ : prive cache la marque dans l'interface, il ne protège pas les fichiers.
 *
 * CE QUE LE SITE DIT (fiches AZUR « lames ailes d'avion », brise-soleil fixes) :
 *   · « profils monoblocs en aluminium extrudé (N 573-3), aluminium 6060 T6,
 *     de forme ovoïde type aile d'avion » (l'AS600x70 seule est en deux parties) ;
 *     13 sections, de 70 à 600 mm ; longueurs standard 4 000, 5 000, 6 000 ;
 *   · par section, la fiche donne largeur × épaisseur, périmètre, poids au
 *     mètre, inerties, et deux PORTÉES : « lame couchée » et « lame debout »,
 *     « calculées selon les charges climatiques de la FT n°45 » (zone de vent
 *     2, terrain III b, altitude < 9 m, W50 = 475 Pa). Celles qu'on modèle :
 *       AS200x36 : périmètre 413, 2 037 g/ml, portées 3 260 / 3 400
 *       AS300x52 : périmètre 618, 4 316 g/ml, portée 3 740 (fiche produit,
 *                  calcul à 1 050 Pa ; la brochure 2025 donne 4 770 / 5 050)
 *       AS400x68 : périmètre 823, 6 590 g/ml, portées 5 910 / 6 310
 *   · modes de pose : « entre peignes ou plats », « flasques en consoles,
 *     peignes ou plats », « entre embouts porteurs », « entre embouts à
 *     oreilles », et SpeedFix (supports de lames « disponibles en positions
 *     0°, 15°, 30° et 45° », section 50 × 50, sur profils porteurs TR20x50,
 *     TR50x50, TR80x50, ou vissés directement en façade) ; « les flasques sont
 *     dimensionnés selon étude (épaisseur et matériau) » ;
 *   · trois configurations : « brise-soleil horizontal », « brise-soleil
 *     vertical lames couchées », « brise-soleil vertical lames debout » ;
 *     « inclinées de 0° à 90°, nous conseillons la distance entre les lames »
 *     — le pas N'EST PAS chiffré sur le site ;
 *   · finitions : thermolaquage RAL 60-80 µm, thermolaquage aspect bois,
 *     anodisation 20 µm.
 *
 * CE QU'ON SUPPOSE (dit « à confirmer » dans chaque fiche) :
 *   · le PAS (entraxe) des lames = la largeur de la lame ;
 *   · l'INCLINAISON : 30°, l'une des quatre positions SpeedFix ;
 *   · les FLASQUES : plats d'aluminium de 10 mm, consoles et platines
 *     murales de même ; le nombre d'appuis vient de la portée « lame
 *     couchée » de la fiche (un appui au plus tous les 3 260 / 3 740 /
 *     5 910 mm) ; consoles des écrans tous les 1 500 mm au plus ;
 *   · la CASQUETTE : 1 200 de débord, lames couchées inclinées à 30° vers
 *     l'extérieur ; les ÉCRANS : 2 200 de haut, à 100 mm du nu de façade.
 *   Les objets sont POSÉS AU SOL comme tout mesh BPO : la casquette se relève
 *   à la hauteur du linteau dans l'application.
 *
 * Le format BPO, l'empaquetage, la relecture, l'entrée de marque, les tailles
 * et les vignettes sont dans tools/bpo-catalogue.mjs. Mètres, Y vers le haut,
 * façade à l'arrière (−Z), extérieur vers +Z.
 */
import * as THREE from "three";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { atelier, fabriquerObjets, verifierMarque, peindreVignettes, poserEntreeFabricants, poserTailles, SORTIE, MM } from "./bpo-catalogue.mjs";

const BPO_DIR = "tellier";                              // FABRICANTS_DB[].dir et data/<dir>/
const URL_PAGE = "https://www.tellierbrisesoleil.com/protection-solaire/brise-soleil-fixes/lames-ailes-avion/";

/* ------------------------------------------------------------------ *
 *  Les sections du site (mm, g/ml) — ce qu'on modèle
 * ------------------------------------------------------------------ */
const SECTIONS = Object.freeze({
  AS200x36: { largeur: 200, epaisseur: 36, perimetre: 413, poids: 2037, couchee: 3260, debout: 3400,
    portees: "portées 3 260 mm lame couchée / 3 400 mm lame debout" },
  AS300x52: { largeur: 300, epaisseur: 52, perimetre: 618, poids: 4316, couchee: 3740, debout: 3740,
    portees: "portée maximale 3 740 mm (fiche produit, calcul à 1 050 Pa ; brochure 2025 : 4 770 / 5 050 mm)" },
  AS400x68: { largeur: 400, epaisseur: 68, perimetre: 823, poids: 6590, couchee: 5910, debout: 6310,
    portees: "portées 5 910 mm lame couchée / 6 310 mm lame debout" },
});

/* Teintes : aluminium thermolaqué. Le site liste les finitions sans en
   imposer une ; rendu lames RAL 9006 aluminium blanc, flasques et consoles
   RAL 9007 aluminium gris, fixations zinguées — À CONFIRMER, la fiche le dit.
   Dans BPO chaque groupe se recolore au nuancier, d'où un nom par matière. */
const MATIERES = Object.freeze({
  lame:     { nom: "Lames aluminium extrudé 6060 T6 thermolaqué", teinte: "#b9bcbe", metalness: 0.5, roughness: 0.45 },
  flasque:  { nom: "Flasques et consoles aluminium",              teinte: "#8e9397", metalness: 0.5, roughness: 0.5 },
  fixation: { nom: "Fixations (platines, visserie)",              teinte: "#9a9fa3", metalness: 0.4, roughness: 0.55 },
});
const { materiau, boite, cylindre } = atelier(MATIERES);

const EP = 10;             // épaisseur rendue des flasques, consoles et platines (à confirmer)
const INCLINAISON = 30;    // degrés — position SpeedFix 30° (à confirmer)
const RAD = Math.PI / 180;

/* ------------------------------------------------------------------ *
 *  La lame : un profil ovoïde « aile d'avion » de corde c et d'épaisseur t
 *  (deux demi-ellipses jointes au maître-couple, à 38 % de la corde), extrudé
 *  sur `L` le long de X, corde le long de Z (bord d'attaque vers −Z, côté
 *  façade), épaisseur le long de Y. Normales lisses sur le flanc, plates sur
 *  les bouts. Le maillage est centré sur l'axe de la lame.
 * ------------------------------------------------------------------ */
const N_PROFIL = 36;
function profil(c, t) {
  const a = 0.38, pts = [];
  for (let k = 0; k < N_PROFIL; k++) {
    const ph = k / N_PROFIL * 2 * Math.PI;          // tour complet, en partant du bord de fuite (+Z), par le dessus
    const cosv = Math.cos(ph), sinv = Math.sin(ph);
    const u = cosv < 0 ? a + a * cosv : a + (1 - a) * cosv;   // abscisse 0..1 (−Z → +Z)
    const h = (t / 2) * sinv;                                 // demi-épaisseur signée
    pts.push([u * c - c / 2, h]);                             // (z, y) centrés sur l'axe
  }
  return pts;
}
function geometrieLame(L, c, t) {
  const P = profil(c, t), n = P.length;
  const pos = [], nrm = [], uv = [], idx = [];
  /* le flanc : deux anneaux de n sommets, normale 2D du profil (lissée sur
     les deux voisins), quads entre anneaux */
  for (let k = 0; k < n; k++) {
    const [z0, y0] = P[(k + n - 1) % n], [z1, y1] = P[(k + 1) % n];
    const tz = z1 - z0, ty = y1 - y0, l = Math.hypot(tz, ty) || 1;
    const nz = ty / l, ny = -tz / l;                          // tangente tournée de −90° : vers l'extérieur
    for (const x of [-L / 2, L / 2]) {
      pos.push(x * MM, P[k][1] * MM, P[k][0] * MM); nrm.push(0, ny, nz); uv.push(x / L + 0.5, k / n);
    }
  }
  for (let k = 0; k < n; k++) {
    const a = 2 * k, b = 2 * k + 1, c2 = 2 * ((k + 1) % n), d = 2 * ((k + 1) % n) + 1;
    idx.push(a, b, c2, b, d, c2);                           // sens direct vu de l'extérieur
  }
  /* les bouts : un éventail depuis le centre, normale ±X */
  for (const s of [-1, 1]) {
    const base = pos.length / 3;
    pos.push(s * L / 2 * MM, 0, 0); nrm.push(s, 0, 0); uv.push(0.5, 0.5);
    for (let k = 0; k < n; k++) { pos.push(s * L / 2 * MM, P[k][1] * MM, P[k][0] * MM); nrm.push(s, 0, 0); uv.push(P[k][0] / c + 0.5, P[k][1] / t + 0.5); }
    for (let k = 0; k < n; k++) {
      const i = base + 1 + k, j = base + 1 + (k + 1) % n;
      if (s > 0) idx.push(base, j, i); else idx.push(base, i, j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
/* Pose une lame : longueur L le long de X, centrée en (x, y, z), inclinée de
   `inclinaison` autour de X (lame couchée : la corde se relève de −Z vers +Y),
   ou tournée de `rotY` autour de Y (lame debout). */
function lame(racine, nom, L, sec, { x = 0, y = 0, z = 0, inclinaison = 0, rotX = 0, rotY = 0, rotZ = 0 } = {}) {
  const m = new THREE.Mesh(geometrieLame(L, sec.largeur, sec.epaisseur), materiau("lame"));
  m.position.set(x * MM, y * MM, z * MM);
  m.rotation.set(rotX + inclinaison * RAD, rotY, rotZ, "YXZ");
  m.name = nom;
  racine.add(m);
  return m;
}

/* Une plaque découpée dans le plan (Z, Y), d'épaisseur EP le long de X,
   centrée en x : `points` = [[z, y], …] en mm, dans le sens direct vu de +X. */
function plaqueZY(racine, nom, mat, points, x) {
  const forme = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z * MM, y * MM)));
  const g = new THREE.ExtrudeGeometry(forme, { depth: EP * MM, bevelEnabled: false });
  const m = new THREE.Mesh(g, materiau(mat));
  m.rotation.y = -Math.PI / 2;                 // X local → Z monde, Z local → −X monde
  m.position.x = (x + EP / 2) * MM;
  m.name = nom;
  racine.add(m);
  return m;
}
/* Une platine murale avec ses quatre chevilles, plaquée au nu de façade
   (face arrière en z = zMur), centrée en x, de yBas à yBas + h. */
function platine(racine, nom, l, h, { x = 0, yBas = 0, zMur = 0 } = {}) {
  boite(racine, nom, "fixation", l, h, EP, { x, yBas, z: zMur + EP / 2 });
  for (const sx of [-1, 1]) for (const sy of [0.2, 0.8]) {
    const v = cylindre(racine, `${nom} — cheville`, "fixation", 6, 6, { x: x + sx * (l / 2 - 18), z: zMur + EP + 3 });
    v.rotation.x = Math.PI / 2; v.position.y = (yBas + h * sy) * MM;
  }
}

/* Enveloppe d'une lame couchée inclinée : hauteur et profondeur occupées. */
const enveloppe = (sec, inc) => ({
  h: sec.largeur * Math.sin(inc * RAD) + sec.epaisseur * Math.cos(inc * RAD),
  p: sec.largeur * Math.cos(inc * RAD) + sec.epaisseur * Math.sin(inc * RAD),
});
const nAppuis = (L, portee) => Math.ceil(L / portee - 1e-9) + 1;

/* ------------------------------------------------------------------ *
 *  1. Brise-soleil horizontal, en casquette au-dessus d'une baie : des
 *     consoles (flasques en plat, en porte-à-faux depuis une platine murale)
 *     portent N lames couchées, parallèles à la façade, inclinées à 30° vers
 *     l'extérieur, au pas de leur largeur. Débord 1 200.
 * ------------------------------------------------------------------ */
function casquette({ section, longueur, debord = 1200, inclinaison = INCLINAISON }) {
  const sec = SECTIONS[section], L = longueur, P = debord;
  const racine = new THREE.Group(); racine.name = "Brise-soleil horizontal";
  const env = enveloppe(sec, inclinaison);
  const hBarre = Math.round(env.h + 40);             // la barre horizontale de la console, qui enferme les lames
  const hMur = hBarre + Math.round(P * 0.28);        // la console s'élargit vers la platine (gousset)
  const zMur = -P / 2;                                // nu de façade
  const nC = nAppuis(L, sec.couchee);
  const nL = Math.max(1, Math.floor(P / sec.largeur));
  const pas = sec.largeur;
  const yLame = hMur - hBarre / 2;
  for (let i = 0; i < nC; i++) {
    const x = -L / 2 + EP / 2 + i * (L - EP) / (nC - 1);                 // consoles aux bouts et aux appuis intermédiaires
    plaqueZY(racine, `Console ${i + 1}`, "flasque",
      [[zMur + EP, 0], [zMur + P, hMur - hBarre], [zMur + P, hMur], [zMur + EP, hMur]], x);
    platine(racine, `Platine ${i + 1}`, 120, hMur + 60, { x: Math.max(-L / 2 + 60, Math.min(L / 2 - 60, x)), yBas: -30, zMur });
  }
  const zc = zMur + EP + (P - EP) / 2;                                   // lames centrées sur la console
  for (let k = 0; k < nL; k++) {
    lame(racine, `Lame ${k + 1}`, L - 2 * EP, sec, { y: yLame, z: zc + (k - (nL - 1) / 2) * pas, inclinaison });
  }
  const dims = { largeur: L, profondeur: P, hauteur: hMur + 60, lames: nL, appuis: nC, pas, inclinaison };
  return { racine, dims };
}

/* ------------------------------------------------------------------ *
 *  2. Brise-soleil vertical, lames couchées : un écran devant la baie, deux
 *     flasques verticales (plats) tenues à la façade par des consoles haut et
 *     bas, N lames horizontales inclinées à 30° au pas de leur largeur.
 *     Hauteur 2 200, écran à 100 du nu de façade.
 * ------------------------------------------------------------------ */
function ecranCouche({ section, longueur, hauteur = 2200, retrait = 100, inclinaison = INCLINAISON }) {
  const sec = SECTIONS[section], L = longueur, H = hauteur;
  const racine = new THREE.Group(); racine.name = "Brise-soleil vertical lames couchées";
  const env = enveloppe(sec, inclinaison);
  const pF = Math.round(env.p + 40);                 // largeur du plat (profondeur de l'écran)
  const zMur = -(retrait + pF) / 2, zF0 = zMur + EP + retrait;   // le plat, de zF0 à zF0 + pF
  const nF = nAppuis(L, sec.couchee);
  const pas = sec.largeur, marge = 100;
  const nL = Math.max(1, Math.floor((H - 2 * marge) / pas));
  const y0 = (H - (nL - 1) * pas) / 2;
  for (let i = 0; i < nF; i++) {
    const x = -L / 2 + EP / 2 + i * (L - EP) / (nF - 1);
    const xp = Math.max(-L / 2 + 60, Math.min(L / 2 - 60, x));          // la platine reste dans la longueur
    plaqueZY(racine, `Flasque ${i + 1}`, "flasque", [[zF0, 0], [zF0 + pF, 0], [zF0 + pF, H], [zF0, H]], x);
    for (const [k, yB] of [["basse", 60], ["haute", H - 120]]) {
      boite(racine, `Console ${k} ${i + 1}`, "flasque", EP, 60, retrait + EP, { x, yBas: yB, z: zMur + EP + (retrait + EP) / 2 });
      platine(racine, `Platine ${k} ${i + 1}`, 120, 120, { x: xp, yBas: yB - 30, zMur });
    }
  }
  const zL = zF0 + pF / 2;                           // l'axe des lames, au milieu du plat
  for (let k = 0; k < nL; k++) {
    lame(racine, `Lame ${k + 1}`, L - 2 * EP, sec, { y: y0 + k * pas, z: zL, inclinaison });
  }
  const dims = { largeur: L, profondeur: retrait + EP + pF, hauteur: H, lames: nL, appuis: nF, pas, inclinaison };
  return { racine, dims };
}

/* ------------------------------------------------------------------ *
 *  3. Brise-soleil vertical, lames debout : deux flasques horizontales (plats
 *     haut et bas) tenues à la façade par des consoles, N lames verticales
 *     au pas de leur largeur, corde à 30° du plan de façade. Hauteur 2 200,
 *     écran à 100 du nu de façade.
 * ------------------------------------------------------------------ */
function ecranDebout({ section, longueur, hauteur = 2200, retrait = 100, inclinaison = INCLINAISON }) {
  const sec = SECTIONS[section], L = longueur, H = hauteur;
  const racine = new THREE.Group(); racine.name = "Brise-soleil vertical lames debout";
  /* corde à `inclinaison` du plan de façade : rotation autour de Y de 90° − inclinaison */
  const rotY = (90 - inclinaison) * RAD;
  const pF = Math.round(sec.largeur * Math.sin(inclinaison * RAD) + sec.epaisseur * Math.cos(inclinaison * RAD) + 40);
  const zMur = -(retrait + pF) / 2, zF0 = zMur + EP + retrait;
  const nC = Math.ceil(L / 1500 - 1e-9) + 1;         // consoles tous les 1 500 au plus (à confirmer)
  const pas = sec.largeur, marge = sec.largeur / 2 + 20;
  const nL = Math.max(1, Math.floor((L - 2 * marge) / pas) + 1);
  const x0 = -((nL - 1) * pas) / 2;
  for (const [k, yB] of [["basse", 0], ["haute", H - EP]]) {
    boite(racine, `Flasque ${k}`, "flasque", L, EP, pF, { yBas: yB, z: zF0 + pF / 2 });
    for (let i = 0; i < nC; i++) {
      const x = -L / 2 + 60 + i * (L - 120) / (nC - 1);
      boite(racine, `Console ${k} ${i + 1}`, "flasque", EP, 60, retrait + EP,
        { x, yBas: k === "basse" ? 0 : H - 60, z: zMur + EP + (retrait + EP) / 2 });
      platine(racine, `Platine ${k} ${i + 1}`, 120, 120, { x, yBas: k === "basse" ? 0 : H - 120, zMur });
    }
  }
  for (let k = 0; k < nL; k++) {
    /* la lame est extrudée le long de X : on la dresse (Z autour de 90°) puis
       on tourne sa corde autour de Y */
    lame(racine, `Lame ${k + 1}`, H - 2 * EP, sec, { x: x0 + k * pas, y: H / 2, z: zF0 + pF / 2, rotZ: Math.PI / 2, rotY });
  }
  const dims = { largeur: L, profondeur: retrait + EP + pF, hauteur: H, lames: nL, appuis: 2, pas, inclinaison, consoles: nC };
  return { racine, dims };
}

/* ------------------------------------------------------------------ *
 *  Le catalogue : 3 sections × 3 poses × 3 longueurs
 * ------------------------------------------------------------------ */
const LONGUEURS = [2000, 3000, 4000];
const FINITION = "Finitions du site : thermolaquage RAL 60-80 µm, aspect bois ou anodisation 20 µm (rendu : lames RAL 9006, "
  + "flasques RAL 9007 — à confirmer).";
const SUPPOSE = `Pas des lames pris égal à leur largeur et inclinaison ${INCLINAISON}° (position SpeedFix) : à confirmer, le site ne `
  + "chiffre pas l'entraxe ; flasques et consoles rendues en plat de 10 mm, « dimensionnées selon étude » chez le fabricant.";
const fiche = (sec) => `Lame AZUR ${sec} : section ${SECTIONS[sec].largeur} × ${SECTIONS[sec].epaisseur} mm, aluminium 6060 T6 extrudé `
  + `monobloc, forme ovoïde type aile d'avion, ${SECTIONS[sec].poids} g/ml, ${SECTIONS[sec].portees} (fiche fabricant, charges FT n°45).`;

const POSES = {
  casquette: { cat: "Brise-soleil fixes — lames ailes d'avion AZUR — horizontal (casquette)", fabrique: casquette, code: "h",
    titre: (sec, L) => `Brise-soleil horizontal AZUR ${sec} — casquette L ${L}`,
    texte: (d) => `Casquette au-dessus d'une baie : ${d.lames} lames couchées parallèles à la façade sur ${d.appuis} consoles en `
      + `porte-à-faux à platine murale, débord ${d.profondeur}, longueur ${d.largeur}. Posée au sol dans BPO : à relever à la hauteur du linteau.` },
  couche: { cat: "Brise-soleil fixes — lames ailes d'avion AZUR — vertical lames couchées", fabrique: ecranCouche, code: "vc",
    titre: (sec, L) => `Brise-soleil vertical AZUR ${sec} — lames couchées L ${L}`,
    texte: (d) => `Écran devant une baie : ${d.lames} lames horizontales entre ${d.appuis} flasques verticales tenues à la façade par des `
      + `consoles haut et bas, hauteur ${d.hauteur}, longueur ${d.largeur}, à 100 mm du nu de façade (à confirmer).` },
  debout: { cat: "Brise-soleil fixes — lames ailes d'avion AZUR — vertical lames debout", fabrique: ecranDebout, code: "vd",
    titre: (sec, L) => `Brise-soleil vertical AZUR ${sec} — lames debout L ${L}`,
    texte: (d) => `Écran devant une baie : ${d.lames} lames verticales entre deux flasques horizontales (haut et bas) tenues à la façade `
      + `par ${d.consoles} consoles, corde à ${d.inclinaison}° du plan de façade, hauteur ${d.hauteur}, longueur ${d.largeur}, à 100 mm du nu de façade (à confirmer).` },
};

const CATALOGUE = [];
for (const [pose, p] of Object.entries(POSES)) {
  for (const sec of Object.keys(SECTIONS)) {
    for (const L of LONGUEURS) {
      CATALOGUE.push({
        bpo: `tl_azur_${sec.toLowerCase()}_${p.code}_${L}`, glb: `TL-AZUR-${sec}-${p.code}-${L}`,
        fabrique: p.fabrique, params: { section: sec, longueur: L }, pose,
        cat: p.cat, reference: `AZUR ${sec}`, section: sec, longueur: L,
        titre: p.titre(sec, L), azimut: pose === "casquette" ? 35 : 25,
      });
    }
  }
}

const phraseDims = (d) => `L ${d.largeur} × P ${d.profondeur} × H ${d.hauteur} mm (${d.lames} lames au pas de ${d.pas}, ${d.inclinaison}°)`;

/* ------------------------------------------------------------------ *
 *  L'entrée de marque, et les trois modes (le travail est dans bpo-catalogue.mjs)
 * ------------------------------------------------------------------ */
const MARQUE_DEBUT = "  /* TELLIER BRISE-SOLEIL";                // le bloc que ce générateur réécrit dans data/fabricants.js

const entreeFabricants = (fiches) => `  /* TELLIER BRISE-SOLEIL (12/10/2026) : brise-soleil fixes à lames ailes d'avion, gamme AZUR, objets établis
     d'après les fiches du site du fabricant (tools/objets-tellier.mjs — le régénérer réécrit CE bloc).
     Privée (compte) : objets réservés à l'agence tant que le fabricant n'a rien accordé.
     Pas de logo : rien reçu. Vignettes : data/${BPO_DIR}/thumbs/<id>.png */
  {id:'${BPO_DIR}', label:"Tellier Brise-Soleil", status:'ready', prive:'compte', dir:'${BPO_DIR}', logo:'', url:'${URL_PAGE}', subs:[${
  fiches.map((p) => JSON.stringify({ id: p.bpo, label: p.titre, mesh: true, cat: p.cat,
    categorie: `${POSES[p.pose].cat.split(" — ")[2].replace(/^./, (c) => c.toUpperCase())} — réf. ${p.reference}`,
    description: `${POSES[p.pose].texte(p.dims)} ${fiche(p.section)} ${p.dimensions}. ${SUPPOSE} ${FINITION}` })).join(",")}]},
`;

async function fabriquer() {
  const fiches = await fabriquerObjets({ catalogue: CATALOGUE, dir: BPO_DIR, fabricant: "Tellier Brise-Soleil", matieres: MATIERES,
    cotes: (d) => [d.largeur, d.hauteur, d.profondeur], phraseDims });
  const marques = poserEntreeFabricants({ debut: MARQUE_DEBUT, entree: entreeFabricants(fiches), id: BPO_DIR, nb: fiches.length });
  const tailles = poserTailles(BPO_DIR);
  mkdirSync(SORTIE, { recursive: true });
  writeFileSync(join(SORTIE, "fabricants-entree-tellier.js"), entreeFabricants(fiches));
  console.log(`${fiches.length} objets dans data/${BPO_DIR}/ ; data/fabricants.js : ${marques} marques ; data/tailles.js : ${tailles} paquets`);
}

if (process.argv.includes("--verifier")) verifierMarque(BPO_DIR);
else if (process.argv.includes("--vignettes")) await peindreVignettes({ catalogue: CATALOGUE, dir: BPO_DIR });
else await fabriquer();
