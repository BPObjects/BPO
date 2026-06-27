-- ============================================================================
--  Building Product Objects — schéma Supabase (à coller dans SQL Editor)
--  Comptes, essai 15 jours sans carte, abonnement, newsletter.
-- ============================================================================

create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text,
  full_name             text,
  lang                  text default 'fr',
  trial_ends_at         timestamptz not null default (now() + interval '15 days'),
  plan                  text not null default 'trial',   -- trial | active | expired | canceled
  subscription_status   text,                            -- miroir Stripe (trialing/active/past_due/canceled…)
  stripe_customer_id    text,
  stripe_subscription_id text,
  current_period_end    timestamptz,
  newsletter_opt_in     boolean default false,
  created_at            timestamptz default now()
);

-- Création automatique du profil à chaque inscription (essai de 15 jours)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, newsletter_opt_in)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name',''),
          coalesce((new.raw_user_meta_data->>'newsletter')::boolean, false));
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sécurité au niveau ligne : chacun ne voit/modifie que SON profil
alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"   on public.profiles for select using (auth.uid() = id);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- L'utilisateur ne peut modifier QUE ces colonnes (pas plan / trial / stripe…)
revoke update on public.profiles from authenticated;
grant  update (full_name, lang, newsletter_opt_in) on public.profiles to authenticated;
grant  select on public.profiles to authenticated;

-- Vue d'accès (essai en cours OU abonnement actif)
create or replace view public.my_access as
  select id,
         (plan = 'active' or now() < trial_ends_at) as has_access,
         plan, trial_ends_at, current_period_end, subscription_status
  from public.profiles
  where id = auth.uid();

-- ============================================================================
--  ADMIN — pour TON accès aux abonnés (depuis Supabase > Table Editor)
--  Tu peux filtrer/exporter, et requêter les inscrits newsletter :
--    select email, full_name, created_at from profiles where newsletter_opt_in;
-- ============================================================================
