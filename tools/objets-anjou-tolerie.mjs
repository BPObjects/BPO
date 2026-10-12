/* tools/objets-anjou-tolerie.mjs — fabrique les produits ANJOU TÔLERIE du
 * catalogue (data/anjou_tolerie/), d'après le plan technique 07-00046 du
 * fabricant (« Armoire vestiaire 3 cases avec caisson haut », type Vestiaire,
 * matière acier, daté du 10-05-2007) remis par AL le 12/10/2026.
 *
 *   cd tools && npm install                      (three, en devDependency — rien n'entre dans app.html)
 *   node objets-anjou-tolerie.mjs                -> data/anjou_tolerie/<id>.js, l'entrée de marque dans
 *                                                   data/fabricants.js, les tailles dans data/tailles.js,
 *                                                   et un .glb intermédiaire par objet dans tools/sortie/
 *   node objets-anjou-tolerie.mjs --verifier     -> relit chaque data/anjou_tolerie/<id>.js comme app.html
 *   node objets-anjou-tolerie.mjs --vignettes    -> data/anjou_tolerie/thumbs/<id>.png (Chromium sans tête)
 *
 * LA MARQUE EST PRIVÉE (prive:'compte') : visible du seul compte propriétaire
 * (bpo-config.js, OWNER_EMAILS), comme Vitra, Haworth ou Mecalux en attente
 * d'accord. Les rubriques sont celles du catalogue du fabricant (vestiaires
 * avec caisson haut, industrie propre, industrie salissante, bancs) et RIEN
 * N'Y NOMME UN PROJET NI UN CLIENT (AL, 12/10 : le nom du dossier n'a rien à
 * faire ici) — ⚠ le dépôt est public et Pages sert data/ : prive cache la
 * marque dans l'interface, il ne protège pas les fichiers.
 *
 * CE QUE LE PLAN DIT, et c'est tout ce qu'on a mesuré dessus :
 *   · largeur 1 200 (trois cases de 400), hauteur du corps 1 800, caisson haut
 *     de 450 posé sur le corps, « arrière du caisson entièrement ouvert »,
 *     flancs perforés, trois grilles d'aération en bas de sa face, une sortie
 *     cylindrique sur le dessus ;
 *   · trois portes à charnières côté droit, poignée-serrure à gauche, grille
 *     d'aération perforée en bas de chaque porte ;
 *   · le tout posé sur un piètement-banc : traverses, pieds, lattes devant ;
 *   · dans chaque case, une tablette haute et une patère.
 *   La PROFONDEUR n'est pas cotée : 500 mm, celle de toute la gamme vestiaires
 *   du fabricant (anjoutolerie.fr : 400/800/1 200 × 500, hauteurs 1 800 à
 *   2 050 selon le piètement). La hauteur du banc (400), son débord (350) et
 *   l'épaisseur des tôles (rendue à 15 mm pour qu'on les VOIE ; les vraies
 *   font 7 à 9/10 mm) sont des choix de rendu, pas des cotes. Les BANCS
 *   SÉPARÉS (demande AL du 12/10) reprennent la construction du piètement du
 *   plan — tubes carrés de 30, lattes de hêtre de 70 × 25 — en 1 000, 1 500
 *   et 2 000 de long, 400 de profondeur, 400 de haut. Les VESTIAIRES INDUSTRIE
 *   SALISSANTE (demande AL du 12/10) sont la gamme « 2 portes » du fabricant :
 *   une case de 400 coupée en deux par une cloison — le propre d'un côté, le
 *   sale de l'autre —, DEUX portes de 180, chacune à charnières côté extérieur
 *   et serrure vers le milieu, une patère par compartiment ; 1, 2 et 3 cases
 *   (400/800/1 200 × 500), sur pieds, corps 1 900 + pieds 150 = 2 050, les
 *   cotes des tableaux anjoutolerie.fr (réfs S1/S2/S3 DC/S, à confirmer).
 *
 * LE FORMAT BPO, relu dans admin.html (packMesh / previewLoad) :
 *   · positions uint16 quantifiées dans meta.bb [minx, 0, minz, maxx, maxy,
 *     maxz], objet centré en X et Z, posé au sol ; normales int8 (×127) ;
 *     UV float32 ; indices uint32 ; le tout concaténé, gzip, base64 → geo ;
 *     meta.{plen,nlen,uvlen,ilen} sont les longueurs en octets de chaque bloc,
 *     nv/nf les comptes, dim les cotes en mètres ;
 *   · groups[] : un par matière, {start, count, name, col:[r,g,b] 0-255} —
 *     app.html applique ses finitions par groupe, d'où un NOM lisible ;
 *   · tex : {} — pas de texture, la teinte suffit à de l'acier peint.
 *   Mètres, Y vers le haut, portes vers +Z. Les .glb de tools/sortie/ ne
 *   servent qu'au banc de vignettes (tools/banc-objet-glb.html) ; ils ne sont
 *   pas versionnés.
 *
 * GLTFExporter lit les Blob par FileReader, que Node n'a pas : un polyfill de
 * dix lignes ci-dessous, pas une dépendance de plus.
 */
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync } from "fs";
import { gzipSync, gunzipSync } from "zlib";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, "..");
const BPO_DIR = "anjou_tolerie";                       // FABRICANTS_DB[].dir et data/<dir>/
const DATA = join(RACINE, "data", BPO_DIR);
const THUMBS = join(DATA, "thumbs");
const SORTIE = join(ICI, "sortie");                    // .glb intermédiaires, non versionnés
const FABRICANTS = join(RACINE, "data", "fabricants.js");
const TAILLES = join(RACINE, "data", "tailles.js");

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class {
    constructor() { this.result = null; this.onload = null; this.onloadend = null; this.onerror = null; }
    #fini() { this.onload?.({ target: this }); this.onloadend?.({ target: this }); }
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((b) => { this.result = b; this.#fini(); }, (e) => this.onerror?.(e));
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((b) => {
        this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(b).toString("base64")}`;
        this.#fini();
      }, (e) => this.onerror?.(e));
    }
  };
}

/* ------------------------------------------------------------------ *
 *  Cotes en millimètres, maillage en mètres
 * ------------------------------------------------------------------ */
const MM = 1 / 1000;
const TOLE = 15;            // épaisseur RENDUE d'une tôle (voir l'en-tête)
const TUBE = 30;            // tube carré du piètement

/* Teintes : acier peint. Le plan ne nomme aucune teinte (« Matière : acier »,
   c'est tout) ; corps gris clair RAL 7035, portes bleu gentiane RAL 5010, la
   paire la plus courante du fabricant — À CONFIRMER, la fiche le dit. Dans
   BPO chaque groupe se recolore au nuancier, d'où un nom lisible par matière. */
const TEINTES = Object.freeze({
  corps:  "#c5c9c6",   // RAL 7035 gris clair
  porte:  "#0e4c7a",   // RAL 5010 bleu gentiane
  sombre: "#2a2a2a",   // grilles et perforations (on voit l'ombre, pas le trou)
  tube:   "#3b3f42",   // piètement, tubes carrés
  latte:  "#b8926a",   // lattes de banc, hêtre verni
  zinc:   "#9a9fa3",   // charnières, serrures, sortie de caisson
});
const NOMS_MATIERES = Object.freeze({
  corps: "Corps acier peint RAL 7035", porte: "Portes acier peint RAL 5010",
  sombre: "Grilles et perforations", tube: "Piètement tube acier", latte: "Lattes hêtre",
  zinc: "Quincaillerie zinguée",
});
const materiaux = {};
const materiau = (nom) => materiaux[nom] ??= new THREE.MeshStandardMaterial({
  color: new THREE.Color(TEINTES[nom]), metalness: nom === "latte" ? 0 : 0.35,
  roughness: nom === "latte" ? 0.7 : 0.5, name: nom,
});

/* Une boîte posée par sa base : (largeur X, hauteur Y, profondeur Z), centre
   en X et Z, `yBas` au bas. Tout objet se décrit ainsi, cote après cote. */
function boite(racine, nom, mat, l, h, p, { x = 0, yBas = 0, z = 0 } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(l * MM, h * MM, p * MM), materiau(mat));
  m.position.set(x * MM, (yBas + h / 2) * MM, z * MM);
  m.name = nom;
  racine.add(m);
  return m;
}
function cylindre(racine, nom, mat, rayon, h, { x = 0, yBas = 0, z = 0 } = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rayon * MM, rayon * MM, h * MM, 32), materiau(mat));
  m.position.set(x * MM, (yBas + h / 2) * MM, z * MM);
  m.name = nom;
  racine.add(m);
  return m;
}

/* ------------------------------------------------------------------ *
 *  Le piètement-banc : la construction du plan, partagée par l'armoire
 *  (qui le porte) et par le banc séparé.
 *    cadre de tubes de `L` × (zArr → zAv), quatre pieds aux angles, un
 *    longeron par côté, une traverse à chaque bout (et une au milieu
 *    au-delà de 1 500), `nLattes` lattes de 70 × 25 sur la zone
 *    [zLattes0, zLattes1], posées sur le cadre à la hauteur `hs`.
 * ------------------------------------------------------------------ */
function pietementBanc(racine, { L, hs, zArr, zAv, zLattes0, zLattes1, nLattes, traverses = [] }) {
  const b = new THREE.Group(); b.name = "Piètement banc"; racine.add(b);
  const T = TUBE;
  for (const sx of [-1, 1]) {
    const x = sx * (L / 2 - T / 2);
    boite(b, "Pied arrière", "tube", T, hs - T, T, { x, z: zArr });
    boite(b, "Pied avant", "tube", T, hs - T, T, { x, z: zAv });
    boite(b, "Longeron", "tube", T, T, zAv - zArr + T, { x, yBas: hs - T, z: (zArr + zAv) / 2 });
  }
  for (const z of [zArr, zAv, ...traverses]) boite(b, "Traverse", "tube", L - 2 * T, T, T, { yBas: hs - T, z });
  if (L > 1500) {
    boite(b, "Pied médian arrière", "tube", T, hs - T, T, { z: zArr });
    boite(b, "Pied médian avant", "tube", T, hs - T, T, { z: zAv });
  }
  const pas = (zLattes1 - zLattes0 - 70) / Math.max(1, nLattes - 1);
  for (let k = 0; k < nLattes; k++) {
    boite(b, `Latte ${k + 1}`, "latte", L, 25, 70, { yBas: hs, z: zLattes0 + 35 + k * pas });
  }
}

/* ------------------------------------------------------------------ *
 *  L'armoire vestiaire, paramétrée
 * ------------------------------------------------------------------ */
function vestiaire({ cases, largeurCase = 400, profondeur = 500, hauteurCorps = 1800,
                     caisson = 0, support = "banc", portesParCase = 1 }) {
  const racine = new THREE.Group();
  racine.name = "Armoire vestiaire";
  const L = cases * largeurCase, P = profondeur, H = hauteurCorps;
  const hs = support === "banc" ? 400 : support === "pieds" ? 150 : 0;   // hauteur du piètement

  /* LE CORPS : une caisse monobloc. Les cloisons entre cases ne se voient pas
     portes fermées ; ce qu'on voit, c'est le retour de corps entre deux
     portes — d'où des portes un peu moins larges que la case. */
  boite(racine, "Corps", "corps", L, H, P, { yBas: hs });

  /* LES PORTES : charnières à droite, serrure à gauche, grille en bas — comme
     sur la vue de face du plan. En industrie salissante (portesParCase = 2),
     chaque case porte DEUX vantaux étroits : charnières côté extérieur,
     serrures vers le milieu, une grille chacun. */
  for (let i = 0; i < cases; i++) {
    const xc = -L / 2 + largeurCase * (i + 0.5);
    const zAv = P / 2;
    const lv = largeurCase / portesParCase;           // largeur d'un vantail, jeux compris
    for (let v = 0; v < portesParCase; v++) {
      const xv = xc - largeurCase / 2 + lv * (v + 0.5);
      /* côté charnières : +1 = à droite (une porte, ou le vantail droit), -1 = à gauche */
      const cote = portesParCase === 1 || v === portesParCase - 1 ? 1 : -1;
      const nom = portesParCase === 1 ? `Porte ${i + 1}` : `Porte ${i + 1}${v === 0 ? "a" : "b"}`;
      const porte = new THREE.Group(); porte.name = nom; racine.add(porte);
      boite(porte, `${nom} — vantail`, "porte", lv - 24, H - 40, TOLE, { x: xv, yBas: hs + 20, z: zAv + TOLE / 2 });
      boite(porte, `${nom} — grille d'aération`, "sombre", Math.min(180, lv - 70), 220, 3,
        { x: xv, yBas: hs + 70, z: zAv + TOLE + 1.5 });
      boite(porte, `${nom} — serrure`, "zinc", Math.min(44, lv * 0.22), 18, 12,
        { x: xv - cote * lv * 0.27, yBas: hs + H * 0.62, z: zAv + TOLE + 6 });
      boite(porte, `${nom} — porte-étiquette`, "zinc", Math.min(60, lv * 0.35), 28, 2,
        { x: xv, yBas: hs + H - 160, z: zAv + TOLE + 1 });
      for (const [k, f] of [["haute", 0.78], ["basse", 0.22]]) {
        boite(porte, `${nom} — charnière ${k}`, "zinc", 10, 70, 10,
          { x: xv + cote * (lv / 2 - 12 - 5), yBas: hs + H * f, z: zAv + TOLE / 2 });
      }
    }
  }

  /* LE CAISSON HAUT : trois tôles et un dessus, l'ARRIÈRE OUVERT (le plan le
     dit en toutes lettres). Flancs perforés, grilles d'aération en bas de la
     face — une par case — et une sortie cylindrique au centre du dessus. */
  if (caisson > 0) {
    const yB = hs + H;
    const c = new THREE.Group(); c.name = "Caisson haut"; racine.add(c);
    boite(c, "Caisson — dessus", "corps", L, TOLE, P, { yBas: yB + caisson - TOLE });
    boite(c, "Caisson — face", "corps", L, caisson - TOLE, TOLE, { yBas: yB, z: P / 2 - TOLE / 2 });
    for (const s of [-1, 1]) {
      boite(c, `Caisson — flanc ${s < 0 ? "gauche" : "droit"}`, "corps", TOLE, caisson - TOLE, P,
        { x: s * (L / 2 - TOLE / 2), yBas: yB });
      for (let r = 0; r < 4; r++) for (let q = 0; q < 5; q++) {
        boite(c, "Caisson — perforation", "sombre", 2, 30, 20,
          { x: s * (L / 2 - 1), yBas: yB + 60 + r * 75, z: -P / 2 + 80 + q * 70 });
      }
    }
    for (let i = 0; i < cases; i++) {
      boite(c, `Caisson — grille ${i + 1}`, "sombre", 160, 90, 2,
        { x: -L / 2 + largeurCase * (i + 0.5), yBas: yB + 40, z: P / 2 + 1 });
    }
    cylindre(c, "Caisson — sortie d'air", "zinc", 75, 120, { yBas: yB + caisson - 2 });
  }

  /* LE PIÈTEMENT. « banc » : le cadre de tubes déborde de 350 devant, trois
     lattes dessus — la vue de face du plan. « pieds » : quatre pieds carrés,
     comme la gamme sur pieds du catalogue (corps 1 900 + pieds 150 = 2 050). */
  if (support === "banc") {
    const debord = 350;
    pietementBanc(racine, { L, hs, zArr: -P / 2 + TUBE / 2, zAv: P / 2 + debord - TUBE / 2,
      zLattes0: P / 2 + 30, zLattes1: P / 2 + debord - 10, nLattes: 3, traverses: [P / 2 - TUBE / 2] });
  } else if (support === "pieds") {
    const b = new THREE.Group(); b.name = "Pieds"; racine.add(b);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      boite(b, "Pied", "tube", 40, hs, 40, { x: sx * (L / 2 - 40), z: sz * (P / 2 - 40) });
    }
  }

  /* L'INTÉRIEUR, qu'on ne voit pas portes fermées : tablette haute et patère
     par case (vue de gauche du plan) ; en industrie salissante, une cloison
     médiane et une patère par compartiment. Léger, et fidèle. */
  for (let i = 0; i < cases; i++) {
    const xc = -L / 2 + largeurCase * (i + 0.5);
    boite(racine, `Case ${i + 1} — tablette`, "corps", largeurCase - 2 * TOLE, 8, P - 60,
      { x: xc, yBas: hs + H - 300, z: -10 });
    if (portesParCase === 2) {
      boite(racine, `Case ${i + 1} — cloison propre/sale`, "corps", 8, H - 2 * TOLE, P - 2 * TOLE, { x: xc, yBas: hs + TOLE });
    }
    const lv = largeurCase / portesParCase;
    for (let v = 0; v < portesParCase; v++) {
      boite(racine, `Case ${i + 1} — patère${portesParCase > 1 ? " " + (v + 1) : ""}`, "zinc", 10, 60, 40,
        { x: xc - largeurCase / 2 + lv * (v + 0.5), yBas: hs + H - 400, z: -P / 2 + 40 });
    }
  }

  const dims = { largeur: L, profondeur: support === "banc" ? P + 350 : P, hauteur: hs + H + caisson,
                 corps: H, caisson, pietement: hs, sortie: caisson ? 120 : 0 };
  return { racine, dims };
}

