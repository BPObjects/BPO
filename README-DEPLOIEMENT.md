# BPO-site — bundle prêt à publier

Contenu :
- `index.html` — page d'accueil (liens Mon compte / Espace fabricants + pied de page légal).
- `meuble.html` — le configurateur (passerelle d'accès incluse + lien « Mon compte »).
- `compte.html` — inscription / connexion / essai / abonnement / newsletter.
- `espace-fabricants.html` — formulaire fabricants → al@architecture-al.com.
- `mentions-legales.html`, `cgu.html`, `cgv.html`, `politique-confidentialite.html` — pages légales.
- `bpo-config.js` — **à remplir** avec tes clés Supabase (anon).
- `bpo-auth.js` — passerelle d'accès (garde « dev » : tant que `bpo-config.js` n'est pas
  configuré, l'appli reste en **accès libre** ; dès que tu mets tes vraies clés, le blocage essai/abonnement s'active).
- `supabase/` — schéma SQL + 3 fonctions Stripe (voir `BPO-saas/GUIDE-MISE-EN-PLACE.md`).

## À ajouter avant publication
- Le dossier **`data/`** (fabricant-meshes.js, fabricants.js, textured-objects.js) depuis ton dépôt actuel — il n'est pas inclus ici (fichiers volumineux).
- Ton **`bpo-logo.png`** (référencé par index.html).

## Mise en route
1. Suis `BPO-saas/GUIDE-MISE-EN-PLACE.md` (Supabase + Stripe), renseigne `bpo-config.js`.
2. Complète les `[À COMPLÉTER]` des pages légales (SIRET, adresse, TVA, hébergeur…).
3. Publie tout le dossier (GitHub Pages, Netlify, OVH…).

Tant que le backend n'est pas branché, `index.html`, `meuble.html` et les pages
légales fonctionnent normalement ; `compte.html` nécessite Supabase configuré.
