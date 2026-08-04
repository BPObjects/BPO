/* bpo-auth.js — passerelle d'accès. À inclure EN HAUT du <body> de app.html :
     <script type="module" src="bpo-auth.js"></script>
   Vérifie la session + l'accès. Sans session -> redirige vers compte.html.
   Essai en cours -> bandeau "N jours restants".
   Essai TERMINÉ (fin d'essai douce) -> pose data-bpo-demo="1", bandeau
   persistant, et bpo-demo-gate.js intercepte exports/impression/chiffrage.
   (v3 : bandeaux localisés — 13 langues du site, ?lang=xx sinon navigateur.) */
/* supabase-js VENDORISÉ (2.110.7, bundle esm.sh rapatrié dans ./vendor/) :
   plus aucun code d'authentification chargé depuis un CDN externe. */
import { createClient } from "./vendor/supabase-js-2.110.7.js";
import { SUPABASE_URL, SUPABASE_ANON, PRICE_LABEL, PRICE_LABEL_SHORT, OWNER_EMAILS } from "./bpo-config.js";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

/* Vérification d'accès CÔTÉ SERVEUR (fonction Edge check-access) — utilisée par
   les exports DQE de app.html. true si abonné ou essai en cours. */
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

/* i18n des bandeaux — clé = chaîne française ; __TRIAL_LEFT__ = gabarit à {n}. */
const AUTH_I18N = {
  en:{"S’abonner":"Subscribe","__TRIAL_LEFT__":"Free trial: {n} day(s) left.","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"Trial ended — the workshop stays open in discovery mode. Exports and printing are for subscribers."},
  de:{"S’abonner":"Abonnieren","__TRIAL_LEFT__":"Kostenlose Testphase: noch {n} Tag(e).","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"Testphase beendet — die Werkstatt bleibt im Entdeckungsmodus offen. Exporte und Druck sind Abonnenten vorbehalten."},
  es:{"S’abonner":"Suscribirse","__TRIAL_LEFT__":"Prueba gratuita: quedan {n} día(s).","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"Prueba finalizada — el taller sigue abierto en modo descubrimiento. Exportaciones e impresión reservadas a los suscriptores."},
  it:{"S’abonner":"Abbonati","__TRIAL_LEFT__":"Prova gratuita: restano {n} giorni.","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"Prova terminata — l’atelier resta aperto in modalità scoperta. Esportazioni e stampa riservate agli abbonati."},
  pt:{"S’abonner":"Subscrever","__TRIAL_LEFT__":"Teste gratuito: restam {n} dia(s).","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"Teste terminado — o atelier continua aberto em modo descoberta. Exportações e impressão reservadas aos subscritores."},
  hu:{"S’abonner":"Előfizetés","__TRIAL_LEFT__":"Ingyenes próba: {n} nap van hátra.","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"A próba lejárt — a műhely felfedező módban nyitva marad. Az exportok és a nyomtatás az előfizetőké."},
  ru:{"S’abonner":"Подписаться","__TRIAL_LEFT__":"Бесплатный период: осталось дней — {n}.","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"Пробный период завершён — мастерская открыта в режиме знакомства. Экспорт и печать доступны подписчикам."},
  uk:{"S’abonner":"Підписатися","__TRIAL_LEFT__":"Безкоштовний період: залишилося днів — {n}.","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"Пробний період завершено — майстерня відкрита в режимі знайомства. Експорт і друк доступні підписникам."},
  zh:{"S’abonner":"订阅","__TRIAL_LEFT__":"免费试用：剩余 {n} 天。","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"试用已结束——工作坊在探索模式下保持开放。导出与打印为订阅用户专享。"},
  ja:{"S’abonner":"購読する","__TRIAL_LEFT__":"無料トライアル：残り {n} 日。","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"トライアル終了。アトリエはディスカバリーモードで利用できます。エクスポートと印刷は購読者向けです。"},
  hi:{"S’abonner":"सदस्यता लें","__TRIAL_LEFT__":"निःशुल्क परीक्षण: {n} दिन शेष।","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"परीक्षण समाप्त — कार्यशाला खोज मोड में खुली है। निर्यात और प्रिंटिंग सदस्यों के लिए।"},
  ar:{"S’abonner":"اشترك","__TRIAL_LEFT__":"تجربة مجانية: بقي {n} يومًا.","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"انتهت التجربة — تبقى الورشة مفتوحة في وضع الاستكشاف. التصدير والطباعة للمشتركين."}
};
const ALANG = (() => {
  try{
    const p = /[?&]lang=([a-z]{2})/.exec(location.search);
    const n = (p && p[1]) || (navigator.language||"fr").toLowerCase().slice(0,2);
    return n==="fr" ? null : (AUTH_I18N[n] || AUTH_I18N.en);
  }catch(e){ return null; }
})();
const AT = s => (ALANG && ALANG[s]) || s;

function banner(txt){
  const b=document.createElement("div");
  b.style.cssText="position:fixed;top:0;left:0;right:0;z-index:100000;background:#ff8a3d;color:#1a1d23;font:600 12px system-ui;text-align:center;padding:6px;line-height:1.3;";
  b.innerHTML=txt+' &nbsp;<a href="compte.html" style="color:#1a1d23;text-decoration:underline;">'+AT("S’abonner")+' ('+PRICE_LABEL_SHORT+')</a>';
  document.body.appendChild(b);
  /* pousse l'appli sous le bandeau pour ne rien recouvrir */
  const h=b.offsetHeight||28, app=document.getElementById("app");
  if(app){ app.style.marginTop=h+"px"; app.style.height="calc(100dvh - "+h+"px)"; }
  else { document.body.style.paddingTop=h+"px"; }
}

/* Compte propriétaire : débloque les marques `prive:'compte'` (catalogue intégré,
   accord fabricant en attente). L'attribut est posé APRÈS coup — app.html écoute
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
  if(left > 0){
    banner(ALANG ? AT("__TRIAL_LEFT__").replace("{n}", left)
                 : "Essai gratuit : "+left+" jour"+(left>1?"s":"")+" restant"+(left>1?"s":"")+".");
    return;
  }
  /* essai terminé et non abonné -> FIN D'ESSAI DOUCE : l'atelier reste ouvert,
     bpo-demo-gate.js intercepte exports / impression / chiffrage / rendu photo. */
  window.BPO_PRICE_LABEL = PRICE_LABEL;
  document.documentElement.setAttribute("data-bpo-demo","1");
  window.dispatchEvent(new Event("bpo-demo"));
  banner(AT("Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés."));
})();