/* ------------------------------------------------------------------ *
 *  Le banc vestiaire séparé : le piètement du plan, seul
 * ------------------------------------------------------------------ */
function banc({ longueur, profondeur = 400, hauteur = 400 }) {
  const racine = new THREE.Group();
  racine.name = "Banc vestiaire";
  pietementBanc(racine, { L: longueur, hs: hauteur, zArr: -profondeur / 2 + TUBE / 2, zAv: profondeur / 2 - TUBE / 2,
    zLattes0: -profondeur / 2 + 15, zLattes1: profondeur / 2 - 15, nLattes: 4 });
  const dims = { largeur: longueur, profondeur, hauteur: hauteur + 25, corps: 0, caisson: 0, pietement: hauteur, sortie: 0 };
  return { racine, dims };
}

/* ------------------------------------------------------------------ *
 *  Le catalogue : le modèle du plan, ses déclinaisons, les bancs
 * ------------------------------------------------------------------ */
const TEINTE_PHRASE = "Acier peint, teinte à confirmer avec le fabricant (rendu : corps gris clair "
  + "RAL 7035, portes bleu gentiane RAL 5010).";
const TEINTE_BANC = "Piètement acier peint (rendu gris anthracite), lattes hêtre verni — à confirmer avec le fabricant.";

