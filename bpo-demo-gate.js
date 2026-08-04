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
        '<div style="font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#ff8a3d;margin-bottom:10px;">Mode découverte</div>'+
        '<div style="font-size:19px;font-weight:600;margin-bottom:8px;">Votre essai est terminé — l’atelier reste ouvert.</div>'+
        '<div style="font-size:13px;line-height:1.6;color:#8b92a0;margin-bottom:20px;">Continuez à configurer librement. Les exports IFC, DAE et OBJ, le rendu photo, l’impression et les sorties du chiffrage font partie de l’abonnement.</div>'+
        '<a href="compte.html" style="display:inline-block;background:#ff8a3d;color:#1a1d23;font-weight:700;padding:11px 22px;border-radius:8px;text-decoration:none;">S’abonner — '+prix+'</a>'+
        '<div style="margin-top:14px;"><a href="#" id="bpoDemoGateClose" style="color:#8b92a0;font-size:12px;text-decoration:underline;">Continuer en découverte</a></div>'+
      '</div>';
    el.addEventListener('click', function(e){ if(e.target===el) fermer(); });
    document.body.appendChild(el);
    document.getElementById('bpoDemoGateClose').addEventListener('click', function(e){ e.preventDefault(); fermer(); });
  }
  function fermer(){ if(el) el.style.display='none'; }
})();
