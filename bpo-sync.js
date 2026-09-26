/* bpo-sync.js — L'ATELIER SUIT LE COMPTE (2026-08-06).
   Chargé par bpo-auth.js (import dynamique, une fois la session connue).

   PRINCIPE. Tout le travail de l'app vit en localStorage (aucune donnée
   d'atelier n'était côté serveur). Ce module fait le pont : au démarrage il
   TIRE l'atelier du compte (table Supabase `workspaces`, une ligne par
   utilisateur) et le FUSIONNE avec le local ; ensuite chaque écriture d'une
   clé suivie est POUSSÉE (débonce 3 s + vidage à la mise en arrière-plan).

   FUSION. Par clé, dernier écrit gagne (horodatages tenus dans
   BPO_SYNC_META_v1 — le localStorage n'en fournit pas). Pour les listes à
   `id` (configs, scènes, gabarits), UNION par id : deux appareils qui
   ajoutent chacun des éléments ne s'écrasent pas ; à id égal, la version du
   côté le plus récent gagne. JAMAIS de perte muette : une valeur locale
   jamais synchronisée que le serveur remplacerait est d'abord copiée dans
   BPO_SYNC_RESCUE_v1 (et dit en console).

   SANS TABLE (SQL pas encore exécuté) : une ligne en console, et le site
   fonctionne exactement comme avant — la synchro se désactive seule.

   L'ESSAI ANONYME synchronise aussi (rôle authenticated) : à la conversion
   en compte, l'id auth est conservé -> l'atelier suit, comme promis.

   GROSSES CLÉS (26/09/2026, AL : « Corriger la synchro ») — une clé de plus
   de MAX_VAL caractères (planches à images embarquées, bibliothèque) ne va
   plus dans `data` : elle est rangée dans la colonne `gros` de la MÊME ligne
   ({clé:{v,t,n,h,d,a}}), écrite dans le même upsert — une seule requête, donc
   jamais un mélange de deux versions ; longueur n et empreinte h sont
   vérifiées à la lecture. `data` garde la dernière version COURTE de la clé :
   les clients anciens (onglets pas rechargés, futur build figé) ne voient
   jamais de grosse valeur et ne touchent pas à `gros` (un upsert n'écrit que
   les colonnes envoyées). Ce qu'un client ancien écrit ensuite dans `data`
   est repris (union pour les listes à id) ou mis en copie de sauvetage
   (dernier-écrit-gagne), jamais perdu. Sans la colonne (SQL
   supabase/2026-09-26-workspaces-gros.sql pas encore passé), la grosse clé
   reste écartée comme avant, mais n'est plus jamais réécrite ici.
   Grosse clé « dernier écrit gagne » (planches) : BPO_SYNC_BASE_v1 retient la
   dernière version commune à l'appareil et au compte ; si les deux côtés ont
   changé, le perdant part D'ABORD en copie de sauvetage. Une clé « dernier
   écrit gagne » reçue sans rechargement (planches, cartouche) n'est jamais
   écrasée par l'ancienne version que l'app gardait en mémoire.
   RETOUR ARRIÈRE : GROS_ACTIF = false — JAMAIS l'ancien fichier (LISEZMOI). */

const KEYS = {
  /* clé localStorage            fusion   quoi                               */
  "BPO_CONFIGS_v1":              "ids",   /* configurations enregistrées      */
  "BPO_SCENES_v1":               "ids",   /* scènes                           */
  "BPO_TEMPLATES_v1":            "ids",   /* gabarits                         */
  "BPO_CFG_FOLDERS_v1":          "lww",   /* dossiers de configs              */
  "BPO_SCN_FOLDERS_v1":          "lww",   /* dossiers de scènes               */
  "BPO_PRIX_v1":                 "lww",   /* lignes de prix personnalisées    */
  "BPO_PLOT_v1":                 "lww",   /* parcelle / cadastre              */
  "BPO_BORD_v1":                 "lww",   /* bordereau                        */
  "BPO_BIND_v1":                 "lww",   /* liaisons bibliothèque            */
  "BPO_CART_v2":                 "lww",   /* cartouche (identité agence)      */
  "BPO_CATGRP_ORDER_v1":         "lww",   /* ordre des groupes du catalogue   */
  "BPO_PREFS_v1":                "lww",   /* préférences d'atelier            */
  "BPO_ANNOT_v1":                "lww",   /* annotations                      */
  "BPO_TEXADJ_v1":               "lww",   /* réglages de textures             */
  "BPO_SYNC_TOMB_v1":            "tomb"   /* identifiants supprimés (voir plus bas) */
};
/* PIERRES TOMBALES (08/08/2026) — une fusion par UNION ne peut pas voir une
   suppression : l'élément absent d'un côté est repris de l'autre, et ce qu'on
   supprimait revenait à la synchro suivante (constat utilisateur). On transporte
   donc les identifiants supprimés avec leur date, et l'union les écarte.
   Écrire un élément lève sa pierre (côté app) : un identifiant présent dans une
   liste ne peut pas être un identifiant supprimé. Les pierres de plus de six
   mois sont oubliées — passé ce délai, l'appareil qui n'a pas synchronisé a de
   toute façon divergé bien au-delà de cette question. */
const TOMB_KEY = "BPO_SYNC_TOMB_v1";
const TOMB_TTL = 180*24*3600*1000;
/* Volontairement HORS synchro : bpo_lang, BPO_PANEL_HID, BPO_INTRO_VOL
   (propres à l'appareil), BPO_AIKEY_v1 / bpoClaudeKey (secrets — ne montent
   jamais), bpoRef / bpoInterne (attribution / interne), sb-* (session). */

const META_KEY   = "BPO_SYNC_META_v1";     /* { clé: iso du dernier écrit local } */
const RESCUE_KEY = "BPO_SYNC_RESCUE_v1";   /* copies de sauvetage avant écrasement */
const BOOT_FLAG  = "BPO_SYNC_BOOT";        /* garde anti-boucle du rechargement    */
const MAX_VAL    = 700000;                 /* ~0,7 Mo par clé : au-delà, écartée   */
const PUSH_DELAY = 3000;
/* GROSSES CLÉS (26/09, AL : « Corriger la synchro ») : MAX_VAL reste le plafond
   de `data`, celui que connaissent les clients anciens (ils ne doivent JAMAIS y
   lire plus grand) ; au-delà, la clé va dans la colonne `gros`. */