const CATALOGUE = [
  { bpo: "at_vestiaire_3c_caisson_haut_07_00046", glb: "07-00046-armoire-vestiaire-3-cases-caisson-haut",
    fabrique: vestiaire, params: { cases: 3, caisson: 450, support: "banc" },
    cat: "Vestiaires avec caisson haut", reference: "07-00046",
    titre: "Armoire vestiaire 3 cases avec caisson haut",
    description: "Le modèle du plan 07-00046 (type Vestiaire, matière acier, 10-05-2007) : trois cases "
      + "de 400 avec tablette et patère, portes à charnières et grille d'aération, caisson haut de 450 "
      + "à l'arrière entièrement ouvert, flancs perforés, trois grilles en face et sortie d'air sur le "
      + "dessus ; posé sur un piètement-banc à lattes.", teinte: TEINTE_PHRASE },
  { bpo: "at_vestiaire_1c_caisson_haut", glb: "AT-VCH1-armoire-vestiaire-1-case-caisson-haut",
    fabrique: vestiaire, params: { cases: 1, caisson: 450, support: "banc" },
    cat: "Vestiaires avec caisson haut", reference: "AT-VCH1 (déclinaison)",
    titre: "Armoire vestiaire 1 case avec caisson haut",
    description: "Déclinaison à une case du modèle 07-00046, mêmes cotes de case, même caisson, même "
      + "piètement-banc. Référence à faire établir par le fabricant.", teinte: TEINTE_PHRASE },
  { bpo: "at_vestiaire_2c_caisson_haut", glb: "AT-VCH2-armoire-vestiaire-2-cases-caisson-haut",
    fabrique: vestiaire, params: { cases: 2, caisson: 450, support: "banc" },
    cat: "Vestiaires avec caisson haut", reference: "AT-VCH2 (déclinaison)",
    titre: "Armoire vestiaire 2 cases avec caisson haut",
    description: "Déclinaison à deux cases du modèle 07-00046, mêmes cotes de case, même caisson, même "
      + "piètement-banc. Référence à faire établir par le fabricant.", teinte: TEINTE_PHRASE },
  { bpo: "at_vestiaire_4c_caisson_haut", glb: "AT-VCH4-armoire-vestiaire-4-cases-caisson-haut",
    fabrique: vestiaire, params: { cases: 4, caisson: 450, support: "banc" },
    cat: "Vestiaires avec caisson haut", reference: "AT-VCH4 (déclinaison)",
    titre: "Armoire vestiaire 4 cases avec caisson haut",
    description: "Déclinaison à quatre cases du modèle 07-00046, mêmes cotes de case, même caisson, "
      + "même piètement-banc. Référence à faire établir par le fabricant.", teinte: TEINTE_PHRASE },
  { bpo: "at_vestiaire_ip_2c_pieds_gip2", glb: "GIP2-armoire-vestiaire-2-cases-sur-pieds",
    fabrique: vestiaire, params: { cases: 2, hauteurCorps: 1900, caisson: 0, support: "pieds" },
    cat: "Vestiaires industrie propre", reference: "GIP2 IC/S (catalogue, à confirmer)",
    titre: "Armoire vestiaire industrie propre 2 cases sur pieds",
    description: "Vestiaire industrie propre du catalogue anjoutolerie.fr : 2 cases, 2 050 × 800 × 500 "
      + "sur pieds, sans caisson. Même porte et même intérieur que le modèle du plan.", teinte: TEINTE_PHRASE },
  { bpo: "at_vestiaire_ip_3c_pieds_gip3", glb: "GIP3-armoire-vestiaire-3-cases-sur-pieds",
    fabrique: vestiaire, params: { cases: 3, hauteurCorps: 1900, caisson: 0, support: "pieds" },
    cat: "Vestiaires industrie propre", reference: "GIP3 IC/S (catalogue, à confirmer)",
    titre: "Armoire vestiaire industrie propre 3 cases sur pieds",
    description: "Vestiaire industrie propre du catalogue anjoutolerie.fr : 3 cases, 2 050 × 1 200 × 500 "
      + "sur pieds, sans caisson. Même porte et même intérieur que le modèle du plan.", teinte: TEINTE_PHRASE },
  /* INDUSTRIE SALISSANTE (AL, 12/10) : la gamme « 2 portes » — une case de 400
     coupée en deux, deux vantaux, sur pieds, 2 050 × 400/800/1 200 × 500. */
  ...[1, 2, 3].map((n) => ({
    bpo: `at_vestiaire_is_${n}c_2portes_s${n}`, glb: `S${n}-armoire-vestiaire-industrie-salissante-${n}-case${n > 1 ? "s" : ""}-2-portes`,
    fabrique: vestiaire, params: { cases: n, hauteurCorps: 1900, caisson: 0, support: "pieds", portesParCase: 2 },
    cat: "Vestiaires industrie salissante", reference: `S${n} DC/S (catalogue, à confirmer)`,
    titre: `Armoire vestiaire industrie salissante ${n} case${n > 1 ? "s" : ""} 2 portes`,
    description: `Vestiaire industrie salissante du catalogue anjoutolerie.fr : ${n} case${n > 1 ? "s" : ""} de 400 à deux `
      + "compartiments séparés par une cloison (vêtements de ville d'un côté, de travail de l'autre), deux portes de "
      + "180 par case à charnières extérieures et serrures au milieu, grille d'aération sur chaque porte, tablette "
      + `haute et une patère par compartiment ; 2 050 × ${n * 400} × 500 sur pieds.`, teinte: TEINTE_PHRASE })),
  /* LES BANCS SÉPARÉS (AL, 12/10) : le piètement du plan, seul — tubes carrés de
     30, quatre lattes de hêtre, 400 de haut, 400 de profondeur ; trois
     longueurs, pied médian à partir de 2 000. Références à faire établir. */
  ...[1000, 1500, 2000].map((Lg) => ({
    bpo: `at_banc_vestiaire_${Lg}`, glb: `AT-BV${Lg}-banc-vestiaire-${Lg}`,
    fabrique: banc, params: { longueur: Lg },
    cat: "Bancs", reference: `AT-BV${Lg} (déclinaison)`,
    titre: `Banc vestiaire ${Lg}`,
    description: `Banc vestiaire séparé, ${Lg} × 400, hauteur d'assise 400 : la construction du piètement du `
      + "modèle 07-00046 — cadre et pieds en tube carré de 30, quatre lattes de hêtre de 70 × 25"
      + (Lg > 1500 ? ", pieds médians" : "") + ". Référence à faire établir par le fabricant.", teinte: TEINTE_BANC })),
];

