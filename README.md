# Building Product Objects (BPO)

Catalogue 3D paramétrique des composants du bâtiment. Application web **autonome**
(HTML + JavaScript, sans dépendance, sans étape de build).

## Structure

```
index.html                  Page d'accueil (vitrine, accès architectes / fabricants)
meuble.html                 Le configurateur 3D
data/
  fabricant-meshes.js       Maillages des produits fabricants (quadripode, desserte, bureau)
  bureau-tex.js             Maillage texturé du bureau Haworth (géométrie + textures)
  fabricants.js             Base de données fabricants — pilote le menu « Fabricants »
  fabricants.json           Même base au format JSON (lecture / outils)
LICENSE                     Tous droits réservés
```

Les fichiers `data/*.js` sont chargés par `meuble.html` via `<script src>` **avant**
le script principal et définissent des variables globales : `WEBGL_OBJECTS`,
`BUREAU_TEX`, `QUADRIPOD`, `WOO`, `BUREAU`, `FABRICANTS_DB`. Sortir ces données du
HTML le fait passer de ~5,8 Mo à ~0,26 Mo.

## Base de données fabricants

Le catalogue de la branche « Fabricants » est piloté par `data/fabricants.js`
(variable `FABRICANTS_DB`). Pour **ajouter un fabricant ou un produit**, il suffit
d'ajouter une entrée dans ce fichier (et le maillage correspondant dans `data/`) —
sans toucher au code de `meuble.html`. `data/fabricants.json` en est une copie
lisible pour la documentation ou des outils externes.

Format d'une entrée :

```js
{ id:'haworth', label:'Haworth', status:'ready', subs:[
    { id:'bureau', label:'Bureau administratif 1p',
      render:'webgl-tex', data:'BUREAU_TEX', categorie:'bureau' }
]}
```

- `status` : `'ready'` (produits disponibles) ou `'todo'` (à venir).
- `render` : `'webgl'` (maillage `WEBGL_OBJECTS`) ou `'webgl-tex'` (`BUREAU_TEX`, texturé).
- `data` : nom de la variable globale contenant le maillage.

## Lancer

Aucune installation. Ouvrir `index.html` dans un navigateur récent — fonctionne
aussi bien en local (`file://`) qu'en ligne.

**GitHub Pages** : activer Pages sur le dépôt (branche `main`, dossier racine). Le
chargement des `data/*.js` fonctionne sans configuration.

## Fonctionnalités

- **Objets génériques paramétriques** : murs, dalles, poteaux, poutres,
  garde-corps, portes, fenêtres, mur-rideau, formes.
- **Bibliothèque mobilier** : armoires, tables, assises (chaises, tabourets, canapés).
- **Produits fabricants** en rendu WebGL (PBR, textures haute fidélité).
- **Finitions par élément** : couleurs RAL + textures (bois, pierre, métal, import).
- **Deux moteurs de rendu** : logiciel (canvas 2D, filaire / lignes cachées, cotes)
  et WebGL (temps réel).
- **Exports** OBJ, DAE (Collada), IFC (BIM).

## Compatibilité

Navigateur récent requis. Les produits fabricants texturés utilisent WebGL et
l'API `DecompressionStream` (Chrome, Edge, Firefox, Safari 16.4+) ; un message de
repli s'affiche sur les navigateurs plus anciens.

## Licence

**Tous droits réservés.** Voir le fichier [LICENSE](LICENSE). Le code est public
pour consultation ; toute réutilisation nécessite l'accord écrit de l'auteur.

---

© 2026 Antoine Lacronique, architecte — Building Product Objects.