const GROS_COL    = "gros";
const GROS_ACTIF  = true;                  /* (26/09) false = RETOUR ARRIÈRE SÛR (« étape 0 ») : `gros` ni lu ni écrit, grosses clés écartées mais jamais réécrites. Ne JAMAIS republier l'ancien bpo-sync.js à la place. */
const BASE_KEY    = "BPO_SYNC_BASE_v1";    /* { u: uid, k: {clé: empreinte de la dernière version commune}, e: {clé: [empreintes envoyées d'ici]}, l: délai de lecture complète } */
const DATA_MAX    = 4000000;               /* octets ~UTF-8 de `data`  (CHECK workspaces_data_size < 4 194 304) */
const GROS_MAX    = 15000000;              /* octets ~UTF-8 de `gros`  (CHECK workspaces_gros_size < 16 777 216) */
const PUSH_RETRY  = 30000;                 /* nouvel essai d'une poussée différée ou restée sans réponse (puis 60, 120, 240 s) */
const RETRY_MAX   = 10;
const LIGNEE      = 256;                   /* versions du compte retenues dans la lignée `a` d'une grosse clé */
const QUOTA_LOCAL = 5242880;               /* car. (clés + valeurs) : localStorage de Chromium, Firefox, Safari */
const MARGE_LOCALE = 1000000;              /* car. laissés libres à l'app quand la synchro dépose une grosse valeur */

const RAW = {
  get:    localStorage.getItem.bind(localStorage),
  set:    localStorage.setItem.bind(localStorage),
  remove: localStorage.removeItem.bind(localStorage)
};

function now(){ return new Date().toISOString(); }
/* Fenêtre SketchUp (CEF 2021) : un appel Supabase peut PENDRE indéfiniment
   (verrou/réseau) — chaque appel est borné ; au délai, l'atelier reste local
   pour la session et on le dit, jamais de blocage muet. */
function withTimeout(p, ms){
  return Promise.race([ p, new Promise(res => setTimeout(() => res({ __timeout: true }), ms)) ]);
}
function log(m){ try{ console.log("BPO sync : " + m); }catch(e){} }
function warn(m){ try{ console.warn("BPO sync : " + m); }catch(e){} }

function readMeta(){ try{ return JSON.parse(RAW.get(META_KEY)) || {}; }catch(e){ return {}; } }
function writeMeta(m){ try{ RAW.set(META_KEY, JSON.stringify(m)); }catch(e){} }

/* Union de listes à id. `win`/`lose` = chaînes JSON. Rend null si la forme ne
   s'y prête pas (pas deux tableaux d'objets) -> repli dernier-écrit-gagne. */
function mergeIds(win, lose, morts){
  let a, b;
  try{ a = JSON.parse(win); b = JSON.parse(lose); }catch(e){ return null; }
  if(!Array.isArray(a) || !Array.isArray(b)) return null;
  const okItem = x => x && typeof x === "object" && ("id" in x);
  if(!(a.every(okItem) && b.every(okItem))) return null;
  const mort = id => !!(morts && morts[String(id)]);
  const seen = new Set(a.map(x => String(x.id)));
  const out = a.filter(x => !mort(x.id));
  for(const it of b) if(!seen.has(String(it.id)) && !mort(it.id)) out.push(it);
  return JSON.stringify(out);
}
/* Retire d'une liste JSON les éléments dont l'identifiant est sous pierre.
   Rend la valeur inchangée s'il n'y a rien à retirer, null si la forme ne s'y
   prête pas. */
function filtreMorts(v, morts){
  let a;
  try{ a = JSON.parse(v); }catch(e){ return null; }
  if(!Array.isArray(a)) return null;
  const out = a.filter(x => !(x && typeof x === "object" && ("id" in x) && morts[String(x.id)]));
  return (out.length === a.length) ? v : JSON.stringify(out);
}
/* Deux jeux de pierres tombales : on garde pour chaque identifiant la date la
   PLUS RÉCENTE, et on oublie les plus vieilles que TOMB_TTL. */
function mergeTomb(av, bv){
  let a, b;
  try{ a = av ? JSON.parse(av) : {}; }catch(e){ a = {}; }
  try{ b = bv ? JSON.parse(bv) : {}; }catch(e){ b = {}; }
  const out = {}, limite = Date.now() - TOMB_TTL;
  for(const src of [a, b]){
    if(!src || typeof src !== "object") continue;
    for(const k in src){
      const m = src[k]; if(!m || typeof m !== "object") continue;
      const dst = out[k] = out[k] || {};
      for(const id in m){
        const d = Date.parse(m[id]); if(!(d > limite)) continue;
        if(!dst[id] || Date.parse(dst[id]) < d) dst[id] = m[id];
      }
      if(!Object.keys(dst).length) delete out[k];
    }
  }
  return JSON.stringify(out);
}

/* (26/09) rend true si la copie est faite (ou déjà là), false si ce navigateur
   la refuse (place) : l'appelant n'écrase alors RIEN. Une copie précédente
   différente de la même clé est gardée (« clé @ date »), plus écrasée. Une
   copie de grosse valeur n'est faite que s'il reste ensuite MARGE_LOCALE à l'app. */
function rescue(key, value, quoi){
  if(value === null || value === undefined) return true;          /* une suppression : rien à sauver */
  try{
    const r = JSON.parse(RAW.get(RESCUE_KEY) || "{}");
    for(const c in r) if((c === key || c.indexOf(key + " @ ") === 0) && r[c] && r[c].v === value) return true;
    if(r[key]){ let a = key + " @ " + r[key].t; while(r[a]) a += "'"; r[a] = r[key]; }
    r[key] = { v: value, t: now() };
    const s = JSON.stringify(r);
    if(estGros(value) && !placePour(RESCUE_KEY, s)) return false;
    RAW.set(RESCUE_KEY, s);
    warn((quoi || ("valeur locale « " + key + " » remplacée par celle du compte")) + " — copie de sauvetage dans " + RESCUE_KEY + ".");
    return true;
  }catch(e){ return false; }
}
/* (26/09) la valeur v tiendrait-elle sous la clé k en laissant MARGE_LOCALE car. à
   l'app ? Sans ce garde, une planche reçue ou une copie de sauvetage prenait la
   place du prochain enregistrement (« Sauvegarde impossible », fenêtre SketchUp). */
function placePour(k, v){
  let n = k.length + String(v).length;
  try{
    for(let i = 0; i < localStorage.length; i++){
      const c = localStorage.key(i);
      if(c !== null && c !== k) n += c.length + (RAW.get(c) || "").length;
    }
  }catch(e){ return true; }
  return n + MARGE_LOCALE <= QUOTA_LOCAL;
}

/* ---- GROSSES CLÉS (26/09, AL : « Corriger la synchro ») ---- */
/* Empreinte d'une valeur (longueur + deux hachages 32 bits) : intégrité d'une
   grosse valeur, identité d'une version. "null" pour une suppression. */
