-- ============================================================================
--  BPO — partage d'une scène par lien : table public.scene_partages
--  2026-11-23 — à coller dans SQL Editor (projet ockdepvqxjfwudthmusa).
--
--  MODE D'EMPLOI. Coller TOUT le fichier dans une requête vide, ne rien sélectionner, lancer (Run).
--    - L'éditeur affiche « Potential issue detected — This query includes destructive operations » : c'est attendu
--      (le fichier retire puis recrée SES trois règles et SON déclencheur ; au premier passage il ne retire rien).
--      Confirmer (« Run query »).
--    - Résultat attendu : un tableau de SEPT lignes, colonnes « controle_v3 » et « etat », dans cet ordre :
--      1 déclencheur « actif », 2 fonctions « présente », 3 règles (INSERT, SELECT, DELETE), 1 table « active ».
--    - Rejouable sans dégât (if not exists / or replace / drop ... if exists) : rejouer RÉPARE droits, règles et fonctions.
--      Il ne retire PAS ce qui aurait été ajouté à la main : plus de sept lignes = une règle, un déclencheur ou une fonction
--      en trop, nommé dans le tableau, à retirer à la main (par exemple : drop policy <nom> on public.scene_partages;).
--      Ne pas recoller une copie plus ancienne de ce fichier (son tableau porte « controle » au lieu de « controle_v3 ») ;
--      si c'est fait, rejouer celui-ci remet tout en état.
--    - Tant que ce fichier n'est pas joué, l'application répond « Le partage de scènes n'est pas encore en service. ».
--      Si elle le dit encore APRÈS les sept lignes : vérifier que c'était bien le projet de BPO, puis rejouer seule la
--      ligne   notify pgrst, 'reload schema';
--    - Après exécution, le conseiller de sécurité de Supabase signale public.scene_partagee (alerte 0029 : fonction
--      SECURITY DEFINER appelable par les sessions). C'est VOULU : c'est par elle, et par elle seule, qu'un lien se lit.
--      N'appliquer aucun des remèdes proposés (ni « revoke execute », ni « security invoker ») : plus aucun destinataire
--      n'ouvrirait un lien. Fait par erreur : rejouer ce fichier répare.
--
--  CE QUE FAIT LE FICHIER. Une ligne par lien. L'identifiant (32 caractères hexadécimaux, 122 bits de hasard, tiré par le
--  serveur) EST le secret du lien :
--    - l'auteur (compte, pas l'essai anonyme) crée, liste et révoque SES liens (règles RLS) ;
--    - quiconque présente l'identifiant lit la scène par la fonction scene_partagee, et seulement par elle :
--      aucune règle ne permet de lister les liens des autres.
--
--  PLAFONDS (déclencheur, messages lisibles par l'application) : 20 Mo par lien, 200 liens et 200 Mo par compte, 2 Go pour
--  l'ENSEMBLE des liens. Ce dernier protège le disque du projet : les comptes sont gratuits, la somme des comptes ne doit
--  pas pouvoir remplir la base (qui passerait en lecture seule, pour tout BPO). Quand il est atteint, la création de liens
--  répond « Le partage de scènes est complet pour le moment. » ; les liens existants se lisent toujours. Ce sont des
--  constantes de la fonction scene_partages_avant_insertion : pour en changer une, changer le nombre ET le même nombre dans
--  le message juste en dessous, puis rejouer le fichier.
--  Deux envois simultanés d'un même compte passent l'un après l'autre (verrou par compte) ; le plafond d'ensemble, lui,
--  peut être dépassé de quelques envois partis en même temps de comptes différents.
--
--  ENTRETIEN (à lancer à la main, une requête à la fois, recopiée SANS les deux tirets « -- » du début de chaque ligne :
--  avec les tirets, l'éditeur ne fait rien et n'affiche aucune erreur). Ne jamais faire « select * » ici : contenu pèse
--  jusqu'à 20 Mo par ligne.
--    Vue d'ensemble (poids compté, place réelle sur le disque, base entière). Le poids compté est celui du texte que
--    reçoit le destinataire ; s'il dépasse de très loin la place sur le disque, un compte a gonflé ses liens pour fermer
--    le partage : « l'occupation par compte » le désigne, et retirer ses liens rouvre aussitôt la création.
--      select count(*) as liens, count(distinct owner) as comptes,
--             pg_size_pretty(coalesce(sum(poids), 0)::bigint) as poids_compte,
--             pg_size_pretty(pg_total_relation_size('public.scene_partages')) as place_sur_le_disque,
--             pg_size_pretty(pg_database_size(current_database())) as base_entiere
--        from public.scene_partages;
--    L'occupation par compte :
--      select u.email, count(*) as liens, pg_size_pretty(sum(s.poids)::bigint) as poids, min(s.created_at)::date as plus_ancien
--        from public.scene_partages s left join auth.users u on u.id = s.owner
--        group by u.email order by sum(s.poids) desc limit 20;
--    Les vingt plus gros liens :
--      select s.id, u.email, s.nom, pg_size_pretty(s.poids::bigint) as poids, s.created_at::date as cree_le
--        from public.scene_partages s left join auth.users u on u.id = s.owner order by s.poids desc limit 20;
--    Retirer tous les liens d'un compte (abus) ; irréversible. Le tableau rendu liste les liens retirés ; aucun tableau =
--    adresse inconnue, rien n'a été retiré :
--      delete from public.scene_partages where owner = (select id from auth.users where email = lower('adresse@exemple.fr'))
--        returning id, nom;
--    Reposer à la main des lignes sauvegardées : sans session (éditeur SQL, clé de service), l'identifiant et la date
--    fournis sont GARDÉS, les liens déjà envoyés restent donc valables ; le poids est remesuré, les plafonds s'appliquent.
--
--  SUSPENDRE la création de liens sans rien perdre (lecture, liste et révocation continuent ; rejouer ce fichier
--  rétablit le droit) :
--      revoke insert on table public.scene_partages from authenticated;
--    Pendant la suspension, l'application répond « Échec : permission denied for table scene_partages » et le tableau de
--    contrôle reste à sept lignes. Pour savoir où l'on en est (false = création suspendue, true = création ouverte) :
--      select has_table_privilege('authenticated', 'public.scene_partages', 'insert') as creation_ouverte;
--
--  RETOUR ARRIÈRE. ATTENTION : supprimer la table détruit TOUS les liens déjà envoyés (les scènes restent chez leurs
--  auteurs, mais chaque lien est à recréer et à renvoyer) ; rien ne les ramène, hors sauvegarde du projet.
--      drop function if exists public.scene_partagee(text);
--      drop table if exists public.scene_partages;                        -- emporte l'index, les règles et le déclencheur
--      drop function if exists public.scene_partages_avant_insertion();   -- après la table, jamais avant
--      drop function if exists public.scene_partages_nombre();            -- reste éventuel de la première forme
--      notify pgrst, 'reload schema';
-- ============================================================================

-- garde : ce fichier est celui du projet de BPO ; collé dans un autre projet, il s'arrête ici sans rien créer
do $$
begin
  if to_regclass('public.workspaces') is null then
    raise exception 'Mauvais projet Supabase : la table workspaces de BPO est absente. Rien n''a été fait.';
  end if;
end
$$;

create table if not exists public.scene_partages (
  id         text        primary key default replace(gen_random_uuid()::text, '-', ''),
  owner      uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  nom        text        not null check (char_length(nom) between 1 and 200),
  contenu    jsonb       not null,
  poids      integer     not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists scene_partages_owner_idx on public.scene_partages (owner, created_at desc);

-- droits : rien pour le rôle anon ; lire, créer, supprimer pour une session (jamais modifier ni vider)
alter table public.scene_partages enable row level security;
revoke all on table public.scene_partages from public, anon, authenticated;
grant select, insert, delete on table public.scene_partages to authenticated;

-- avant l'insertion : identifiant, auteur et date posés par le serveur, poids mesuré, plafonds.
-- SECURITY DEFINER : le plafond d'ensemble doit compter les liens de TOUS les comptes, que la RLS cache à l'appelant.
-- La fonction n'est appelable par personne (revoke plus bas) : elle ne joue que comme déclencheur.
create or replace function public.scene_partages_avant_insertion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
  total bigint;
  ensemble bigint;
  par_session boolean;
begin
  -- la requête vient-elle d'une session de l'application ? Un seul de ces signes suffit : un identifiant de session,
  -- le rôle « authenticated » du jeton, ou celui sous lequel l'API joue la requête dans la base.
  par_session := auth.uid() is not null
                 or coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
                 or coalesce(current_setting('role', true), '') = 'authenticated';
  if par_session then                       -- session de l'application : tout est posé par le serveur
    new.id := replace(gen_random_uuid()::text, '-', '');
    new.owner := auth.uid();
    new.created_at := now();
  end if;                                   -- sinon (éditeur SQL, clé de service) : valeurs fournies gardées, défauts sinon
  new.poids := octet_length(new.contenu::text);
  if new.poids > 20000000 then
    raise exception 'Scène trop lourde pour un lien (20 Mo au plus).';
  end if;
  if par_session then
    -- un envoi à la fois par compte : le suivant attend la fin du précédent, puis compte des lignes validées
    perform pg_advisory_xact_lock(hashtextextended('scene_partages ' || new.owner::text, 0::bigint));
  end if;
  select count(*), coalesce(sum(s.poids), 0) into n, total
    from public.scene_partages s
    where s.owner = new.owner;
  if n >= 200 then
    raise exception 'Trop de liens de partage (200 au plus) : révoquez-en avant d''en créer un autre.';
  end if;
  if total + new.poids > 200000000 then
    raise exception 'Espace de partage plein (200 Mo au plus) : révoquez des liens avant d''en créer un autre.';
  end if;
  select coalesce(sum(s.poids), 0) into ensemble from public.scene_partages s;
  if ensemble + new.poids > 2000000000 then
    raise exception 'Le partage de scènes est complet pour le moment. Réessayez plus tard.';
  end if;
  return new;
end
$$;
revoke all on function public.scene_partages_avant_insertion() from public, anon, authenticated;

drop trigger if exists scene_partages_avant_insertion on public.scene_partages;
create trigger scene_partages_avant_insertion
  before insert on public.scene_partages
  for each row execute function public.scene_partages_avant_insertion();

-- règles : chacun ne voit, ne crée et ne supprime que ses propres liens ; l'essai anonyme n'en crée pas
drop policy if exists scene_partages_lire on public.scene_partages;
create policy scene_partages_lire on public.scene_partages
  for select to authenticated
  using (owner = (select auth.uid()));

drop policy if exists scene_partages_creer on public.scene_partages;
create policy scene_partages_creer on public.scene_partages
  for insert to authenticated
  with check (
    owner = (select auth.uid())
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  );

drop policy if exists scene_partages_revoquer on public.scene_partages;
create policy scene_partages_revoquer on public.scene_partages
  for delete to authenticated
  using (owner = (select auth.uid()));

-- reste éventuel de la première forme de ce fichier (sans effet si elle n'a jamais été jouée)
drop function if exists public.scene_partages_nombre();

-- lecture par le lien : toute session BPO (compte ou essai libre), pas le rôle anon sans session
create or replace function public.scene_partagee(p_id text)
returns table (nom text, contenu jsonb, created_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select s.nom, s.contenu, s.created_at
  from public.scene_partages s
  where p_id ~ '^[0-9a-f]{32}$' and s.id = p_id
$$;
revoke all on function public.scene_partagee(text) from public, anon;
grant execute on function public.scene_partagee(text) to authenticated;
comment on function public.scene_partagee(text) is 'Partage de scène par lien : porte de lecture VOULUE. SECURITY DEFINER exposée exprès aux sessions (alerte 0029 du conseiller de sécurité attendue). Ne pas retirer EXECUTE à authenticated, ne pas passer en SECURITY INVOKER : plus aucun destinataire n''ouvrirait un lien. Réparation : rejouer supabase/2026-11-23-scene-partages.sql.';

-- l'API relit le schéma tout de suite
notify pgrst, 'reload schema';

-- contrôle : sept lignes attendues (1 table « active », 3 règles, 1 déclencheur, 2 fonctions)
select 'table scene_partages : RLS' as controle_v3,
       case when c.relrowsecurity then 'active' else 'INACTIVE' end as etat
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'scene_partages'
union all
select 'règle ' || p.policyname, p.cmd
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'scene_partages'
union all
select 'déclencheur ' || t.tgname, 'actif'
  from pg_trigger t
  where t.tgrelid = 'public.scene_partages'::regclass and not t.tgisinternal
union all
select 'fonction ' || f.proname, 'présente'
  from pg_proc f join pg_namespace n on n.oid = f.pronamespace
  where n.nspname = 'public' and f.proname in ('scene_partagee', 'scene_partages_avant_insertion')
order by 1;
