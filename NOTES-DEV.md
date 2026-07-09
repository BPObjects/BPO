# BPO — note de reprise (dev)

Dernière mise à jour : 9 juillet 2026 (ajout du configurateur Parking).
À lire en début de nouvelle conversation avant toute modification.

---

## ⚠️ Règles absolues

1. **Ne jamais écrire `meuble.html` via bash.** Le dossier est synchronisé Dropbox : bash lit le fichier **tronqué**. Une écriture bash l'a déjà corrompu une fois (perte de données). Utiliser exclusivement les outils fichier (Read / Edit / Grep), qui voient le fichier réel.
2. Les `grep -c` lancés en bash sur `meuble.html` peuvent **sous-compter** pour la même raison. Ne pas s'y fier pour un audit sérieux.
3. **Une seule session à la fois** sur le fichier.
4. Ne jamais écraser le fichier live par une vieille sauvegarde en bloc.
5. Le WebGL n'est **pas prévisualisable** côté assistant. Toute modification de shader doit être vérifiée par lecture attentive + tests numériques hors ligne, puis validée par capture d'écran de l'utilisateur. Avancer par petites étapes.

### Méthode de vérification qui marche
Extraire les fonctions concernées du fichier live (script Python + `sed` sur les
en-têtes `function …`), les charger dans Node avec un `face()` bouchon, puis :
faces dégénérées, NaN, **volume signé** (normales sortantes), enroulement des faces
plates. Une projection en vue de dessus des faces `n = [0,1,0]` vers un SVG, rasterisée
avec PIL, permet de **voir** le marquage sans lancer l'application. C'est ainsi qu'on a
attrapé les normales inversées et les places qui se recouvraient dans les virages.

---

## Fichiers

| Chemin | Rôle |
|---|---|
| `BPO-site/meuble.html` | L'application entière (~2 Mo, HTML+JS+GLSL en un seul fichier). |
| `BPO-site/index.html` | Page d'accueil. |
| `BPO-site/data/fabricants.js` | `FABRICANTS_DB` — catalogue (chargé au démarrage, 2,5 Ko). |
| `BPO-site/data/textured-objects.js` | Stub 278 o : `TEX_OBJECTS`, `TEX_POOL`, `BPO_prod()`. |
| `BPO-site/data/haworth/<id>.js` | **38 meubles**, un fichier chacun (~63 Mo au total), chargés **à la demande**. |
| `BPO-site/data/al_design/<id>.js` | **24 meubles** convertis depuis des `.dae` ArchiCAD (720 Ko au total). |
| `BPO-site/images_Textures/` | Les 5 JPEG source des meubles al_design (référence ; ils sont embarqués dans les `.js`). |
| `BPO-site/favicon.svg`, `favicon.ico`, `assets/favicon-*.png` | Favicon (grappe de nœuds orange). |

**Déploiement** : publier tout le dossier. Oublier `data/haworth/` = plus aucun meuble fabricant en ligne (bug déjà rencontré).

---

## Architecture, l'essentiel

### Géométrie
- `build()` aiguille selon `MODE` et remplit le tableau global `FC` de faces.
- Face : `{verts, n, col, al, tex, ifc, vn, uv}`.
- Helpers globaux (hoistés) : `box`, `boxV`, `beamSeg`, `cylY`, `dallePrism`, `expandPerEdge` (contours décalés **mitrés**), `acroRing`, `profileRects`, `steelDims`.

### Rendu
- Rasteriseur logiciel (`ctx`/`cv`) **et** WebGL (`glcv`). `ENGINE` = `'soft'`|`'webgl'` mais **ne pilote que les objets paramétriques** : la Scène et les produits fabricants forcent le WebGL via `showGeneric`/`WGL.show` **sans toucher `ENGINE`**. Pour savoir si le WebGL rend : tester `MODE==='scene' || MODE==='quadripod' || ENGINE==='webgl' || WGL.gActive || WGL.txActive`.

Programmes GLSL :

| Programme | Usage |
|---|---|
| `progG` | Objets colorés (immeuble, scène non-fabricants) + **verre** (reflets). |
| `progGT` | Faces texturées des objets paramétriques (textures de finition). |
| `progT` | Produits fabricants + scène texturée (a une matrice `model`). |
| `progSky` | Ciel : rayon de vue par pixel, nuages fBm, disque solaire. |
| `progFloor` | Sol : herbe procédurale + ombre de contact (`shAmt`). |
| `progShadow` | Ombre planaire projetée au sol (a une matrice `model`). |
| `progBlob` | Tache de contact douce sous les meubles. |
| `progDepth` | Carte d'ombre (profondeur empaquetée RGBA8). |
| `progAOg/a/b/c` | SSAO : géométrie, occlusion, flou bilatéral, composition. |