const phraseDims = (d) => {
  if (!d.corps) return `L ${d.largeur} × P ${d.profondeur} × H ${d.hauteur} mm`;
  const detail = [`corps ${d.corps}`, d.caisson ? `caisson ${d.caisson}` : null,
    d.pietement ? `piètement ${d.pietement}` : null].filter(Boolean).join(" + ");
  const sortie = d.sortie ? `, sortie d'air en plus (+${d.sortie})` : "";
  return `L ${d.largeur} × P ${d.profondeur} × H ${d.hauteur} mm (${detail}${sortie})`;
};

/* ------------------------------------------------------------------ *
 *  Empaquetage au format BPO, et sa relecture
 * ------------------------------------------------------------------ */
const hexVersRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function empaqueterBpo(racine) {
  racine.updateMatrixWorld(true);
  const parGroupe = new Map();   // nom de matière -> {pos, nrm, uv, idx}
  const n = new THREE.Vector3(), v = new THREE.Vector3(), nm = new THREE.Matrix3();
  racine.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry : o.geometry.toNonIndexed();
    const cle = o.material.name;
    if (!parGroupe.has(cle)) parGroupe.set(cle, { pos: [], nrm: [], uv: [], idx: [] });
    const G = parGroupe.get(cle);
    const base = G.pos.length / 3;
    const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
    nm.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
      n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      G.pos.push(v.x, v.y, v.z); G.nrm.push(n.x, n.y, n.z);
      G.uv.push(UV ? UV.getX(i) : 0, UV ? UV.getY(i) : 0);
    }
    const I = g.index;
    if (I) for (let i = 0; i < I.count; i++) G.idx.push(base + I.getX(i));
    else for (let i = 0; i < P.count; i++) G.idx.push(base + i);
  });
  const POS = [], NRM = [], UV = [], IDX = [], GMETA = [];
  for (const [cle, G] of parGroupe) {
    const base = POS.length / 3, start = IDX.length;
    POS.push(...G.pos); NRM.push(...G.nrm); UV.push(...G.uv);
    for (const i of G.idx) IDX.push(base + i);
    GMETA.push({ start, count: G.idx.length, name: NOMS_MATIERES[cle] || cle, col: hexVersRgb(TEINTES[cle]) });
  }
  const nv = POS.length / 3, nf = IDX.length / 3;
  let [minx, miny, minz, maxx, maxy, maxz] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++) {
    const X = POS[i * 3], Y = POS[i * 3 + 1], Z = POS[i * 3 + 2];
    if (X < minx) minx = X; if (X > maxx) maxx = X; if (Y < miny) miny = Y;
    if (Y > maxy) maxy = Y; if (Z < minz) minz = Z; if (Z > maxz) maxz = Z;
  }
  const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
  for (let i = 0; i < nv; i++) { POS[i * 3] -= cx; POS[i * 3 + 1] -= miny; POS[i * 3 + 2] -= cz; }
  const bb = [minx - cx, 0, minz - cz, maxx - cx, maxy - miny, maxz - cz];
  const dim = [maxx - minx, maxy - miny, maxz - minz].map((x) => +x.toFixed(3));
  const q = (x, lo, hi) => hi <= lo ? 0 : Math.max(0, Math.min(65535, Math.round((x - lo) / (hi - lo) * 65535)));
  const posb = new Uint8Array(nv * 6); const dv = new DataView(posb.buffer);
  for (let i = 0; i < nv; i++) {
    dv.setUint16(i * 6, q(POS[i * 3], bb[0], bb[3]), true);
    dv.setUint16(i * 6 + 2, q(POS[i * 3 + 1], bb[1], bb[4]), true);
    dv.setUint16(i * 6 + 4, q(POS[i * 3 + 2], bb[2], bb[5]), true);
  }
  const nrmb = new Int8Array(nv * 3);
  for (let i = 0; i < nv * 3; i++) nrmb[i] = Math.max(-127, Math.min(127, Math.round(NRM[i] * 127)));
  const uvb = new Uint8Array(nv * 8); const uvv = new DataView(uvb.buffer);
  for (let i = 0; i < nv * 2; i++) uvv.setFloat32(i * 4, UV[i], true);
  const idxb = new Uint8Array(IDX.length * 4); const iv = new DataView(idxb.buffer);
  for (let i = 0; i < IDX.length; i++) iv.setUint32(i * 4, IDX[i], true);
  const raw = Buffer.concat([Buffer.from(posb), Buffer.from(nrmb.buffer), Buffer.from(uvb), Buffer.from(idxb)]);
  const meta = { plen: posb.length, nlen: nrmb.length, uvlen: uvb.length, ilen: idxb.length,
                 bb: bb.map((x) => +x.toFixed(5)), nv, nf, dim };
  return { meta, geo: gzipSync(raw, { level: 9 }).toString("base64"), groups: GMETA, tex: {} };
}

