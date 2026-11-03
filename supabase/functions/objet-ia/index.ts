/* index.ts — fonction Edge « objet-ia » : d'une description en langage naturel, le code d'un objet 3D (fichier OBJET
 * pour le kit bpo-geo-kit.js), écrit par Claude et renvoyé en flux au navigateur.
 *
 * Le navigateur (bpo-objet-ia.js) envoie la description — ou, pour une correction ou une modification, la description, le code
 * précédent et le rapport du contrôle, ou la demande et les réglages (J5) — avec le jeton de session de l'utilisateur. Ici : contrôle de session,
 * d'admission des anonymes (ANONYMES_ADMIS, E9 ; F4 : anonyme = champ GoTrue ou pas de courriel), d'abonnement ou d'essai, de quota
 * (en objets sur 30 jours glissants), de gardes (appels par objet, appels par 30 jours sur les objets créés OU repris dans la
 * fenêtre, F1) et de plafonds globaux (F2 : appels de tous les utilisateurs sur 24 h, MAX_APPELS_GLOBAL_24H, pour toute requête ;
 * E9 : objets créés sur 24 h, MAX_OBJETS_GLOBAL_24H, à la création), puis l'appel au modèle en flux ; la réponse est un
 * text/event-stream (debut, delta…, fin | erreur), et la ligne objets_ia tient la comptabilité (appels, tours, jetons, statut,
 * dernier code). Contrat : PROTOCOLE.md §3 (dossier de travail, hors dépôt).
 *
 * Toute la logique est dans traitement.ts (fonctions pures, testées sous Node) ; ce fichier ne fait que le câblage Deno :
 * les secrets, le client service Supabase, le SDK Anthropic, et Deno.serve.
 *
 * SECRETS, posés par AL dans Edge Functions → Secrets, jamais dans le dépôt (public) :
 *   · SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — fournis par la plateforme ;
 *   · ANTHROPIC_API_KEY_OBJET_IA — la clé DÉDIÉE à cette fonction, la SEULE clé Anthropic lue (H12) : une clé d'un espace de travail
 *     Anthropic à part, à limite de dépense mensuelle, PRÉREQUIS de la mise en service (DEPLOIEMENT.md §2, dossier de travail, hors dépôt).
 *     Sans elle (absente ou vide), la fonction répond 503 cle_absente et le bouton le dit : échec fermé, aucun repli sur une autre clé.
 *     Retirer ce secret arrête donc proprement la dépense, au prochain chargement du module (redéployer pour le forcer).
 *
 * CE QUI SORT DU PROJET : la description de l'utilisateur, son instruction, les réglages courants de l'objet modifié (des nombres
 * nommés, J5) et le code produit partent chez Anthropic. Rien d'autre : ni courriel, ni identifiant (le jeton ne quitte pas Supabase).
 *
 * JOURNAL : console.error, toujours préfixé « objet-ia: », cinq formes de lignes : {"statut":…,"duree_ms":…} par réponse autre
 * que 200/204 ; « flux du modèle : … », écrites par traitement.ts (erreur du modèle pendant le flux, D5 ; « refus avant le début : … »
 * quand l'appel échoue avant le premier événement du flux — refus de l'API, délai de connexion ou garde murale compris, quel que soit
 * le nom de l'erreur, H7 et I11 — rien n'est alors compté ; flux arrêté sans événement de fin ;
 * arrêt max_tokens sans fichier OBJET, E11 ; arrêt max_tokens (fichier livré) ou (fichier refusé : trop_long | code_refuse), F6, H10) ;
 * « mise à jour de la ligne ratée : … » ; « erreur interne: … » (exception hors du flux, réponse 500) ; « boucle du flux : … » (ne
 * devrait jamais apparaître). L6 : en plus de ces cinq formes, quand la plateforme annonce l'arrêt du worker (beforeunload, plus bas),
 * une ligne par appel en cours, « arrêt du worker annoncé (<raison>) pendant un appel <phase>, <n> s, ligne <id> » (signalerArret de
 * traitement.ts ; M5 : l'id de la ligne objets_ia, un UUID, ou « ? »), qui n'annule rien. Rien au chargement du module (H12). La
 * comptabilité (appels, tours, jetons) est dans la table objets_ia, pas dans le journal ; jamais le texte des descriptions ni le code.
 * Une erreur s'y écrit « nom: message », le nom étant celui de son
 * constructeur (J9, nomErreur de traitement.ts : les erreurs du SDK 1.3.0 ont toutes e.name « Error » ; APIUserAbortError ou
 * BadRequestError ne se lisent que sur le constructeur). Une erreur de base de supabase-js — un objet simple { code, message, details,
 * hint }, pas une Error — s'y écrit « ErreurBase: <code> <message> », sans details ni hint (K2 : classe de traitement.ts, la même pour
 * « erreur interne »). L5 : tout texte d'erreur y tient sur UNE ligne de 300 caractères au plus (classe).
 *
 * MODÈLE (référence API du 02/11/2026) : claude-opus-5-5, réflexion toujours active sur ce modèle (pas de paramètre thinking),
 * profondeur par output_config.effort, pas de temperature ni de top_p, pas de préremplissage assistant. Repli serveur sur
 * refus des classificateurs : fallbacks 'default' sous le beta server-side-fallback-2026-07-01, derrière AVEC_REPLI (à passer à
 * false si l'API refuse le paramètre : la fonction marche sans). Le prompt système est mis en cache (cache_control ephemeral) :
 * identique d'un appel à l'autre, il est relu à 5 % du prix.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";   /* E14 : épinglé ; validé par tsc contre ce paquet */
