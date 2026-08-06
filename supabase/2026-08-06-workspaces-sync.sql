-- ============================================================================
--  BPO — L'ATELIER SUIT LE COMPTE (synchronisation projets/préférences)
--  2026-08-06 — à coller dans SQL Editor.
--
--  Une ligne par utilisateur : l'atelier en JSON { "<clé localStorage>": {v,t} }
--  v = valeur (texte JSON tel quel, null = suppression), t = horodatage ISO du
--  dernier écrit. La FUSION (par clé, dernier écrit gagne ; configs/scènes par
--  union d'ids) se fait CÔTÉ CLIENT (bpo-sync.js) — le serveur ne fait que
--  stocker. L'essai anonyme converti garde son id auth -> son atelier suit,
--  comme promis par le bandeau « votre travail est conservé ».
-- ============================================================================

create table if not exists public.workspaces (
  id         uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- updated_at entretenu côté serveur (vérité pour détecter un push concurrent)
create or replace function public.workspaces_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists on_workspace_write on public.workspaces;
create trigger on_workspace_write
  before insert or update on public.workspaces
  for each row execute function public.workspaces_touch();

-- Sécurité au niveau ligne : chacun ne voit/écrit que SON atelier
-- (les sessions anonymes ont aussi le rôle authenticated — l'essai libre synchronise)
alter table public.workspaces enable row level security;

drop policy if exists "read own workspace" on public.workspaces;
create policy "read own workspace" on public.workspaces
  for select using (auth.uid() = id);

drop policy if exists "insert own workspace" on public.workspaces;
create policy "insert own workspace" on public.workspaces
  for insert with check (auth.uid() = id);

drop policy if exists "update own workspace" on public.workspaces;
create policy "update own workspace" on public.workspaces
  for update using (auth.uid() = id) with check (auth.uid() = id);

grant select, insert, update on public.workspaces to authenticated;

-- Garde-fou : l'atelier ne doit pas dépasser ~4 Mo (ordre de grandeur du
-- localStorage navigateur). Au-delà, l'écriture est refusée — le client
-- écarte de lui-même les clés trop lourdes avant d'en arriver là.
alter table public.workspaces drop constraint if exists workspaces_data_size;
alter table public.workspaces add constraint workspaces_data_size
  check (pg_column_size(data) < 4194304);