`prog` (dans `initGL`) est l'ancien shader du chemin non-gActive : **non modifié**, sans ombres.

### Scène
- `SCENE = {instances, sel, selSet, decor}` ; instance : `{mode, prod, cfgId, params, x, z, y (cm), rotY, group, children}`.
- Multi-sélection : `scnSel()`, `scnSelIs/Single/Toggle/All/Clear`. Ctrl/⌘+clic, Ctrl/⌘+A, Échap. Gizmo dessiné sur **chaque** objet sélectionné (`SCN_GIZS`), n'importe quelle poignée agit sur tout le groupe.
- Grouper / dégrouper : `scnGroupSel()`, `scnUngroupSel()`.
- **Fluidité** : chaque instance a ses tampons GPU locaux (`scnInstGL`, `scnInstSplitGL`), la position passe par une matrice `model` → déplacer ne reconstruit rien.
- **Piège** : ne **jamais** appeler `scnYbounds()` ou `instanceFaces()` par frame — ils reconstruisent l'objet via `build()` et ont des effets de bord (ils ont déjà fait disparaître le ciel/sol et « la moitié de la scène »). Utiliser `scnFootprint()`, qui est en cache et porte aussi `y0`/`y1`.

### Produits fabricants
- Un produit est un **maillage** si sa fiche dans `FABRICANTS_DB` porte `mesh:true` ; son
  fichier vit dans le dossier `dir` de son fabricant. `fabDirOf(pid)` / `isFabMesh(pid)`
  remplacent l'ancien `isHaworth()`, qui câblait le chargeur sur une seule marque.
