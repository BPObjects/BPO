/* bpo-auth.js — passerelle d'accès. À inclure EN HAUT du <body> de meuble.html :
     <script type="module" src="bpo-auth.js"></script>
   Vérifie la session + l'accès (essai en cours ou abonné). Sinon -> redirige vers
   compte.html. Affiche un bandeau "essai : N jours restants". */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON } from "./bpo-config.js";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

function paywall(html){
  const o=document.createElement("div");
  o.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(20,23,28,.94);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#e8e9ec;";
  o.innerHTML='<div style="max-width:420px;text-align:center;padding:30px;background:#20242c;border:1px solid #343a45;border-radius:14px;">'+html+'</div>';
  document.body.appendChild(o);
}
function banner(txt){
  const b=document.createElement("div");
  b.style.cssText="position:fixed;top:0;left:0;right:0;z-index:9998;background:#ff8a3d;color:#1a1d23;font:600 12px system-ui;text-align:center;padding:5px;";
  b.innerHTML=txt+' &nbsp;<a href="compte.html" style="color:#1a1d23;text-decoration:underline;">S’abonner (50 €/an)</a>';
  document.body.appendChild(b);
}

(async () => {
  if(String(SUPABASE_URL).includes("VOTRE-PROJET")){ console.warn("BPO: backend non configuré — accès libre (mode dev)."); return; }
  const { data:{ session } } = await sb.auth.getSession();
  if(!session){ location.replace("compte.html"); return; }
  const { data: prof } = await sb.from("profiles").select("plan,trial_ends_at").eq("id", session.user.id).single();
  const active = prof?.plan === "active";
  const left = prof? Math.ceil((new Date(prof.trial_ends_at)-Date.now())/86400000) : 0;
  if(active) return;                         /* abonné : accès complet */
  if(left > 0){ banner("Essai gratuit : "+left+" jour"+(left>1?"s":"")+" restant"+(left>1?"s":"")+"."); return; }
  /* essai terminé et non abonné -> blocage */
  paywall('<h2 style="margin-bottom:8px;">Votre essai est terminé</h2>'+
          '<p style="color:#8b92a0;font-size:13px;margin-bottom:18px;">Abonnez-vous pour continuer à utiliser tous les outils.</p>'+
          '<a href="compte.html" style="display:inline-block;background:#ff8a3d;color:#1a1d23;font-weight:700;padding:11px 22px;border-radius:8px;text-decoration:none;">S’abonner — 50 € / an</a>');
})();
