# Building Product Objects (BPO)

Catalogue 3D paramétrique des composants du bâtiment. Application web **autonome**
(HTML + JavaScript, sans dépendance, sans étape de build).

## Structure

```
index.html                  Page d'accueil (vitrine)
meuble.html                 Le configurateur 3D
admin.html                  Back-office fabricants (import de nouveaux objets)
data/
  fabricant-meshes.js       Maillages WebGL des produits fabricants (quadripode, desserte)
  textured-objects.js       Objets texturés haute fidélité (registre TEX_OBJECTS)
  fabricants.js             Base de données fabricants — pilote le menu « Fabricants »
  fabricants.json           Même base au format JSON
LICENSE                     Tous droits réservés
```

Les fichiers `data/*.js` sont chargés via `<script src>` avant le script principal
et définissent des variables globales : `WEBGL_OBJECTS`, `TEX_OBJECTS`,
`FABRICANTS_DB`, `QUADRIPOD`, `WOO`, `BUREAU`.

## Back-office fabricants (`admin.html`)

Outil qui tourne **dans le navigateur** (aucun serveur) pour ajouter un objet
fabricant sans coder :

1. Ouvrir `admin.html`.
2. Glisser un fichier **.dae** (Collada) **et son dossier de textures** (ou les images en vrac). Un bouton « Dossier de textures » permet aussi de choisir le dossier.
3. Cliquer **Convertir** : l'objet est lu, converti au format interne (géométrie +
   UV + matériaux + textures), recentré et orienté automatiquement (lecture de
   l'unité et de l'axe vertical du DAE). Un **aperçu 3D** s'affiche — c'est le
   contrôle qualité : si l'objet est bon à l'écran, la conversion est bonne.
4. Remplir la fiche produit (fabricant, identifiant, nom, catégorie).
5. **Ajouter au catalogue**, puis télécharger les deux fichiers générés
   (`textured-objects.js` et `fabricants.js`).
6. Remplacer ces deux fichiers dans `data/`, committer : le produit apparaît dans
   le configurateur, onglet **Fabricants**.

Astuce : pour vérifier l'outil, réimporte un modèle dont tu connais les dimensions
et compare-les à celles affichées.

## Base de données fabricants

Le menu « Fabricants » est piloté par `data/fabricants.js` (`FABRICANTS_DB`).
Le back-office l'édite pour toi, mais tu peux aussi ajuster une entrée à la main
(label, statut, catégorie…). `data/fabricants.json` en est une copie lisible.

## Lancer

Aucune installation. Ouvrir `index.html` dans un navigateur récent — fonctionne en
local (`file://`) comme sur **GitHub Pages** (activer Pages sur la branche `main`,
dossier racine).

## Fonctionnalités

- **Objets génériques paramétriques** : murs, dalles, poteaux, poutres,
  garde-corps, portes, fenêtres, mur-rideau, formes.
- **Bibliothèque mobilier** : armoires, tables, assises (chaises, tabourets, canapés).
- **Produits fabricants** en rendu WebGL (PBR, textures haute fidélité), ajoutables
  via le back-office.
- **Finitions par élément** : couleurs RAL + textures.
- **Deux moteurs de rendu** : logiciel et WebGL.
- **Exports** OBJ, DAE, IFC (BIM).

## Compatibilité

Navigateur récent (WebGL, `DecompressionStream` / `CompressionStream` :
Chrome, Edge, Firefox, Safari 16.4+).

## Licence

**Tous droits réservés.** Voir [LICENSE](LICENSE).

---

© 2026 Antoine Lacronique, architecte — Building Product Objects.
