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
 * LA GÉOMÉTRIE EST CELLE DU CONFIGURATEUR DE L'APPLICATION : bpo-brisesoleil.js
 * (produit procédural proc:'brisesoleil' de la marque, qui déploie les mêmes
 * brise-soleil en longueur et en hauteur par curseurs) expose `geometrie(P)`,
 * pure ; ce générateur l'appelle sous Node pour les 27 tailles figées (trois
 * sections × trois poses × trois longueurs) et ajoute à la marque les trois
 * fiches du configurateur (une par pose, proc + set). Une seule source.
 * Le format BPO, l'empaquetage, la relecture, l'entrée de marque, les tailles
 * et les vignettes sont dans tools/bpo-catalogue.mjs. Mètres, Y vers le haut,
 * façade à l'arrière (−Z), extérieur vers +Z.
 */
import * as THREE from "three";
import { writeFileSync, mkdirSync, copyFileSync } from "fs";
import { join } from "path";
import { atelier, fabriquerObjets, verifierMarque, peindreVignettes, poserEntreeFabricants, poserTailles, SORTIE, RACINE } from "./bpo-catalogue.mjs";

const BPO_DIR = "tellier";                              // FABRICANTS_DB[].dir et data/<dir>/
const THUMBS = join(RACINE, "data", BPO_DIR, "thumbs");
const URL_PAGE = "https://www.tellierbrisesoleil.com/protection-solaire/brise-soleil-fixes/lames-ailes-avion/";

/* ------------------------------------------------------------------ *
 *  LA GÉOMÉTRIE VIENT DU CONFIGURATEUR DE L'APPLICATION (bpo-brisesoleil.js,
 *  le produit procédural proc:'brisesoleil' de la marque) : sa fonction
 *  `geometrie(P)` est pure — des faces {verts, n, vn, key} en mètres — et
 *  sert ici sous Node pour fabriquer les tailles figées. UNE source : ce que
 *  l'architecte déploie par curseurs et ce que le catalogue porte en objets
 *  maillés sont la même construction. Les sections du site (largeur ×
 *  épaisseur, poids, portées) sont dans BS.SECTIONS.
 * ------------------------------------------------------------------ */
import { createRequire } from "module";
const BS = createRequire(import.meta.url)("../bpo-brisesoleil.js");
const SECTIONS = Object.fromEntries(BS.SECTIONS.map((s) => [s.id, { largeur: s.l, epaisseur: s.e, poids: s.poids, couchee: s.couchee, debout: s.debout,
  portees: s.id === "AS300x52" ? "portée maximale 3 740 mm (fiche produit, calcul à 1 050 Pa ; brochure 2025 : 4 770 / 5 050 mm)"
    : `portées ${s.couchee.toLocaleString("fr-FR")} mm lame couchée / ${s.debout.toLocaleString("fr-FR")} mm lame debout` }]));

/* Teintes : aluminium thermolaqué. Le site liste les finitions sans en
   imposer une ; rendu lames RAL 9006 aluminium blanc, flasques et consoles
   RAL 9007 aluminium gris, fixations zinguées — À CONFIRMER, la fiche le dit.
   Les clés (bsLame, bsFlasque, bsFix) sont celles des finitions par élément
   du configurateur ; les teintes aussi (BS.TEINTES). */
const hex = (rgb) => "#" + rgb.map((x) => x.toString(16).padStart(2, "0")).join("");
const MATIERES = Object.freeze({
  bsLame:    { nom: "Lames aluminium extrudé 6060 T6 thermolaqué", teinte: hex(BS.TEINTES.bsLame),    metalness: 0.5, roughness: 0.45 },
  bsFlasque: { nom: "Flasques et consoles aluminium",              teinte: hex(BS.TEINTES.bsFlasque), metalness: 0.5, roughness: 0.5 },
  bsFix:     { nom: "Fixations (platines, visserie)",              teinte: hex(BS.TEINTES.bsFix),     metalness: 0.4, roughness: 0.55 },
});
const { materiau } = atelier(MATIERES);
const INCLINAISON = BS.PBS.incl;   // 30° — position SpeedFix (à confirmer)

/* Les faces du configurateur → une scène three.js (un maillage par matière),
   triangles non indexés, normales lissées quand la face en porte (vn), UV
   projetées sur le plan dominant de la face (en mètres). Les objets figés sont
   posés au sol : hPose = 0, le reste aux valeurs par défaut du configurateur
   (pas = largeur de lame, 30°, appuis selon la portée, retrait 100). */
