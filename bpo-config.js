/* bpo-config.js — À REMPLIR avec tes clés (étape Supabase + Stripe du guide).
   Ce sont des clés PUBLIQUES (anon) : pas de secret ici. Les secrets restent
   côté Supabase Edge Functions. */
export const SUPABASE_URL  = "https://ockdepvqxjfwudthmusa.supabase.co";
export const SUPABASE_ANON = "sb_publishable_z6V4r_1kcvbt9y-E1JnjRw_bv29jysd";
/* URL de l'appli (pour les redirections Stripe) — ex. https://app.architecture-al.com */
export const SITE_URL = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, "");
/* Durée d'essai (jours) — informatif côté front ; la vraie valeur est posée en base. */
export const TRIAL_DAYS = 15;
/* Prix affiché — SEUL endroit à changer côté front. Le montant réellement débité
   vient de l'ID de prix Stripe utilisé par la fonction Edge `create-checkout`
   (côté Supabase) : les garder cohérents. */
export const PRICE_LABEL = "100 € / an";
export const PRICE_LABEL_SHORT = "100 €/an";   /* pour les bandeaux étroits */