const HC = new Map();                      /* petit cache : les grosses chaînes reviennent souvent identiques */
const imul = Math.imul;
function empreinte(s){
  if(s === null || s === undefined) return "null";
  s = String(s);
  const c = (s.length > 4096) ? HC.get(s.length) : null;
  if(c && c.s === s) return c.h;
  let a = 0x811c9dc5, b = 0x9747b28c;
  for(let i = 0; i < s.length; i++){
    const x = s.charCodeAt(i);
    a = imul(a ^ x, 16777619);
    b = imul(b ^ x, 0x5bd1e995); b ^= b >>> 15;
  }
  const h = s.length.toString(36) + "-" + ("0000000" + (a >>> 0).toString(16)).slice(-8) + ("0000000" + (b >>> 0).toString(16)).slice(-8);
  if(s.length > 4096){ HC.set(s.length, { s: s, h: h }); if(HC.size > 16) HC.delete(HC.keys().next().value); }
  return h;
}
function estGros(v){ return typeof v === "string" && v.length > MAX_VAL; }
/* octets ~UTF-8 (ce que compte pg_column_size avant compression) */
function octets(s){
  let n = s.length;
  for(let i = 0; i < s.length; i++){ const c = s.charCodeAt(i); if(c > 0x7f) n += (c > 0x7ff && (c < 0xd800 || c > 0xdfff)) ? 2 : 1; }
  return n;
}
function poids(doc){
  let n = 2;
  for(const k in doc){ const e = doc[k]; n += k.length + 80 + ((e && typeof e.v === "string") ? octets(e.v) : 4); }
  return n;
}
/* "ok" | "abimee" (longueur ou empreinte fausse : jamais appliquée) | "inconnue"
   (autre format — version future du site — : jamais touchée) */
function grosEtat(e){
  if(!e || typeof e !== "object" || typeof e.v !== "string" || (e.f !== undefined && e.f !== 1)) return "inconnue";
  return (e.n === e.v.length && e.h === empreinte(e.v)) ? "ok" : "abimee";
}
function memeDoc(a, b){
  const ka = Object.keys(a);
  if(ka.length !== Object.keys(b).length) return false;
  for(const k of ka){
    const x = a[k], y = b[k];
    if(x === y) continue;
    if(!x || !y || x.v !== y.v) return false;
    if(k !== TOMB_KEY && (x.t !== y.t || x.h !== y.h || x.d !== y.d)) return false;   /* pierres : le contenu seul */
  }
  return true;
}
function sansColonneGros(err){
  return /42703|PGRST204/.test(String(err && err.code || "")) || /\bgros\b/.test(String(err && err.message || ""));
}
/* (26/09) le serveur a répondu NON (colonne, contrainte, requête invalide) : inutile
   de réessayer. Le reste — délai fixe des shims figés (« sans reponse »), coupure
   (« Failed to fetch », « reseau »), HTTP 5xx, jeton expiré — est une panne
   passagère : l'écriture a pu passer ; on réessaie et la relecture le verra. */
function refusDefinitif(err){
  const c = String(err && err.code || ""), m = String(err && err.message || "");
  return sansColonneGros(err) || /^(22|23|42)/.test(c) || /^PGRST[12]/.test(c) || /\bHTTP 4(00|13)\b/.test(m);
}
function kcar(n){ return n > 99999 ? (Math.round(n / 1000) + " k car.") : (n + " car."); }

