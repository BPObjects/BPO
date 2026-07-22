# SMTP Supabase — mode d'emploi (avant ouverture des abonnements)

**Pourquoi** : le service e-mail intégré de Supabase est limité à **2 messages/heure**
et n'est pas destiné à la production. Sans SMTP propre, les inscriptions échouent
en silence dès le 3ᵉ utilisateur de l'heure.

**Flux concernés** (compte.html) : confirmation d'inscription (`signUp`) et lien
magique (`signInWithOtp`). Pas de « mot de passe oublié » à ce jour (le lien
magique en tient lieu) — gabarit fourni quand même.

---
## 1. Choisir le fournisseur

### Voie A — sans nom de domaine (démarrage rapide) : **Brevo**
- Gratuit jusqu'à **300 e-mails/jour** ; l'expéditeur est une **adresse e-mail
  vérifiée** (pas besoin de posséder un domaine).
- Limite : sans domaine, pas de SPF/DKIM → une partie des messages peut arriver
  en indésirables. Acceptable pour démarrer, pas idéal pour durer.
- Marche à suivre : créer le compte Brevo → vérifier votre adresse d'expéditeur
  (Senders & IP → Senders) → **SMTP & API → SMTP** → noter :
  - Hôte : `smtp-relay.brevo.com` — Port : `587`
  - Identifiant : (affiché, souvent votre e-mail de compte)
  - Mot de passe : la **clé SMTP** générée (PAS le mot de passe du compte)

### Voie B — avec nom de domaine (recommandé pour l'ouverture commerciale) : **Resend**
- Gratuit jusqu'à 3 000 e-mails/mois, intégration Supabase documentée, excellente
  délivrabilité une fois le domaine vérifié (SPF + DKIM ajoutés dans la zone DNS).
- Nécessite de posséder un domaine (ex. `bpobjects.com`) — qui servirait AUSSI à
  remplacer `bpobjects.github.io/BPO` (GitHub Pages accepte les domaines custom).
- Marche à suivre : compte Resend → Domains → ajouter le domaine → poser les
  enregistrements DNS indiqués → Settings → SMTP : `smtp.resend.com`, port 587,
  identifiant `resend`, mot de passe = clé API.

> Décision simple : **pas de domaine aujourd'hui → Brevo maintenant**, et
> re-basculer sur Resend le jour où le domaine existe (10 min de re-config).

---
## 2. Configurer Supabase (tableau de bord)

1. **Authentication → Emails → SMTP Settings** → activer *Enable Custom SMTP* :
   - Host / Port / Username / Password : valeurs du fournisseur (ci-dessus)
   - Sender email : l'adresse vérifiée (Brevo) ou `no-reply@votredomaine` (Resend)
   - Sender name : `BPO — Building Product Objects`
2. **Authentication → Rate Limits** : « Rate limit for sending emails » est à
   **2/heure** tant que le SMTP custom n'est pas actif. Une fois le SMTP activé,
   monter par ex. à **30/heure** (Brevo tient 300/jour).
3. **Authentication → Emails → Templates** : coller les gabarits de ce dossier —
   - *Confirm signup* ← `confirm-signup.html` (objet : `Confirmez votre adresse — BPO`)
   - *Magic Link* ← `magic-link.html` (objet : `Votre lien de connexion — BPO`)
   - *Reset Password* ← `reset-password.html` (objet : `Réinitialisation de votre mot de passe — BPO`)
   Les variables `{{ .ConfirmationURL }}` / `{{ .Email }}` sont remplacées par Supabase.
4. **Authentication → URL Configuration** — vérifier :
   - Site URL : `https://bpobjects.github.io/BPO`
   - Redirect URLs : `https://bpobjects.github.io/BPO/*` (et `bpo://app/*` si un
     jour l'app desktop verrouillée fait de l'auth par lien).

---
## 3. Tester (protocole)

1. S'inscrire sur `compte.html` avec une adresse réelle NON déjà inscrite
   → l'e-mail « Confirmez votre adresse » doit arriver en < 1 min ; le bouton
   doit ramener sur `compte.html` connecté (essai 15 j actif).
2. Se déconnecter → « lien magique » → l'e-mail « Votre lien de connexion »
   doit arriver et connecter.
3. Refaire une inscription avec la MÊME adresse → le site doit afficher
   « Un compte existe déjà avec cet e-mail » (correctif du 19/07) et AUCUN
   e-mail ne doit partir.
4. Enchaîner 3 inscriptions d'adresses différentes dans l'heure → les 3 e-mails
   doivent partir (preuve que la limite 2/h intégrée ne s'applique plus).
5. Contrôler le tableau de bord du fournisseur (Brevo : Statistics → Email) :
   les envois doivent y apparaître, sans rebond.

**Piège connu** : si l'e-mail n'arrive pas, regarder d'abord Supabase →
Logs → Auth (erreur SMTP explicite) puis le tableau de bord du fournisseur
(rejet d'expéditeur non vérifié = cause n° 1).
