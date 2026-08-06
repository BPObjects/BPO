/* bpo-es5.js — VOIE DE COMPATIBILITE moteurs anciens (2026-08-06).
 *
 * POURQUOI. La fenetre SketchUp 2021 embarque Chromium 64 : l'optional
 * chaining `?.` (Chrome 80+) y est une erreur de syntaxe FATALE — le bundle
 * supabase-js (218 occurrences), bpo-auth.js et le script compte de
 * compte.html n'y tournent JAMAIS. Le reseau, lui, marche parfaitement
 * (mesure au pont : /auth/v1/health 200 en 447 ms). Ce fichier refait donc
 * le strict necessaire en ES5 pur + fetch : connexion par mot de passe,
 * session avec refresh, profil/newsletter, et SYNCHRO DE L'ATELIER en
 * reutilisant LE MEME moteur de fusion (bpo-sync.js, compatible Chrome 64)
 * via un adaptateur qui imite la surface supabase-js qu'il consomme.
 *
 * ACTIVATION. Charge par un petit script inline (compte.html + app.html) qui
 * pose window.BPO_OLD_ENGINE quand `new Function('return a?.b')` jette
 * (+ forçage ?es5=1 pour les bancs). Sur un moteur moderne : JAMAIS actif.
 *
 * ASSUME (v1) : pas d'essai anonyme ni de creation de compte sur moteur
 * ancien (connexion d'un compte EXISTANT seulement) ; pas de paiement Stripe
 * (bouton masque) ; textes en francais (les nœuds statiques restent traduits
 * par la passe i18n de la page, elle est ES5-compatible).
 *
 * ES5 STRICT : pas de fleches, const/let, gabarits `...`, destructuring.
 * Cles publiques = miroir de bpo-config.js (les garder coherents).
 */
