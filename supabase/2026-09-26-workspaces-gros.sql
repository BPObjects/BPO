-- ============================================================================
--  BPO — GROSSES CLÉS DE L'ATELIER (colonne `gros`)
--  2026-09-26 (AL : « Corriger la synchro ») — à coller dans SQL Editor.
--  PRÉPARÉ, NON EXÉCUTÉ.
--
--  Une clé d'atelier de plus de 700 000 caractères (planches à images
--  embarquées, bibliothèque) ne va plus dans `data` : bpo-sync.js la range
--  dans cette colonne de la MÊME ligne, { "<clé>": {v,t,n,h,d,a} } (valeur,
--  horodatage, longueur, empreinte, empreinte de la version courte de `data`
--  déjà intégrée, lignée des versions précédentes), écrite dans le même
--  upsert que `data` (une seule requête : jamais un mélange de deux
--  versions). `data` garde la dernière version courte : les clients anciens
--  (onglets pas rechargés, fenêtre SketchUp pas rouverte, futur build figé)
--  ne voient jamais de grosse valeur et ne touchent pas à cette colonne — un
--  upsert PostgREST n'écrit que les colonnes envoyées.
--
--  SANS RISQUE pour les clients en service : ils ne lisent ni n'écrivent
--  `gros`. Tant que ce script n'est pas passé, le nouveau bpo-sync.js le dit
--  une fois en console et garde les grosses clés à l'écart (comme avant, sans
--  plus jamais les réécrire localement).
--
--  Rien d'autre à faire :
--   - les droits select/insert/update de `authenticated` sont accordés sur la
--     TABLE (2026-08-06-workspaces-sync.sql) : ils couvrent la nouvelle colonne ;
--   - RLS « chacun sa ligne » et trigger updated_at inchangés (le trigger
--     s'applique à toute mise à jour de la ligne, `gros` compris) ;
--   - Postgres 11+ : ajouter une colonne avec un défaut constant ne réécrit
--     pas la table (instantané).
-- ============================================================================

alter table public.workspaces
  add column if not exists gros jsonb not null default '{}'::jsonb;

-- Garde-fou, comme workspaces_data_size : 16 Mio (le client s'arrête de
-- lui-même à 15 Mo : la clé qui ferait dépasser n'est pas poussée, le compte
-- garde sa version, le reste de l'atelier continue de monter).
alter table public.workspaces drop constraint if exists workspaces_gros_size;
alter table public.workspaces add constraint workspaces_gros_size
  check (pg_column_size(gros) < 16777216);

-- PostgREST relit le schéma tout de suite (sinon : jusqu'à son prochain
-- rechargement, la colonne serait inconnue de l'API).
notify pgrst, 'reload schema';


-- ----------------------------------------------------------------------------
--  VÉRIFICATIONS (lecture seule, à lancer à la main après coup)
-- ----------------------------------------------------------------------------
-- La colonne est là :
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'workspaces';
--
-- Après ouverture du site (console : « BPO sync : prêt (… grosses : BPO_PLOT_v1 1138 k car. …) ») :
--   select id, updated_at,
--          pg_column_size(data) as data_octets,
--          pg_column_size(gros) as gros_octets,
--          (select array_agg(k) from jsonb_object_keys(gros) k) as grosses_cles
--     from public.workspaces
--    order by updated_at desc
--    limit 5;
--
-- (26/09) Un client ANCIEN (onglet pas rechargé) laisse-t-il `gros` intact ? Noter
-- n et h de chaque grosse clé, faire écrire l'onglet ancien (une préférence),
-- relancer : n et h doivent être identiques, seul updated_at change.
--   select w.id, w.updated_at, k as cle, w.gros->k->>'n' as n, w.gros->k->>'h' as h
--     from public.workspaces w, jsonb_object_keys(w.gros) k
--    order by w.updated_at desc, k;


-- ----------------------------------------------------------------------------
--  RETOUR ARRIÈRE (lire d'abord le LISEZMOI, section « Retour arrière »)
-- ----------------------------------------------------------------------------
-- (26/09, vérification adverse V1) Le retour arrière du CODE ne passe ni par ce
-- SQL ni par l'ancien bpo-sync.js : republier l'ancien fichier fait perdre, sur
-- chaque appareil, les ajouts d'une bibliothèque de plus de 700 000 car. Il se
-- fait avec patch-sync-gros-retour-arriere.py (GROS_ACTIF = false), puis
-- publication et rechargement des fenêtres. La colonne reste alors en sommeil,
-- intacte, et reprend du service si le correctif est réactivé.
--
-- NE PAS SUPPRIMER LA COLONNE tant qu'un appareil peut détenir des ajouts qui
-- n'existent que dans `gros` et chez lui : elle porte les seules copies au
-- compte des grosses clés. Si un jour il fallait vraiment la retirer (plus
-- aucune clé de plus de 700 000 car. sur aucun appareil, `gros` vide) :
-- 1. vérifier qu'elle est vide, sinon l'exporter d'abord :
--      select id, gros from public.workspaces where gros <> '{}'::jsonb;
-- 2. seulement ensuite :
--      alter table public.workspaces drop constraint if exists workspaces_gros_size;
--      alter table public.workspaces drop column if exists gros;
--      notify pgrst, 'reload schema';
