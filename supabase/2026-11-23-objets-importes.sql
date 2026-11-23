-- Objets importés au compte (23/11/2026)
-- À jouer UNE fois dans l'éditeur SQL de Supabase (projet BPO). Rejouable sans dégât.
-- Sans lui : l'application dit en console « espace de stockage absent » et marche comme avant (objets par navigateur).
--
-- Un espace de stockage PRIVÉ, « objets-importes ». Chaque objet importé ou généré y est un fichier
--   <identifiant du compte>/<pid>.json.gz
-- Seul le compte propriétaire lit, écrit, remplace et supprime ses fichiers (le premier dossier du chemin est son
-- identifiant). L'essai anonyme n'écrit pas. Plafonds : 25 Mo par fichier (réglage de l'espace), 500 Mo et 2 000
-- fichiers par compte (règle d'écriture).
-- Retour arrière : supprimer les quatre règles et la fonction ci-dessous, puis vider et supprimer l'espace
--                  depuis l'écran Storage de Supabase (un espace ne se supprime pas en SQL tant qu'il contient des fichiers).

insert into storage.buckets (id, name, public, file_size_limit)
values ('objets-importes', 'objets-importes', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

-- place occupée par le compte courant (hors règles : une règle de storage.objects ne peut pas relire sa propre table)
create or replace function public.objets_importes_place()
returns table (octets bigint, fichiers bigint)
language sql stable security definer
set search_path = public, storage
as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint, count(*)::bigint
  from storage.objects o
  where o.bucket_id = 'objets-importes'
    and (storage.foldername(o.name))[1] = auth.uid()::text
$$;
revoke all on function public.objets_importes_place() from public, anon;
grant execute on function public.objets_importes_place() to authenticated;

drop policy if exists objets_importes_lire on storage.objects;
create policy objets_importes_lire on storage.objects
  for select to authenticated
  using (bucket_id = 'objets-importes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists objets_importes_ecrire on storage.objects;
create policy objets_importes_ecrire on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'objets-importes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false          -- comptes seulement
    and (select p.octets   from public.objets_importes_place() p) < 524288000      -- 500 Mo par compte
    and (select p.fichiers from public.objets_importes_place() p) < 2000           -- 2 000 fichiers par compte
  );

-- remplacer un fichier (x-upsert) passe par une mise à jour
drop policy if exists objets_importes_remplacer on storage.objects;
create policy objets_importes_remplacer on storage.objects
  for update to authenticated
  using (bucket_id = 'objets-importes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (
    bucket_id = 'objets-importes'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

drop policy if exists objets_importes_supprimer on storage.objects;
create policy objets_importes_supprimer on storage.objects
  for delete to authenticated
  using (bucket_id = 'objets-importes' and (storage.foldername(name))[1] = auth.uid()::text);

-- contrôle : doit rendre l'espace (public = false, 26214400) et les quatre règles
select id, public, file_size_limit from storage.buckets where id = 'objets-importes';
select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'objets_importes_%' order by policyname;