/* La relecture, telle que previewLoad (admin.html) et app.html la font. Un
   bloc mal découpé ou une quantification à l'envers tombe ici. */
function relireBpo(D) {
  const raw = gunzipSync(Buffer.from(D.geo, "base64")), mt = D.meta;
  if (raw.length !== mt.plen + mt.nlen + mt.uvlen + mt.ilen) throw new Error("longueurs des blocs ≠ meta");
  const posQ = new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + mt.plen));
  const idx = new Uint32Array(raw.buffer.slice(raw.byteOffset + mt.plen + mt.nlen + mt.uvlen,
    raw.byteOffset + mt.plen + mt.nlen + mt.uvlen + mt.ilen));
  const bb = mt.bb, b = new THREE.Box3();
  for (let i = 0; i < mt.nv; i++) {
    b.expandByPoint(new THREE.Vector3(bb[0] + posQ[i * 3] / 65535 * (bb[3] - bb[0]),
      bb[1] + posQ[i * 3 + 1] / 65535 * (bb[4] - bb[1]), bb[2] + posQ[i * 3 + 2] / 65535 * (bb[5] - bb[2])));
  }
  let imax = 0; for (const i of idx) if (i > imax) imax = i;
  if (imax >= mt.nv) throw new Error(`indice ${imax} ≥ nv ${mt.nv}`);
  const fin = D.groups.reduce((m, g) => Math.max(m, g.start + g.count), 0);
  if (fin !== idx.length) throw new Error(`groupes couvrent ${fin} indices sur ${idx.length}`);
  return { taille: b.getSize(new THREE.Vector3()), solY: b.min.y, nf: idx.length / 3, groupes: D.groups.length };
}

