-- Partage d'une scène par lien (23/11/2026)
-- À jouer UNE fois dans l'éditeur SQL de Supabase (projet BPO), AVANT de publier app.html.
-- Rejouable sans dégât (if not exists / or replace / drop ... if exists).
--
-- Une ligne par lien. L'identifiant (32 caractères hexadécimaux, 122 bits de hasard, tiré par le serveur) EST le secret
-- du lien :
--   - l'auteur (compte, pas l'essai anonyme) crée, liste et révoque SES liens (règles RLS) ;
--   - quiconque présente l'identifiant lit la scène par la fonction scene_partagee, et seulement par elle :
--     aucune règle ne permet de lister les liens des autres.
-- Plafonds (déclencheur, messages lisibles par l'application) : 20 Mo par lien, 200 liens et 200 Mo par compte.
-- Retour arrière : drop function public.scene_partagee(text); drop table public.scene_partages;
--                  drop function public.scene_partages_avant_insertion();

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

-- avant l'insertion : identifiant, auteur et date posés par le serveur, poids mesuré, plafonds
create or replace function public.scene_partages_avant_insertion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  n integer;
  total bigint;
begin
  new.id := replace(gen_random_uuid()::text, '-', '');
  new.owner := coalesce(auth.uid(), new.owner);
  new.created_at := now();
  new.poids := octet_length(new.contenu::text);
  if new.poids > 20000000 then
    raise exception 'Scène trop lourde pour un lien (20 Mo au plus).';
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

-- lecture par le lien : toute session BPO (compte ou essai libre), pas le rôle anon sans session
create or replace function public.scene_partagee(p_id text)
returns table (nom text, contenu jsonb, created_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select s.nom, s.contenu, s.created_at
  from public.scene_partages s
  where p_id ~ '^[0-9a-f]{32}$' and s.id = p_id
$$;
revoke all on function public.scene_partagee(text) from public, anon;
grant execute on function public.scene_partagee(text) to authenticated;

-- l'API relit le schéma tout de suite
notify pgrst, 'reload schema';

-- contrôle : sept lignes attendues (1 table « active », 3 règles, 1 déclencheur, 2 fonctions)
select 'table scene_partages : RLS' as controle,
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
