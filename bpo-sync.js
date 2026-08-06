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
   en compte, l'id auth est conservé -> l'atelier suit, comme promis. */

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
  "BPO_TEXADJ_v1":               "lww"    /* réglages de textures             */
};
/* Volontairement HORS synchro : bpo_lang, BPO_PANEL_HID, BPO_INTRO_VOL
   (propres à l'appareil), BPO_AIKEY_v1 / bpoClaudeKey (secrets — ne montent
   jamais), bpoRef / bpoInterne (attribution / interne), sb-* (session). */

const META_KEY   = "BPO_SYNC_META_v1";     /* { clé: iso du dernier écrit local } */
const RESCUE_KEY = "BPO_SYNC_RESCUE_v1";   /* copies de sauvetage avant écrasement */
const BOOT_FLAG  = "BPO_SYNC_BOOT";        /* garde anti-boucle du rechargement    */
const MAX_VAL    = 700000;                 /* ~0,7 Mo par clé : au-delà, écartée   */
const PUSH_DELAY = 3000;

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
function mergeIds(win, lose){
  let a, b;
  try{ a = JSON.parse(win); b = JSON.parse(lose); }catch(e){ return null; }
  if(!Array.isArray(a) || !Array.isArray(b)) return null;
  const okItem = x => x && typeof x === "object" && ("id" in x);
  if(!(a.every(okItem) && b.every(okItem))) return null;
  const seen = new Set(a.map(x => String(x.id)));
  const out = a.slice();
  for(const it of b) if(!seen.has(String(it.id))) out.push(it);
  return JSON.stringify(out);
}

function rescue(key, value){
  try{
    const r = JSON.parse(RAW.get(RESCUE_KEY) || "{}");
    r[key] = { v: value, t: now() };
    RAW.set(RESCUE_KEY, JSON.stringify(r));
    warn("valeur locale « " + key + " » remplacée par celle du compte — copie de sauvetage dans " + RESCUE_KEY + ".");
  }catch(e){}
}