/* Lire un data/<dir>/<id>.js tel qu'il est écrit : BPO_prod(id, {...}). */
function lireProduit(chemin) {
  let lu = null;
  new Function("BPO_prod", readFileSync(chemin, "utf8"))((id, o) => { lu = { id, ...o }; });
  if (!lu) throw new Error(`${chemin} : aucun appel BPO_prod`);
  return lu;
}

/* ------------------------------------------------------------------ *
 *  L'entrée de marque (FABRICANTS_DB) et les tailles (BPO_TAILLES)
 * ------------------------------------------------------------------ */
const MARQUE_DEBUT = "  /* ANJOU TÔLERIE";
const MARQUE_FIN = "  /* locked:true -> marque";   // l'entrée se place juste avant les marques verrouillées

const entreeFabricants = (fiches) => `  /* ANJOU TÔLERIE (12/10/2026) : vestiaires métalliques et bancs, objets établis d'après le plan
     technique 07-00046 du fabricant (tools/objets-anjou-tolerie.mjs — le régénérer réécrit CE bloc).
     Privée (compte) : objets réservés à l'agence tant que le fabricant n'a rien accordé.
     Pas de logo : rien reçu. Vignettes : data/${BPO_DIR}/thumbs/<id>.png */
  {id:'${BPO_DIR}', label:"Anjou Tôlerie", status:'ready', prive:'compte', dir:'${BPO_DIR}', logo:'', url:'https://anjoutolerie.fr', subs:[${
  fiches.map((p) => JSON.stringify({ id: p.bpo, label: p.titre, mesh: true, cat: p.cat,
    categorie: `${p.titre.startsWith("Banc") ? "Banc vestiaire" : "Armoire vestiaire"} — réf. ${p.reference}`,
    description: `${p.description} ${p.dimensions}. ${p.teinte}` })).join(",")}]},
`;

