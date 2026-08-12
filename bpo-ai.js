/* bpo-ai.js — COMPRÉHENSION LIBRE SANS CLÉ (2026-08-12).

   Chargé À LA DEMANDE par la barre de prompt de app.html (import dynamique, au
   premier ordre dicté) : rien n'est téléchargé pour les visiteurs qui ne s'en
   servent pas, et l'IIFE du prompt n'a besoin d'aucune modification ailleurs.

   POURQUOI. L'étage « libre » exigeait jusqu'ici que l'utilisateur colle SA clé
   Anthropic (bouton 🔑). Aucun architecte ne fera ça. Ici, l'abonné parle et
   c'est la fonction Edge `prompt-ai` qui appelle Claude avec la clé de BPO,
   après avoir vérifié la session, l'abonnement et le quota mensuel.

   CE MODULE NE VOIT AUCUN SECRET : il n'envoie que le jeton de session de
   l'utilisateur (déjà présent dans le navigateur) et l'ordre dicté. La clé
   Anthropic ne quitte jamais Supabase.

   Une seconde instance de client Supabase est créée ici (bpo-auth.js garde la
   sienne, non exposée). C'est volontaire : `getSession()` rafraîchit un jeton
   expiré tout seul, là où lire le localStorage à la main donnerait un 401 au
   bout d'une heure. Les deux instances partagent le même stockage. */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON } from "./bpo-config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

/* Erreur porteuse d'un code, pour que l'appelant sache s'il doit se rabattre
   sur la clé locale (pas de session) ou afficher un message (quota atteint). */
export class ErreurAI extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Envoie un ordre au serveur. Renvoie l'objet {mode?, set?, say, _quota}.
 *  @param {string} texte  l'ordre dicté ou tapé
 *  @param {string} mode   l'objet courant (immeuble, piscine…)
 *  @param {string} params JSON des paramètres de l'objet courant */
export async function demander(texte, mode, params) {
  let session = null;
  try {
    session = (await sb.auth.getSession())?.data?.session ?? null;
  } catch (e) { /* traité comme absence de session */ }
  if (!session) throw new ErreurAI("no-session", "Connectez-vous pour la compréhension libre.");

  let r;
  try {
    r = await fetch(SUPABASE_URL + "/functions/v1/prompt-ai", {
      method: "POST",
      headers: { "Authorization": "Bearer " + session.access_token, "Content-Type": "application/json" },
      body: JSON.stringify({ texte: texte, mode: mode, params: params }),
    });
  } catch (e) {
    throw new ErreurAI("reseau", "Service indisponible — le parseur local prend le relais.");
  }

  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new ErreurAI("no-session", "Session expirée — reconnectez-vous.");
  if (r.status === 403) throw new ErreurAI("abo", j.error || "Abonnement requis pour la compréhension libre.");
  if (r.status === 429) throw new ErreurAI("quota", j.error || "Quota mensuel atteint.");
  if (r.status === 404) throw new ErreurAI("absent", "Compréhension libre pas encore déployée sur ce site.");
  if (!r.ok || j.error) throw new ErreurAI("serveur", j.error || "Erreur du service de compréhension.");
  return j;
}

/** Le serveur est-il utilisable ici et maintenant ? (session ouverte)
 *  Sert à l'affichage : la barre montre 🧠 actif sans réclamer de clé. */
export async function disponible() {
  try { return !!(await sb.auth.getSession())?.data?.session; }
  catch (e) { return false; }
}
