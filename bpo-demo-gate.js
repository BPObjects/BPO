/* bpo-demo-gate.js — « fin d'essai douce » : mode découverte de app.html.
   Actif uniquement quand <html data-bpo-demo="1"> — posé par bpo-auth.js à
   l'expiration de l'essai (ou par « ?bpoDemo=1 » pour tester : le drapeau ne
   peut que RESTREINDRE, jamais débloquer quoi que ce soit).
   Libres en découverte : configurer, rendu temps réel, enregistrer ses
   configurations. Interceptés : exports OBJ / DAE / IFC, rendu photo (path
   tracing), impression PDF (mise en page et relevés), sorties du chiffrage
   (tableur + planche) — les boutons restent visibles et mènent à une
   invitation à s'abonner, jamais à un mur.
   À charger en fin de <body>, APRÈS les scripts de l'app (defer) — les
   fonctions globales du chiffrage doivent exister pour être enveloppées. */
(function(){
  'use strict';

  /* auto-armement de test : ne fait que poser le drapeau restrictif */
  try{
    if(/[?&]bpoDemo=1/.test(location.search))
      document.documentElement.setAttribute('data-bpo-demo','1');
  }catch(e){}

  function demo(){ return document.documentElement.getAttribute('data-bpo-demo')==='1'; }

  /* i18n de la carte — clé = chaîne française (convention de l'app).
     Langue : ?lang=xx sinon navigateur ; repli anglais hors langues du site. */
  var GATE_I18N = {
    en:{"Mode découverte":"Discovery mode","Votre essai est terminé — l’atelier reste ouvert.":"Your trial has ended — the workshop stays open.","Continuez à configurer librement. Les exports IFC, DAE et OBJ, le rendu photo, l’impression et les sorties du chiffrage font partie de l’abonnement.":"Keep configuring freely. IFC, DAE and OBJ exports, photo rendering, printing and cost-estimate outputs are part of the subscription.","S’abonner":"Subscribe","Continuer en découverte":"Continue in discovery mode"},
    de:{"Mode découverte":"Entdeckungsmodus","Votre essai est terminé — l’atelier reste ouvert.":"Ihre Testphase ist beendet — die Werkstatt bleibt offen.","Continuez à configurer librement. Les exports IFC, DAE et OBJ, le rendu photo, l’impression et les sorties du chiffrage font partie de l’abonnement.":"Konfigurieren Sie weiterhin frei. IFC-, DAE- und OBJ-Exporte, Foto-Rendering, Druck und Kostenschätzungs-Ausgaben sind Teil des Abonnements.","S’abonner":"Abonnieren","Continuer en découverte":"Im Entdeckungsmodus fortfahren"},
    es:{"Mode découverte":"Modo descubrimiento","Votre essai est terminé — l’atelier reste ouvert.":"Su prueba ha terminado — el taller sigue abierto.","Continuez à configurer librement. Les exports IFC, DAE et OBJ, le rendu photo, l’impression et les sorties du chiffrage font partie de l’abonnement.":"Siga configurando libremente. Las exportaciones IFC, DAE y OBJ, el render fotográfico, la impresión y las salidas de presupuesto forman parte de la suscripción.","S’abonner":"Suscribirse","Continuer en découverte":"Continuar en modo descubrimiento"},
    it:{"Mode découverte":"Modalità scoperta","Votre essai est terminé — l’atelier reste ouvert.":"La tua prova è terminata — l’atelier resta aperto.","Continuez à configurer librement. Les exports IFC, DAE et OBJ, le rendu photo, l’impression et les sorties du chiffrage font partie de l’abonnement.":"Continua a configurare liberamente. Le esportazioni IFC, DAE e OBJ, il render fotografico, la stampa e le uscite del computo fanno parte dell’abbonamento.","S’abonner":"Abbonati","Continuer en découverte":"Continua in modalità scoperta"},
    pt:{"Mode découverte":"Modo descoberta","Votre essai est terminé — l’atelier reste ouvert.":"O seu teste terminou — o atelier continua aberto.","Continuez à configurer librement. Les exports IFC, DAE et OBJ, le rendu photo, l’impression et les sorties du chiffrage font partie de l’abonnement.":"Continue a configurar livremente. As exportações IFC, DAE e OBJ, o render fotográfico, a impressão e as saídas de orçamento fazem parte da subscrição.","S’abonner":"Subscrever","Continuer en découverte":"Continuar em modo descoberta"},
    hu:{"Mode découverte":"Felfedező mód","Votre essai est terminé — l’atelier reste ouvert.":"A próbaidőszak lejárt — a műhely nyitva marad.","Continuez à configurer librement. Les exports IFC, DAE et OBJ, le rendu photo, l’impression et les sorties du chiffrage font partie de l’abonnement.":"Konfiguráljon továbbra is szabadon. Az IFC, DAE és OBJ exportok, a fotórenderelés, a nyomtatás és a költségbecslés kimenetei az előfizetés részei.","S’abonner":"Előfizetés","Continuer en découverte":"Folytatás felfedező módban"},
    ru:{"Mode découverte":"Режим знакомства","Votre essai est terminé — l’atelier reste ouvert.":"Пробный период завершён — мастерская остаётся открытой.","Continuez à configurer librement. Les exports IFC, DAE et OBJ, le rendu photo, l’impression et les sorties du chiffrage font partie de l’abonnement.":"Продолжайте свободно настраивать. Экспорт IFC, DAE и OBJ, фоторендер, печать и выгрузки сметы входят в подписку.","S’abonner":"Подписаться","Continuer en découverte":"Продолжить в режиме знакомства"},
    uk:{"Mode découverte":"Режим знайомства","Votre essai est terminé — l’atelier reste ouvert.":"Пробний період завершено — майстерня залишається відкритою.","Continuez à configurer librement. Les exports IFC, DAE et OBJ, le rendu photo, l’impression et les sorties du chiffrage font partie de l’abonnement.":"Продовжуйте вільно налаштовувати. Експорт IFC, DAE та OBJ, фоторендер, друк і виведення кошторису входять до підписки.","S’abonner":"Підписатися","Continuer en découverte":"Продовжити в режимі знайомства"},
    zh:{"Mode découverte":"探索模式","Votre essai est terminé — l’atelier reste ouvert.":"您的试用已结束——工作坊仍然开放。","Continuez à configurer librement. Les exports IFC, DAE et OBJ, le rendu photo, l’impression et les sorties du chiffrage font partie de l’abonnement.":"继续自由配置。IFC、DAE 和 OBJ 导出、照片级渲染、打印以及造价输出均包含在订阅中。","S’abonner":"订阅","Continuer en découverte":"继续探索模式"},
    ja:{"Mode découverte":"ディスカバリーモード","Votre essai est terminé — l’atelier reste ouvert.":"トライアルは終了しました。アトリエは引き続き利用できます。","Continuez à configurer librement. Les exports IFC, DAE et OBJ, le rendu photo, l’impression et les sorties du chiffrage font partie de l’abonnement.":"引き続き自由に設定できます。IFC・DAE・OBJ のエクスポート、フォトレンダリング、印刷、見積り出力は購読に含まれます。","S’abonner":"購読する","Continuer en découverte":"このまま続ける"},
    hi:{"Mode découverte":"खोज मोड","Votre essai est terminé — l’atelier reste ouvert.":"आपका परीक्षण समाप्त हो गया — कार्यशाला खुली रहती है।","Continuez à configurer librement. Les exports IFC, DAE et OBJ, le rendu photo, l’impression et les sorties du chiffrage font partie de l’abonnement.":"स्वतंत्र रूप से कॉन्फ़िगर करते रहें। IFC, DAE और OBJ निर्यात, फोटो रेंडर, प्रिंटिंग और लागत-अनुमान आउटपुट सदस्यता का हिस्सा हैं।","S’abonner":"सदस्यता लें","Continuer en découverte":"खोज मोड में जारी रखें"},
    ar:{"Mode découverte":"وضع الاستكشاف","Votre essai est terminé — l’atelier reste ouvert.":"انتهت تجربتك — تبقى الورشة مفتوحة.","Continuez à configurer librement. Les exports IFC, DAE et OBJ, le rendu photo, l’impression et les sorties du chiffrage font partie de l’abonnement.":"واصل الضبط بحرّية. تصدير IFC وDAE وOBJ، والعرض الواقعي، والطباعة، ومخرجات التقدير كلها ضمن الاشتراك.","S’abonner":"اشترك","Continuer en découverte":"المتابعة في وضع الاستكشاف"}
  };
  /* langue = celle du SITE : ?lang= sinon localStorage bpo_lang (posé par le
     sélecteur d'app.html) sinon navigateur ; re-choisie sur l'évènement bpo-lang. */
  function gPick(){
    try{
      var p = /[?&]lang=([a-z]{2})/.exec(location.search);
      var sl = ""; try{ sl = (typeof localStorage!=="undefined" && localStorage.getItem("bpo_lang")) || ""; }catch(e){}
      var n = ((p && p[1]) || sl || ((typeof navigator!=="undefined" && navigator.language) || "fr")).toLowerCase().slice(0,2);
      return n==="fr" ? null : (GATE_I18N[n] || GATE_I18N.en);
    }catch(e){ return null; }
  }
  var GDICT = gPick();
  try{ if(typeof document!=="undefined") document.addEventListener("bpo-lang", function(){ GDICT = gPick(); }); }catch(e){}
  function GT(s){ return (GDICT && GDICT[s]) || s; }

  /* 1) Boutons à identifiant stable : exports de configuration + impressions.
     Écouteur en phase de CAPTURE sur document : il court-circuite les .onclick
     posés par l'app sans toucher à son code. */
  var IDS = ['exp-obj','exp-dae','exp-ifc','exp-ifc23','psPrint','plotPrint','bpo-pt-btn'];
  document.addEventListener('click', function(e){
    if(!demo()) return;
    var t = (e.target && e.target.closest) ? e.target.closest('#'+IDS.join(',#')) : null;
    if(!t) return;
    e.preventDefault(); e.stopPropagation();
    ouvrir();
  }, true);

  /* 2) Sorties du chiffrage : boutons créés dynamiquement, mais qui appellent
     les globales à la volée — envelopper les fonctions suffit. */
  ['dqeCSV','dqePDF'].forEach(function(n){
    var f = window[n];
    if(typeof f !== 'function') return;
    window[n] = function(){ if(demo()){ ouvrir(); return; } return f.apply(this, arguments); };
  });

  /* Invitation — carte sombre cohérente avec l'app, refermable. */
  var el = null;
  function ouvrir(){
    if(el){ el.style.display='flex'; return; }
    var prix = window.BPO_PRICE_LABEL || '100 €/an';
    el = document.createElement('div');
    el.id = 'bpoDemoGate';
    el.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(13,21,38,.55);display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;';
    el.innerHTML =
      '<div style="max-width:430px;margin:16px;padding:28px 30px;background:#20242c;border:1px solid #343a45;border-radius:14px;color:#e8e9ec;text-align:center;">'+
        '<div style="font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#ff8a3d;margin-bottom:10px;">'+GT('Mode découverte')+'</div>'+
        '<div style="font-size:19px;font-weight:600;margin-bottom:8px;">'+GT('Votre essai est terminé — l’atelier reste ouvert.')+'</div>'+
        '<div style="font-size:13px;line-height:1.6;color:#8b92a0;margin-bottom:20px;">'+GT('Continuez à configurer librement. Les exports IFC, DAE et OBJ, le rendu photo, l’impression et les sorties du chiffrage font partie de l’abonnement.')+'</div>'+
        '<a href="compte.html" style="display:inline-block;background:#ff8a3d;color:#1a1d23;font-weight:700;padding:11px 22px;border-radius:8px;text-decoration:none;">'+GT('S’abonner')+' — '+prix+'</a>'+
        '<div style="margin-top:14px;"><a href="#" id="bpoDemoGateClose" style="color:#8b92a0;font-size:12px;text-decoration:underline;">'+GT('Continuer en découverte')+'</a></div>'+
      '</div>';
    el.addEventListener('click', function(e){ if(e.target===el) fermer(); });
    document.body.appendChild(el);
    document.getElementById('bpoDemoGateClose').addEventListener('click', function(e){ e.preventDefault(); fermer(); });
  }
  function fermer(){ if(el) el.style.display='none'; }
})();
