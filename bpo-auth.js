/* bpo-auth.js — passerelle d'accès. À inclure EN HAUT du <body> de meuble.html :
     <script type="module" src="bpo-auth.js"></script>
   Vérifie la session + l'accès. Sans session -> redirige vers compte.html.
   Essai en cours -> bandeau "N jours restants".
   Essai TERMINÉ (v2, fin d'essai douce) -> plus de mur : pose data-bpo-demo="1",
   bandeau persistant, et bpo-demo-gate.js intercepte exports/impression/chiffrage.
   (v2 : fonction paywall() supprimée — remplacée par le mode découverte.) */
/* supabase-js VENDORISÉ (2.110.7, bundle esm.sh rapatrié dans ./vendor/) :
   plus aucun code d'authentification chargé depuis un CDN externe. */
import { createClient } from "./vendor/supabase-js-2.110.7.js";
import { SUPABASE_URL, SUPABASE_ANON, PRICE_LABEL, PRICE_LABEL_SHORT, OWNER_EMAILS } from "./bpo-config.js";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

/* Vérification d'accès CÔTÉ SERVEUR (fonction Edge check-access) — utilisée par
   les exports DQE de meuble.html. true si abonné ou essai en cours. */
window.BPO_CHECK_ACCESS = async () => {
  try{
    const { data:{ session } } = await sb.auth.getSession();
    if(!session) return false;
    const r = await fetch(SUPABASE_URL+"/functions/v1/check-access",
      { method:"POST", headers:{ "Authorization":"Bearer "+session.access_token } });
    const j = await r.json().catch(()=>({}));
    return j.access === true;
  }catch(e){ return false; }
};

function banner(txt){
  const b=document.createElement("div");
  b.style.cssText="position:fixed;top:0;left:0;right:0;z-index:100000;background:#ff8a3d;color:#1a1d23;font:600 12px system-ui;text-align:center;padding:6px;line-height:1.3;";
  b.innerHTML=txt+' &nbsp;<a href="compte.html" style="color:#1a1d23;text-decoration:underline;">S’abonner ('+PRICE_LABEL_SHORT+')</a>';
  document.body.appendChild(b);
  /* pousse l'appli sous le bandeau pour ne rien recouvrir */
  const h=b.offsetHeight||28, app=document.getElementById("app");
  if(app){ app.style.marginTop=h+"px"; app.style.height="calc(100dvh - "+h+"px)"; }
  else { document.body.style.paddingTop=h+"px"; }
}

/* Compte propriétaire : débloque les marques `prive:'compte'` (catalogue intégré,
   accord fabricant en attente). L'attribut est posé APRÈS coup — meuble.html écoute
   l'évènement pour reconstruire sa liste de marques. */
function marquerProprietaire(session){
  try{
    const mail = (session?.user?.email || "").trim().toLowerCase();
    if(!mail || !(OWNER_EMAILS||[]).some(m => String(m).trim().toLowerCase() === mail)) return;
    document.documentElement.setAttribute("data-bpo-owner", "1");
    window.dispatchEvent(new Event("bpo-owner"));
  }catch(e){}
}

(async () => {
  const { data:{ session } } = await sb.auth.getSession();
  if(!session){ location.replace("compte.html"); return; }
  marquerProprietaire(session);
  const { data: prof } = await sb.from("profiles").select("plan,trial_ends_at").eq("id", session.user.id).single();
  const active = prof?.plan === "active";
  const left = prof? Math.ceil((new Date(prof.trial_ends_at)-Date.now())/86400000) : 0;
  if(active) return;                         /* abonné : accès complet */
  if(left > 0){ banner("Essai gratuit : "+left+" jour"+(left>1?"s":"")+" restant"+(left>1?"s":"")+"."); return; }
  /* essai terminé et non abonné -> FIN D'ESSAI DOUCE : l'atelier reste ouvert,
     bpo-demo-gate.js intercepte exports / impression / sorties du chiffrage. */
  window.BPO_PRICE_LABEL = PRICE_LABEL;
  document.documentElement.setAttribute("data-bpo-demo","1");
  window.dispatchEvent(new Event("bpo-demo"));
  banner("Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.");
})();
