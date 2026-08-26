# Provenance et licences — data/humains/

Personnages 3D générés hors-ligne avec **MPFB2 v2.0.17** (Blender 4.5.12),
à partir exclusivement d'assets **CC0 1.0 Universal** :

- Maillage de base, morphs (macro targets) et rig : livrés avec MPFB2
  (github.com/makehumancommunity/mpfb2 — LICENSE.md section C : assets CC0 ;
  le projet ne revendique aucun droit sur les sorties, section D).
- Cheveux, vêtements, chaussures, yeux : pack officiel
  `makehuman_system_assets_cc0.zip`
  (static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html —
  chaque entrée du pack est étiquetée CC0).

Les maillages publiés ici (positions quantifiées, normales, indices — format
BPO_HMPACK) sont donc redistribuables sans restriction ni attribution.
« MakeHuman » est une marque du projet MakeHuman : mentionnée ici comme
provenance uniquement (la CC0 ne cède pas les marques, §4a).

Tous les paquets : base MPFB2 + sourcils eyebrow001 + yeux low-poly +
shoes01, peaux young_lightskinned_* + young_african_* (m/f selon modèle).
~17 500 tris chacun.

| Paquet | Contenu | Tenue / coiffure |
|---|---|---|
| hm-adulte-01 | Homme, marche | male_casualsuit06 / short01 |
| hm-adulte-02 | Homme, debout | male_casualsuit06 / short01 |
| hm-homme-03 | Homme, costume | male_elegantsuit01 / short03 |
| hm-homme-04 | Homme, chantier | male_worksuit01 / short02 |
| hm-homme-05 | Homme, assis | male_casualsuit01 / short04 |
| hm-homme-06 | Homme, pointant | male_casualsuit06 / short01 |
| hm-femme-01 | Femme, marche | female_elegantsuit01 / long01 |
| hm-femme-02 | Femme, debout | female_elegantsuit01 / long01 |
| hm-femme-03 | Femme, assise | female_elegantsuit01 / bob01 |
| hm-femme-04 | Femme, marche 2 | female_elegantsuit01 / ponytail01 |
| hm-femme-05 | Femme, conversation | female_elegantsuit01 / afro01 |
| hm-enfant-01 | Garçon, debout (âge ~0,2) | male_casualsuit06 / short02 |
| hm-enfant-02 | Fille, marche (âge ~0,2) | female_sportsuit01 / braid01 |

Les tuiles `tx/*.webp` sont dérivées des textures diffuses CC0 de ces mêmes
assets (recalibrées 1024/512/256). Chaîne de génération : CODE/humains/outils
(hm-gen.py, hm-decimate.py, hm-tex.py, hm-encode.py) — pose et séparation
haut/bas faites à la génération ; les rôles (peau/cheveux/haut/bas/
chaussures/yeux) sont portés par les groupes du paquet, les teintes
paramétriques sont cuites dans les tuiles au runtime.
