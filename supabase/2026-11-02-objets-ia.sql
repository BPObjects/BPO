-- ============================================================================
--  BPO — « DÉCRIRE UN OBJET » : table public.objets_ia
--  2026-11-02 — à coller dans SQL Editor (projet ockdepvqxjfwudthmusa).
--  PRÉPARÉ, NON EXÉCUTÉ. Rejouable sans dommage (if not exists / drop … if exists /
--  add column if not exists). À rejouer AVANT de redéployer la fonction (E13 :
--  la fonction écrit la 17e colonne, jetons_cache_ecrit ; sur une table à 16
--  colonnes, l'insertion échouerait).
--
--  Une ligne par objet décrit (id = la « session » tirée par le navigateur, un
--  UUID v4 par objet), écrite UNIQUEMENT par la fonction Edge objet-ia avec la
--  clé service : insertion au premier appel (mode creer — ou modifier sur une
--  session que le serveur ne connaît pas, D1 —, après contrôle du quota), mise
--  à jour aux appels suivants (appels, tours, jetons, statut, nom, dernier
--  code). L'utilisateur ne peut que LIRE ses propres lignes — aucune
--  politique d'écriture, et les droits insert/update/delete sont retirés aux
--  rôles anon et authenticated : même une politique ajoutée par erreur plus
--  tard n'ouvrirait rien.
--
--  Le quota se compte ICI, en objets (lignes) sur 30 jours glissants, et les
--  deux gardes (appels par objet, appels par 30 jours) sur la colonne appels :
--  c'est la fonction qui lit. F1 (02/11) : les gardes de l'utilisateur lisent
--  updated_at (objets créés OU repris dans la fenêtre ; le quota d'objets ne
--  garde que les created_at de la fenêtre), d'où l'index (user_id, updated_at
--  desc). Le plafond global d'objets (E9 : objets créés par TOUS les
--  utilisateurs sur 24 h, MAX_OBJETS_GLOBAL_24H d'index.ts) se lit en count(*)
--  sur created_at, d'où l'index (created_at desc) (H11) ; le plafond global
--  d'appels (F2 : MAX_APPELS_GLOBAL_24H, 150) somme appels sur les lignes à
--  updated_at dans les 24 h, d'où l'index (updated_at desc). Les plafonds
--  eux-mêmes sont des constantes d'index.ts, réglées au §5 de DEPLOIEMENT.md
--  (dossier de travail, hors dépôt). Les compteurs (appels, jetons) sont relus
--  puis écrits sans verrou par la fonction : deux mises à jour concurrentes
--  d'une même ligne peuvent se perdre l'une l'autre (TOCTOU accepté, le module
--  sérialise ses appels) ; la requête « coût des 30 derniers jours » plus
--  bas est donc un PLANCHER.
--
--  Statuts : en_cours (appel en cours) | ok (code livré) | defauts (réservé :
--  le contrôle du navigateur a laissé des défauts) | erreur (modèle, délai,
--  refus, code refusé, réponse vide, fichier trop long) | abandon (le
--  navigateur a fermé le flux ou coupé la requête).
--
--  H7 et I11 (02/11, réunis par J10) : tout échec d'un appel avant le
--  premier événement du flux ne laisse rien, quel que soit le nom de
--  l'erreur — requête refusée, limite de dépense atteinte, panne, délai de
--  connexion ou garde murale compris (rien n'a été produit ni facturé) : la
--  ligne qu'il venait de créer est supprimée (par la fonction, clé service),
--  une ligne reprise retrouve appels, statut et updated_at d'avant ; ni objet,
--  ni appel, ni unité des plafonds globaux ne sont comptés. Seul l'abandon
--  réel du client (requête coupée, flux fermé) reste compté, en statut
--  abandon. Après le premier événement, tout échec reste compté (des jetons
--  ont pu être facturés).
-- ============================================================================

create table if not exists public.objets_ia (
  id             uuid primary key,                       -- = session du client (UUID v4)
  user_id        uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  statut         text not null default 'en_cours',       -- en_cours | ok | defauts | erreur | abandon
  description    text not null,
  nom            text,
  designation    text,
  appels         int  not null default 1,                -- requêtes acceptées pour cet objet (toutes modes)
  tours          int  not null default 1,                -- réponses qui ont livré un fichier OBJET
  jetons_entree  int  not null default 0,
  jetons_sortie  int  not null default 0,
  jetons_cache   int  not null default 0,                -- jetons d'entrée relus depuis le cache
  jetons_cache_ecrit int not null default 0,             -- jetons d'entrée écrits dans le cache (E13)
  modele         text,
  lang           text,
  code           text                                    -- dernier code produit (≤ 60 000 caractères, D4)
);

-- E13 (02/11) : la 17e colonne — une table déjà créée avec 16 colonnes la reçoit ici,
-- rejouable (add column if not exists) ; la fonction la cumule à chaque appel.
alter table public.objets_ia add column if not exists jetons_cache_ecrit int not null default 0;

alter table public.objets_ia drop constraint if exists objets_ia_statut_valide;
alter table public.objets_ia add constraint objets_ia_statut_valide
  check (statut in ('en_cours', 'ok', 'defauts', 'erreur', 'abandon'));

-- D4 (02/11) : 60 000 caractères, le même plafond que PLAFONDS.code du serveur
-- et que le module ; rejouer le script remplace l'ancienne contrainte (40 000).
alter table public.objets_ia drop constraint if exists objets_ia_code_taille;
alter table public.objets_ia add constraint objets_ia_code_taille
  check (code is null or length(code) <= 60000);

create index if not exists objets_ia_user_date on public.objets_ia (user_id, created_at desc);
-- F1 / F2 (02/11) : les gardes de l'utilisateur lisent updated_at (objets créés OU repris dans la
-- fenêtre), le plafond global d'appels somme appels sur updated_at (24 h). Rejouables.
create index if not exists objets_ia_user_maj on public.objets_ia (user_id, updated_at desc);
create index if not exists objets_ia_maj on public.objets_ia (updated_at desc);
-- H11 (02/11) : le plafond global d'objets (E9) compte les lignes à created_at dans les
-- 24 h, tous utilisateurs : son index, en tête sur created_at. Rejouable.
create index if not exists objets_ia_cree on public.objets_ia (created_at desc);

