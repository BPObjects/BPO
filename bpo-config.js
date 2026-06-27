/* bpo-config.js — À REMPLIR avec tes clés (étape Supabase + Stripe du guide).
   Ce sont des clés PUBLIQUES (anon) : pas de secret ici. Les secrets restent
   côté Supabase Edge Functions. */
export const SUPABASE_URL  = "https://VOTRE-PROJET.supabase.co";
export const SUPABASE_ANON = "VOTRE_CLE_ANON_PUBLIC";
/* URL de l'appli (pour les redirections Stripe) — ex. https://app.architecture-al.com */
export const SITE_URL = window.location.origin;
/* Durée d'essai (jours) — informatif côté front ; la vraie valeur est posée en base. */
export const TRIAL_DAYS = 15;
export const PRICE_LABEL = "50 € / an";