function poserEntreeFabricants(fiches) {
  let s = readFileSync(FABRICANTS, "utf8");
  const e = entreeFabricants(fiches);
  const a = s.indexOf(MARQUE_DEBUT), b = s.indexOf(MARQUE_FIN);
  if (b < 0) throw new Error(`data/fabricants.js : repère « ${MARQUE_FIN.trim()} » introuvable`);
  s = a >= 0 && a < b ? s.slice(0, a) + e + s.slice(b) : s.slice(0, b) + e + s.slice(b);
  /* La preuve avant l'écriture : le fichier doit encore s'évaluer, et porter
     la marque avec tous ses produits. */
  const DB = new Function(s + ";return FABRICANTS_DB")();
  const at = DB.find((f) => f.id === BPO_DIR);
  if (!at || at.subs.length !== fiches.length) throw new Error("data/fabricants.js : l'entrée relue ne porte pas tous les produits");
  const ids = new Set();
  for (const f of DB) for (const p of f.subs || []) { if (ids.has(p.id)) throw new Error(`identifiant en double : ${p.id}`); ids.add(p.id); }
  writeFileSync(FABRICANTS, s);
  return DB.length;
}

/* BPO_TAILLES : la taille NON compressée de chaque paquet, pour la jauge de
   chargement (data/tailles.js est généré ailleurs par tailles.py ; ici on
   ne touche qu'aux clés de cette marque, et on garde l'ordre trié). */
