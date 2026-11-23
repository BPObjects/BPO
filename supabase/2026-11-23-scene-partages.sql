-- Partage d'une scène par lien (23/11/2026)
-- À jouer UNE fois dans l'éditeur SQL de Supabase (projet BPO), AVANT de publier app.html.
-- Rejouable sans dégât (if not exists / or replace / drop policy if exists).
--
-- Une ligne par lien. L'identifiant (32 caractères hexadécimaux, 122 bits de hasard) EST le secret du lien :
--   - l'auteur (compte, pas l'essai anonyme) crée, liste et révoque SES liens (règles RLS) ;
--   - quiconque présente l'identifiant lit la scène par la fonction scene_partagee, et seulement par elle :
--     aucune règle ne permet de lister les liens des autres.
-- Retour arrière : drop function public.scene_partagee(text); drop table public.scene_partages;
--                  drop function public.scene_partages_nombre();

create table if not exists public.scene_partages (
  id         text        primary key default replace(gen_random_uuid()::text, '-', ''),
  owner      uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  nom        text        not null check (char_length(nom) between 1 and 200),
  contenu    jsonb       not null,
  poids      integer     not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists scene_partages_owner_idx on public.scene_partages (owner, created_at desc);

alter table public.scene_partages enable row level security;
revoke all on table public.scene_partages from anon;
grant select, insert, delete on table public.scene_partages to authenticated;

-- nombre de liens du compte courant (hors RLS, pour la règle d'insertion : une règle ne peut pas relire sa propre table)
create or replace function public.scene_partages_nombre()
returns integer
language sql stable security definer
set search_path = public
as $$ select count(*)::integer from public.scene_partages where owner = auth.uid() $$;
revoke all on function public.scene_partages_nombre() from public, anon;
grant execute on function public.scene_partages_nombre() to authenticated;

drop policy if exists scene_partages_lire on public.scene_partages;
create policy scene_partages_lire on public.scene_partages
  for select to authenticated
  using (owner = auth.uid());

drop policy if exists scene_partages_creer on public.scene_partages;
create policy scene_partages_creer on public.scene_partages
  for insert to authenticated
  with check (
    owner = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false   -- comptes seulement
    and octet_length(contenu::text) <= 20000000                             -- 20 Mo (le client s'arrête à 15)
    and public.scene_partages_nombre() < 200                                -- 200 liens actifs par compte
  );

drop policy if exists scene_partages_revoquer on public.scene_partages;
create policy scene_partages_revoquer on public.scene_partages
  for delete to authenticated
  using (owner = auth.uid());

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

-- contrôle : doit rendre « scene_partages | t » et les trois règles
select c.relname, c.relrowsecurity from pg_class c where c.relname = 'scene_partages';
select policyname, cmd from pg_policies where tablename = 'scene_partages' order by policyname;
