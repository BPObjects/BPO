/* ============================================================================
   BPO — Moteur de rendu par lancer de rayons (path tracing) WebGPU
   ----------------------------------------------------------------------------
   Module autonome. API :
     BPO_RT.available()                      -> WebGPU dispo ?
     const r = await BPO_RT.create(canvas)   -> crée un moteur sur un <canvas>
     r.setScene({triangles, materials})      -> géométrie + matériaux
     r.setCamera({origin,target,up,fovY,aspect})
     r.setEnv({sunDir,sunColor,sunIntensity,sunAngle,skyTop,skyHor,skyGround,skyInt,expo,warm})
     r.setOpts({bounces})
     r.reset()      -> vide l'accumulateur (à appeler si la vue change)
     r.start()/r.stop()                      -> boucle progressive
     r.onProgress(fn)                         -> fn(nbEchantillons)
     r.toPNG()      -> dataURL PNG de l'image courante

   triangles : Array de { a:[x,y,z], b:[x,y,z], c:[x,y,z], mat:index }
   materials : Array de { albedo:[r,g,b] (0..1 linéaire), metal, rough,
                          alpha (1=opaque, <1=verre), ior, emissive:[r,g,b] }
   ============================================================================ */
(function () {
  'use strict';
  const RT = {};
  RT.VERSION = '20260712f';   /* marqueur : vérifier avec BPO_RT.VERSION dans la console */
  RT.available = function () { return !!(typeof navigator !== 'undefined' && navigator.gpu); };

  /* ---------- petits utilitaires vectoriels (CPU) ---------- */
  const V = {
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    min: (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
    max: (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]
  };

  /* ---------- BVH (median split sur l'axe le plus large) ----------
     Sortie : nodes = Float32Array, 8 floats/nœud :
       [minx,miny,minz, leftFirst, maxx,maxy,maxz, count]
       count>0  -> feuille : leftFirst = 1er triangle (dans l'ordre trié)
       count==0 -> interne : leftFirst = index enfant gauche (droit = +1)
     order = Uint32Array : indices de triangles réordonnés. */
  function buildBVH(tris) {
    const n = tris.length;
    const cen = new Array(n), bmin = new Array(n), bmax = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = tris[i];
      const lo = V.min(V.min(t.a, t.b), t.c);
      const hi = V.max(V.max(t.a, t.b), t.c);
      bmin[i] = lo; bmax[i] = hi;
      cen[i] = [(lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5, (lo[2] + hi[2]) * 0.5];
    }
    const order = new Uint32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    const nodesArr = [];               // chaque nœud = {min,max,left,count}
    const LEAF = 4;                    // triangles max par feuille

    function makeNode(start, count) {
      const idx = nodesArr.length;
      const nd = { min: [1e30, 1e30, 1e30], max: [-1e30, -1e30, -1e30], left: 0, count: 0 };
      nodesArr.push(nd);
      for (let i = start; i < start + count; i++) {
        const ti = order[i];
        nd.min = V.min(nd.min, bmin[ti]); nd.max = V.max(nd.max, bmax[ti]);
      }
      if (count <= LEAF) { nd.left = start; nd.count = count; return idx; }
      // axe le plus large
      const ext = [nd.max[0] - nd.min[0], nd.max[1] - nd.min[1], nd.max[2] - nd.min[2]];
      let axis = 0; if (ext[1] > ext[axis]) axis = 1; if (ext[2] > ext[axis]) axis = 2;
      // tri partiel par centroïde sur l'axe
      const seg = Array.from(order.slice(start, start + count));
      seg.sort((x, y) => cen[x][axis] - cen[y][axis]);
      for (let i = 0; i < count; i++) order[start + i] = seg[i];
      const mid = count >> 1;
      const li = makeNode(start, mid);
      const ri = makeNode(start + mid, count - mid);
      nodesArr[idx].left = li;          // (ri == li+... pas garanti) on stocke les 2
      nodesArr[idx].right = ri;
      nodesArr[idx].count = 0;
      return idx;
    }
    if (n > 0) makeNode(0, n);

    // aplatir en s'assurant que l'enfant droit suit le gauche (réindexation DFS)
    const flat = [];
    const remap = new Int32Array(nodesArr.length).fill(-1);
    (function emit(i) {
      const nd = nodesArr[i];
      const self = flat.length; remap[i] = self; flat.push(nd);
      if (nd.count === 0) { emit(nd.left); emit(nd.right); }
    })(0);
    // convertir en Float32Array avec left = index enfant gauche remappé
    const nodes = new Float32Array(flat.length * 8);
    for (let i = 0; i < flat.length; i++) {
      const nd = flat[i], o = i * 8;
      nodes[o] = nd.min[0]; nodes[o + 1] = nd.min[1]; nodes[o + 2] = nd.min[2];
      nodes[o + 4] = nd.max[0]; nodes[o + 5] = nd.max[1]; nodes[o + 6] = nd.max[2];
      if (nd.count > 0) { nodes[o + 3] = nd.left; nodes[o + 7] = nd.count; }   // feuille
      else { nodes[o + 3] = remap[nd.left]; nodes[o + 7] = 0; }                // interne : enfant gauche (droit = +?)
    }
    // NB : après ce DFS, l'enfant gauche remappé est à self+1 ; on stocke quand même
    // l'index explicite pour rester robuste. Le shader lit left ; right = left calculé par count DFS.
    // Pour simplifier la traversée, on recale : enfant gauche = i+1, enfant droit = stocké.
    // -> on réémet les deux indices : left (o+3) = gauche, on met droit dans un buffer séparé.
    const rightIdx = new Int32Array(flat.length).fill(-1);
    for (let i = 0; i < flat.length; i++) if (flat[i].count === 0) rightIdx[i] = remap[flat[i].right];
    return { nodes: nodes, order: order, rightIdx: rightIdx, nodeCount: flat.length };
  }

  /* ---------- empaquetage GPU des buffers de scène ---------- */
  function packScene(scene) {
    const tris = scene.triangles, mats = scene.materials;
    const bvh = buildBVH(tris);
    const nT = tris.length;
    // triangles réordonnés : 3 vec4 chacun (xyz + matIndex dans .w du 1er)
    // + buffer d'UV PARALLÈLE (3 vec2 par triangle, même ordre BVH) pour les feuillages
    const triBuf = new Float32Array(nT * 12);
    const uvBuf = new Float32Array(nT * 6);
    /* NORMALES DE SOMMET : 3 vec4 par triangle, meme ordre BVH que triBuf.
       vec4 et non vec3 : en WGSL un array<vec3f> a un pas de 16 octets, pas 12
       — lire 9 flottants par triangle en vec3f decalerait tout en silence. */
    const nrmBuf = new Float32Array(nT * 12);
    for (let i = 0; i < nT; i++) {
      const t = tris[bvh.order[i]], o = i * 12;
      triBuf[o] = t.a[0]; triBuf[o + 1] = t.a[1]; triBuf[o + 2] = t.a[2]; triBuf[o + 3] = t.mat + 0.5;
      triBuf[o + 4] = t.b[0]; triBuf[o + 5] = t.b[1]; triBuf[o + 6] = t.b[2]; triBuf[o + 7] = 0;
      triBuf[o + 8] = t.c[0]; triBuf[o + 9] = t.c[1]; triBuf[o + 10] = t.c[2]; triBuf[o + 11] = 0;
      if (t.vn) { const w = i * 12;
        for (let s = 0; s < 3; s++) {
          const v = t.vn[s] || [0, 0, 0];
          nrmBuf[w + s * 4] = v[0]; nrmBuf[w + s * 4 + 1] = v[1]; nrmBuf[w + s * 4 + 2] = v[2];
        }
      }
      if (t.uv) { const q = i * 6;
        uvBuf[q] = t.uv[0][0]; uvBuf[q + 1] = t.uv[0][1];
        uvBuf[q + 2] = t.uv[1][0]; uvBuf[q + 3] = t.uv[1][1];
        uvBuf[q + 4] = t.uv[2][0]; uvBuf[q + 5] = t.uv[2][1]; }
    }
    // matériaux : 3 vec4 chacun
    const nM = mats.length;
    const matBuf = new Float32Array(Math.max(1, nM) * 12);
    for (let i = 0; i < nM; i++) {
      const m = mats[i], o = i * 12, e = m.emissive || [0, 0, 0];
      matBuf[o] = m.albedo[0]; matBuf[o + 1] = m.albedo[1]; matBuf[o + 2] = m.albedo[2]; matBuf[o + 3] = m.metal || 0;
      matBuf[o + 4] = (m.rough == null ? 0.5 : m.rough); matBuf[o + 5] = (m.alpha == null ? 1 : m.alpha);
      /* mode surface : 0 aplat, 1 herbe procédurale, 2 béton, 3 gazon mappé, 4 feuillage */
      matBuf[o + 6] = m.ior || 1.5; matBuf[o + 7] = (m.leaf === 2) ? 5 : (m.leaf ? 4 : (m.grass || 0));
      matBuf[o + 8] = e[0]; matBuf[o + 9] = e[1]; matBuf[o + 10] = e[2];
      matBuf[o + 11] = m.leafLayer || 0;   /* mode 4 : couche de la tuile de feuilles + 1 (0 = sans tuile) */
    }
    // nœuds BVH : 2 vec4 chacun (min+left, max+count) + enfant droit dans buffer u32 séparé
    const nN = bvh.nodeCount;
    const nodeBuf = bvh.nodes;                 // déjà 8 floats/nœud
    const rightBuf = new Int32Array(Math.max(1, nN));
    for (let i = 0; i < nN; i++) rightBuf[i] = bvh.rightIdx[i];
    return { triBuf, matBuf, nodeBuf, rightBuf, uvBuf, nrmBuf, nT, nM, nN };
  }

  /* ---------- Shader WGSL (compute path tracer + présentation) ---------- */
  const WGSL_TRACE = /* wgsl */`
struct Uniforms {
  camPos : vec4f,          // xyz + tanHalfFovY
  camRight : vec4f,        // xyz + aspect
  camUp : vec4f,
  camFwd : vec4f,
  dims : vec4f,            // W, H, frame, bounces
  sun : vec4f,             // sunDir.xyz + angularRadius
  sunCol : vec4f,          // rgb + intensity
  skyTop : vec4f,
  skyHor : vec4f,
  skyGround : vec4f,       // rgb + skyIntensity
  lightN : vec4f,          // x = nombre de lampes ponctuelles
};
@group(0) @binding(0) var<uniform> U : Uniforms;
@group(0) @binding(1) var<storage, read> tris : array<vec4f>;
@group(0) @binding(2) var<storage, read> mats : array<vec4f>;
@group(0) @binding(3) var<storage, read> nodes : array<vec4f>;   // 2 vec4 par nœud
@group(0) @binding(4) var<storage, read> rights : array<i32>;
@group(0) @binding(5) var<storage, read_write> accum : array<vec4f>;
@group(0) @binding(6) var<storage, read> lights : array<vec4f>;  // 2 vec4 / lampe : (pos.xyz, rayon) (col.rgb, intensité)
/* Gazon MAPPÉ (16/08) : la tuile photo du viewer, répétée en coordonnées monde.
   Toujours liée (1 px vert par défaut) — layout auto oblige. */
@group(0) @binding(7) var gsamp : sampler;
@group(0) @binding(8) var gtex : texture_2d<f32>;
/* FEUILLAGES (16/08 soir) : UV par triangle (3 vec2, ordre BVH) + tuiles de
   feuilles en tableau de textures — la découpe se fait à l'ALPHA DU TEXEL
   (silhouette réelle des feuilles, comme au viewer), y compris pour les
   rayons d'ombre (lumière tachetée sous les arbres). */
@group(0) @binding(9) var<storage, read> uvs : array<vec2f>;
@group(0) @binding(10) var vtex : texture_2d_array<f32>;
/* CIEL PHOTO (23/08) : voute equirectangulaire, echantillonnee par la direction
   du rayon. 1x1 par defaut — le layout auto exige une liaison permanente. */
@group(0) @binding(11) var skytex : texture_2d<f32>;
/* Normales de sommet, 3 vec4 par triangle, meme ordre que tris. Voir l'en-tete
   de Standalone/patch-normales-lissees.py pour le choix de vec4. */
@group(0) @binding(12) var<storage, read> nrms : array<vec4f>;

fn uvAt(tri : u32, b : vec2f) -> vec2f {
  let u0 = uvs[tri * 3u]; let u1 = uvs[tri * 3u + 1u]; let u2 = uvs[tri * 3u + 2u];
  return u0 * (1.0 - b.x - b.y) + u1 * b.x + u2 * b.y;
}
/* Normale LISSEE au point d'impact. Renvoie le vecteur nul quand le triangle
   n'a pas de normales de sommet (sol, touffes d'herbe, cartes de staffage) :
   l'appelant retombe alors sur la geometrique. */
fn nrmAt(tri : u32, b : vec2f) -> vec3f {
  let n0 = nrms[tri * 3u].xyz; let n1 = nrms[tri * 3u + 1u].xyz; let n2 = nrms[tri * 3u + 2u].xyz;
  let s = n0 * (1.0 - b.x - b.y) + n1 * b.x + n2 * b.y;
  if (dot(s, s) < 1e-6) { return vec3f(0.0); }
  return normalize(s);
}

const PI = 3.14159265;
const INF = 1e30;

// --- RNG (PCG) ---
var<private> rngState : u32;
fn pcg() -> u32 { var s = rngState * 747796405u + 2891336453u; rngState = s;
  var w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
fn rnd() -> f32 { return f32(pcg()) * (1.0 / 4294967296.0); }

fn hash12(p : vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn vnoise(p : vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let a = hash12(i); let b = hash12(i + vec2f(1.0, 0.0));
  let c = hash12(i + vec2f(0.0, 1.0)); let d = hash12(i + vec2f(1.0, 1.0));
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn fbm2(pp : vec2f) -> f32 {
  var s = 0.0; var a = 0.5; var q = pp;
  for (var i = 0; i < 5; i = i + 1) { s = s + a * vnoise(q); q = q * 2.03 + vec2f(11.7, 3.1); a = a * 0.5; }
  return s;
}
/* Herbe procédurale REALISTE. (NE PAS mettre de backtick ici : ce commentaire est
   dans un littéral de gabarit JS, un backtick fermerait la chaîne.)
   - base  : mottling fractal (grande/moyenne échelle), toujours présent ;
   - clump : teinte aléatoire par touffe (~18 cm) qui casse les aplats lisses ;
   - grain : moucheture haute fréquence, texture des brins ;
   - taches seches jaunatres eparses.
   Le détail FIN (touffe + grain) s'estompe avec la distance à la caméra : au loin
   il fourmillerait et convergerait lentement ; de près il donne le relief. */
fn grassColor(pp : vec3f) -> vec3f {
  let p = pp.xz;
  // TOUT est du bruit CONTINU (fbm / vnoise interpolés). Pas de hash12(floor(..)) :
  // une valeur constante par cellule ferait un damier de carrés durs.
  // Échelles resserrées : l'énergie visible est portée par le détail FIN (brins de
  // quelques cm), pas par de grands aplats — sinon le sol paraît « en gros patchs ».
  let base = fbm2(p * 1.3);                                // mottling large discret (~0,75 m)
  let med  = vnoise(p * 6.0);                              // ~17 cm
  let fine = vnoise(p * 18.0) * 0.6 + vnoise(p * 45.0) * 0.4;    // texture des brins (~5 / 2 cm)
  let micro = vnoise(p * 150.0);                           // grain très fin
  let dcam = length(pp - U.camPos.xyz);
  let fade = clamp(1.0 - dcam * 0.028, 0.0, 1.0);          // détail fin net < ~12 m

  let dark = vec3f(0.030, 0.066, 0.018);
  let mid  = vec3f(0.072, 0.150, 0.046);
  let dry  = vec3f(0.130, 0.140, 0.058);
  var col = mix(dark, mid, clamp(base * 0.55 + med * 0.40 + 0.12, 0.0, 1.0));
  // taches sèches éparses : seuil DOUX sur un bruit basse fréquence (bords fondus)
  let dpatch = smoothstep(0.62, 0.84, vnoise(p * 1.1 + vec2f(5.0, 9.0)));
  col = mix(col, dry, dpatch * 0.34);
  // valeur : brins (dominant, près) + micro-grain, tous continus → pas de damier
  col = col * (0.86 + 0.10 * (med - 0.5) + fade * (0.34 * (fine - 0.5) + 0.16 * (micro - 0.5)));
  return max(col, vec3f(0.0));
}
/* Béton procédural : gris moucheté multi-échelle (dalles + granulat fin), continu. */
fn concreteColor(pp : vec3f) -> vec3f {
  let p = pp.xz;
  let base = vec3f(0.52, 0.52, 0.51);
  let n1 = vnoise(p * 0.32);
  let n2 = vnoise(p * 1.7 + vec2f(11.0, 3.0));
  let n3 = vnoise(p * 6.5 + vec2f(2.0, 7.0));
  var c = base * (0.86 + 0.16 * n1);
  c = mix(c, base * 0.76, smoothstep(0.55, 0.86, n2) * 0.5);   // nuances / coulures
  c = c * (0.93 + 0.13 * (n3 - 0.5));                          // grain fin (granulat)
  return max(c, vec3f(0.0));
}
/* Ciel : dégradé horizon->zénith + halo chaud autour du soleil (comme le viewer). */
fn skyColor(d : vec3f) -> vec3f {
  var c : vec3f;
  /* CIEL PHOTO : skyTop.w = drapeau, skyHor.w = azimut du soleil du moteur.
     La voute TOURNE pour aligner la lueur peinte (azimut 0 dans l'image) sur le
     vrai soleil — un seul soleil a l'ecran. textureSampleLevel (niveau
     explicite) est legal sous controle de flux non uniforme, contrairement a
     textureSample. Conversion sRGB -> lineaire, puis skyInt comme le degrade. */
  if (U.skyTop.w > 0.5) {
    let dn = normalize(d);
    let uS = fract((atan2(dn.x, dn.z) - U.skyHor.w) / 6.2831853 + 0.5);
    let vS = clamp(acos(clamp(dn.y, -1.0, 1.0)) / 3.14159265, 0.0, 1.0);
    let tx = textureSampleLevel(skytex, gsamp, vec2f(uS, vS), 0.0).rgb;
    return pow(tx, vec3f(2.2)) * U.skyGround.w;
  }
  if (d.y >= 0.0) {
    c = mix(U.skyHor.rgb, U.skyTop.rgb, pow(clamp(d.y, 0.0, 1.0), 0.42));
    let sd = normalize(U.sun.xyz);
    let m = max(dot(normalize(d), sd), 0.0);
    c = c + U.sunCol.rgb * (pow(m, 6.0) * 0.35 + pow(m, 48.0) * 0.5);   // halo
  } else {
    c = mix(U.skyHor.rgb, U.skyGround.rgb, clamp(-d.y * 2.5, 0.0, 1.0));
  }
  return c * U.skyGround.w;
}

struct Hit { t : f32, p : vec3f, n : vec3f, mat : i32, hit : bool, bary : vec2f, tri : i32 };

fn triHit(ro : vec3f, rd : vec3f, i : u32, tmax : f32) -> vec4f {
  // renvoie (t, matIndexAsF32, u, v) ; t<0 si pas de hit — u/v = barycentriques (poids de b et c)
  let a = tris[i * 3u].xyz;
  let b = tris[i * 3u + 1u].xyz;
  let c = tris[i * 3u + 2u].xyz;
  let e1 = b - a; let e2 = c - a;
  let pv = cross(rd, e2); let det = dot(e1, pv);
  if (abs(det) < 1e-9) { return vec4f(-1.0, 0.0, 0.0, 0.0); }
  let inv = 1.0 / det; let tv = ro - a;
  let u = dot(tv, pv) * inv; if (u < 0.0 || u > 1.0) { return vec4f(-1.0, 0.0, 0.0, 0.0); }
  let qv = cross(tv, e1); let v = dot(rd, qv) * inv; if (v < 0.0 || u + v > 1.0) { return vec4f(-1.0, 0.0, 0.0, 0.0); }
  let t = dot(e2, qv) * inv;
  if (t < 1e-4 || t > tmax) { return vec4f(-1.0, 0.0, 0.0, 0.0); }
  return vec4f(t, tris[i * 3u].w, u, v);
}

fn slab(ro : vec3f, invD : vec3f, lo : vec3f, hi : vec3f, tmax : f32) -> f32 {
  let t0 = (lo - ro) * invD; let t1 = (hi - ro) * invD;
  let tsm = min(t0, t1); let tbg = max(t0, t1);
  let tn = max(max(tsm.x, tsm.y), tsm.z);
  let tf = min(min(tbg.x, tbg.y), tbg.z);
  if (tf >= max(tn, 0.0) && tn < tmax) { return tn; } return INF;
}

fn traverse(ro : vec3f, rd : vec3f, tmax : f32, occ : bool) -> Hit {
  var h : Hit; h.hit = false; h.t = tmax;
  let invD = 1.0 / rd;
  var stack : array<i32, 40>; var sp = 0; stack[0] = 0; sp = 1;
  loop {
    if (sp <= 0) { break; }
    sp = sp - 1; let ni = stack[sp];
    let n0 = nodes[u32(ni) * 2u]; let n1 = nodes[u32(ni) * 2u + 1u];
    if (slab(ro, invD, n0.xyz, n1.xyz, h.t) >= INF) { continue; }
    let count = i32(n1.w + 0.5);
    if (count > 0) {
      let first = i32(n0.w + 0.5);
      for (var k = 0; k < count; k = k + 1) {
        let r = triHit(ro, rd, u32(first + k), h.t);
        if (r.x > 0.0) {
          let mi = i32(r.y);
          /* FEUILLAGE (mode 4) : la carte n'existe qu'aux texels opaques de sa
             tuile — testé à l'alpha du point d'impact, pour la CAMÉRA comme
             pour les OMBRES (rnd stochastique : converge en douceur). */
          var trou = false;
          if (mats[u32(mi) * 3u + 1u].w > 3.5) {
            let layer = i32(mats[u32(mi) * 3u + 2u].w + 0.5) - 1;
            if (layer >= 0) {
              let uvh = uvAt(u32(first + k), r.zw);
              let aH = textureSampleLevel(vtex, gsamp, uvh, layer, 0.0).a;
              trou = (rnd() > aH);
            }
          }
          if (!trou) {
            h.hit = true; h.t = r.x; h.mat = mi;
            if (occ) { return h; }
            let ii = u32(first + k);
            let a = tris[ii * 3u].xyz; let b = tris[ii * 3u + 1u].xyz; let c = tris[ii * 3u + 2u].xyz;
            h.n = normalize(cross(b - a, c - a));
            h.p = ro + rd * r.x;
            h.bary = r.zw; h.tri = i32(ii);
          }
        }
      }
    } else {
      let li = i32(n0.w + 0.5); let ri = rights[ni];
      if (sp < 38) { stack[sp] = li; sp = sp + 1; stack[sp] = ri; sp = sp + 1; }
    }
  }
  return h;
}

fn onb(n : vec3f) -> mat3x3f {
  let s = select(-1.0, 1.0, n.z >= 0.0);
  let a = -1.0 / (s + n.z); let b = n.x * n.y * a;
  let t = vec3f(1.0 + s * n.x * n.x * a, s * b, -s * n.x);
  let bt = vec3f(b, s + n.y * n.y * a, -n.y);
  return mat3x3f(t, bt, n);
}
fn cosineDir(n : vec3f) -> vec3f {
  let r1 = rnd(); let r2 = rnd(); let r = sqrt(r1); let phi = 2.0 * PI * r2;
  let d = vec3f(r * cos(phi), r * sin(phi), sqrt(1.0 - r1));
  return onb(n) * d;
}
fn fresnel(cosT : f32, F0 : vec3f) -> vec3f { return F0 + (vec3f(1.0) - F0) * pow(1.0 - cosT, 5.0); }

fn sampleSun() -> vec3f {
  // direction dans un petit cône autour du soleil
  let sd = normalize(U.sun.xyz);
  let ct = 1.0 - rnd() * (1.0 - cos(U.sun.w));
  let st = sqrt(1.0 - ct * ct); let phi = 2.0 * PI * rnd();
  let l = vec3f(cos(phi) * st, sin(phi) * st, ct);
  return onb(sd) * l;
}

fn sunDisk(d : vec3f) -> vec3f {
  /* RAYON VISIBLE != RAYON D'ECHANTILLONNAGE (23/08). U.sun.w pilote le cone
     d'ombre : l'elargir adoucit les ombres, ce qu'on veut d'un ciel couvert.
     Mais le MEME angle dessinait le disque, qui atteignait 19 deg de diametre
     sur un crepuscule — signale par AL. Le vrai soleil en fait 0,53.
       · ciel PHOTO (skyTop.w) : aucun disque synthetique. L'image contient deja
         son soleil, photographie, et a la bonne place puisque chaque panorama
         est roule pour l'aligner sur celui du moteur ;
       · degrade procedural : disque plafonne a 0,010 rad de rayon. Plus petit,
         il s'aliase a faible nombre d'echantillons.
     AUCUN EFFET SUR L'ECLAIRAGE : sunDisk n'est ajoute que pour les rayons
     speculaires (voir le drapeau spec), l'eclairage direct passe par sampleSun,
     qui garde U.sun.w entier. Ombres et intensite inchangees.
     (PIEGE MAISON : PAS DE BACKTICK ici — ce commentaire vit dans un template
     literal JS, un backtick le fermerait et casserait tout le fichier.) */
  if (U.skyTop.w > 0.5) { return vec3f(0.0); }
  let rv = min(U.sun.w, 0.010);
  if (dot(normalize(d), normalize(U.sun.xyz)) > cos(rv)) {
    return U.sunCol.rgb * U.sunCol.w * 3.0;
  }
  return vec3f(0.0);
}
fn radiance(roIn : vec3f, rdIn : vec3f) -> vec3f {
  var ro = roIn; var rd = rdIn;
  var thr = vec3f(1.0); var L = vec3f(0.0);
  var spec = true;                              // le rayon précédent était-il spéculaire ?
  let bounces = i32(U.dims.w + 0.5);
  for (var b = 0; b < bounces; b = b + 1) {
    let h = traverse(ro, rd, INF, false);
    if (!h.hit) {
      var sky = skyColor(rd);
      if (spec) { sky = sky + sunDisk(rd); }    // soleil visible seulement pour les rayons spéculaires (évite le double comptage du NEE)
      L = L + thr * sky; break;
    }
    let ng = h.n;
    /* NORMALE LISSEE pour l'ombrage, GEOMETRIQUE pour les decalages de rayon.
       Trois precautions, chacune pour un defaut connu (voir l'en-tete du patch
       Standalone/patch-normales-lissees.py) : repli si le triangle n'a pas de
       normales de sommet ; alignement sur la geometrique, car un maillage a
       faces retournees fournit des normales opposees ; et ng conserve plus bas
       pour decider ou un rayon repart, sinon on obtient des points noirs pres
       des aretes. */
    var ns = nrmAt(u32(h.tri), h.bary);
    if (dot(ns, ns) < 0.5) { ns = ng; }
    else if (dot(ns, ng) < 0.0) { ns = -ns; }
    var n = ns; if (dot(n, rd) > 0.0) { n = -n; }
    let m0 = mats[u32(h.mat) * 3u]; let m1 = mats[u32(h.mat) * 3u + 1u]; let m2 = mats[u32(h.mat) * 3u + 2u];
    var albedo = m0.rgb; let metal = m0.w; let rough = m1.x; let alpha = m1.y; let ior = m1.z;
    if (m1.w > 3.5) {                    // DECOUPE ALPHA : couleur lue dans la tuile
      // (la decoupe aux trous de la tuile est deja faite dans traverse, dont le
      //  test porte sur > 3.5 : les modes 4 et 5 en heritent tous les deux)
      let layerL = i32(m2.w + 0.5) - 1;
      if (layerL >= 0) {
        let txL = textureSampleLevel(vtex, gsamp, uvAt(u32(h.tri), h.bary), layerL, 0.0);
        albedo = pow(txL.rgb, vec3f(2.2));
      }
      /* MODE 4 = FEUILLAGE : 30 % des rayons TRAVERSENT, teintes — c'est le
         contre-jour d'un houppier. MODE 5 = STAFFAGE PHOTOGRAPHIQUE (personnages,
         arbres photographies) : la silhouette est OPAQUE. Sans cette distinction
         un personnage devenait un fantome translucide : un etre humain n'est pas
         une feuille. Tout le reste est partage. */
      if (m1.w < 4.5 && rnd() < 0.30) {
        thr = thr * albedo * 0.9; ro = h.p + rd * 1e-3; spec = true; continue;
      }
      // sinon : surface pleine -> diffuse standard ci-dessous
    }
    else if (m1.w > 2.5) {                                   // gazon MAPPÉ : tuile photo répétée (monde)
      var tg = textureSampleLevel(gtex, gsamp, h.p.xz / 2.2, 0.0).rgb;   // ~2,2 m : même échelle que le viewer (gScale 0.45)
      tg = pow(tg, vec3f(2.2));                              // sRGB -> linéaire
      tg = tg * (0.93 + 0.14 * fbm2(h.p.xz * 0.07));         // modelé TRÈS discret (le ±36 % faisait un marbre)
      /* le ciel bleuté + le tonemapping DÉLAVENT l'albédo : on rend au gazon la
         vivacité qu'il a au viewer (saturation +35 %, luminance +15 %) et un
         grain de brins près de la caméra (comme l'herbe procédurale). */
      let lumG = dot(tg, vec3f(0.30, 0.59, 0.11));
      tg = clamp((tg - vec3f(lumG)) * 1.35 + vec3f(lumG * 1.15), vec3f(0.0), vec3f(1.0));
      let dcamG = length(h.p - U.camPos.xyz);
      let fadeG = clamp(1.0 - dcamG * 0.035, 0.0, 1.0);
      if (fadeG > 0.01) {
        let brins = vnoise(h.p.xz * 42.0) * 0.6 + vnoise(h.p.xz * 130.0) * 0.4;
        tg = tg * (1.0 + fadeG * 0.30 * (brins - 0.5));
      }
      albedo = tg;
    }
    else if (m1.w > 1.5) { albedo = concreteColor(h.p); }    // sol béton procédural
    else if (m1.w > 0.5) { albedo = grassColor(h.p); }       // sol herbe procédurale
    L = L + thr * m2.rgb;                        // émissif
    let p = h.p + n * 1e-3;

    // --- VERRE ARCHITECTURAL (mince) : reflet de Fresnel + transmission DROITE
    //     légèrement teintée. Pas de réfraction "lentille" (panneaux plats). ---
    if (alpha < 0.999) {
      let nl = select(-ng, ng, dot(rd, ng) < 0.0);
      let cosI = clamp(dot(-rd, nl), 0.0, 1.0);
      let F = 0.08 + 0.92 * pow(1.0 - cosI, 5.0);   // reflet un peu plus présent (verre archi)
      if (rnd() < F) {
        rd = reflect(rd, nl); ro = h.p + nl * 1e-3;      // reflet du ciel / environnement
      } else {
        ro = h.p + rd * 1e-3;                            // on traverse tout droit
        thr = thr * mix(vec3f(1.0), albedo, 0.35);       // légère teinte du vitrage
      }
      spec = true; continue;
    }

    // --- éclairage direct du soleil (NEE, source directionnelle) ---
    let ldir = sampleSun();
    let ndl = dot(n, ldir);
    if (ndl > 0.0 && U.sunCol.w > 0.0) {
      let sh = traverse(p, ldir, INF, true);
      if (!sh.hit) {
        L = L + thr * albedo * (1.0 - metal) * ndl * U.sunCol.rgb * U.sunCol.w * (1.0 / PI);
      }
    }
    // --- éclairage direct des LAMPES ponctuelles (NEE, atténuation quadratique) ---
    let nL = u32(U.lightN.x + 0.5);
    for (var li = 0u; li < nL; li = li + 1u) {
      let La = lights[li * 2u]; let Lb = lights[li * 2u + 1u];
      let toL = La.xyz - p;
      let dist = length(toL);
      if (dist > 1e-4) {
        let ldir2 = toL / dist;
        let ndl2 = dot(n, ldir2);
        if (ndl2 > 0.0) {
          let sh2 = traverse(p, ldir2, dist - 1e-2, true);
          if (!sh2.hit) {
            let atten = 1.0 / (dist * dist + La.w * La.w);
            L = L + thr * albedo * (1.0 - metal) * ndl2 * Lb.rgb * Lb.w * atten * (1.0 / PI);
          }
        }
      }
    }

    // --- rebond (spéculaire Fresnel / diffus) ---
    let F0v = mix(vec3f(0.04), albedo, metal);
    let cosV = clamp(dot(-rd, n), 0.0, 1.0);
    var Fr = fresnel(cosV, F0v);
    // HERBE : on ECRASE la montee rasante du Fresnel. A incidence rasante
    // fresnel() tend vers 1 quelle que soit la rugosite, donc pSpec saturait a
    // 0,95 et 95 % des rayons repartaient vers le ciel : le sol prenait un voile
    // cyan mouille, « on dirait un marecage » (signale par AL). C'est le
    // comportement juste d'un dielectrique LISSE ; une pelouse vue de rase-mottes
    // n'est pas un plan, c'est une foret de brins qui diffusent — il n'y a pas de
    // miroir a raser. La reflectance rasante passe de ~1,0 a ~0,155. Le tirage et
    // le poids Fr/pSpec restent coherents : l'estimateur reste non biaise.
    // Beton (2) et feuillage (4) gardent leur Fresnel : une dalle mouillee et une
    // feuille ciree brillent pour de bon.
    if ((m1.w > 0.5 && m1.w < 1.5) || (m1.w > 2.5 && m1.w < 3.5)) {
      Fr = mix(F0v, Fr, 0.12);
    }
    let pSpec = clamp((Fr.x + Fr.y + Fr.z) / 3.0, 0.05, 0.95);
    if (rnd() < pSpec) {
      let refl = reflect(rd, n);
      rd = normalize(refl + cosineDir(n) * rough * rough);
      if (dot(rd, n) <= 0.0) { rd = refl; }
      thr = thr * Fr / pSpec; spec = true; ro = p;
    } else {
      rd = cosineDir(n);
      thr = thr * albedo * (1.0 - metal) / (1.0 - pSpec); spec = false; ro = p;
    }
    // roulette russe
    if (b > 2) {
      let q = clamp(max(thr.x, max(thr.y, thr.z)), 0.05, 0.95);
      if (rnd() > q) { break; } thr = thr / q;
    }
  }
  return L;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let W = u32(U.dims.x); let H = u32(U.dims.y);
  if (gid.x >= W || gid.y >= H) { return; }
  let idx = gid.y * W + gid.x;
  let frame = u32(U.dims.z);
  rngState = (gid.x * 1973u + gid.y * 9277u + frame * 26699u) | 1u;
  // rayon caméra (jitter sous-pixel)
  let jx = rnd(); let jy = rnd();
  let uv = vec2f((f32(gid.x) + jx) / U.dims.x, (f32(gid.y) + jy) / U.dims.y) * 2.0 - 1.0;
  let px = uv.x * U.camPos.w * U.camRight.w;      // tanHalfFov * aspect
  let py = -uv.y * U.camPos.w;
  let rd = normalize(U.camFwd.xyz + U.camRight.xyz * px + U.camUp.xyz * py);
  // profondeur de champ (objectif mince) : camUp.w = rayon d'ouverture (m),
  // camFwd.w = distance de mise au point (m). 0 = stenope (net partout).
  var ro = U.camPos.xyz;
  var rdir = rd;
  let ap = U.camUp.w;
  if (ap > 0.0) {
    let fd = max(0.2, U.camFwd.w);
    // point focal sur le PLAN focal (perpendiculaire a fwd), pas la sphere
    let fp = ro + rd * (fd / max(0.05, dot(rd, U.camFwd.xyz)));
    let ang = rnd() * 2.0 * PI;
    let rr = sqrt(rnd()) * ap;
    ro = ro + U.camRight.xyz * (cos(ang) * rr) + U.camUp.xyz * (sin(ang) * rr);
    rdir = normalize(fp - ro);
  }
  let col = radiance(ro, rdir);
  let prev = accum[idx];
  accum[idx] = vec4f(prev.rgb + col, prev.w + 1.0);
}
`;

  const WGSL_PRESENT = /* wgsl */`
struct PU { dims : vec4f, grade : vec4f };   // grade: expo, warm, 0,0
@group(0) @binding(0) var<uniform> P : PU;
@group(0) @binding(1) var<storage, read> accum : array<vec4f>;

@vertex
fn vs(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  var p = array<vec2f,3>(vec2f(-1.0,-1.0), vec2f(3.0,-1.0), vec2f(-1.0,3.0));
  return vec4f(p[vi], 0.0, 1.0);
}
fn aces(x : vec3f) -> vec3f {
  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), vec3f(0.0), vec3f(1.0));
}
@fragment
fn fs(@builtin(position) fc : vec4f) -> @location(0) vec4f {
  let W = u32(P.dims.x);
  let x = u32(fc.x); let y = u32(fc.y);
  let a = accum[y * W + x];
  var c = a.rgb / max(a.w, 1.0);
  c = c * P.grade.x;                                  // exposition
  // teinte chaude/froide simple pilotée par la luminance
  let l = clamp((c.r + c.g + c.b) / 3.0, 0.0, 1.0);
  let warm = mix(vec3f(0.95,0.97,1.05), vec3f(1.06,1.0,0.92), l);
  c = mix(c, c * warm, P.grade.y);
  c = aces(c);
  c = pow(c, vec3f(1.0/2.2));
  return vec4f(c, 1.0);
}
`;

  /* ---------- Renderer ---------- */
  RT.create = async function (canvas) {
    if (!RT.available()) throw new Error('WebGPU indisponible');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('Aucun adaptateur WebGPU');
    const device = await adapter.requestDevice();
    const ctx = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'opaque' });

    const R = {
      device, ctx, format, canvas,
      W: canvas.width, H: canvas.height,
      frame: 0, running: false, _raf: 0, _prog: null,
      cam: null, env: null, opts: { bounces: 5 }, scenePacked: null,
      buffers: {}, pipe: null, present: null, bind: null, pbind: null
    };

    // shaders / pipelines
    const traceMod = device.createShaderModule({ code: WGSL_TRACE });
    const presMod = device.createShaderModule({ code: WGSL_PRESENT });
    R.pipe = device.createComputePipeline({ layout: 'auto', compute: { module: traceMod, entryPoint: 'main' } });
    R.present = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: presMod, entryPoint: 'vs' },
      fragment: { module: presMod, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' }
    });

    R.uni = device.createBuffer({ size: 11 * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    R.puni = device.createBuffer({ size: 2 * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    function mkStorage(arr, extraUsage) {
      const b = device.createBuffer({ size: Math.max(16, arr.byteLength), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | (extraUsage || 0) });
      device.queue.writeBuffer(b, 0, arr);
      return b;
    }
    /* Lampes ponctuelles : buffer par défaut vide (1 vec4 factice) ; setLights le remplit. */
    R.nLights = 0;
    R.buffers.lights = mkStorage(new Float32Array(4));
    /* Texture de gazon : 1 px vert tant que setGroundTex n'a pas fourni la tuile
       (le layout auto exige une liaison permanente pour les bindings 7/8). */
    R.gsampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });
    R.gtex = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    device.queue.writeTexture({ texture: R.gtex }, new Uint8Array([96, 128, 64, 255]), { bytesPerRow: 256 }, [1, 1]);
    /* Tuiles de FEUILLAGE : tableau de textures (couches 512x512 rgba). Défaut :
       1x1x1 vert. setVegTiles([{data,w,h},...]) — l'ordre = les couches des
       matériaux (leafLayer = index + 1). writeTexture n'exige pas d'alignement. */
    R.vtex = device.createTexture({ size: [1, 1, 1], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: R.vtex }, new Uint8Array([80, 120, 60, 255]), { bytesPerRow: 4 }, [1, 1, 1]);
    R.setVegTiles = function (tiles) {
      try {
        tiles = tiles || [];
        var ref = null; for (var i = 0; i < tiles.length; i++) { if (tiles[i] && tiles[i].data) { ref = tiles[i]; break; } }
        if (!ref) return;
        var S = ref.w, n = Math.max(1, tiles.length);
        var t = device.createTexture({ size: [S, S, n], format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
        for (var l = 0; l < n; l++) {
          var T = tiles[l];
          if (T && T.data && T.w === S && T.h === S) {
            device.queue.writeTexture({ texture: t, origin: [0, 0, l] },
              (T.data.buffer ? new Uint8Array(T.data.buffer, T.data.byteOffset || 0, T.data.byteLength) : T.data),
              { bytesPerRow: S * 4, rowsPerImage: S }, [S, S, 1]);
          }
          else if (T && T.data) {
            /* une tuile aux dimensions differentes de la couche est ECARTEE :
               sa couche resterait noire sans que rien ne le dise. Le hook
               recalibre tout en amont, donc ce cas ne devrait pas survenir —
               s'il survient, c'est que le recalibrage a ete contourne
               (signale par code-8e, 28/08). */
            console.warn('[rendu] tuile ' + l + ' ecartee : ' + T.w + 'x' + T.h + ' au lieu de ' + S + 'x' + S);
          }
        }
        if (R.vtex) { try { R.vtex.destroy(); } catch (e) {} }
        R.vtex = t;
        if (R.buffers.tris) { R._makeBinds(); R.reset(); }
      } catch (e) { console.warn('setVegTiles:', e); }
    };
    /* Fournit la tuile photo (ImageBitmap) — reset de l'accumulateur, la scène repart propre. */
    /* CIEL PHOTO : 1x1 bleu tant que setSkyTex n'a rien fourni. */
    R.skytex = device.createTexture({ size: [1, 1], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: R.skytex }, new Uint8Array([110, 150, 210, 255]), { bytesPerRow: 4 }, [1, 1]);
    R.useSky = 0;
    R.setSkyTex = function (bmp) {
      try {
        if (!bmp) { R.useSky = 0; if (R.buffers.tris) { R.reset(); } return; }
        var t = device.createTexture({ size: [bmp.width, bmp.height], format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
        device.queue.copyExternalImageToTexture({ source: bmp }, { texture: t }, [bmp.width, bmp.height]);
        if (R.skytex) { try { R.skytex.destroy(); } catch (e) {} }
        R.skytex = t; R.useSky = 1;
        if (R.buffers.tris) { R._makeBinds(); R.reset(); }
      } catch (e) { console.warn('setSkyTex:', e); }
    };
    R.setGroundTex = function (bmp) {
      try {
        var t = device.createTexture({ size: [bmp.width, bmp.height], format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
        device.queue.copyExternalImageToTexture({ source: bmp }, { texture: t }, [bmp.width, bmp.height]);
        if (R.gtex) { try { R.gtex.destroy(); } catch (e) {} }
        R.gtex = t;
        if (R.buffers.tris) { R._makeBinds(); R.reset(); }
      } catch (e) { console.warn('setGroundTex:', e); }
    };

    R.setScene = function (scene) {
      const P = packScene(scene);
      R.scenePacked = P;
      R.buffers.tris = mkStorage(P.triBuf);
      R.buffers.mats = mkStorage(P.matBuf);
      R.buffers.nodes = mkStorage(P.nodeBuf);
      R.buffers.rights = mkStorage(P.rightBuf);
      R.buffers.uvs = mkStorage(P.uvBuf);
      R.buffers.nrms = mkStorage(P.nrmBuf);
      R._allocAccum();
      R._makeBinds();
      R.reset();
    };

    R._allocAccum = function () {
      const px = R.W * R.H;
      if (R.buffers.accum) R.buffers.accum.destroy();
      R.buffers.accum = device.createBuffer({ size: px * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    };

    R._makeBinds = function () {
      R.bind = device.createBindGroup({
        layout: R.pipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: R.uni } },
          { binding: 1, resource: { buffer: R.buffers.tris } },
          { binding: 2, resource: { buffer: R.buffers.mats } },
          { binding: 3, resource: { buffer: R.buffers.nodes } },
          { binding: 4, resource: { buffer: R.buffers.rights } },
          { binding: 5, resource: { buffer: R.buffers.accum } },
          { binding: 6, resource: { buffer: R.buffers.lights } },
          { binding: 7, resource: R.gsampler },
          { binding: 8, resource: R.gtex.createView() },
          { binding: 9, resource: { buffer: R.buffers.uvs } },
          { binding: 10, resource: R.vtex.createView({ dimension: '2d-array' }) },
          { binding: 11, resource: R.skytex.createView() },
          { binding: 12, resource: { buffer: R.buffers.nrms } }
        ]
      });
      R.pbind = device.createBindGroup({
        layout: R.present.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: R.puni } },
          { binding: 1, resource: { buffer: R.buffers.accum } }
        ]
      });
    };

    R.setCamera = function (c) { R.cam = c; R.reset(); };
    R.setEnv = function (e) { R.env = e; R.reset(); };
    /* Lampes ponctuelles : liste de { pos:[x,y,z], radius, color:[r,g,b], intensity }.
       Chaque lampe = 2 vec4f : (pos.xyz, rayon) puis (couleur.rgb, intensité). */
    R.setLights = function (list) {
      list = list || [];
      var n = list.length, buf = new Float32Array(Math.max(1, n) * 8);
      for (var i = 0; i < n; i++) {
        var L = list[i], p = L.pos || [0, 0, 0], c = L.color || [1, 1, 1];
        buf[i * 8] = p[0]; buf[i * 8 + 1] = p[1]; buf[i * 8 + 2] = p[2]; buf[i * 8 + 3] = (L.radius == null ? 0.15 : L.radius);
        buf[i * 8 + 4] = c[0]; buf[i * 8 + 5] = c[1]; buf[i * 8 + 6] = c[2]; buf[i * 8 + 7] = (L.intensity == null ? 30 : L.intensity);
      }
      if (R.buffers.lights) R.buffers.lights.destroy();
      R.buffers.lights = mkStorage(buf);
      R.nLights = n;
      R._makeBinds(); R.reset();
    };
    R.setOpts = function (o) { Object.assign(R.opts, o || {}); R.reset(); };
    R.onProgress = function (fn) { R._prog = fn; };

    R.reset = function () {
      R.frame = 0;
      if (R.buffers.accum) device.queue.writeBuffer(R.buffers.accum, 0, new Float32Array(R.W * R.H * 4));
    };

    function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

    R._writeUniforms = function () {
      const c = R.cam, e = R.env;
      const fwd = norm([c.target[0] - c.origin[0], c.target[1] - c.origin[1], c.target[2] - c.origin[2]]);
      const right = norm(cross(fwd, c.up || [0, 1, 0]));
      const up = cross(right, fwd);
      const tan = Math.tan((c.fovY || 0.95) * 0.5);
      const u = new Float32Array(44);
      u.set([c.origin[0], c.origin[1], c.origin[2], tan], 0);
      u.set([right[0], right[1], right[2], c.aspect || (R.W / R.H)], 4);
      u.set([up[0], up[1], up[2], c.aperture || 0], 8);      /* rayon d'ouverture (m) — 0 = sans DoF */
      /* repli : ouverture sans distance fournie -> mise au point sur la CIBLE
         (sans lui, focus a 20 cm = image entierement floue ; revue 26/08) */
      var _fd = c.focusDist || Math.hypot(c.target[0] - c.origin[0], c.target[1] - c.origin[1], c.target[2] - c.origin[2]) || 0;
      u.set([fwd[0], fwd[1], fwd[2], _fd], 12);               /* distance de mise au point (m) */
      u.set([R.W, R.H, R.frame, R.opts.bounces], 16);
      const sd = norm(e.sunDir);
      u.set([sd[0], sd[1], sd[2], e.sunAngle || 0.05], 20);
      u.set([e.sunColor[0], e.sunColor[1], e.sunColor[2], e.sunIntensity == null ? 3.0 : e.sunIntensity], 24);
      u.set([e.skyTop[0], e.skyTop[1], e.skyTop[2], R.useSky ? 1 : 0], 28);
      u.set([e.skyHor[0], e.skyHor[1], e.skyHor[2], Math.atan2(sd[0], sd[2])], 32);   /* azimut du soleil : la voute photo tourne avec lui */
      u.set([e.skyGround[0], e.skyGround[1], e.skyGround[2], e.skyInt == null ? 1.0 : e.skyInt], 36);
      u.set([R.nLights || 0, 0, 0, 0], 40);
      device.queue.writeBuffer(R.uni, 0, u);
      const pu = new Float32Array(8);
      pu.set([R.W, R.H, 0, 0], 0);
      pu.set([e.expo == null ? 1.0 : e.expo, e.warm == null ? 0.5 : e.warm, 0, 0], 4);
      device.queue.writeBuffer(R.puni, 0, pu);
    };

    R.frameStep = function () {
      if (!R.cam || !R.env || !R.scenePacked) return;
      R._writeUniforms();
      const enc = device.createCommandEncoder();
      const cp = enc.beginComputePass();
      cp.setPipeline(R.pipe); cp.setBindGroup(0, R.bind);
      cp.dispatchWorkgroups(Math.ceil(R.W / 8), Math.ceil(R.H / 8));
      cp.end();
      const rp = enc.beginRenderPass({ colorAttachments: [{ view: R.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      rp.setPipeline(R.present); rp.setBindGroup(0, R.pbind); rp.draw(3);
      rp.end();
      device.queue.submit([enc.finish()]);
      R.frame++;
      if (R._prog) R._prog(R.frame);
    };

    R.start = function () { if (R.running) return; R.running = true; const loop = () => { if (!R.running) return; R.frameStep(); R._raf = requestAnimationFrame(loop); }; loop(); };
    R.stop = function () { R.running = false; if (R._raf) cancelAnimationFrame(R._raf); R._raf = 0; };

    R.toPNG = function () { return canvas.toDataURL('image/png'); };

    R.resize = function (w, h) { R.stop(); canvas.width = w; canvas.height = h; R.W = w; R.H = h; ctx.configure({ device, format, alphaMode: 'opaque' }); R._allocAccum(); R._makeBinds(); R.reset(); };

    return R;
  };

  if (typeof window !== 'undefined') window.BPO_RT = RT;
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildBVH, packScene };
})();