(function () {
  'use strict';
  if (!window.BPO_OLD_ENGINE) { return; }

  var SB_URL = 'https://ockdepvqxjfwudthmusa.supabase.co';
  var SB_KEY = 'sb_publishable_z6V4r_1kcvbt9y-E1JnjRw_bv29jysd';
  var SKEY   = 'bpo_lite_session';        /* cle DEDIEE : jamais le format sb-* de supabase-js */

  function log(m){ try{ console.log('BPO es5 : ' + m); }catch(e){} }

  /* fetch JSON borne (8 s par defaut) — resout toujours { ok, status, json } */
  function req(method, path, body, token, ms) {
    return new Promise(function (resolve) {
      var done = false;
      function fin(r){ if (!done) { done = true; resolve(r); } }
      setTimeout(function(){ fin({ ok:false, status:0, json:null, timeout:true }); }, ms || 8000);
      try {
        var h = { 'apikey': SB_KEY, 'Content-Type': 'application/json' };
        if (token) { h['Authorization'] = 'Bearer ' + token; }
        fetch(SB_URL + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined })
          .then(function (r) {
            return r.text().then(function (t) {
              var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
              fin({ ok: r.status >= 200 && r.status < 300, status: r.status, json: j });
            });
          }, function () { fin({ ok:false, status:0, json:null }); });
      } catch (e) { fin({ ok:false, status:0, json:null }); }
    });
  }

  /* ---------------- session (stockage + refresh) ---------------- */
  function sread(){ try { return JSON.parse(localStorage.getItem(SKEY)); } catch (e) { return null; } }
  function swrite(s){ try { if (s) { localStorage.setItem(SKEY, JSON.stringify(s)); } else { localStorage.removeItem(SKEY); } } catch (e) {} }
  function fromTokenResponse(j) {
    if (!j || !j.access_token) { return null; }
    var exp = j.expires_at ? j.expires_at * 1000
                           : Date.now() + ((j.expires_in || 3600) * 1000);
    return { access_token: j.access_token, refresh_token: j.refresh_token || null,
             expires_at_ms: exp, user: j.user || null };
  }
  /* rend une session VALIDE (refresh au besoin) ou null */
  function getSession() {
    var s = sread();
    if (!s) { return Promise.resolve(null); }
    if (Date.now() < s.expires_at_ms - 60000) { return Promise.resolve(s); }
    if (!s.refresh_token) { swrite(null); return Promise.resolve(null); }
    return req('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token }, null)
      .then(function (r) {
        var ns = r.ok ? fromTokenResponse(r.json) : null;
        if (ns) { swrite(ns); log('session rafraichie.'); }
        else if (r.status === 400 || r.status === 401) { swrite(null); log('refresh refuse — deconnecte.'); }
        else { log('refresh sans reponse — session gardee pour re-essai.'); return s; }
        return ns;
      });
  }
  function signIn(email, pwd) {
    return req('POST', '/auth/v1/token?grant_type=password', { email: email, password: pwd }, null)
      .then(function (r) {
        if (!r.ok) {
          var msg = (r.json && (r.json.error_description || r.json.msg || r.json.message)) ||
                    (r.timeout ? 'Serveur sans reponse (8 s).' : 'Connexion refusee.');
          return { error: msg };
        }
        var s = fromTokenResponse(r.json);
        swrite(s);
        for (var i = 0; i < CB.length; i++) { try { CB[i]('SIGNED_IN', shimSession(s)); } catch (e) {} }
        return { session: s };
      });
  }
  function signOut() {
    var s = sread();
    swrite(null);
    if (s && s.access_token) { req('POST', '/auth/v1/logout', {}, s.access_token, 2500); } /* meilleur effort */
    for (var i = 0; i < CB.length; i++) { try { CB[i]('SIGNED_OUT', null); } catch (e) {} }
  }

  /* ---------------- profil ---------------- */
  function profile(s) {
    if (!s || !s.user) { return Promise.resolve(null); }
    return req('GET', '/rest/v1/profiles?id=eq.' + s.user.id + '&select=*', null, s.access_token)
      .then(function (r) { return (r.ok && r.json && r.json.length) ? r.json[0] : null; });
  }
  function patchProfile(s, fields) {
    return req('PATCH', '/rest/v1/profiles?id=eq.' + s.user.id, fields, s.access_token);
  }

  /* ------- adaptateur : la surface supabase-js que bpo-sync.js consomme -------
   * sb.auth.getSession() / onAuthStateChange(cb)
   * sb.from('workspaces').select(...).eq(...).maybeSingle()
   * sb.from('workspaces').upsert(rec, opts).select(...).maybeSingle()        */
  var CB = [];
  function shimSession(s) { return s ? { user: s.user, access_token: s.access_token } : null; }
  function shim() {
    return {
      auth: {
        getSession: function () {
          return getSession().then(function (s) { return { data: { session: shimSession(s) } }; });
        },
        onAuthStateChange: function (cb) { CB.push(function (ev, sess) { cb(ev, sess); }); }
      },
      from: function (table) {
        return {
          select: function (cols) {
            return { eq: function (col, val) {
              return { maybeSingle: function () {
                return getSession().then(function (s) {
                  if (!s) { return { data: null, error: { message: 'pas de session' } }; }
                  return req('GET', '/rest/v1/' + table + '?' + col + '=eq.' + val + '&select=' + encodeURIComponent(cols), null, s.access_token)
                    .then(function (r) {
                      if (r.timeout) { return { data: null, error: { message: 'sans reponse (8 s)' } }; }
                      if (!r.ok) { return { data: null, error: { message: 'HTTP ' + r.status, code: (r.json && r.json.code) || '' } }; }
                      return { data: (r.json && r.json.length) ? r.json[0] : null, error: null };
                    });
                });
              } };
            } };
          },
          upsert: function (rec) {
            return { select: function (cols) {
              return { maybeSingle: function () {
                return getSession().then(function (s) {
                  if (!s) { return { data: null, error: { message: 'pas de session' } }; }
                  var path = '/rest/v1/' + table + '?on_conflict=id&select=' + encodeURIComponent(cols);
                  return new Promise(function (resolve) {
                    var done = false;
                    function fin(r){ if (!done) { done = true; resolve(r); } }
                    setTimeout(function(){ fin({ data:null, error:{ message:'sans reponse (8 s)' } }); }, 8000);
                    try {
                      fetch(SB_URL + path, { method: 'POST',
                        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + s.access_token,
                                   'Content-Type': 'application/json',
                                   'Prefer': 'resolution=merge-duplicates,return=representation' },
                        body: JSON.stringify([rec]) })
                        .then(function (r) {
                          return r.text().then(function (t) {
                            var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
                            if (r.status < 200 || r.status >= 300) { fin({ data:null, error:{ message:'HTTP ' + r.status, code:(j && j.code) || '' } }); }
                            else { fin({ data: (j && j.length) ? j[0] : null, error: null }); }
                          });
                        }, function () { fin({ data:null, error:{ message:'reseau' } }); });
                    } catch (e) { fin({ data:null, error:{ message: String(e && e.message || e) } }); }
                  });
                });
              } };
            } };
          }
        };
      }
    };
  }

  window.BPO_LITE = { getSession: getSession, signIn: signIn, signOut: signOut,
                      profile: profile, patchProfile: patchProfile, shim: shim };

  /* ================= PAGE COMPTE : connexion + vue compte ================= */
  function compteUI() {
    function $(id){ return document.getElementById(id); }
    function show(el){ if (el) { el.classList.remove('hidden'); } }
    function hide(el){ if (el) { el.classList.add('hidden'); } }
    function msg(el, t, okFlag){ if (el) { el.textContent = t; el.style.color = okFlag ? '#2e9e63' : '#e05252'; show(el); } }

    function renderCompte(s) {
      hide($('auth')); show($('account'));
      if ($('who')) { $('who').textContent = (s.user && s.user.email) || ''; }
      /* Stripe et magie e-mail = voie moderne seulement */
      hide($('subscribe')); hide($('portal'));
      profile(s).then(function (p) {
        var b = $('statusBadge');
        var active = p && p.plan === 'active';
        var left = p ? Math.ceil((new Date(p.trial_ends_at).getTime() - Date.now()) / 86400000) : 0;
        if (b) {
          if (active) { b.textContent = 'Abonné'; b.className = 'badge b-ok'; }
          else if (left > 0) { b.textContent = 'Essai'; b.className = 'badge b-warn'; }
          else { b.textContent = 'Expiré'; b.className = 'badge b-no'; }
        }
        if ($('periodLbl')) { $('periodLbl').textContent = active ? 'Abonnement' : (left > 0 ? "Jours d'essai restants" : 'Essai terminé'); }
        if ($('periodVal')) { $('periodVal').textContent = active ? (p && p.current_period_end ? new Date(p.current_period_end).toLocaleDateString() : '—') : (left > 0 ? String(left) : '—'); }
        if (active) { show($('skpGet')); hide($('skpLock')); } else { hide($('skpGet')); show($('skpLock')); }
        if ($('nlToggle')) {
          $('nlToggle').checked = !!(p && p.newsletter_opt_in);
          $('nlToggle').onchange = function () { patchProfile(s, { newsletter_opt_in: $('nlToggle').checked }); };
        }
      });
      if ($('logout')) {
        $('logout').onclick = function () { signOut(); location.reload(); return false; };
      }
    }

    function renderAuth() {
      show($('auth')); hide($('account'));
      /* v1 moteur ancien : CONNEXION seulement — creation de compte et lien
         magique depuis un navigateur classique. */
      hide($('toggle')); hide($('magic')); hide($('nameFld')); hide($('nlFld')); hide($('noCb'));
      if ($('authTitle')) { $('authTitle').textContent = 'Connexion'; }
      if ($('authSub')) { $('authSub').textContent = 'Fenêtre SketchUp : connectez-vous avec votre compte BPO existant.'; }
      if ($('doAuth')) {
        $('doAuth').textContent = 'Se connecter';
        $('doAuth').onclick = function () {
          var em = $('email') ? $('email').value : '', pw = $('pwd') ? $('pwd').value : '';
          if (!em || !pw) { msg($('authMsg'), 'E-mail et mot de passe requis.'); return false; }
          $('doAuth').disabled = true;
          signIn(em.replace(/^\s+|\s+$/g, ''), pw).then(function (r) {
            $('doAuth').disabled = false;
            if (r.error) { msg($('authMsg'), r.error); }
            else { renderCompte(r.session); }
          });
          return false;
        };
      }
    }

    getSession().then(function (s) { if (s) { renderCompte(s); } else { renderAuth(); } });
  }

  /* ============ PAGE APP : synchro de l'atelier + invite discrete ============ */
  function appBoot() {
    getSession().then(function (s) {
      if (s) {
        log('session ' + ((s.user && s.user.email) || '?') + ' — demarrage synchro.');
        try {
          /* import() dynamique (Chrome 63+) via Function : le mot-cle ne doit
             pas apparaitre nu dans un fichier voulu ES5-parsable partout. */
          (new Function("return import('./bpo-sync.js')"))()
            .then(function (m) { m.startSync(shim()); },
                  function (e) { log('bpo-sync inaccessible (' + String(e && e.message || e) + ').'); });
        } catch (e) { log('import impossible (' + String(e && e.message || e) + ').'); }
        return;
      }
      /* pas de session : petit bandeau — l'app reste utilisable comme avant */
      try {
        var b = document.createElement('div');
        b.style.cssText = 'position:relative;z-index:100000;background:#ff8a3d;color:#1a1d23;font:600 12px system-ui;text-align:center;padding:6px;line-height:1.3;';
        b.innerHTML = 'Connectez-vous pour retrouver vos projets ici — <a href="compte.html" style="color:#1a1d23;text-decoration:underline;">Mon compte</a>';
        function pose(){ if (document.body) { document.body.insertBefore(b, document.body.firstChild); } }
        if (document.body) { pose(); } else { document.addEventListener('DOMContentLoaded', pose); }
      } catch (e) {}
    });
  }

  function boot() {
    if ((location.pathname || '').indexOf('compte') >= 0) { compteUI(); } else { appBoot(); }
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); }
  else { boot(); }
})();
