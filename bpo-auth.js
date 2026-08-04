/* bpo-auth.js — passerelle d'accès. À inclure EN HAUT du <body> de app.html :
     <script type="module" src="bpo-auth.js"></script>
   v4 — ESSAI LIBRE SANS COMPTE : sans session, une session ANONYME Supabase
   est créée (2 jours d'accès complet, côté serveur via le trigger v4) ; repli
   sur compte.html si la fonctionnalité est désactivée. L'anonyme voit un
   bandeau « créez votre compte pour conserver votre travail » ; à la création
   du compte, le MÊME utilisateur est converti (travail conservé, essai 15 j).
   Essai en cours -> bandeau N jours ; essai terminé -> mode découverte
   (data-bpo-demo + bpo-demo-gate.js). Capture aussi ?ref= (attribution).
   Bandeaux localisés (13 langues) et EN FLUX (v5 : plus de chevauchement).
   v6 — la langue suit CELLE DU SITE : ?lang= sinon localStorage bpo_lang
   (posé par le sélecteur de langue de l'app) sinon navigateur ; et le bandeau
   se re-rend à chaud sur l'évènement `bpo-lang` émis par setLang() d'app.html. */
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

/* i18n des bandeaux — clé = chaîne française ; __*__ = gabarits à {n}. */
const AUTH_I18N = {
  en:{"S’abonner":"Subscribe","Créer mon compte":"Create my account","__TRIAL_LEFT__":"Free trial: {n} day(s) left.","__ANON_LEFT__":"Free tryout: {n} day(s) left — create your free account to keep your work.","__ANON_ENDED__":"Free tryout over — create your free account: 15-day full trial, your work is kept.","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"Trial ended — the workshop stays open in discovery mode. Exports and printing are for subscribers."},
  de:{"S’abonner":"Abonnieren","Créer mon compte":"Mein Konto erstellen","__TRIAL_LEFT__":"Kostenlose Testphase: noch {n} Tag(e).","__ANON_LEFT__":"Freies Ausprobieren: noch {n} Tag(e) — erstellen Sie Ihr kostenloses Konto, um Ihre Arbeit zu behalten.","__ANON_ENDED__":"Freies Ausprobieren beendet — erstellen Sie Ihr kostenloses Konto: 15 Tage Volltest, Ihre Arbeit bleibt erhalten.","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"Testphase beendet — die Werkstatt bleibt im Entdeckungsmodus offen. Exporte und Druck sind Abonnenten vorbehalten."},
  es:{"S’abonner":"Suscribirse","Créer mon compte":"Crear mi cuenta","__TRIAL_LEFT__":"Prueba gratuita: quedan {n} día(s).","__ANON_LEFT__":"Prueba libre: {n} día(s) — cree su cuenta gratuita para conservar su trabajo.","__ANON_ENDED__":"Prueba libre terminada — cree su cuenta gratuita: 15 días de prueba completa, su trabajo se conserva.","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"Prueba finalizada — el taller sigue abierto en modo descubrimiento. Exportaciones e impresión reservadas a los suscriptores."},
  it:{"S’abonner":"Abbonati","Créer mon compte":"Crea il mio account","__TRIAL_LEFT__":"Prova gratuita: restano {n} giorni.","__ANON_LEFT__":"Prova libera: {n} giorni — crea il tuo account gratuito per conservare il lavoro.","__ANON_ENDED__":"Prova libera terminata — crea il tuo account gratuito: 15 giorni di prova completa, il lavoro è conservato.","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"Prova terminata — l’atelier resta aperto in modalità scoperta. Esportazioni e stampa riservate agli abbonati."},
  pt:{"S’abonner":"Subscrever","Créer mon compte":"Criar a minha conta","__TRIAL_LEFT__":"Teste gratuito: restam {n} dia(s).","__ANON_LEFT__":"Teste livre: {n} dia(s) — crie a sua conta gratuita para conservar o trabalho.","__ANON_ENDED__":"Teste livre terminado — crie a sua conta gratuita: 15 dias de teste completo, o trabalho é conservado.","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"Teste terminado — o atelier continua aberto em modo descoberta. Exportações e impressão reservadas aos subscritores."},
  hu:{"S’abonner":"Előfizetés","Créer mon compte":"Fiókom létrehozása","__TRIAL_LEFT__":"Ingyenes próba: {n} nap van hátra.","__ANON_LEFT__":"Szabad próba: {n} nap — hozzon létre ingyenes fiókot a munkája megőrzéséhez.","__ANON_ENDED__":"A szabad próba lejárt — hozzon létre ingyenes fiókot: 15 napos teljes próba, a munkája megmarad.","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"A próba lejárt — a műhely felfedező módban nyitva marad. Az exportok és a nyomtatás az előfizetőké."},
  ru:{"S’abonner":"Подписаться","Créer mon compte":"Создать мой аккаунт","__TRIAL_LEFT__":"Бесплатный период: осталось дней — {n}.","__ANON_LEFT__":"Свободная проба: осталось {n} дн. — создайте бесплатный аккаунт, чтобы сохранить работу.","__ANON_ENDED__":"Свободная проба завершена — создайте бесплатный аккаунт: 15 дней полного доступа, работа сохранится.","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"Пробный период завершён — мастерская открыта в режиме знакомства. Экспорт и печать доступны подписчикам."},
  uk:{"S’abonner":"Підписатися","Créer mon compte":"Створити мій акаунт","__TRIAL_LEFT__":"Безкоштовний період: залишилося днів — {n}.","__ANON_LEFT__":"Вільна проба: залишилося {n} дн. — створіть безкоштовний акаунт, щоб зберегти роботу.","__ANON_ENDED__":"Вільну пробу завершено — створіть безкоштовний акаунт: 15 днів повного доступу, робота збережеться.","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"Пробний період завершено — майстерня відкрита в режимі знайомства. Експорт і друк доступні підписникам."},
  zh:{"S’abonner":"订阅","Créer mon compte":"创建我的账户","__TRIAL_LEFT__":"免费试用：剩余 {n} 天。","__ANON_LEFT__":"自由试用：剩余 {n} 天——创建免费账户以保留您的工作。","__ANON_ENDED__":"自由试用已结束——创建免费账户：15 天完整试用，您的工作将被保留。","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"试用已结束——工作坊在探索模式下保持开放。导出与打印为订阅用户专享。"},
  ja:{"S’abonner":"購読する","Créer mon compte":"アカウントを作成する","__TRIAL_LEFT__":"無料トライアル：残り {n} 日。","__ANON_LEFT__":"フリートライアル：残り {n} 日 — 無料アカウントを作成して作業を保存しましょう。","__ANON_ENDED__":"フリートライアル終了 — 無料アカウントを作成：15日間のフルトライアル、作業は保持されます。","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"トライアル終了。アトリエはディスカバリーモードで利用できます。エクスポートと印刷は購読者向けです。"},
  hi:{"S’abonner":"सदस्यता लें","Créer mon compte":"मेरा खाता बनाएँ","__TRIAL_LEFT__":"निःशुल्क परीक्षण: {n} दिन शेष।","__ANON_LEFT__":"मुक्त परीक्षण: {n} दिन शेष — अपना काम सहेजने हेतु निःशुल्क खाता बनाएँ।","__ANON_ENDED__":"मुक्त परीक्षण समाप्त — निःशुल्क खाता बनाएँ: 15 दिनों का पूर्ण परीक्षण, आपका काम सुरक्षित।","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"परीक्षण समाप्त — कार्यशाला खोज मोड में खुली है। निर्यात और प्रिंटिंग सदस्यों के लिए।"},
  ar:{"S’abonner":"اشترك","Créer mon compte":"إنشاء حسابي","__TRIAL_LEFT__":"تجربة مجانية: بقي {n} يومًا.","__ANON_LEFT__":"تجربة حرة: بقي {n} يومًا — أنشئ حسابًا مجانيًا للاحتفاظ بعملك.","__ANON_ENDED__":"انتهت التجربة الحرة — أنشئ حسابًا مجانيًا: 15 يومًا من التجربة الكاملة، وعملك محفوظ.","Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés.":"انتهت التجربة — تبقى الورشة مفتوحة في وضع الاستكشاف. التصدير والطباعة للمشتركين."}
};
/* v6 : la langue du bandeau = celle du SITE. Ordre : ?lang= (test/forçage)
   -> localStorage bpo_lang (posé par le sélecteur de langue d'app.html)
   -> navigateur. bpo_lang peut porter une langue hors AUTH_I18N (sv/da/fi/no/pl) :
   repli anglais, cohérent avec le reste du site. */
function pickLang(){
  try{
    const p = /[?&]lang=([a-z]{2})/.exec(location.search);
    let n = (p && p[1]) || "";
    if(!n){ try{ n = localStorage.getItem("bpo_lang") || ""; }catch(e){} }
    if(!n) n = navigator.language || "fr";
    n = n.toLowerCase().slice(0,2);
    return n==="fr" ? null : (AUTH_I18N[n] || AUTH_I18N.en);
  }catch(e){ return null; }
}
let ALANG = pickLang();
const AT = s => (ALANG && ALANG[s]) || s;

/* Attribution d'origine : ?ref=<canal> capté dès l'app (même clé que compte.html) */
try{
  const m = /[?&]ref=([A-Za-z0-9_\-]{1,32})/.exec(location.search);
  if(m) localStorage.setItem("bpoRef", m[1].toLowerCase());
}catch(e){}

function banner(mkTxt, mkCta){
  /* v5 : bandeau DANS LE FLUX (premier enfant du body) — il pousse tout le
     document naturellement, aucun chevauchement possible ; la hauteur de #app
     est recalee (et suivie par ResizeObserver : zoom, retour a la ligne...).
     v6 : mkTxt/mkCta sont des FABRIQUES de texte — le bandeau se re-rend au
     changement de langue du site (évènement `bpo-lang` émis par setLang). */
  const b=document.createElement("div");
  b.style.cssText="position:relative;z-index:100000;background:#ff8a3d;color:#1a1d23;font:600 12px system-ui;text-align:center;padding:6px;line-height:1.3;";
  const rendre = () => {
    const cta = (mkCta && mkCta()) || (AT("S’abonner")+' ('+PRICE_LABEL_SHORT+')');
    b.innerHTML=mkTxt()+' &nbsp;<a href="compte.html" style="color:#1a1d23;text-decoration:underline;">'+cta+'</a>';
  };
  rendre();
  document.body.insertBefore(b, document.body.firstChild);
  const cale = () => {
    const h=b.offsetHeight||28, app=document.getElementById("app");
    if(app){ app.style.height="calc(100dvh - "+h+"px)"; }
  };
  cale();
  if(window.ResizeObserver){ new ResizeObserver(cale).observe(b); }
  window.addEventListener("resize", cale);
  document.addEventListener("bpo-lang", () => { ALANG = pickLang(); rendre(); cale(); });
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
  let { data:{ session } } = await sb.auth.getSession();
  if(!session){
    /* ESSAI LIBRE : session anonyme (2 jours côté serveur). Repli : compte.html. */
    try{
      const { data: d2, error } = await sb.auth.signInAnonymously();
      if(error || !d2?.session){ location.replace("compte.html"); return; }
      session = d2.session;
    }catch(e){ location.replace("compte.html"); return; }
  }
  marquerProprietaire(session);
  const anon = !!session.user?.is_anonymous;
  const { data: prof } = await sb.from("profiles").select("plan,trial_ends_at").eq("id", session.user.id).single();
  const active = prof?.plan === "active";
  const left = prof? Math.ceil((new Date(prof.trial_ends_at)-Date.now())/86400000) : 0;
  if(active) return;                         /* abonné : accès complet */
  if(left > 0){
    if(anon){
      banner(() => (ALANG ? AT("__ANON_LEFT__") : "Essai libre : {n} j — créez votre compte gratuit pour conserver votre travail.").replace("{n}", left),
             () => AT("Créer mon compte"));
    } else {
      banner(() => ALANG ? AT("__TRIAL_LEFT__").replace("{n}", left)
                         : "Essai gratuit : "+left+" jour"+(left>1?"s":"")+" restant"+(left>1?"s":"")+".");
    }
    return;
  }
  /* essai terminé (anonyme ou compte) -> FIN D'ESSAI DOUCE : l'atelier reste
     ouvert, bpo-demo-gate.js intercepte exports / impression / chiffrage / rendu photo. */
  window.BPO_PRICE_LABEL = PRICE_LABEL;
  document.documentElement.setAttribute("data-bpo-demo","1");
  window.dispatchEvent(new Event("bpo-demo"));
  if(anon){
    banner(() => ALANG ? AT("__ANON_ENDED__")
                       : "Essai libre terminé — créez votre compte gratuit : 15 jours d'essai complet, votre travail est conservé.",
           () => AT("Créer mon compte"));
  } else {
    banner(() => AT("Essai terminé — l’atelier reste ouvert en découverte. Exports et impression réservés aux abonnés."));
  }
})();