import { classe, compterLignes, enTetes, estAnonyme, signalerArret, sommerAppels, traiter } from "./traitement.ts";
import type { Deps, EvenementFlux, Ligne, LigneComptee, MessageModele } from "./traitement.ts";
import { PROMPT_SYSTEME } from "./prompt.ts";

/* ---- Réglages (à ajuster par AL ; DEPLOIEMENT.md §5, dossier de travail, hors dépôt) ---- */
const MODELE = "claude-opus-5-5";
const EFFORT: "low" | "medium" | "high" | "xhigh" | "max" = "high";
/** E10 : 16 000 coupait des réponses (la réflexion compte dans la limite) → erreur vide, comptée au quota. */
const MAX_TOKENS = 32000;
/** E9 : sessions anonymes (essai sans compte). false = 403 anonyme (« créez votre compte gratuit »), avant tout quota. */
const ANONYMES_ADMIS = false;
/** Objets par utilisateur et par fenêtre glissante, selon sa catégorie (E10 ; anonyme 0 : aucun objet même si ANONYMES_ADMIS). */
const QUOTAS = { anonyme: 0, essai: 2, actif: 10 };
const FENETRE_JOURS = 30;
/** Gardes : appels au modèle par objet (session), et par utilisateur sur la fenêtre (E10). */
const MAX_APPELS_SESSION = 6;
const MAX_APPELS_30J = 50;
/** E9 : plafond des créations de tous les utilisateurs sur 24 h ; au-delà 503 sature + Retry-After 3600 (aucune ligne, aucun appel
 *  au modèle). La borne de dépense d'une journée est MAX_APPELS_GLOBAL_24H, sur une clé dédiée (H13). */
const MAX_OBJETS_GLOBAL_24H = 40;
/** F2 : plafond global d'APPELS au modèle sur 24 h, tous utilisateurs confondus, pour toute requête (création ou session connue),
 *  sommés sur les lignes touchées dans les 24 h (updated_at) ; au-delà 503 sature + Retry-After 3600, avant toute écriture.
 *  150 ≈ 40 créations × 3,75 appels ; borne de dépense ≈ 150 × 0,71 $ = 107 $/jour, ordre de grandeur au pire, hors requêtes
 *  simultanées ; ≈ 45 $ réaliste (DEPLOIEMENT.md §6, dossier de travail, hors dépôt). */