-- Sécurité au niveau ligne : chacun ne voit que SES objets ; personne n'écrit
-- depuis le navigateur (la fonction Edge écrit avec la clé service, qui
-- ignore la RLS).
alter table public.objets_ia enable row level security;

drop policy if exists "objets_ia : lecture du proprietaire" on public.objets_ia;
create policy "objets_ia : lecture du proprietaire" on public.objets_ia
  for select using (auth.uid() = user_id);

revoke all on public.objets_ia from anon, authenticated;
grant select on public.objets_ia to authenticated;

comment on table  public.objets_ia is
  'Objets décrits en langage naturel (« Décrire un objet ») : un objet par ligne, id = session du navigateur ; écrit par la fonction Edge objet-ia seulement ; sert au quota (objets sur 30 jours glissants) et aux gardes (appels).';
comment on column public.objets_ia.id            is 'Session tirée par le navigateur (UUID v4), une par objet, pour toute la vie du panneau.';
comment on column public.objets_ia.statut        is 'en_cours | ok | defauts | erreur | abandon';
comment on column public.objets_ia.description   is 'Description de l''utilisateur (≤ 1 500 caractères), telle qu''envoyée au modèle.';
comment on column public.objets_ia.nom           is 'OBJET.nom lu dans le dernier code livré.';
comment on column public.objets_ia.designation   is 'OBJET.designation lu dans le dernier code livré.';
comment on column public.objets_ia.appels        is 'Requêtes acceptées pour cet objet, tous modes (creer, corriger, modifier) ; gardes MAX_APPELS_SESSION (6) par objet et MAX_APPELS_30J (50) par 30 jours, constantes d''index.ts.';
comment on column public.objets_ia.tours         is 'Réponses du modèle qui ont livré un fichier OBJET.';
comment on column public.objets_ia.jetons_entree is 'Jetons d''entrée facturés (hors cache), cumulés sur l''objet.';
comment on column public.objets_ia.jetons_sortie is 'Jetons de sortie, cumulés sur l''objet.';
comment on column public.objets_ia.jetons_cache  is 'Jetons d''entrée relus depuis le cache, cumulés sur l''objet (0,20 $/M).';
comment on column public.objets_ia.jetons_cache_ecrit is 'Jetons d''entrée écrits dans le cache (cache_creation_input_tokens), cumulés sur l''objet (5 $/M : 1,25 × l''entrée).';
comment on column public.objets_ia.modele        is 'Modèle qui a répondu en dernier (le repli serveur peut en changer).';
comment on column public.objets_ia.lang          is 'Langue des textes lisibles demandée par le navigateur (deux lettres).';
comment on column public.objets_ia.code          is 'Dernier code OBJET livré (≤ 60 000 caractères) ; null si aucun.';

-- PostgREST relit le schéma tout de suite.
notify pgrst, 'reload schema';