- `quadripod` et `woo` sont désormais des **maillages** (les `.dae` d'ArchiCAD). `buildQuadripod()`
  et `buildWoo()` restent dans le code : `build()` les appelle tant que `TEX_OBJECTS[AL_PRODUCT]`
  n'est pas chargé, ils servent donc de repli. Ne pas les supprimer sans tester le premier rendu.
  Le `bureau` (Haworth) reste, lui, entièrement paramétrique.
- **Conversion .dae → BPO_prod** : l'export ArchiCAD est en Z-up ; on passe en Y-up
  (`y' = z, z' = −y`), on recentre en X/Z avec la base à `y = 0` (convention du catalogue), et
  on **écarte le « Lumion Node Material »**, un repère d'export présent dans chaque fichier qui
  faussait la boîte englobante. Encodage : positions uint16 quantifiées sur `meta.bb`, normales
  int8 (`/127`), UV float32, index uint32, le tout gzip + base64.
- Les textures d'un produit vont dans `o.tex` (data-URI). Haworth est en PNG,
  al_design en **JPEG** (le béton fait 2000², un PNG pèserait des mégaoctets). D'où `texExt()` :
  l'export DAE écrivait sinon des octets JPEG dans un fichier nommé « .png ».

### Chargement à la demande
- `ensureProduct(pid, cb)` injecte `data/<dir>/<pid>.js`.
- `fabDecode(pid, cb)` décode la géométrie **et conserve `tex` + `uv`** (nécessaires à l'export texturé). File d'attente des callbacks via `_fabDone()`.

### Export
- `_fcClean()` assainit `FC` avant tout export : écarte faces dégénérées / NaN, recalcule les normales manquantes. **Une seule mauvaise face suffit à faire refuser le fichier par Lumion.**
- `exportBuildFull(cb)` : en mode Scène, `buildScene()` ne construit **pas** `FC` (mémoire) → le drapeau `SCN_FORCE_FC` force la construction, après chargement/décodage de tous les meubles fabricants (délai de sécurité 20 s). Avertit au-delà de 400 000 faces (un meuble Haworth ≈ 90 000 faces).
- `texToPNG(id)` : textures procédurales **et** fabricants (data-URI PNG de `TEX_POOL`).
- L'export DAE utilise les **vraies UV** quand elles existent, sinon projection planaire.

---

## Réglages de rendu (`PREFS`, persistés)

| Clé | Défaut | Effet |
|---|---|---|
| `shadows` | activé (`!==0`) | Coupe **les quatre** sources d'ombre : shadow map, projection planaire, tache de contact, et le facteur `shAmt` du shader de sol. |
| `ssao` | désactivé (`===1` pour activer) | Occlusion ambiante. |
| `ssaoStrength` | `0.70` | Curseur 0 → 2. |
| `clouds` | activé | Nuages du ciel. |
| `grass` | activé | Sol herbe procédural. |
| `skyTop`, `skyHor`, `ground` | — | Couleurs, aussi utilisées par les **reflets du verre**. |

`SUN = {on, date, hour, az, elev}` + `computeSun()`. `WGL.sunVec(fallback)` renvoie la direction vers le soleil (course réelle si `SUN.on`, sinon lumière d'ambiance). Contrôles exposés par `buildSunControls(host, rerender)` — appelée depuis les Préférences **et** le panneau Scène.

### Points de réglage fins
- Shadow map : `WGL.SHSZ = 2048`, biais dans `GLSL_SH_FS` (`0.0040 * (1 - N·L)`, plancher `0.0010`), PCF 3×3, intensité `mix(1.0, s/9.0, 0.85)`.
- SSAO : `radius = clamp(diag * 0.012, 0.08, 0.35)`, 12 échantillons, bruit **tuilé 4×4** + flou **bilatéral** 4×4 aligné sur les centres de texels (poids `exp(-|Δd| * 900)`).
  - *Leçon* : un bruit aléatoire par pixel ne peut pas être effacé par un flou 4×4 ; un flou box non pondéré recrée un liseré aux silhouettes.
- Herbe : bruit de valeur à **période indépendante par axe** (sinon couture dès que les fréquences X et Y diffèrent). Vérifié : raccord exactement nul.
- Le sol n'est **pas** dans la passe géométrique du SSAO → pas d'AO des meubles sur l'herbe (assuré par les ombres portées + taches de contact).

---

## Parking (`PPARK`)

Ajouté le 9 juillet 2026. Catégorie générique « Parking », `MODE='parking'`.

Le tracé est celui de l'**allée** (droit / L / U / libre) ; les places s'y accrochent
de part et d'autre. Tout est exprimé dans le repère curviligne `(s, o)` — abscisse le
long de l'axe, décalage latéral — et projeté par `PT(s, o, eps)`. Le marquage est donc
plat, posé à 4 / 8 / 12 mm au-dessus de la dalle, et **suit la pente longitudinale et
le dévers** sans effort, exactement comme la Route.

| Fonction | Rôle |
|---|---|
| `parkGeom()` | module : pas et profondeur selon l'angle. Créneau si `angle < 5°`. |
| `parkLayout()` | nombre de places + position des PMR (têtes et pieds de travée). |
| `parkFillet()` | congé d'angle par **vrai arc de cercle**. |
| `_parkCenter()` | recentre les tracés générés sur l'origine (convention du catalogue). |
| `surfPT(x,z)` | hauteur exacte de la nappe en un point du monde (inversion bilinéaire). |
| `parkCenterline()` | axe de l'allée : `pts, S, baseY, rp, sc, cLim, noBay`. |
| `buildParking()` | dalle extrudée + marquage + îlots. |
| `hatchSO()` | hachures à 45° réels dans un parallélogramme cisaillé. |
| `buildIsland()` | îlot relevé : bordure, surface, arbre. |

Points à ne pas casser :

- **`rp` pointe à droite** : `(-tz, tx)`. `routeCenterline()` utilise l'inverse
  `(tz, -tx)`, c'est pourquoi le dessus de chaussée de `buildRoute()` a ses normales
  **vers le bas** (bug latent, invisible faute de *back-face culling*, mais faux à
  l'export IFC/DAE). Ne pas « harmoniser » le parking sur la route.
- **`routeRoundCorners()` n'est pas un arc** : c'est un Bézier quadratique dont le rayon
  de courbure réel vaut `r·cos²(φ/2)/sin(φ/2)`, soit **0,707·r** pour un angle droit.
  Avec les 8 m de demi-emprise d'un parking, le bord intérieur repassait derrière l'axe
  et la dalle se repliait en nœud papillon. D'où `parkFillet()`. La Route a le même
  défaut, atténué par sa faible largeur.
- Les faces de marquage sont émises par `flatPoly()`, qui **redresse l'enroulement**
  d'après l'aire signée du polygone entier (et non le produit vectoriel d'un seul coin,
  qui ment sur un quad replié) et écarte les *slivers*. La travée de gauche étant le
  miroir de celle de droite, sans cela la moitié du marquage serait éclairée par dessous.
- En épi, la place penche de `L·cos(angle)` le long de l'allée : la longueur exploitable
  est amputée d'autant, sinon les dernières places débordent de la dalle.
- **Dédoublonner les points de l'axe** après `routeResample()`. Deux congés consécutifs
  partagent leur point de tangence (branche courte d'un U) : deux points confondus donnent
  une tangente nulle, `cosd = 0`, donc `sc = 4`. L'offset était multiplié par quatre et la
  dalle projetait une longue pointe.
- **Validation des places, en coordonnées MONDE** (et non par exclusion de zone : interdire
  en bloc le voisinage des carrefours laissait les coins déserts). Une place est retenue si :
  1. sa **largeur réelle**, mesurée perpendiculairement à son axe et échantillonnée sur toute
     sa profondeur, reste ≥ à la cote nominale (`bayW`, `pmrW`, ou `bayL` en créneau) ;
  2. ses deux flancs tiennent la profondeur, et sa largeur reste dans **0,97–1,05** de la
     cote nominale sur **cinq niveaux de profondeur** : une place ne doit être ni pincée ni
     évasée en éventail. Conséquence assumée : pas de places dans les courbes ni dans les
     carrefours, la zone reste en circulation ;
  3. elle ne mord pas l'allée (`distToAxis ≥ aisleW/2`) ;
  4. elle ne recouvre aucune place ni îlot déjà acceptés (`overlaps()`, axe séparateur sur
     des quads rétrécis de 4 cm — les places voisines partagent un bord).
  Les refusées sont comptées dans `PARK_INFO.dropped`.
- **Places de tête de travée (carrefours).** La trame globale part du milieu de l'axe : elle
  ne tombe jamais pile sur un sommet, et près du carrefour la section transversale pivote,
  donc les places s'y déforment et sont refusées. Une passe supplémentaire repart **du sommet,
  dans le repère cartésien de chaque branche** et pose des places standard tant qu'elles
  tiennent (`inSlab`, allée libre, pas de recouvrement). Les primitives de marquage travaillent
  via `MP(u, v, eps)`, remplacé pour l'occasion : le repère curviligne devient le repère de
  branche, la hauteur venant de `surfPT()`. Trois règles, chacune apprise d'un défaut visible :
  1. une place **ne franchit pas la section du sommet** — sinon la traverse d'un U vient
     s'engrener en peigne entre les places de la branche suivante ;
  2. **seule la branche sortante, et seulement du côté extérieur du virage**, peut remonter
     jusqu'à une demi-emprise en deçà du sommet : c'est ce qui garnit le quadrant extérieur.
     Sans cette dissymétrie, soit le coin reste désert, soit les deux travées se disputent ;
  3. chaque passe est **bornée à la longueur de sa branche**, sinon la traverse remonte
     au-delà du sommet précédent et pose des places en travers de la branche d'avant.
  Gain : L vif 23 → 32 places, U vif 24 → 44.
- Le trait de fond est rentré d'une demi-largeur (`oMax`) : en bataille il tomberait
  pile sur le bord de dalle.
- **Angle vif** (`corner = 0`) : pas de congé, la dalle se referme en onglet. Mais l'onglet
  du bord CONCAVE se referme en un point situé à *demi-emprise en arrière* du sommet le
  long de la branche. Tout point d'axe échantillonné plus près produit un nœud papillon.
  On évacue donc les points d'axe dans un rayon `clear = outerHalf + 0,30 m` autour du
  sommet, et on interdit les places dans cette plage (`cl.noBay`) : le carrefour reste en
  circulation, ce qui est de toute façon la bonne réponse métier.
- **`cLim`** : dans un virage de rayon R, un point décalé de `o` vers le centre a pour
  rayon `R − o` ; si `o ≥ R` il traverse le centre et la dalle se replie. `parkCenterline()`
  calcule donc, par échantillon, la distance signée du centre de courbure le long de `rp`
  (cercle circonscrit du triplet), et `clampO()` bride tout offset un peu en deçà. Cas
  déclencheur : un demi-tour dont le rayon d'axe égale la demi-emprise (branche courte
  d'un U de 16 m). **Mettre `cLim = Infinity` sur les sommets vifs** — leur cercle
  circonscrit est un artefact du triplet et le brider raboterait l'onglet.
- Îlots (`islEvery`) : intercalés dans `lay.seq`, ils consomment leur propre largeur
  d'allée (`iAdv = islW / sin(angle)`). Ancrés au fond de la travée, remontant vers
  l'allée sur `islDepth` (0 = toute la travée). L'arbre est **vertical**, il ne suit pas
  le dévers ; le reste de l'îlot épouse la surface.
- **La nappe est BILINÉAIRE**, pas plane : `Q(t,o) = (1−t)(c_i + o·u_i) + t(c_{i+1} + o·u_{i+1})`
  avec `u = rp·sc`. Trois conséquences, toutes apprises à la dure :
  1. `PT()` doit interpoler **le vecteur `u`**, pas séparément la direction `rp` et le facteur
     `sc` — sinon le marquage quitte la nappe dès que deux sections ne sont pas parallèles.
     `cl.u` est publié pour ça.
  2. Les quads doivent rester petits : l'écart entre la nappe et sa triangulation croît avec
     leur taille. Autour d'un sommet vif la zone franche laisse 8 m entre sections → quads de
     8 × 17 m, et le marquage s'enfonçait de **39 cm** sous la dalle. On réinsère des sections
     tous les 50 cm en interpolant `(c, u)` (la nappe reste rigoureusement identique) et on
     subdivise le profil transversal tous les 1,2 m. Écart résiduel : 0 mm, vérifié.
  3. `surfPT(x, z)` inverse la nappe (quadratique en `t`, puis `o` par projection) pour donner
     la hauteur exacte en un point du monde. C'est ce qui permet de marquer les carrefours.
- **`DIMS_BB`** : `drawCotes()` suppose un objet centré sur l'origine, base à `y = 0` — la
  convention de tous les meubles. Le parking (axe partant de l'origine, dalle sous `y = 0`)
  publie sa boîte réelle dans `DIMS_BB`, dont `drawCotes()` se sert pour se recaler. Sans
  ça les cotes flottent à côté de l'élément. `build()` remet `DIMS_BB = null`. **La Route a
  le même défaut** et n'est pas corrigée.
- **Structure de chaussée** (`parkLayers()`, `parkTotalThick()`) : de haut en bas,
  roulement BBSG / base grave-bitume / fondation GNT 0/31,5 / couche de forme — ou bien
  dalle béton en tête. Les couches d'épaisseur nulle sont omises ; s'il ne reste rien, un
  garde-fou impose 10 cm. Elles sont **parallèles au dessus** (épaisseur constante, la
  sous-face suit donc le dévers) et apparaissent en bandes sur les joues et les abouts :
  la coupe se lit comme un profil TP. Vérifié : `volume signé = surface × épaisseur totale`
  à 0,01 % près, pour six structures.

`PARK_INFO = {total, pmr, req, area, dropped}` alimente le récapitulatif du panneau
(`#park-recap`, `#park-mod`) **et** le jeu de propriétés IFC `BPO_Parking`
(`NombreDePlaces`, `NombreDePlacesPMR`, `PlacesPMRExigees`, `SurfaceDalle`,
`AngleStationnement`, `LargeurAllee`, `DimensionPlace`).

Règle PMR appliquée : 2 % arrondi à l'unité supérieure, minimum 1, **par travée** — donc
symétrique, et toujours ≥ à l'exigence calculée sur le total.

Reste à faire côté parking : remplissage automatique d'une **emprise polygonale** (v2),
`IfcSpace` par place plutôt qu'un `IfcBuildingElementProxy` global, bordures et trottoirs
en périphérie (les profils de Route sont réutilisables), et places PMR réparties plutôt
que groupées en tête et pied de travée.

## Immeuble (`PIM`)

Ajouts récents : sous-sol (hauteur **dès 60 cm**, voiles et dalles activables séparément), fondations (**filantes** mitrées en anneau, ou **massifs** sous poteaux), poteaux en **profils acier normés** (IPE / IPN / HEA / HEB / UPN via le catalogue `STEEL_PROFILES` **préexistant** — ne pas en créer un second, c'est le bug « IPE NaN »), tube rond, tube carré, orientation d'âme 0°/90°. Débord d'acrotère (−50 → +300 cm). Porte d'entrée en mur-rideau (côté N/S/E/O, 1 ou 2 vantaux).

---

## Reste à faire

- **Route** : corriger le sens de `rp` dans `routeCenterline()` (normales du dessus de
  chaussée inversées) et remplacer `routeRoundCorners()` par `parkFillet()`. Impact visuel
  à valider — l'éclairage de la chaussée changera.
- Tâche 27 : IFC — `IfcOpeningElement` (phase 2).
- Tâche 28 : langues suédois / danois / finlandais / néerlandais.
- Nettoyer les libellés Haworth bruts (« BENCH 2P AVEC SEPARATEUR »…).
- Profils acier exacts en **vue plan** et en **export IFC** (aujourd'hui emprise carrée).
- Fondations filantes : uniquement le contour extérieur, pas les refends.
- Groupes contenant des meubles fabricants : rendus en géométrie simplifiée (perdent leurs textures GPU).
- Éventuellement : import de vraies photos de ciel / herbe en remplacement du procédural.