const MAX_APPELS_GLOBAL_24H = 150;
/** Repli serveur sur refus (fallbacks: 'default'). false = appel sans repli, sans en-tête beta. */
const AVEC_REPLI = true;
/** Garde murale d'un appel au modèle : au-delà, le flux est coupé. Avant le premier événement de l'API, rien n'est compté (I11 :
 *  erreur/modele) ; après, l'appel reste compté, en erreur/delai (J9 : le SDK lève alors APIUserAbortError, nom lu sur le
 *  constructeur). L6 : les 400 s de la plateforme (offre payante) sont la vie du WORKER, partagée entre les requêtes qu'il sert :
 *  cette garde ne protège à coup sûr qu'un appel servi par un worker neuf (voir l'abonnement à beforeunload, plus bas). */
const GARDE_MURALE_MS = 300_000;

const URL_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CLE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
/* H12 : la clé dédiée seule, sans repli ni ligne de journal ; absente ou vide, 503 cle_absente (échec fermé). */
const CLE_ANTHROPIC = Deno.env.get("ANTHROPIC_API_KEY_OBJET_IA") ?? "";

const admin = createClient(URL_SUPABASE, CLE_SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anthropic = CLE_ANTHROPIC ? new Anthropic({ apiKey: CLE_ANTHROPIC, maxRetries: 0, timeout: GARDE_MURALE_MS }) : null;

/** L'appel au modèle, en flux : 'parti' au premier événement reçu de l'API (H7), deltas de texte, puis l'événement de fin (usage,
 *  stop_reason, modèle qui a répondu). */
async function* flux(messages: MessageModele[], _lang: string, signal: AbortSignal): AsyncGenerator<EvenementFlux> {
  if (!anthropic) throw new Error("clé absente");
  /* Le client parti (req.signal) ou la garde murale : l'un ou l'autre annule le flux Claude. */
  const garde = AbortSignal.timeout(GARDE_MURALE_MS);
  const combine = AbortSignal.any([signal, garde]);
  const base = {
    model: MODELE,
    max_tokens: MAX_TOKENS,
    output_config: { effort: EFFORT },
    system: [{ type: "text" as const, text: PROMPT_SYSTEME, cache_control: { type: "ephemeral" as const } }],
    messages,
  };
  const repli = AVEC_REPLI
    ? { betas: ["server-side-fallback-2026-07-01" as const], fallbacks: "default" as const }
    : {};
  const stream = anthropic.beta.messages.stream({ ...base, ...repli }, { signal: combine });
  let premier = true;
  for await (const ev of stream) {
    /* H7 : le premier événement reçu (message_start, avant toute réflexion ou tout texte) dit que l'API a pris l'appel ; une erreur
       levée AVANT lui (requête refusée, limite de dépense atteinte, panne ; I11 : délai de connexion ou garde murale aussi, quel que
       soit le nom de l'erreur) ne consomme rien : traitement.ts rend la ligne. */
    if (premier) { premier = false; yield { type: "parti" }; }
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
      yield { type: "delta", t: ev.delta.text };
    }
  }
  const fin = await stream.finalMessage();
  yield {
    type: "fin",
    usage: {
      entree: fin.usage.input_tokens,
      sortie: fin.usage.output_tokens,
      cache_lu: fin.usage.cache_read_input_tokens ?? 0,
      cache_ecrit: fin.usage.cache_creation_input_tokens ?? 0,   /* E13 */
    },
    stop_reason: fin.stop_reason,
    modele: fin.model,
  };
}