function poserTailles() {
  let s = readFileSync(TAILLES, "utf8");
  const i = s.indexOf("var BPO_TAILLES="), j = s.indexOf("}", i) + 1;
  const T = JSON.parse(s.slice(i + "var BPO_TAILLES=".length, j));
  for (const k of Object.keys(T)) if (k.startsWith(BPO_DIR + "/")) delete T[k];
  for (const f of readdirSync(DATA).filter((x) => x.endsWith(".js")).sort()) {
    T[`${BPO_DIR}/${f.slice(0, -3)}`] = statSync(join(DATA, f)).size;
  }
  const trie = Object.fromEntries(Object.entries(T).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeFileSync(TAILLES, s.slice(0, i) + "var BPO_TAILLES=" + JSON.stringify(trie) + s.slice(j));
  return Object.keys(trie).length;
}

/* ------------------------------------------------------------------ *
 *  Les trois modes
 * ------------------------------------------------------------------ */
async function fabriquer() {
  mkdirSync(THUMBS, { recursive: true });
  mkdirSync(SORTIE, { recursive: true });
  const exporteur = new GLTFExporter();
  const fiches = [];
  let fautes = 0;
  for (const e of CATALOGUE) {
    const { racine, dims } = e.fabrique(e.params);
    const D = empaqueterBpo(racine);
    const texte = `BPO_prod(${JSON.stringify(e.bpo)},${JSON.stringify(D)});\n`;
    writeFileSync(join(DATA, `${e.bpo}.js`), texte);
    const r = relireBpo(D);
    const attendu = [dims.largeur, dims.hauteur + dims.sortie, dims.profondeur].map((x) => x / 1000);
    const ecart = Math.max(...attendu.map((a, i) => Math.abs(a - [r.taille.x, r.taille.y, r.taille.z][i])));
    const ok = r.solY < 1e-6 && ecart < 0.03;
    if (!ok) fautes++;
    console.log(`${ok ? "ok " : "KO "} ${e.bpo}.js  ${D.meta.nv} sommets, ${D.meta.nf} faces, ${D.groups.length} matières, `
      + `${(texte.length / 1024).toFixed(0)} Ko — relu ${r.taille.x.toFixed(3)} × ${r.taille.y.toFixed(3)} × ${r.taille.z.toFixed(3)} m`
      + (ok ? "" : `  (attendu ${attendu.map((x) => x.toFixed(3)).join(" × ")})`));
    /* Le .glb intermédiaire, pour le banc de vignettes seulement. */
    const scene = new THREE.Scene(); scene.name = e.titre; scene.add(racine);
    scene.userData = { fabricant: "Anjou Tôlerie", reference: e.reference, titre: e.titre, dimensions: phraseDims(dims) };
    writeFileSync(join(SORTIE, `${e.glb}.glb`), Buffer.from(await exporteur.parseAsync(scene, { binary: true })));
    fiches.push({ ...e, dimensions: phraseDims(dims) });
  }
  if (fautes) { console.error(`${fautes} objet(s) hors cote — rien d'autre n'est écrit`); process.exit(1); }
  const marques = poserEntreeFabricants(fiches);
  const tailles = poserTailles();
  writeFileSync(join(SORTIE, "fabricants-entree.js"), entreeFabricants(fiches));
  console.log(`${fiches.length} objets dans data/${BPO_DIR}/ ; data/fabricants.js : ${marques} marques ; data/tailles.js : ${tailles} paquets`);
}

function verifier() {
  const DB = new Function(readFileSync(FABRICANTS, "utf8") + ";return FABRICANTS_DB")();
  const at = DB.find((f) => f.id === BPO_DIR);
  if (!at) { console.error("data/fabricants.js : la marque n'y est pas"); process.exit(1); }
  const T = new Function(readFileSync(TAILLES, "utf8") + ";return BPO_TAILLES")();
  let fautes = 0;
  for (const p of at.subs) {
    const chemin = join(DATA, `${p.id}.js`);
    try {
      const D = lireProduit(chemin);
      if (D.id !== p.id) throw new Error(`BPO_prod(${D.id}) dans ${p.id}.js`);
      const r = relireBpo(D);
      const vignette = existsSync(join(THUMBS, `${p.id}.png`));
      const taille = T[`${BPO_DIR}/${p.id}`] === statSync(chemin).size;
      const ok = !r.taille.equals(new THREE.Vector3()) && r.solY < 1e-6 && vignette && taille;
      if (!ok) fautes++;
      console.log(`${ok ? "ok " : "KO "} ${p.id}  ${r.nf} faces, ${r.groupes} matières, ${r.taille.x.toFixed(3)} × ${r.taille.y.toFixed(3)} × ${r.taille.z.toFixed(3)} m`
        + `${vignette ? "" : "  SANS VIGNETTE"}${taille ? "" : "  TAILLE FAUSSE dans data/tailles.js"}  « ${p.cat} »`);
    } catch (e) { fautes++; console.log(`KO  ${p.id}  ${e.message}`); }
  }
  if (fautes) { console.error(`${fautes} produit(s) en défaut`); process.exit(1); }
  console.log(`${at.subs.length} produits relus, la marque est ${at.prive === "compte" ? "privée (compte)" : "PUBLIQUE"}`);
}

/* --vignettes : une image de chaque objet, peinte par tools/banc-objet-glb.html
   dans un Chromium sans tête, fond transparent, recadrée sur la boîte
   englobante, 96 px avec 7 % de marge — la recette des vignettes Haworth,
   Ragni et Flos. Il faut playwright (npm i -D playwright, puis npx playwright
   install chromium) et le serveur du dépôt : python -m http.server 8857 à la
   racine (ou BANC_URL=http://…). Ni l'un ni l'autre n'entrent dans package.json. */
async function vignettes() {
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { console.error("playwright absent : npm i -D playwright && npx playwright install chromium"); process.exit(2); }
  const base = process.env.BANC_URL || "http://127.0.0.1:8857";
  try { await fetch(base + "/tools/banc-objet-glb.html"); }
  catch { console.error(`rien ne répond sur ${base} : python -m http.server 8857 à la racine du dépôt`); process.exit(2); }
  mkdirSync(THUMBS, { recursive: true });
  const navigateur = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await navigateur.newPage({ viewport: { width: 900, height: 900 } });
  for (const e of CATALOGUE) {
    if (!existsSync(join(SORTIE, `${e.glb}.glb`))) { console.error(`${e.glb}.glb absent de tools/sortie/ : lancer d'abord le mode par défaut`); process.exit(1); }
    await page.goto(`${base}/tools/banc-objet-glb.html?glb=/tools/sortie/${e.glb}.glb&l=900&h=900&fond=0`);
    await page.waitForFunction(() => window.pret !== false, null, { timeout: 60_000 });
    if (await page.evaluate(() => window.pret) !== true) {
      console.error(`KO ${e.bpo} : ${await page.evaluate(() => document.getElementById("journal").textContent)}`); process.exit(1);
    }
    const dataUrl = await page.evaluate(() => {
      const src = document.querySelector("canvas");
      const ctx = document.createElement("canvas"); ctx.width = src.width; ctx.height = src.height;
      const c2 = ctx.getContext("2d"); c2.drawImage(src, 0, 0);
      const px = c2.getImageData(0, 0, ctx.width, ctx.height).data;
      let x0 = ctx.width, y0 = ctx.height, x1 = 0, y1 = 0;
      for (let y = 0; y < ctx.height; y++) for (let x = 0; x < ctx.width; x++) {
        if (px[(y * ctx.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      const cote = Math.max(x1 - x0, y1 - y0) * 1.07, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const out = document.createElement("canvas"); out.width = 96; out.height = 96;
      out.getContext("2d").drawImage(ctx, cx - cote / 2, cy - cote / 2, cote, cote, 0, 0, 96, 96);
      return out.toDataURL("image/png");
    });
    writeFileSync(join(THUMBS, `${e.bpo}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
    console.log(`ok  thumbs/${e.bpo}.png`);
  }
  await navigateur.close();
}

if (process.argv.includes("--verifier")) verifier();
else if (process.argv.includes("--vignettes")) await vignettes();
else await fabriquer();