-- ----------------------------------------------------------------------------
--  VÉRIFICATIONS (lecture seule, à lancer à la main après coup)
-- ----------------------------------------------------------------------------
-- La table, ses 17 colonnes (id, user_id, created_at, updated_at, statut, description,
-- nom, designation, appels, tours, jetons_entree, jetons_sortie, jetons_cache,
-- jetons_cache_ecrit, modele, lang, code) :
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'objets_ia'
--    order by ordinal_position;
--   select count(*) as colonnes from information_schema.columns
--    where table_schema = 'public' and table_name = 'objets_ia';     -- 17 attendu
--
-- Les index (H11) : objets_ia_pkey, objets_ia_user_date, objets_ia_user_maj, objets_ia_maj, objets_ia_cree :
--   select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'objets_ia' order by 1;
--
-- RLS active, une seule politique (select) :
--   select relrowsecurity from pg_class where oid = 'public.objets_ia'::regclass;
--   select policyname, cmd from pg_policies where tablename = 'objets_ia';
--
-- Droits : authenticated ne doit avoir que SELECT.
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'objets_ia' order by 1, 2;
--
-- Après un premier essai depuis le site :
--   select id, statut, nom, appels, tours, jetons_entree, jetons_sortie, jetons_cache, jetons_cache_ecrit, modele, created_at
--     from public.objets_ia order by created_at desc limit 10;
--
-- Les plafonds globaux du jour : objets créés (E9 : 503 sature à partir de MAX_OBJETS_GLOBAL_24H, 40 par défaut) et appels
-- des lignes touchées (F2 : 503 sature à partir de MAX_APPELS_GLOBAL_24H, 150 par défaut — au plus tard le 151e appel de la
-- journée, tous utilisateurs confondus, création ou session connue, est refusé ; plus tôt les jours où des objets anciens
-- sont repris : la somme sur les lignes touchées compte tout l'historique d'une vieille ligne reprise, soit un surcompte de
-- 5 appels au plus par reprise — conservateur, accepté) :
--   select count(*) as objets_24h from public.objets_ia where created_at > now() - interval '24 hours';
--   select coalesce(sum(appels), 0) as appels_24h from public.objets_ia where updated_at > now() - interval '24 hours';
--
-- Les appels d'un utilisateur sur la fenêtre, comme la fonction les compte (F1 : lignes créées OU reprises) :
--   select coalesce(sum(appels), 0) as appels_30j,
--          count(*) filter (where created_at > now() - interval '30 days') as objets_30j
--     from public.objets_ia where user_id = '<uuid>' and updated_at > now() - interval '30 days';
--
-- Coût des 30 derniers jours (fenêtre glissante, pas le mois civil ; ordre de grandeur), par modèle (colonne modele), aux tarifs
-- de claude-opus-5-5 : 4 $/M entrée, 20 $/M sortie, 0,20 $/M cache lu, 5 $/M cache écrit (E13). C'est un PLANCHER :
--   · les lignes servies par le modèle de repli (modele autre que claude-opus-5-5 : le modèle qui a répondu en dernier) sont
--     facturées à leurs propres tarifs, plus élevés au 02/11/2026, et non à ceux-ci ;
--   · les compteurs sont relus puis écrits sans verrou (deux mises à jour concurrentes d'une même ligne peuvent sous-compter) ;
--   · les lignes créées il y a plus de 30 jours et reprises depuis n'y figurent pas ;
--   · une tentative refusée en cours de réponse puis reprise par le repli serveur est facturée sans être comptée (les jetons
--     lus sont ceux de la seule tentative qui a répondu) :
--   select modele, count(*) as objets, sum(appels) as appels,
--          round((sum(jetons_entree) * 4 + sum(jetons_sortie) * 20 + sum(jetons_cache) * 0.2 + sum(jetons_cache_ecrit) * 5) / 1e6, 2) as dollars
--     from public.objets_ia where created_at > now() - interval '30 days'
--    group by modele order by dollars desc;
--
-- Les arrêts max_tokens (E11, F6, H10) se comptent dans les logs de la fonction, pas ici : « objet-ia: flux du modèle : arrêt
-- max_tokens » (sans fichier : la ligne reste en statut erreur, sans code), « … arrêt max_tokens (fichier livré) » (un fichier
-- s'est extrait quand même et a été livré) et « … arrêt max_tokens (fichier refusé : trop_long) » ou « (fichier refusé :
-- code_refuse) » (un fichier s'est extrait, puis le plafond ou le filtre l'a refusé : statut erreur). Les échecs avant le
-- début du flux (H7, I11 : refus de l'API, panne, délai de connexion, garde murale) aussi : « … flux du modèle : refus avant
-- le début : <nom>: <message> », le nom étant celui de l'erreur (J9) — la table n'en garde rien.


-- ----------------------------------------------------------------------------
--  RETOUR ARRIÈRE
-- ----------------------------------------------------------------------------
-- La table ne porte que de la comptabilité et les codes produits : rien
-- d'autre ne dépend d'elle (les objets gardés vivent dans la bibliothèque de
-- l'utilisateur, par cfg.ia). Pour tout retirer, après avoir supprimé la
-- fonction Edge (DEPLOIEMENT.md §7, dossier de travail, hors dépôt) :
--   drop table if exists public.objets_ia;
--   notify pgrst, 'reload schema';