export function startSync(sb){
  if(window.__BPO_SYNC__) return window.__BPO_SYNC__;

  const S = {
    uid: null,
    disabled: false,          /* table absente ou erreur bloquante            */
    server: {},               /* dernier état serveur connu { clé:{v,t} }     */
    serverStamp: null,        /* updated_at de la ligne au dernier pull       */
    dirty: new Set(),
    timer: null,
    pushing: false,
    gros: {},                 /* (26/09) colonne `gros` au dernier état connu { clé:{v,t,n,h,d,a} } */
    avecGros: GROS_ACTIF ? null : false,   /* (26/09) colonne `gros` suivie ? null = pas encore su */
    pourquoi: GROS_ACTIF ? "" : "désactivée (retour arrière)",   /* (26/09) sinon, pourquoi */
    lu: false,                /* (26/09) le compte a été lu dans cette session : sinon, jamais de poussée */
    encore: false,            /* (26/09) une poussée demandée pendant une autre : refaite après, plus perdue */
    essais: 0,
    nonVus: {},               /* (26/09) clés « dernier écrit gagne » appliquées ici SANS rechargement {clé: empreinte} : l'app garde l'ancienne en mémoire */
    dataDouteuse: false,      /* (26/09) notre dernière écriture est partie sans `data` : un client ancien a pu l'écrire juste avant */
    lecture: null,            /* (26/09) lecture de démarrage en cours (uid) : pas de seconde lecture complète en parallèle */
    dits: {},                 /* (26/09) avertissements déjà donnés (une fois par session) */
    ecartees: [],
    mesures: {}
  };
  window.__BPO_SYNC__ = S;
  if(!GROS_ACTIF) log("colonne `gros` désactivée (retour arrière) — clés de plus de " + MAX_VAL + " car. laissées de côté, jamais réécrites ici.");
  function uneFois(cle, m){ if(!S.dits[cle]){ S.dits[cle] = 1; warn(m); } }

  /* ---- interception des écritures locales (stamp + débonce du push) ---- */
  localStorage.setItem = function(k, v){
    RAW.set(k, v);
    if(k in KEYS){ const m = readMeta(); m[k] = now(); writeMeta(m); schedule(); }
  };
  localStorage.removeItem = function(k){
    RAW.remove(k);
    if(k in KEYS){ const m = readMeta(); m[k] = now(); writeMeta(m); schedule(); }
  };

  function schedule(){
    if(S.disabled || !S.uid) return;
    if(!S.lu && S.essais > 0 && S.essais <= RETRY_MAX) return;   /* (26/09) compte jamais lu : la relance espacée prévue suffit, pas une lecture complète par écriture locale */
    S.essais = 0;
    clearTimeout(S.timer);
    S.timer = setTimeout(() => { push(); }, PUSH_DELAY);
  }
  /* (26/09) poussée différée (compte illisible) ou sans réponse : nouvel essai
     dans 30 s, puis 60, 120, 240 s, dix fois au plus d'affilée ; une écriture
     locale relance (tout de suite si le compte a déjà été lu). */
  function relance(){
    if(S.disabled || !S.uid || ++S.essais > RETRY_MAX) return;
    clearTimeout(S.timer);
    S.timer = setTimeout(() => { push(); }, PUSH_RETRY * Math.pow(2, Math.min(S.essais - 1, 3)));
  }

  /* (26/09) BASE, propre au compte connecté : k = empreinte de la dernière
     version de chaque clé commune à cet appareil et au compte — dit, entre deux
     versions différentes, QUI a changé depuis (voir arbitre) ; e = empreintes
     des dernières versions ENVOYÉES d'ici ; l = délai de la lecture complète. */
  function lireBase(){
    let b = null;
    try{ b = JSON.parse(RAW.get(BASE_KEY)); }catch(e){}
    const ok = !!(b && typeof b === "object"), moi = ok && b.u === S.uid;
    return { u: S.uid, k: (moi && b.k) || {}, e: (moi && b.e) || {}, l: (ok && b.l) || 0 };
  }
  function ecrireBase(B){ try{ RAW.set(BASE_KEY, JSON.stringify(B)); }catch(e){} }
  /* ce que vaut une clé au compte, tel que cette session le connaît */
  function valeurCompte(k){
    const g = S.gros && S.gros[k], d = S.server && S.server[k];
    if(S.avecGros && g && grosEtat(g) === "ok") return g.v;
    return d ? d.v : null;
  }
  /* La base avance sur ce qui était commun AU MOMENT de la fusion (une retouche
     pendant l'envoi n'en fait pas partie) ET que le compte porte vraiment (pas une
     clé que `data`, trop lourd, n'a pas emportée) ; jamais sur une clé appliquée
     sans rechargement (l'app ne l'a pas vue). Vue complète du compte seulement. */
  function noteBase(m){
    if(S.avecGros !== true) return;
    const B = lireBase();
    for(const k in m.communs){
      if(m.trop[k] || S.nonVus[k] !== undefined) continue;
      if(empreinte(valeurCompte(k)) === m.communs[k]) B.k[k] = m.communs[k];
    }
    ecrireBase(B);
  }
  /* Avant d'écrire : ce qui part d'ici. Si le compte porte ensuite une de ces
     versions (réponse perdue, délai fixe d'un shim, envoi lent arrivé en retard,
     retouche pendant l'envoi), c'est la nôtre : pas un conflit. */
  function noteEnvoi(m){
    if(S.avecGros !== true) return;
    const B = lireBase();
    let n = 0;
    for(const k in m.communs){
      if(m.trop[k] || S.nonVus[k] !== undefined) continue;
      const h = m.communs[k], l = Array.isArray(B.e[k]) ? B.e[k] : [];
      if(empreinte(valeurCompte(k)) !== h && l.indexOf(h) < 0){ B.e[k] = [h].concat(l).slice(0, 8); n++; }
    }
    if(n) ecrireBase(B);
  }

  /* ---- lecture de l'état local des clés suivies ---- */
  function localMap(){
    const meta = readMeta(), out = {};
    for(const k in KEYS){
      const v = RAW.get(k);
      if(v === null && !meta[k]) continue;          /* jamais vue ici */
      out[k] = { v: v, t: meta[k] || null };        /* t null = jamais synchronisée */
    }
    return out;
  }

  /* (26/09) La valeur « du compte » d'une clé rangée dans `gros` : la grosse
     version, plus ce qu'un client ANCIEN a écrit depuis dans `data` (il n'y voit
     que la dernière version courte). g.d = empreinte de la version courte que la
     grosse a déjà intégrée : tant que `data` n'a pas bougé, il ne compte pas
     (sinon ses éléments supprimés reviendraient, pierres oubliées). */
  function fondGros(k, D, g, mk){
    const R = { v: g.v, t: g.t };
    if(!D || empreinte(D.v) === g.d) return R;
    if(KEYS[k] === "ids" && D.v !== null){
      const dt = D.t ? Date.parse(D.t) : 0, gt = g.t ? Date.parse(g.t) : 0;
      const u = (dt > gt) ? mergeIds(D.v, g.v, mk) : mergeIds(g.v, D.v, mk);
      if(u !== null) return { v: u, t: (dt > gt) ? D.t : g.t };
    }
    /* (26/09) copie refusée (place) : rien n'est intégré, la clé attend (null) */
    if(!rescue(k, D.v, "« " + k + " » écrite au compte par un client ancien après la grosse version (qui est gardée)")){
      uneFois("att " + k, "« " + k + " » écrite au compte par un client ancien : copie de sauvetage impossible ici (place) — rien n'est intégré ni écrasé, clé en attente sur cet appareil.");
      return null;
    }
    return R;
  }
  /* (26/09) Local L contre compte R quand une grosse valeur est en jeu : jamais
     d'écrasement à l'aveugle. Si un seul côté a changé depuis la BASE, il gagne
     (succession normale). Si les deux, ou base inconnue (première synchro avec
     ce code) : CONFLIT — la grosse version l'emporte sur une courte (la courte
     vient d'un appareil qui ne voyait pas la grosse), sinon la plus récente ; le
     perdant part D'ABORD en copie de sauvetage ; si ce navigateur la refuse,
     rien n'est écrasé (« attente »). g.a = empreintes des versions dont la
     grosse du compte descend : si NOTRE base n'y est pas, deux écritures se
     sont croisées pendant un envoi (la nôtre a été recouverte sans être vue)
     -> conflit aussi, jamais d'abandon muet. */
  function arbitre(k, L, R, B, D, g){
    const hl = empreinte(L.v), hr = empreinte(R.v), nv = S.nonVus[k];
    let b = B.k[k];
    /* reçue ici sans rechargement : le local vaut ce qu'on a appliqué, ou l'ancienne
       version que l'app avait en mémoire et vient de réécrire -> rien de neuf ici */
    if(nv !== undefined && (hl === nv || hl === b)) return "compte";
    if(b === undefined && D && empreinte(D.v) === hl) b = hl;   /* le local EST la version courte du compte */
    if(Array.isArray(B.e[k]) && B.e[k].indexOf(hr) >= 0) b = hr;   /* le compte porte une version envoyée D'ICI : pas un conflit */
    const lm = (b === undefined) || hl !== b, rm = (b === undefined) || hr !== b;
    if(lm && !rm) return "local";
    if(rm && !lm && (!g || (Array.isArray(g.a) ? g.a : []).indexOf(b) >= 0)) return "compte";
    const gl = estGros(L.v), gr = estGros(R.v);
    const lt = L.t ? Date.parse(L.t) : 0, rt = R.t ? Date.parse(R.t) : 0;
    const local = (gl !== gr) ? gl : (lt > rt);
    const perdant = local ? R : L;
    if(!rescue(k, perdant.v, "conflit sur « " + k + " » : " + (local ? "version du compte" : "version locale") + " (" + kcar(String(perdant.v).length) + ") non retenue")){
      warn("conflit sur « " + k + " » : copie de sauvetage impossible ici (place) — rien n'est écrasé, clé en attente sur cet appareil.");
      return "attente";
    }
    return local ? "local" : "compte";
  }

  /* ---- fusion locale/serveur -> { merged, applied[], dirty[], trop{} } ---- */
  function merge(loc, srv, gros){
    const merged = {}, applied = [], dirty = [];
    const trop = {};   /* (26/09, AL : « Corriger la synchro ») clés tenues à l'écart ici : ni appliquées, ni poussées, ni filtrées */
    const G = S.avecGros ? (gros || {}) : {};
    const B = lireBase();
    const keys = new Set([...Object.keys(loc), ...Object.keys(srv), ...Object.keys(G)]);
    /* Les pierres tombales D'ABORD : l'union des listes doit connaître TOUTES les
       suppressions, celles d'ici comme celles d'une autre machine. */
    let morts = {};
    {
      const L = loc[TOMB_KEY], R = srv[TOMB_KEY];
      const u = mergeTomb(L ? L.v : null, R ? R.v : null);
      try{ morts = JSON.parse(u) || {}; }catch(e){ morts = {}; }
      if(L || R){
        merged[TOMB_KEY] = { v: u, t: now() };
        if(!R || u !== R.v) dirty.push(TOMB_KEY);
        if(!L || u !== L.v) applied.push(TOMB_KEY);
      }
      keys.delete(TOMB_KEY);
    }
    for(const k of keys){
      if(!(k in KEYS)) continue;                    /* le serveur peut porter des clés d'une version future */
      const L = loc[k];
      let R = srv[k], gk = false;
      if(G[k]){                                     /* (26/09) grosse version au compte */
        const etat = grosEtat(G[k]);
        if(etat === "inconnue"){
          warn("clé « " + k + " » : format inconnu dans `gros` (version plus récente du site ?) — laissée telle quelle, non synchronisée ici.");
          if(R) merged[k] = R;
          trop[k] = 1;
          continue;
        }
        let g = G[k];
        if(etat === "abimee"){
          /* (26/09) jamais appliquée, jamais retirée : seul l'appareil qui a la version
             annoncée (n, h), ou qui en descend (sa base), la répare ; les autres attendent */
          const h0 = (L && typeof L.v === "string") ? empreinte(L.v) : "";
          if(!h0 || (h0 !== g.h && B.k[k] !== g.h)){
            uneFois("abi " + k, "clé « " + k + " » : copie du compte abîmée (longueur ou empreinte) — ni appliquée ni retirée ; l'appareil qui a cette version la réparera.");
            if(R) merged[k] = R;
            trop[k] = 1;
            continue;
          }
          warn("clé « " + k + " » : copie du compte abîmée (longueur ou empreinte) — réparée depuis cet appareil.");
          g = { v: L.v, t: (h0 === g.h) ? g.t : (L.t || now()), d: g.d };
        }
        const F = fondGros(k, R, g, morts[k] || null);
        if(!F){ if(R) merged[k] = R; trop[k] = 1; continue; }
        R = F; gk = true;
      }
      if(!S.avecGros && L && (L.v !== null) && String(L.v).length > MAX_VAL){
        uneFois("lourd " + k, "clé « " + k + " » trop lourde (" + String(L.v).length + " car.) — non synchronisée" + (S.avecGros === false ? " (colonne `gros` : " + (S.pourquoi || "absente au compte") + ")." : "."));
        if(srv[k]) merged[k] = srv[k];
        trop[k] = 1;
        continue;
      }
      if(!R){ if(L){ merged[k] = { v: L.v, t: L.t || now() }; dirty.push(k); } continue; }
      if(!L){ merged[k] = R; applied.push(k); continue; }
      if(L.v === R.v){ merged[k] = { v: R.v, t: R.t }; continue; }
      const lt = L.t ? Date.parse(L.t) : 0;
      const rt = R.t ? Date.parse(R.t) : 0;
      /* listes à id : UNION, le côté le plus récent gagne les collisions */
      if(KEYS[k] === "ids" && L.v !== null && R.v !== null){
        const mk = morts[k] || null;
        const u = (rt >= lt) ? mergeIds(R.v, L.v, mk) : mergeIds(L.v, R.v, mk);
        if(u !== null){
          merged[k] = { v: u, t: now() };
          if(u !== R.v) dirty.push(k);
          if(u !== L.v){ if(!L.t) rescue(k, L.v); applied.push(k); }
          continue;
        }
      }
      if(S.avecGros && (gk || estGros(L.v) || estGros(R.v))){   /* (26/09) une grosse valeur en jeu */
        const c = arbitre(k, L, R, B, srv[k], gk ? G[k] : null);
        if(c === "local"){ merged[k] = { v: L.v, t: L.t || now() }; dirty.push(k); delete S.nonVus[k]; }
        else if(c === "compte"){ merged[k] = R; applied.push(k); }
        else { merged[k] = srv[k] || R; trop[k] = 1; }
        continue;
      }
      /* (26/09) petite clé « dernier écrit gagne » reçue ici sans rechargement : l'app
         la réécrit depuis sa mémoire (l'ancienne) -> le compte gagne ; si elle y a
         retouché, c'est un conflit : la plus récente gagne comme avant, mais l'autre
         part D'ABORD en copie de sauvetage (sinon rien n'est écrasé). */
      const nv = (KEYS[k] === "lww") ? S.nonVus[k] : undefined;
      if(nv !== undefined){
        const hl = empreinte(L.v);
        if(hl === nv || hl === B.k[k]){ merged[k] = R; applied.push(k); continue; }
        const perdant = (lt > rt) ? R : L;
        if(!rescue(k, perdant.v, "conflit sur « " + k + " » (reçue ici sans rechargement, puis réécrite) : " + (lt > rt ? "version du compte" : "version locale") + " non retenue")){ merged[k] = R; trop[k] = 1; continue; }
      }
      if(rt >= lt){                                  /* le serveur gagne */
        if(!L.t && L.v !== null) rescue(k, L.v);     /* jamais synchronisée -> sauvetage */
        merged[k] = R; applied.push(k);
      } else {                                       /* le local gagne */
        merged[k] = { v: L.v, t: L.t }; dirty.push(k); delete S.nonVus[k];
      }
    }
    /* FILET — quelle que soit la branche empruntée (union, serveur gagne, local
       gagne, ou un seul côté présent), aucune liste ne doit ressortir avec un
       identifiant supprimé. Sans lui, un appareil qui découvre la liste du
       serveur ressusciterait les éléments effacés ailleurs, et plus rien ne les
       filtrerait ensuite puisque les deux côtés seraient devenus identiques. */
    for(const k in merged){
      if(KEYS[k] !== "ids" || trop[k]) continue;   /* (26/09) jamais le filet sur une clé écartée : il y écrivait la copie périmée du compte */
      const e = merged[k]; if(!e || e.v == null) continue;
      const mk = morts[k]; if(!mk || !Object.keys(mk).length) continue;
      const f = filtreMorts(e.v, mk);
      if(f !== null && f !== e.v){
        merged[k] = { v: f, t: now() };
        if(dirty.indexOf(k) < 0) dirty.push(k);
        if(applied.indexOf(k) < 0) applied.push(k);
      }
    }
    return { merged, applied, dirty, trop };
  }

  /* (26/09) Découpe le résultat de la fusion entre `data` — clés ≤ MAX_VAL, au
     format d'avant, ce que lisent les clients anciens — et `gros`. Une clé
     rangée dans `gros` laisse dans `data` sa dernière version courte, INTACTE.
     Rien de ce qu'on ne connaît pas n'est retiré (clés d'une version future). */
  function range(merged, trop){
    const srvD = S.server || {}, srvG = S.gros || {};
    const data = {}, gros = {};
    for(const k in srvD) if(!(k in KEYS)) data[k] = srvD[k];
    if(S.avecGros) for(const k in srvG) gros[k] = srvG[k];
    const sortent = [];   /* (26/09) clés qui quittent `gros` pour `data` */
    for(const k in merged){
      const e = merged[k], D = srvD[k];
      if(trop[k]){ if(D) data[k] = D; continue; }
      if(S.avecGros && k !== TOMB_KEY && estGros(e.v)){
        const d = D ? empreinte(D.v) : "", g0 = srvG[k], h = empreinte(e.v);
        const connu = grosEtat(g0) !== "inconnue", ok0 = grosEtat(g0) === "ok", a0 = (connu && Array.isArray(g0.a)) ? g0.a : [];
        /* a : lignée (LIGNEE dernières versions du compte dont celle-ci descend ; une
           entrée abîmée qu'on répare garde la sienne) */
        const a = !connu ? (D ? [d] : []) : (g0.h === h ? a0 : [g0.h].concat(a0).slice(0, LIGNEE));
        gros[k] = (ok0 && g0.v === e.v && g0.t === e.t && g0.d === d) ? g0
                : { v: e.v, t: e.t, n: e.v.length, h: h, d: d, a: a };
        if(D) data[k] = D;
      } else {
        data[k] = e;
        if(gros[k]){ sortent.push(k); delete gros[k]; }
      }
    }
    /* garde des totaux : un upsert qui dépasse un CHECK est refusé EN ENTIER */
    let pg = S.avecGros ? poids(gros) : 0;
    if(pg > GROS_MAX){
      const neufs = Object.keys(gros).filter(k => gros[k] !== srvG[k] && typeof gros[k].v === "string")
                          .sort((a, b) => gros[b].v.length - gros[a].v.length);
      for(const k of neufs){
        if(pg <= GROS_MAX) break;
        warn("`gros` au-delà de " + GROS_MAX + " octets : « " + k + " » (" + kcar(gros[k].v.length) + ") n'est pas poussée, le compte garde sa version.");
        if(srvG[k]) gros[k] = srvG[k]; else delete gros[k];
        trop[k] = 1;
        pg = poids(gros);
      }
    }
    let pd = poids(data);
    /* (26/09) `data` trop lourd pour partir : une clé qui redescend sous le plafond
       ne quitte pas `gros` (sinon sa vieille version courte de `data` redeviendrait
       « la version du compte ») ; elle reste ici jusqu'à ce que `data` s'allège. */
    if(pd >= DATA_MAX && sortent.length){
      for(const k of sortent){
        gros[k] = srvG[k];
        if(srvD[k]) data[k] = srvD[k]; else delete data[k];
        trop[k] = 1;
        uneFois("sort " + k, "« " + k + " » allégée sous " + MAX_VAL + " car. mais `data` trop lourd (" + pd + " octets) — gardée ici, le compte garde sa grosse version ; alléger l'atelier.");
      }
      pd = poids(data);
    }
    return { data, gros, pd, pg,
             dataChange: !memeDoc(srvD, data),
             grosChange: !!S.avecGros && !memeDoc(srvG, gros) };
  }

  function applyLocally(merged, applied){
    const meta = readMeta(), ok = [];
    for(const k of applied){
      const e = merged[k];
      /* (26/09) place refusée par ce navigateur (quota) : la clé reste au compte,
         pas ici — sans ce garde l'exception arrêtait TOUTE la synchro de l'appareil.
         Une grosse valeur n'entre que si l'app garde ensuite MARGE_LOCALE de place. */
      if(estGros(e.v) && !placePour(k, e.v)){
        uneFois("place " + k, "clé « " + k + " » : place insuffisante dans ce navigateur (" + kcar(e.v.length) + ", il faut laisser " + kcar(MARGE_LOCALE) + " à l'app) — gardée au compte, pas ici.");
        continue;
      }
      try{ if(e.v === null) RAW.remove(k); else RAW.set(k, e.v); }
      catch(err){ warn("clé « " + k + " » : place insuffisante dans ce navigateur (" + String(e.v).length + " car.) — gardée au compte, pas ici."); continue; }
      meta[k] = e.t || now();
      ok.push(k);
    }
    writeMeta(meta);
    return ok;
  }

  /* (26/09) fusion + découpage + application locale : tout ce qu'une poussée envoie.
     enPoussee : appliquée SANS rechargement (poussée, ou lecture de démarrage après
     un rechargement déjà fait) — l'app ne voit pas ce qui arrive. */
  function fusion(enPoussee){
    const m = merge(localMap(), S.server, S.gros);
    const r = range(m.merged, m.trop);
    m.appliedOk = m.applied.length ? applyLocally(m.merged, m.applied) : [];
    m.data = r.data; m.gros = r.gros; m.pd = r.pd; m.pg = r.pg;
    m.dataChange = r.dataChange; m.grosChange = r.grosChange;
    /* versions communes à cet appareil et au compte À CET INSTANT (voir noteBase) */
    m.communs = {};
    for(const k in m.merged){
      if(m.trop[k] || !(k in KEYS) || k === TOMB_KEY) continue;
      const e = m.merged[k], v = RAW.get(k);
      if(v === e.v || (v === null && e.v === null)) m.communs[k] = empreinte(e.v);
    }
    /* clé « dernier écrit gagne » reçue sans rechargement : l'app garde l'ancienne en
       mémoire (planches, cartouche) et la réécrira ; on retient ce qu'on a appliqué */
    if(enPoussee) for(const k of m.appliedOk) if(KEYS[k] === "lww") S.nonVus[k] = empreinte(m.merged[k].v);
    S.ecartees = Object.keys(m.trop);
    return m;
  }
  /* (26/09) appliqué sans rechargement : on le dit, et un évènement permet à l'app
     de relire (plotLoad, cartLoad…) le jour où elle l'écoutera */
  function signale(cles){
    cles = cles.filter(k => k !== TOMB_KEY);
    if(!cles.length) return;
    warn("atelier du compte appliqué sans rechargement (" + cles.join(", ") + ") — recharger la page pour le voir.");
    try{ window.dispatchEvent(new CustomEvent("bpo-sync-applique", { detail: { cles: cles.slice() } })); }catch(e){}
  }

  /* (26/09) une lecture bornée ; au délai, supabase-js ANNULE la requête (les octets
     cessent de descendre) ; les shims figés (SketchUp, ?es5) ont leur délai de 8 s. */
  function borne(q, ms){
    let ac = null;
    try{ if(typeof AbortController === "function" && typeof q.abortSignal === "function"){ ac = new AbortController(); q = q.abortSignal(ac.signal); } }catch(e){ ac = null; }
    return withTimeout(q.maybeSingle(), ms).then(r => { if(r && r.__timeout && ac){ try{ ac.abort(); }catch(e){} } return r; });
  }
  /* (26/09) délai d'une lecture : 8 s + 1 s par 64 Ko attendus (d'après l'atelier
     local : ~0,5 Mbit/s), allongé après un échec (l) ; le code d'avant donnait 8 s. */
  function delaiLecture(complet){
    let n = 0;
    for(const k in KEYS){ const v = RAW.get(k); if(v && (complet || v.length <= MAX_VAL)) n += v.length; }
    const d = 8000 + Math.floor(n / 65536) * 1000;
    return complet ? Math.max(d, lireBase().l || 0) : d;
  }
  /* (26/09) lecture de la ligne. Sans la colonne `gros` (SQL pas encore passé) : on
     le dit une fois et on relit comme avant. Première lecture complète de la session
     sans réponse ou coupée (lien lent, délai fixe des shims) : relue SANS `gros`, les
     grosses clés restent de côté pour la session, les petites se synchronisent
     comme avant ; le délai de la lecture complète est allongé pour la prochaine fois. */
  async function lireLigne(){
    const uid = S.uid, complet = S.avecGros !== false;
    const lis = (cols, ms) => borne(sb.from("workspaces").select(cols).eq("id", uid), ms);
    const r = await lis(complet ? "data," + GROS_COL + ",updated_at" : "data,updated_at", delaiLecture(complet));
    if(!complet || S.uid !== uid) return r;
    if(!r.__timeout && r.error && sansColonneGros(r.error)){
      S.avecGros = false; S.pourquoi = "absente au compte";
      log("colonne `gros` absente au compte — les clés de plus de " + MAX_VAL + " car. restent écartées (exécuter supabase/2026-09-26-workspaces-gros.sql).");
      return lis("data,updated_at", delaiLecture(false));
    }
    if(r.__timeout || (r.error && !refusDefinitif(r.error))){
      const B = lireBase(); B.l = Math.min(Math.max(B.l || 0, delaiLecture(true)) * 2, 120000); ecrireBase(B);
      if(S.avecGros !== null) return r;
      const r2 = await lis("data,updated_at", delaiLecture(false));
      if(S.uid === uid && !r2.__timeout && !r2.error){
        S.avecGros = false; S.pourquoi = "lecture complète trop lente, pour cette session";
        warn("lecture complète du compte sans réponse ou coupée — clés de plus de " + MAX_VAL + " car. laissées de côté pour cette session (les autres se synchronisent) ; nouvel essai à la prochaine ouverture.");
      }
      return r2;
    }
    if(!r.error && S.avecGros === null) S.avecGros = true;
    return r;
  }
  function adopte(row){
    S.server = (row && row.data) || {};
    S.gros = (row && row[GROS_COL]) || {};
    S.serverStamp = row ? row.updated_at : null;
    S.lu = true;
    S.dataDouteuse = false;
  }
  function grossesAuCompte(){
    const l = Object.keys(S.gros || {}).map(k => k + " " + kcar((S.gros[k] && S.gros[k].n) || 0));
    return l.length ? ", grosses : " + l.join(", ") : "";
  }

  /* ---- tirer + fusionner (+ pousser si besoin, + recharger si le local a changé) ---- */
  async function pull(){
    if(S.disabled) return;
    const uid = S.uid;                               /* (26/09) changement de compte pendant la lecture : celle du nouveau est partie */
    let row = null;
    const t0 = Date.now();
    S.lecture = uid;
    try{
      const r = await lireLigne();
      if(S.uid !== uid) return;
      if(r.__timeout){ warn("lecture du compte sans réponse — rien ne part tant qu'il n'est pas lu ; nouvel essai à la prochaine modification (puis espacé)."); return; }
      if(r.error){
        const msg = (r.error.message || "") + " " + (r.error.code || "");
        if(/PGRST205|42P01|Could not find the table/i.test(msg)){
          S.disabled = true;
          log("table `workspaces` absente — synchronisation inactive (exécuter supabase/2026-08-06-workspaces-sync.sql).");
          return;
        }
        warn("lecture impossible (" + msg.trim() + ") — rien ne part tant que le compte n'est pas lu ; nouvel essai à la prochaine modification.");
        return;
      }
      row = r.data;
    }catch(e){ warn("réseau indisponible — rien ne part tant que le compte n'est pas lu ; nouvel essai à la prochaine modification."); return; }
    finally{ if(S.lecture === uid) S.lecture = null; }

    adopte(row);
    S.mesures.lecture = { ms: Date.now() - t0, octets: poids(S.server) + poids(S.gros) };
    /* (26/09) rechargement déjà fait dans cet onglet : ce qui arrive maintenant ne
       sera pas vu par l'app (voir fusion) */
    let boot = null; try{ boot = sessionStorage.getItem(BOOT_FLAG); }catch(e){}
    const m = fusion(!!boot);
    const applied = m.appliedOk;
    for(const k of m.dirty) S.dirty.add(k);
    if(S.dirty.size || m.dataChange || m.grosChange) await push(m);
    else noteBase(m);
    if(S.uid !== uid) return;

    if(applied.length){
      /* l'app a déjà construit son UI sur l'ancien local : un rechargement
         (UNE fois — garde sessionStorage) fait apparaître l'atelier du compte. */
      if(boot){ signale(applied); }
      else{
        try{ sessionStorage.setItem(BOOT_FLAG, "1"); }catch(e){}
        log("atelier du compte appliqué (" + applied.join(", ") + ") — rechargement.");
        location.reload();
        return;
      }
    } else {
      try{ sessionStorage.removeItem(BOOT_FLAG); }catch(e){}
    }
    log("prêt (" + Object.keys(S.server).length + " clé(s) au compte" + grossesAuCompte() + " ; lu " + Math.round(S.mesures.lecture.octets / 1024) + " Ko en " + S.mesures.lecture.ms + " ms).");
  }

  /* ---- pousser (upsert de l'atelier fusionné entier) ---- */
  async function push(pre){
    if(S.disabled || !S.uid) return;
    if(S.pushing){ S.encore = true; return; }        /* (26/09) plus perdue : refaite à la fin de celle en cours */
    if(!pre && !S.lu && S.lecture === S.uid){ relance(); return; }   /* (26/09) la lecture de démarrage court encore (lien lent) : elle fusionnera ce qui est écrit d'ici là */
    S.pushing = true;
    const uid = S.uid;                               /* (26/09) le compte de CETTE poussée : s'il change en route, elle est abandonnée */
    try{
      /* un autre appareil a-t-il écrit depuis notre dernier pull ? -> re-fusion */
      let m = pre;
      if(!m){
        /* (26/09, AL : « Corriger la synchro ») l'horodatage seul d'abord : le
           document entier ne descend que s'il a changé. Et JAMAIS de poussée sur
           un état du compte périmé ou jamais lu : elle écraserait ce qu'un autre
           appareil vient d'écrire (ou toute la ligne, par le seul état local). */
        let frais = false;
        try{
          const r0 = await withTimeout(sb.from("workspaces").select("updated_at").eq("id", uid).maybeSingle(), 4000);
          if(S.uid !== uid) return;
          if(!r0.__timeout && !r0.error){
            let complet = true;
            if(!r0.data){ if(!S.lu || S.serverStamp !== null) adopte(null); frais = true; complet = false; }
            else if(S.lu && r0.data.updated_at === S.serverStamp){
              complet = false;
              if(!S.dataDouteuse) frais = true;
              else{
                /* notre dernière écriture est partie sans `data` : un client ancien a pu
                   l'écrire juste avant, et l'horodatage rendu couvre la sienne -> on relit `data` */
                const r1 = await borne(sb.from("workspaces").select("data,updated_at").eq("id", uid), delaiLecture(false));
                if(S.uid !== uid) return;
                if(!r1.__timeout && !r1.error && r1.data && r1.data.updated_at === S.serverStamp){ S.server = r1.data.data || {}; S.dataDouteuse = false; frais = true; }
                else if(!r1.__timeout && !r1.error) complet = true;     /* écrit entre-temps : lecture complète */
              }
            }
            if(complet){
              const r = await lireLigne();
              if(S.uid !== uid) return;
              if(!r.__timeout && !r.error && r.data && ("data" in r.data)){ adopte(r.data); frais = true; }
            }
          }
        }catch(e){}
        if(!frais){
          warn((S.lu ? "compte illisible juste avant l'écriture" : "compte pas encore lu") + " — poussée différée, rien n'est écrasé ; nouvel essai espacé (30 s, 60 s…) ou à la prochaine modification.");
          relance();
          return;
        }
        m = fusion(true);
        signale(m.appliedOk);
      }
      const envoiData = m.dataChange && m.pd < DATA_MAX, envoiGros = m.grosChange;
      if(m.dataChange && !envoiData) uneFois("data lourd", "`data` trop lourd pour le compte (" + m.pd + " octets, CHECK 4 194 304) — petites clés non poussées ; alléger l'atelier (vignettes, planches).");
      if(!envoiData && !envoiGros){
        if(!m.dataChange) S.dirty.clear();
        noteBase(m);
        S.essais = 0;
        return;
      }
      const rec = { id: uid };
      if(envoiData) rec.data = m.data;
      if(envoiGros) rec[GROS_COL] = m.gros;
      const taille = (envoiData ? m.pd : 0) + (envoiGros ? m.pg : 0);
      noteEnvoi(m);
      const t0 = Date.now();
      const r2 = await withTimeout(sb.from("workspaces")
        .upsert(rec, { onConflict: "id" })
        .select("updated_at").maybeSingle(), 8000 + Math.floor(taille / 131072) * 1000);
      if(S.uid !== uid) return;
      if(r2 && r2.__timeout){ warn("écriture sans réponse (" + Math.round(taille / 1024) + " Ko) — nouvel essai dans 30 s ou à la prochaine modification ; si elle est passée, la relecture le verra."); relance(); }
      else if(r2 && r2.error){
        const msg = ((r2.error.message || "") + " " + (r2.error.code || "")).trim();
        if(!refusDefinitif(r2.error)){
          /* (26/09) délai fixe des shims, coupure : l'écriture a pu passer — pas de repli */
          warn("écriture sans réponse ou coupée (" + msg + ") — nouvel essai dans 30 s ou à la prochaine modification ; si elle est passée, la relecture le verra.");
          relance();
        }
        else if(envoiGros){
          /* (26/09) refus du serveur (CHECK, requête) : repli sur le fonctionnement
             d'avant pour la session, les petites clés continuent. */
          S.avecGros = false; S.pourquoi = "écriture refusée par le serveur, pour cette session";
          warn("écriture de la colonne `gros` refusée par le serveur (" + msg + ") — clés de plus de " + MAX_VAL + " car. laissées de côté pour cette session, les autres continuent.");
          relance();
        }
        else warn("écriture impossible (" + msg + ") — nouvel essai à la prochaine modification.");
      }
      else{
        if(envoiData) S.server = m.data;
        if(envoiGros) S.gros = m.gros;
        if(r2 && r2.data) S.serverStamp = r2.data.updated_at;
        S.dataDouteuse = !envoiData;                 /* (26/09) voir plus haut */
        if(envoiData || !m.dataChange) S.dirty.clear();
        S.essais = 0;
        noteBase(m);
        S.mesures.poussee = { ms: Date.now() - t0, octets: taille, data: envoiData, gros: envoiGros };
        log("atelier poussé au compte (" + Object.keys(m.merged).length + " clé(s)" + (envoiGros ? grossesAuCompte() : "") +
            " ; " + Math.round(taille / 1024) + " Ko en " + S.mesures.poussee.ms + " ms).");
      }
    } finally {
      S.pushing = false;
      if(S.encore){ S.encore = false; schedule(); }
    }
  }

  /* ---- vidage best-effort quand la page part en arrière-plan ---- */
  function flushOnHide(){
    if(S.disabled || !S.uid || !S.dirty.size) return;
    clearTimeout(S.timer);
    push();                                          /* fetch keepalive géré par supabase-js/navigateur */
  }
  document.addEventListener("visibilitychange", () => { if(document.visibilityState === "hidden") flushOnHide(); });
  window.addEventListener("pagehide", flushOnHide);

  /* ---- démarrage + suivi de session (conversion anonyme, changement de compte) ---- */
  (async () => {
    try{
      const { data:{ session } } = await sb.auth.getSession();
      if(!session){ log("pas de session — synchronisation en attente."); return; }
      S.uid = session.user.id;
      await pull();
    }catch(e){ warn("démarrage impossible (" + (e && e.message) + ")."); }
  })();
  sb.auth.onAuthStateChange((_e, s) => {
    const uid = s && s.user ? s.user.id : null;
    if(uid && uid !== S.uid){ S.uid = uid; S.dirty.clear(); S.lu = false; S.server = {}; S.gros = {}; S.serverStamp = null; S.dataDouteuse = false; S.essais = 0; pull(); }
  });

  /* diagnostic console : BPO_SYNC.pull() / .flush() / .status() */
  window.BPO_SYNC = {
    pull: () => pull(),
    flush: () => push(),
    status: () => ({ uid: S.uid, disabled: S.disabled, dirty: [...S.dirty], serveur: Object.keys(S.server), ecartees: S.ecartees || [],
                     gros: (S.avecGros === null) ? "?" : (S.avecGros ? Object.keys(S.gros).map(k => k + " " + ((S.gros[k] && S.gros[k].n) || "?")) : ("colonne `gros` : " + (S.pourquoi || "absente au compte"))),
                     aRecharger: Object.keys(S.nonVus),
                     sauvetage: (RAW.get(RESCUE_KEY) || "").length, mesures: S.mesures })
  };
  return S;
}