const deps: Deps = {
  getUser: async (token) => {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    /* F4 : anonyme si le champ GoTrue le dit OU si le compte n'a pas de courriel (dans BPO un compte a toujours un courriel). */
    return { id: data.user.id, is_anonymous: estAnonyme(data.user) };
  },
  lireProfil: async (uid) => {
    const { data, error } = await admin.from("profiles").select("plan,trial_ends_at").eq("id", uid).maybeSingle();
    if (error) throw error;
    return data ? { plan: data.plan ?? null, trial_ends_at: data.trial_ends_at ?? null } : null;
  },
  compterObjets: async (uid, depuis) => {
    /* F1 : les lignes créées OU reprises dans la fenêtre (updated_at ≥ depuis) ; compterLignes en tire objets (créées dans la
       fenêtre), appels (toutes), plusAncien (created_at) et plusAncienMaj (updated_at). */
    const { data, error } = await admin.from("objets_ia").select("appels,created_at,updated_at")
      .eq("user_id", uid).gte("updated_at", depuis.toISOString()).order("updated_at", { ascending: true });
    if (error) throw error;
    return compterLignes((data ?? []) as LigneComptee[], depuis);
  },
  compterObjetsGlobal: async (depuis) => {
    /* E9 : count exact sans lignes (head) — tous utilisateurs confondus, la clé service ignore la RLS. */
    const { count, error } = await admin.from("objets_ia").select("id", { count: "exact", head: true })
      .gte("created_at", depuis.toISOString());
    if (error) throw error;
    return count ?? 0;
  },
  compterAppelsGlobal: async (depuis) => {
    /* F2 : somme des appels des lignes touchées depuis `depuis`, tous utilisateurs (la clé service ignore la RLS) ; faite ici, pas
       d'agrégat PostgREST (désactivés par défaut sur Supabase) : des dizaines de lignes au plus sur 24 h. */
    const { data, error } = await admin.from("objets_ia").select("appels").gte("updated_at", depuis.toISOString());
    if (error) throw error;
    return sommerAppels((data ?? []) as { appels: number }[]);
  },
  lireObjet: async (session) => {
    const { data, error } = await admin.from("objets_ia").select("*").eq("id", session).maybeSingle();
    if (error) throw error;
    return (data as Ligne | null) ?? null;
  },
  insererObjet: async (ligne) => {
    const { error } = await admin.from("objets_ia").insert(ligne);
    if (error) throw error;
  },
  majObjet: async (session, champs) => {
    const { error } = await admin.from("objets_ia").update(champs).eq("id", session);
    if (error) throw error;
  },
  supprimerObjet: async (id) => {
    /* H7, I11 : la ligne qu'une création vient d'insérer, quand l'appel échoue avant le premier événement du flux (délai compris). */
    const { error } = await admin.from("objets_ia").delete().eq("id", id);
    if (error) throw error;
  },
  flux,
  maintenant: () => new Date(),
  cleAnthropique: !!CLE_ANTHROPIC,
  limites: {
    quotas: QUOTAS, fenetreJours: FENETRE_JOURS, maxAppelsSession: MAX_APPELS_SESSION, maxAppels30j: MAX_APPELS_30J,
    anonymesAdmis: ANONYMES_ADMIS, maxObjetsGlobal24h: MAX_OBJETS_GLOBAL_24H, maxAppelsGlobal24h: MAX_APPELS_GLOBAL_24H,
  },
  journal: (message) => console.error("objet-ia:", message),
};

/* L6 : la plateforme annonce l'arrêt d'un worker par l'événement beforeunload (page Supabase « Background tasks » ; ni la liste des
   raisons ni le délai laissé au gestionnaire n'y sont donnés). Abonné une fois par worker, au chargement du module, sans rien écrire
   (H12) : signalerArret n'écrit qu'une ligne de journal par appel en cours et n'annule rien (on observe d'abord). La garde de type
   laisse l'import possible hors Deno. */
if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("beforeunload", (ev) => signalerArret(String((ev as any)?.detail?.reason ?? "inconnue")));
}

/* Jamais un 500 sans en-têtes CORS. */
Deno.serve(async (req: Request) => {
  const origine = req.headers.get("origin");
  const t0 = Date.now();
  try {
    const reponse = await traiter(req, deps);
    if (reponse.status !== 200 && reponse.status !== 204) {
      console.error("objet-ia:", JSON.stringify({ statut: reponse.status, duree_ms: Date.now() - t0 }));
    }
    return reponse;
  } catch (e) {
    /* J9, K2 : classe de traitement.ts, comme son journal — « <nom>: <message> » pour une Error (nom de nomErreur, le constructeur),
       « ErreurBase: <code> <message> » pour une erreur de base (les « if (error) throw error; » des deps), jamais details ni hint. */
    console.error("objet-ia: erreur interne:", classe(e));
    return new Response(JSON.stringify({ error: "erreur interne, réessayez dans un instant", code: "interne" }), {
      status: 500,
      headers: { ...enTetes(origine), "Content-Type": "application/json; charset=utf-8" },
    });
  }
});
