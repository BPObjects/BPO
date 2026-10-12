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
 * LE FORMAT BPO, l'empaquetage, la relecture, l'entrée de marque, les tailles
 * et les vignettes sont dans tools/bpo-catalogue.mjs, le commun de tous les
 * générateurs de catalogue. Mètres, Y vers le haut, portes vers +Z. Les .glb
 * de tools/sortie/ ne servent qu'au banc de vignettes ; ils ne sont pas
 * versionnés.
 */
import * as THREE from "three";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { atelier, fabriquerObjets, verifierMarque, peindreVignettes, poserEntreeFabricants, poserTailles, SORTIE } from "./bpo-catalogue.mjs";

const BPO_DIR = "anjou_tolerie";                       // FABRICANTS_DB[].dir et data/<dir>/

/* ------------------------------------------------------------------ *
 *  Cotes en millimètres, maillage en mètres
 * ------------------------------------------------------------------ */
const MM = 1 / 1000;           // cotes en millimètres, maillage en mètres
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
const MATIERES = Object.fromEntries(Object.keys(TEINTES).map((k) => [k, { nom: NOMS_MATIERES[k], teinte: TEINTES[k],
  metalness: k === "latte" ? 0 : 0.35, roughness: k === "latte" ? 0.7 : 0.5 }]));
const { boite, cylindre } = atelier(MATIERES);

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
 *  L'entrée de marque (FABRICANTS_DB) et les tailles (BPO_TAILLES)
 * ------------------------------------------------------------------ */
const MARQUE_DEBUT = "  /* ANJOU TÔLERIE";                // le bloc que ce générateur réécrit dans data/fabricants.js

const entreeFabricants = (fiches) => `  /* ANJOU TÔLERIE (12/10/2026) : vestiaires métalliques et bancs, objets établis d'après le plan
     technique 07-00046 du fabricant (tools/objets-anjou-tolerie.mjs — le régénérer réécrit CE bloc).
     Privée (compte) : objets réservés à l'agence tant que le fabricant n'a rien accordé.
     Pas de logo : rien reçu. Vignettes : data/${BPO_DIR}/thumbs/<id>.png */
  {id:'${BPO_DIR}', label:"Anjou Tôlerie", status:'ready', prive:'compte', dir:'${BPO_DIR}', logo:'', url:'https://anjoutolerie.fr', subs:[${
  fiches.map((p) => JSON.stringify({ id: p.bpo, label: p.titre, mesh: true, cat: p.cat,
    categorie: `${p.titre.startsWith("Banc") ? "Banc vestiaire" : "Armoire vestiaire"} — réf. ${p.reference}`,
    description: `${p.description} ${p.dimensions}. ${p.teinte}` })).join(",")}]},
`;

/* ------------------------------------------------------------------ *
 *  Les trois modes (le travail est dans bpo-catalogue.mjs)
 * ------------------------------------------------------------------ */
async function fabriquer() {
  const fiches = await fabriquerObjets({ catalogue: CATALOGUE, dir: BPO_DIR, fabricant: "Anjou Tôlerie", matieres: MATIERES,
    cotes: (d) => [d.largeur, d.hauteur + d.sortie, d.profondeur], phraseDims });
  const marques = poserEntreeFabricants({ debut: MARQUE_DEBUT, entree: entreeFabricants(fiches), id: BPO_DIR, nb: fiches.length });
  const tailles = poserTailles(BPO_DIR);
  mkdirSync(SORTIE, { recursive: true });
  writeFileSync(join(SORTIE, "fabricants-entree.js"), entreeFabricants(fiches));
  console.log(`${fiches.length} objets dans data/${BPO_DIR}/ ; data/fabricants.js : ${marques} marques ; data/tailles.js : ${tailles} paquets`);
}

if (process.argv.includes("--verifier")) verifierMarque(BPO_DIR);
else if (process.argv.includes("--vignettes")) await peindreVignettes({ catalogue: CATALOGUE, dir: BPO_DIR });
else await fabriquer();