export function startSync(sb){
  if(window.__BPO_SYNC__) return window.__BPO_SYNC__;

  const S = {
    uid: null,
    disabled: false,          /* table absente ou erreur bloquante            */
    server: {},               /* dernier état serveur connu { clé:{v,t} }     */
    serverStamp: null,        /* updated_at de la ligne au dernier pull       */
    dirty: new Set(),
    timer: null,
    pushing: false
  };
  window.__BPO_SYNC__ = S;

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
    clearTimeout(S.timer);
    S.timer = setTimeout(() => { push(); }, PUSH_DELAY);
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

  /* ---- fusion locale/serveur -> { merged, applied[], dirty[] } ---- */
  function merge(loc, srv){
    const merged = {}, applied = [], dirty = [];
    const keys = new Set([...Object.keys(loc), ...Object.keys(srv)]);
    for(const k of keys){
      if(!(k in KEYS)) continue;                    /* le serveur peut porter des clés d'une version future */
      const L = loc[k], R = srv[k];
      if(L && (L.v !== null) && String(L.v).length > MAX_VAL){
        warn("clé « " + k + " » trop lourde (" + String(L.v).length + " car.) — non synchronisée.");
        if(R) merged[k] = R;
        continue;
      }
      if(!R){ if(L){ merged[k] = { v: L.v, t: L.t || now() }; dirty.push(k); } continue; }
      if(!L){ merged[k] = R; applied.push(k); continue; }
      if(L.v === R.v){ merged[k] = { v: R.v, t: R.t }; continue; }
      const lt = L.t ? Date.parse(L.t) : 0;
      const rt = R.t ? Date.parse(R.t) : 0;
      /* listes à id : UNION, le côté le plus récent gagne les collisions */
      if(KEYS[k] === "ids" && L.v !== null && R.v !== null){
        const u = (rt >= lt) ? mergeIds(R.v, L.v) : mergeIds(L.v, R.v);
        if(u !== null){
          merged[k] = { v: u, t: now() };
          if(u !== R.v) dirty.push(k);
          if(u !== L.v){ if(!L.t) rescue(k, L.v); applied.push(k); }
          continue;
        }
      }
      if(rt >= lt){                                  /* le serveur gagne */
        if(!L.t && L.v !== null) rescue(k, L.v);     /* jamais synchronisée -> sauvetage */
        merged[k] = R; applied.push(k);
      } else {                                       /* le local gagne */
        merged[k] = { v: L.v, t: L.t }; dirty.push(k);
      }
    }
    return { merged, applied, dirty };
  }

  function applyLocally(merged, applied){
    const meta = readMeta();
    for(const k of applied){
      const e = merged[k];
      if(e.v === null) RAW.remove(k); else RAW.set(k, e.v);
      meta[k] = e.t || now();
    }
    writeMeta(meta);
  }

  /* ---- tirer + fusionner (+ pousser si besoin, + recharger si le local a changé) ---- */
  async function pull(){
    if(S.disabled) return;
    let row = null;
    try{
      const r = await withTimeout(sb.from("workspaces").select("data,updated_at").eq("id", S.uid).maybeSingle(), 8000);
      if(r.__timeout){ warn("lecture sans réponse (8 s) — l'atelier reste local pour cette session."); return; }
      if(r.error){
        const msg = (r.error.message || "") + " " + (r.error.code || "");
        if(/PGRST205|42P01|Could not find the table/i.test(msg)){
          S.disabled = true;
          log("table `workspaces` absente — synchronisation inactive (exécuter supabase/2026-08-06-workspaces-sync.sql).");
          return;
        }
        warn("lecture impossible (" + msg.trim() + ") — nouvel essai au prochain démarrage.");
        return;
      }
      row = r.data;
    }catch(e){ warn("réseau indisponible — l'atelier reste local pour cette session."); return; }

    S.server = (row && row.data) || {};
    S.serverStamp = row ? row.updated_at : null;
    const { merged, applied, dirty } = merge(localMap(), S.server);
    if(applied.length) applyLocally(merged, applied);
    for(const k of dirty) S.dirty.add(k);
    if(S.dirty.size) await push(merged);
    else if(applied.length){ S.server = merged; }

    if(applied.length){
      /* l'app a déjà construit son UI sur l'ancien local : un rechargement
         (UNE fois — garde sessionStorage) fait apparaître l'atelier du compte. */
      let boot = null; try{ boot = sessionStorage.getItem(BOOT_FLAG); }catch(e){}
      if(boot){ warn("l'atelier du compte est arrivé après un rechargement — clés : " + applied.join(", ") + ". Recharger à la main si besoin."); }
      else{
        try{ sessionStorage.setItem(BOOT_FLAG, "1"); }catch(e){}
        log("atelier du compte appliqué (" + applied.join(", ") + ") — rechargement.");
        location.reload();
        return;
      }
    } else {
      try{ sessionStorage.removeItem(BOOT_FLAG); }catch(e){}
    }
    log("prêt (" + Object.keys(S.server).length + " clé(s) au compte).");
  }

  /* ---- pousser (upsert de l'atelier fusionné entier) ---- */
  async function push(pre){
    if(S.disabled || !S.uid || S.pushing) return;
    S.pushing = true;
    try{
      /* un autre appareil a-t-il écrit depuis notre dernier pull ? -> re-fusion */
      let merged = pre;
      if(!merged){
        try{
          const r = await withTimeout(sb.from("workspaces").select("data,updated_at").eq("id", S.uid).maybeSingle(), 4000);
          if(!r.__timeout && !r.error && r.data && r.data.updated_at !== S.serverStamp){
            S.server = r.data.data || {}; S.serverStamp = r.data.updated_at;
          }
        }catch(e){}
        const m = merge(localMap(), S.server);
        if(m.applied.length) applyLocally(m.merged, m.applied);
        merged = m.merged;
      }
      const r2 = await withTimeout(sb.from("workspaces")
        .upsert({ id: S.uid, data: merged }, { onConflict: "id" })
        .select("updated_at").maybeSingle(), 8000);
      if(r2 && r2.__timeout){ warn("écriture sans réponse (8 s) — nouvel essai à la prochaine modification."); }
      else if(r2 && r2.error){ warn("écriture impossible (" + (r2.error.message||"") + ") — nouvel essai à la prochaine modification."); }
      else{
        S.server = merged;
        if(r2 && r2.data) S.serverStamp = r2.data.updated_at;
        S.dirty.clear();
        log("atelier poussé au compte (" + Object.keys(merged).length + " clé(s)).");
      }
    } finally { S.pushing = false; }
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
    if(uid && uid !== S.uid){ S.uid = uid; S.dirty.clear(); pull(); }
  });

  /* diagnostic console : BPO_SYNC.pull() / .flush() / .status() */
  window.BPO_SYNC = {
    pull: () => pull(),
    flush: () => push(),
    status: () => ({ uid: S.uid, disabled: S.disabled, dirty: [...S.dirty], serveur: Object.keys(S.server) })
  };
  return S;
}