function fabrique({ pose, section, longueur }) {
  const P = { ...BS.PBS, pose, section, L: longueur / 10, H: 220, P: 120, hPose: 0, hBas: 0, pasAuto: 1, incl: INCLINAISON, appuisAuto: 1, retrait: 10, platines: 1, designation: "" };
  const { faces, D } = BS.geometrie(P);
  const parCle = new Map();
  for (const f of faces) {
    if (!parCle.has(f.key)) parCle.set(f.key, { pos: [], nrm: [], uv: [] });
    const G = parCle.get(f.key), n = f.n, ax = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2;
    const uv = (v) => ax === 0 ? [v[2], v[1]] : ax === 1 ? [v[0], v[2]] : [v[0], v[1]];
    /* three.js veut le sens direct (antihoraire vu de l'extérieur) ; le moteur
       BPO parcourt ses faces en sens horaire : on oriente chaque triangle par la
       normale de la face (produit mixte), quel que soit le sens d'origine. */
    const tri = (a, b, c) => {
      const A = f.verts[a], B = f.verts[b], C = f.verts[c];
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], wx = C[0] - A[0], wy = C[1] - A[1], wz = C[2] - A[2];
      const direct = (uy * wz - uz * wy) * n[0] + (uz * wx - ux * wz) * n[1] + (ux * wy - uy * wx) * n[2] >= 0;
      for (const i of direct ? [a, b, c] : [a, c, b]) {
        const v = f.verts[i], vn = f.vn ? f.vn[i] : n;
        G.pos.push(v[0], v[1], v[2]); G.nrm.push(vn[0], vn[1], vn[2]); G.uv.push(...uv(v));
      }
    };
    tri(0, 1, 2); if (f.verts.length === 4) tri(0, 2, 3);
  }
  const racine = new THREE.Group();
  racine.name = { casquette: "Brise-soleil horizontal", couche: "Brise-soleil vertical lames couchées", debout: "Brise-soleil vertical lames debout" }[pose];
  for (const [cle, G] of parCle) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(G.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(G.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(G.uv, 2));
    const m = new THREE.Mesh(g, materiau(cle)); m.name = MATIERES[cle].nom; racine.add(m);
  }
  const bb = new THREE.Box3().setFromObject(racine), taille = bb.getSize(new THREE.Vector3());
  const dims = { largeur: Math.round(taille.x * 1000), profondeur: Math.round(taille.z * 1000), hauteur: Math.round(taille.y * 1000),
    lames: D.nL, appuis: D.nAppuis, pas: Math.round(D.pas * 1000), inclinaison: D.incl, consoles: D.nConsoles };
  return { racine, dims };
}

/* ------------------------------------------------------------------ *
 *  Le catalogue : 3 sections × 3 poses × 3 longueurs
 * ------------------------------------------------------------------ */
const LONGUEURS = [2000, 3000, 4000];
const SECTIONS_FIGEES = ["AS200x36", "AS300x52", "AS400x68"];   // les tailles figées ; les dix autres sections, par le configurateur
const FINITION = "Finitions du site : thermolaquage RAL 60-80 µm, aspect bois ou anodisation 20 µm (rendu : lames RAL 9006, "
  + "flasques RAL 9007 — à confirmer).";
const SUPPOSE = `Pas des lames pris égal à leur largeur et inclinaison ${INCLINAISON}° (position SpeedFix) : à confirmer, le site ne `
  + "chiffre pas l'entraxe ; flasques et consoles rendues en plat de 10 mm, « dimensionnées selon étude » chez le fabricant.";
const fiche = (sec) => `Lame AZUR ${sec} : section ${SECTIONS[sec].largeur} × ${SECTIONS[sec].epaisseur} mm, aluminium 6060 T6 extrudé `
  + `monobloc, forme ovoïde type aile d'avion, ${SECTIONS[sec].poids} g/ml, ${SECTIONS[sec].portees} (fiche fabricant, charges FT n°45).`;

const POSES = {
  casquette: { cat: "Brise-soleil fixes — lames ailes d'avion AZUR — horizontal (casquette)", code: "h",
    titre: (sec, L) => `Brise-soleil horizontal AZUR ${sec} — casquette L ${L}`,
    texte: (d) => `Casquette au-dessus d'une baie : ${d.lames} lames couchées parallèles à la façade sur ${d.appuis} consoles en `
      + `porte-à-faux à platine murale, débord ${d.profondeur}, longueur ${d.largeur}. Posée au sol dans BPO : à relever à la hauteur du linteau.` },
  couche: { cat: "Brise-soleil fixes — lames ailes d'avion AZUR — vertical lames couchées", code: "vc",
    titre: (sec, L) => `Brise-soleil vertical AZUR ${sec} — lames couchées L ${L}`,
    texte: (d) => `Écran devant une baie : ${d.lames} lames horizontales entre ${d.appuis} flasques verticales tenues à la façade par des `
      + `consoles haut et bas, hauteur ${d.hauteur}, longueur ${d.largeur}, à 100 mm du nu de façade (à confirmer).` },
  debout: { cat: "Brise-soleil fixes — lames ailes d'avion AZUR — vertical lames debout", code: "vd",
    titre: (sec, L) => `Brise-soleil vertical AZUR ${sec} — lames debout L ${L}`,
    texte: (d) => `Écran devant une baie : ${d.lames} lames verticales entre deux flasques horizontales (haut et bas) tenues à la façade `
      + `par ${d.consoles} consoles, corde à ${d.inclinaison}° du plan de façade, hauteur ${d.hauteur}, longueur ${d.largeur}, à 100 mm du nu de façade (à confirmer).` },
};

