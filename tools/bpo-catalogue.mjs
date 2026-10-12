/* tools/bpo-catalogue.mjs — le COMMUN des générateurs de catalogue (Anjou
 * Tôlerie, Tellier Brise-Soleil…) : construire une scène three.js cote après
 * cote, l'empaqueter au format BPO, la relire comme app.html, poser l'entrée
 * de marque dans data/fabricants.js, les tailles dans data/tailles.js, et
 * peindre les vignettes. Chaque générateur garde pour lui ses cotes, ses
 * matières et son catalogue ; rien d'ici n'entre dans app.html.
 *
 * LE FORMAT BPO, relu dans admin.html (packMesh / previewLoad) :
 *   · positions uint16 quantifiées dans meta.bb [minx, 0, minz, maxx, maxy,
 *     maxz], objet centré en X et Z, posé au sol ; normales int8 (×127) ;
 *     UV float32 ; indices uint32 ; le tout concaténé, gzip, base64 → geo ;
 *     meta.{plen,nlen,uvlen,ilen} sont les longueurs en octets de chaque bloc,
 *     nv/nf les comptes, dim les cotes en mètres ;
 *   · groups[] : un par matière, {start, count, name, col:[r,g,b] 0-255} —
 *     app.html applique ses finitions par groupe, d'où un NOM lisible ;
 *   · tex : {} — pas de texture, la teinte suffit.
 *   Mètres, Y vers le haut, face avant vers +Z.
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

export const ICI = dirname(fileURLToPath(import.meta.url));
export const RACINE = resolve(ICI, "..");
export const SORTIE = join(ICI, "sortie");                    // .glb intermédiaires, non versionnés
export const FABRICANTS = join(RACINE, "data", "fabricants.js");
export const TAILLES = join(RACINE, "data", "tailles.js");
export const MARQUE_FIN = "  /* locked:true -> marque";       // les entrées se placent juste avant les marques verrouillées
export const MM = 1 / 1000;

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
 *  L'atelier : des primitives cotées en millimètres, maillées en mètres.
 *  `matieres` : { cle: { nom, teinte:"#rrggbb", metalness?, roughness? } } —
 *  la clé est le nom du matériau three (c'est elle qui regroupe à
 *  l'empaquetage), nom et teinte deviennent le groupe BPO.
 * ------------------------------------------------------------------ */
export function atelier(matieres) {
  const materiaux = {};
  const materiau = (cle) => {
    const m = matieres[cle];
    if (!m) throw new Error(`matière inconnue : ${cle}`);
    return materiaux[cle] ??= new THREE.MeshStandardMaterial({
      color: new THREE.Color(m.teinte), metalness: m.metalness ?? 0.35, roughness: m.roughness ?? 0.5, name: cle,
    });
  };
  /* Une boîte posée par sa base : (largeur X, hauteur Y, profondeur Z), centre
     en X et Z, `yBas` au bas. */
  const boite = (racine, nom, mat, l, h, p, { x = 0, yBas = 0, z = 0 } = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(l * MM, h * MM, p * MM), materiau(mat));
    m.position.set(x * MM, (yBas + h / 2) * MM, z * MM);
    m.name = nom;
    racine.add(m);
    return m;
  };
  const cylindre = (racine, nom, mat, rayon, h, { x = 0, yBas = 0, z = 0 } = {}) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rayon * MM, rayon * MM, h * MM, 32), materiau(mat));
    m.position.set(x * MM, (yBas + h / 2) * MM, z * MM);
    m.name = nom;
    racine.add(m);
    return m;
  };
  return { materiau, boite, cylindre };
}

/* ------------------------------------------------------------------ *
 *  Empaquetage au format BPO, et sa relecture
 * ------------------------------------------------------------------ */
const hexVersRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export function empaqueterBpo(racine, matieres) {
  racine.updateMatrixWorld(true);
  const parGroupe = new Map();   // nom de matière -> {pos, nrm, uv, idx}
  const n = new THREE.Vector3(), v = new THREE.Vector3(), nm = new THREE.Matrix3();
  racine.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;                       // indexée ou non, les deux cas sont lus plus bas
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
    GMETA.push({ start, count: G.idx.length, name: matieres[cle]?.nom || cle, col: hexVersRgb(matieres[cle].teinte) });
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
export function relireBpo(D) {
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
export function lireProduit(chemin) {
  let lu = null;
  new Function("BPO_prod", readFileSync(chemin, "utf8"))((id, o) => { lu = { id, ...o }; });
  if (!lu) throw new Error(`${chemin} : aucun appel BPO_prod`);
  return lu;
}

/* ------------------------------------------------------------------ *
 *  L'entrée de marque (FABRICANTS_DB) et les tailles (BPO_TAILLES)
 * ------------------------------------------------------------------ */
/* Remplace (ou insère avant les marques verrouillées) le bloc qui commence par
   `debut`, puis prouve que le fichier s'évalue encore, porte la marque `id`
   avec `nb` produits, et qu'aucun identifiant n'est en double sur TOUT le
   catalogue. */
export function poserEntreeFabricants({ debut, entree, id, nb }) {
  let s = readFileSync(FABRICANTS, "utf8");
  const a = s.indexOf(debut), b = s.indexOf(MARQUE_FIN);
  if (b < 0) throw new Error(`data/fabricants.js : repère « ${MARQUE_FIN.trim()} » introuvable`);
  if (a >= 0 && a < b) {
    /* le bloc existe : du commentaire d'en-tête à la fin de la ligne {id:'<dir>', …} — et
       rien de plus, d'autres marques générées peuvent suivre avant le repère */
    const l = s.indexOf(`  {id:'${id}'`, a);
    if (l < 0 || l > b) throw new Error(`data/fabricants.js : bloc « ${debut.trim()} » sans ligne {id:'${id}'}`);
    s = s.slice(0, a) + entree + s.slice(s.indexOf("\n", l) + 1);
  } else s = s.slice(0, b) + entree + s.slice(b);
  const DB = new Function(s + ";return FABRICANTS_DB")();
  const m = DB.find((f) => f.id === id);
  if (!m || m.subs.length !== nb) throw new Error("data/fabricants.js : l'entrée relue ne porte pas tous les produits");
  const ids = new Set();
  for (const f of DB) for (const p of f.subs || []) { if (ids.has(p.id)) throw new Error(`identifiant en double : ${p.id}`); ids.add(p.id); }
  writeFileSync(FABRICANTS, s);
  return DB.length;
}

/* BPO_TAILLES : la taille NON compressée de chaque paquet, pour la jauge de
   chargement (data/tailles.js est généré ailleurs par tailles.py ; ici on
   ne touche qu'aux clés de cette marque, et on garde l'ordre trié). */
export function poserTailles(dir) {
  const DATA = join(RACINE, "data", dir);
  let s = readFileSync(TAILLES, "utf8");
  const i = s.indexOf("var BPO_TAILLES="), j = s.indexOf("}", i) + 1;
  const T = JSON.parse(s.slice(i + "var BPO_TAILLES=".length, j));
  for (const k of Object.keys(T)) if (k.startsWith(dir + "/")) delete T[k];
  for (const f of readdirSync(DATA).filter((x) => x.endsWith(".js")).sort()) {
    T[`${dir}/${f.slice(0, -3)}`] = statSync(join(DATA, f)).size;
  }
  const trie = Object.fromEntries(Object.entries(T).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeFileSync(TAILLES, s.slice(0, i) + "var BPO_TAILLES=" + JSON.stringify(trie) + s.slice(j));
  return Object.keys(trie).length;
}

/* ------------------------------------------------------------------ *
 *  Les trois modes, pour un catalogue [{bpo, glb, titre, reference, fabrique, params, …}]
 * ------------------------------------------------------------------ */
/* Fabrique chaque objet : data/<dir>/<id>.js, relecture et contrôle des cotes
   (`cotes(dims)` → [x, y, z] attendus en mm, tolérance 30 mm), .glb dans
   tools/sortie/ pour les vignettes. Rend les fiches enrichies de `dimensions`
   (phraseDims(dims)) ; n'écrit rien d'autre si un objet est hors cote. */
export async function fabriquerObjets({ catalogue, dir, fabricant, matieres, cotes, phraseDims }) {
  const DATA = join(RACINE, "data", dir);
  mkdirSync(join(DATA, "thumbs"), { recursive: true });
  mkdirSync(SORTIE, { recursive: true });
  const exporteur = new GLTFExporter();
  const fiches = [];
  let fautes = 0;
  for (const e of catalogue) {
    const { racine, dims } = e.fabrique(e.params);
    const D = empaqueterBpo(racine, matieres);
    const texte = `BPO_prod(${JSON.stringify(e.bpo)},${JSON.stringify(D)});\n`;
    writeFileSync(join(DATA, `${e.bpo}.js`), texte);
    const r = relireBpo(D);
    const attendu = cotes(dims).map((x) => x / 1000);
    const ecart = Math.max(...attendu.map((a, i) => Math.abs(a - [r.taille.x, r.taille.y, r.taille.z][i])));
    const ok = r.solY < 1e-6 && ecart < 0.03;
    if (!ok) fautes++;
    console.log(`${ok ? "ok " : "KO "} ${e.bpo}.js  ${D.meta.nv} sommets, ${D.meta.nf} faces, ${D.groups.length} matières, `
      + `${(texte.length / 1024).toFixed(0)} Ko — relu ${r.taille.x.toFixed(3)} × ${r.taille.y.toFixed(3)} × ${r.taille.z.toFixed(3)} m`
      + (ok ? "" : `  (attendu ${attendu.map((x) => x.toFixed(3)).join(" × ")})`));
    /* Le .glb intermédiaire, pour le banc de vignettes seulement. */
    const scene = new THREE.Scene(); scene.name = e.titre; scene.add(racine);
    scene.userData = { fabricant, reference: e.reference, titre: e.titre, dimensions: phraseDims(dims) };
    writeFileSync(join(SORTIE, `${e.glb}.glb`), Buffer.from(await exporteur.parseAsync(scene, { binary: true })));
    fiches.push({ ...e, dims, dimensions: phraseDims(dims) });
  }
  if (fautes) { console.error(`${fautes} objet(s) hors cote — rien d'autre n'est écrit`); process.exit(1); }
  return fiches;
}

/* --verifier : relit chaque produit de la marque comme app.html le fera, et
   vérifie vignette et taille déclarée. */
export function verifierMarque(dir) {
  const DATA = join(RACINE, "data", dir), THUMBS = join(DATA, "thumbs");
  const DB = new Function(readFileSync(FABRICANTS, "utf8") + ";return FABRICANTS_DB")();
  const m = DB.find((f) => f.id === dir);
  if (!m) { console.error("data/fabricants.js : la marque n'y est pas"); process.exit(1); }
  const T = new Function(readFileSync(TAILLES, "utf8") + ";return BPO_TAILLES")();
  let fautes = 0;
  for (const p of m.subs) {
    const chemin = join(DATA, `${p.id}.js`);
    if (p.proc) {                                   // produit PROCÉDURAL : pas de maillage, une vignette si thumb:1
      const vignette = !p.thumb || existsSync(join(THUMBS, `${p.id}.png`));
      if (!vignette) fautes++;
      console.log(`${vignette ? "ok " : "KO "} ${p.id}  procédural (${p.proc})${vignette ? "" : "  SANS VIGNETTE"}  « ${p.cat} »`);
      continue;
    }
    try {
      const D = lireProduit(chemin);
      if (D.id !== p.id) throw new Error(`BPO_prod(${D.id}) dans ${p.id}.js`);
      const r = relireBpo(D);
      const vignette = existsSync(join(THUMBS, `${p.id}.png`));
      const taille = T[`${dir}/${p.id}`] === statSync(chemin).size;
      const ok = !r.taille.equals(new THREE.Vector3()) && r.solY < 1e-6 && vignette && taille;
      if (!ok) fautes++;
      console.log(`${ok ? "ok " : "KO "} ${p.id}  ${r.nf} faces, ${r.groupes} matières, ${r.taille.x.toFixed(3)} × ${r.taille.y.toFixed(3)} × ${r.taille.z.toFixed(3)} m`
        + `${vignette ? "" : "  SANS VIGNETTE"}${taille ? "" : "  TAILLE FAUSSE dans data/tailles.js"}  « ${p.cat} »`);
    } catch (e) { fautes++; console.log(`KO  ${p.id}  ${e.message}`); }
  }
  if (fautes) { console.error(`${fautes} produit(s) en défaut`); process.exit(1); }
  console.log(`${m.subs.length} produits relus, la marque est ${m.prive === "compte" ? "privée (compte)" : "PUBLIQUE"}`);
}

/* --vignettes : une image de chaque objet, peinte par tools/banc-objet-glb.html
   dans un Chromium sans tête, fond transparent, recadrée sur la boîte
   englobante, 96 px avec 7 % de marge — la recette des vignettes Haworth,
   Ragni et Flos. Il faut playwright (npm i -D playwright, puis npx playwright
   install chromium) et le serveur du dépôt : python -m http.server 8857 à la
   racine (ou BANC_URL=http://…). Ni l'un ni l'autre n'entrent dans package.json.
   `azimut` (degrés, défaut 35) : l'angle de vue, par objet (e.azimut) ou global. */
export async function peindreVignettes({ catalogue, dir, azimut = 35 }) {
  const THUMBS = join(RACINE, "data", dir, "thumbs");
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { console.error("playwright absent : npm i -D playwright && npx playwright install chromium"); process.exit(2); }
  const base = process.env.BANC_URL || "http://127.0.0.1:8857";
  try { await fetch(base + "/tools/banc-objet-glb.html"); }
  catch { console.error(`rien ne répond sur ${base} : python -m http.server 8857 à la racine du dépôt`); process.exit(2); }
  mkdirSync(THUMBS, { recursive: true });
  const navigateur = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await navigateur.newPage({ viewport: { width: 900, height: 900 } });
  for (const e of catalogue) {
    if (!existsSync(join(SORTIE, `${e.glb}.glb`))) { console.error(`${e.glb}.glb absent de tools/sortie/ : lancer d'abord le mode par défaut`); process.exit(1); }
    await page.goto(`${base}/tools/banc-objet-glb.html?glb=/tools/sortie/${e.glb}.glb&l=900&h=900&fond=0&azimut=${e.azimut ?? azimut}`);
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