const CATALOGUE = [];
for (const [pose, p] of Object.entries(POSES)) {
  for (const sec of SECTIONS_FIGEES) {
    for (const L of LONGUEURS) {
      CATALOGUE.push({
        bpo: `tl_azur_${sec.toLowerCase()}_${p.code}_${L}`, glb: `TL-AZUR-${sec}-${p.code}-${L}`,
        fabrique, params: { pose, section: sec, longueur: L }, pose,
        cat: p.cat, reference: `AZUR ${sec}`, section: sec, longueur: L,
        titre: p.titre(sec, L), azimut: pose === "casquette" ? 35 : 25,
      });
    }
  }
}

/* LE CONFIGURATEUR (bpo-brisesoleil.js, mode procédural 'brisesoleil') : trois
   fiches, une par pose, qui ouvrent le même configurateur avec `set` — comme
   les ponts Verlinde. `set` ne porte QUE la pose : l'application le rejoue à
   chaque retour dans la marque, il écraserait tout autre réglage. Pas de maillage : la géométrie se calcule dans
   l'application. Vignettes : une taille figée de la même pose. */
const CONFIGURATEURS = [
  { id: "tl_azur_configurateur_casquette", pose: "casquette", set: { pose: "casquette" }, vignette: "tl_azur_as300x52_h_3000",
    label: "Configurateur AZUR — brise-soleil horizontal (casquette)",
    texte: "Casquette au-dessus d'une baie : consoles en porte-à-faux à platine murale portant des lames couchées inclinées vers l'extérieur. "
      + "Réglez la section de lame, la longueur, le débord, la hauteur de pose, l'entraxe, l'inclinaison et les appuis." },
  { id: "tl_azur_configurateur_couche", pose: "couche", set: { pose: "couche" }, vignette: "tl_azur_as200x36_vc_2000",
    label: "Configurateur AZUR — brise-soleil vertical, lames couchées",
    texte: "Écran devant une baie : lames horizontales inclinées entre flasques verticales tenues à la façade par des consoles. "
      + "Réglez la section de lame, la longueur, la hauteur, le retrait, l'entraxe, l'inclinaison et les appuis." },
  { id: "tl_azur_configurateur_debout", pose: "debout", set: { pose: "debout" }, vignette: "tl_azur_as400x68_vd_3000",
    label: "Configurateur AZUR — brise-soleil vertical, lames debout",
    texte: "Écran devant une baie : lames verticales entre deux flasques horizontales tenues à la façade par des consoles. "
      + "Réglez la section de lame, la longueur, la hauteur, le retrait, l'entraxe et l'orientation des lames." },
];
const CAT_CONFIG = "Brise-soleil fixes — lames ailes d'avion AZUR — configurateur (longueur × hauteur)";
const ficheConfigurateur = (c) => ({ id: c.id, label: c.label, proc: "brisesoleil", thumb: 1, set: c.set, cat: CAT_CONFIG,
  categorie: "Brise-soleil fixe sur mesure — gamme AZUR",
  description: `${c.texte} Lames AZUR du site (13 sections de 70 à 600 mm, aluminium 6060 T6 extrudé, portées de la fiche par section) ; `
    + "pas des lames, inclinaison et flasques à confirmer avec le fabricant. " + FINITION });

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
    description: `${POSES[p.pose].texte(p.dims)} ${fiche(p.section)} ${p.dimensions}. ${SUPPOSE} ${FINITION}` }))
    .concat(CONFIGURATEURS.map((c) => JSON.stringify(ficheConfigurateur(c)))).join(",")}]},
`;

async function fabriquer() {
  const fiches = await fabriquerObjets({ catalogue: CATALOGUE, dir: BPO_DIR, fabricant: "Tellier Brise-Soleil", matieres: MATIERES,
    cotes: (d) => [d.largeur, d.hauteur, d.profondeur], phraseDims });
  for (const c of CONFIGURATEURS) copyFileSync(join(THUMBS, `${c.vignette}.png`), join(THUMBS, `${c.id}.png`));
  const marques = poserEntreeFabricants({ debut: MARQUE_DEBUT, entree: entreeFabricants(fiches), id: BPO_DIR, nb: fiches.length + CONFIGURATEURS.length });
  const tailles = poserTailles(BPO_DIR);
  mkdirSync(SORTIE, { recursive: true });
  writeFileSync(join(SORTIE, "fabricants-entree-tellier.js"), entreeFabricants(fiches));
  console.log(`${fiches.length} objets dans data/${BPO_DIR}/ ; data/fabricants.js : ${marques} marques ; data/tailles.js : ${tailles} paquets`);
}

if (process.argv.includes("--verifier")) verifierMarque(BPO_DIR);
else if (process.argv.includes("--vignettes")) await peindreVignettes({ catalogue: CATALOGUE, dir: BPO_DIR });
else await fabriquer();
