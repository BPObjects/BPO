/* bpo-objet-ia.js — « Décrire un objet » dans Ma bibliothèque (02/11/2026, v=20261106a).

   Module ES chargé À LA DEMANDE par app.html (import('./bpo-objet-ia.js?v=20261106a')) depuis le bouton
   « ✨ Décrire un objet » de la rangée d'import, et par bpo-import.js (bouton « IA » d'une carte qui porte cfg.ia).

   Chaîne : description → fonction Edge objet-ia (flux SSE : debut / delta / fin / erreur) → code OBJET (JavaScript)
   → Web Worker bac à sable dans un iframe sandbox (kit bpo-geo-kit.js + HARNAIS) → BPO_GEO.controler → au plus 2 corrections automatiques
   → aperçu 3D (canvas 2D, rendu logiciel) + curseurs (OBJET.params) + « Modifier… » → « Garder » = BPO_import.bake,
   dossier « Objets décrits », cfg.ia (code, réglages, description) pour la reprise.

   Règles tenues ici : aucun accès à document/window au moment de l'import (tout est dans les fonctions) ; le client
   Supabase (./vendor/supabase-js-2.110.7.js + ./bpo-config.js) n'est importé qu'au premier appel serveur ; le code
   de l'objet ne tourne JAMAIS dans le fil principal ; _essai court-circuite le serveur pour les bancs (ni réseau,
   ni Supabase). Contrat d'interface : PROTOCOLE.md du dossier de travail, hors dépôt (§3, §4).

   Corrections du 02/11 (décisions D2 à D10 de la session principale) : code_refuse au premier tour → le texte reçu sert
   de code précédent (D2) ; filtre des mots interdits après masquage des chaînes et des commentaires (D3, FILTRE.md) ;
   plafond du fichier 60 000 caractères et code 'trop_long' sans correction (D4) ; mémo __fr_title / __fr_placeholder
   pour translateDOM (D6a) ; dossier « Objets importes » vide retiré après « Garder » (D7) ; compteur de la ligne d'état
   au plus toutes les 250 ms (D8) ; 429 appels_session / appels sans lien (D9) ; description ≤ 1 500 caractères (D10).
   Révisions du 02/11 (E15 à E18, revue d'intégration) : « Garder » relit la fiche après cfgStore et défait un objet neuf si rien
   n'a été écrit (stockage plein, E15 ; BPO_import.retirer de la couture E16) ; en reprise, le rangement de l'utilisateur est
   gardé, le nom suit (BPO_import.renommer) et une fiche sans maillage (synchronisée d'un autre appareil) reprend le nouveau pid
   sans seconde carte (E17) ; textes : 403 anonyme / abonnement, 409, 503 saturé, service injoignable, fenêtre de jours reçue du
   serveur, « code » plutôt que « programme », « Garder… », « Connexion au service… » avant le premier delta (E18).
   Durcissement du bac à sable (E1 à E4, revue de sécurité du 02/11) : le worker vit dans un <iframe sandbox="allow-scripts"> d'origine
   opaque dont la CSP (connect-src 'none', script-src blob: + inline/eval, worker-src blob:) est la frontière de confinement ; le HARNAIS
   charge le code en mode strict, neutralise les membres dangereux sur toute la chaîne de prototypes de self et les constructeurs de
   fonctions, ignore la valeur de retour de make et plafonne la géométrie (200 000 triangles, 400 000 sommets) ; la page re-vérifie ce
   qu'elle reçoit ; aucun repli vers un worker hors iframe.
   Corrections F10 à F13 (02/11, atelier 3) : le lien du 403 anonyme s'appelle « Créer un compte » (F10) ; en mode modifier, un 429
   appels_session relance UNE fois la requête sous une session neuve, avec une note d'état (F11) ; textes du 503 sature, du 403 abonnement
   et du 429 appels avec la date de réinitialisation reçue du serveur (F12) ; « bac a sable non charge » du relais détruit le bac, recréé
   paresseusement au prochain envoi (F13).
   Correction G5 (02/11, atelier 4) : quand l'écriture vérifiée de « Garder » échoue (stockage plein, E15), le dossier « Objets décrits »
   que ce « Garder » vient de créer est retiré lui aussi s'il n'existait pas avant et qu'aucune fiche n'y est rangée (retirerDossierVide,
   commun avec le retrait D7 de « Objets importes ») ; le chemin de succès ne change pas.
   Corrections H1 à H6 (02/11, relectures de l'atelier 4) : quand la requête d'un tour corriger n'aboutit pas (503, 429, erreur du
   modèle, flux, réseau, délai du serveur) ou qu'elle est annulée, le meilleur code qui s'est construit dans la boucle est affiché avec
   ses défauts et des lignes d'alerte sous « Prêt : … », et le bac retient ce code pour les réglages ; un 429 appels_session sur un tour
   corriger dit qu'une nouvelle modification comptera comme un nouvel objet (F11) ; boucle() rend true quand un objet a été appliqué, et
   « Modifier… » ne vide son champ que dans ce cas (H1). En reprise, « Garder » écrit et relit la fiche AVANT de refabriquer le maillage,
   et remet les fiches d'avant si la refabrication échoue (H2) ; « Objets décrits » n'est créé que pour y ranger la fiche d'un objet neuf
   (H3) ; un objet neuf dont bake n'a pas pu écrire la fiche est défait sans second cfgStore (H4) ; après un rejeu F11, la note reste
   au-dessus d'une erreur (H5) ; plus aucun chemin du poste dans ce fichier (H6).
   Corrections I1 à I8 (02/11, relectures de l'atelier 5) : la recette gardée est celle de la géométrie AFFICHÉE — E.paramsGeo, posés par
   appliquer et par chaque reconstruction de curseur réussie, que « Garder » écrit dans ia.params ; « Garder » est inactif tant qu'un
   réglage attend sa géométrie, et un réglage qui ne se construit pas ramène les curseurs à la dernière géométrie construite ; une boucle
   qui n'applique rien fait retenir au bac le code affiché ; une reprise dont les réglages gardés ne se construisent pas repart aux
   valeurs par défaut du code, et une carte dont rien ne se construit reste reprise, « Modifier… » compris (I1). La ligne d'état ne
   rétrécit plus et reste collée en haut du corps défilant (I2) ; le panneau reste au-dessus de la barre BETA de l'app (I3). « Fabriquer »
   ne détache l'objet affiché de sa carte qu'une fois le nouvel objet appliqué (I4) et reprend la session de la dernière création ratée
   de la même description (I5) ; « Correction n/2… » reste en tête de l'état pendant tout le tour (I6) ; le quota joint à un événement
   erreur du flux met le titre à jour (I7).
   Corrections J1 à J6 (02/11, relectures de l'atelier 6) : pendant un « Garder », Fabriquer (bouton et Ctrl+Entrée), Modifier,
   Recommencer, les curseurs, « Valeurs par défaut » et la reprise d'une carte sont inactifs et ignorés, et « Garder » ne rattache l'objet
   à sa carte que si rien ne l'a remplacé entre-temps (jeton inchangé, aucune boucle en cours) (J1) ; le panneau reste dans la fenêtre à
   l'ouverture et au redimensionnement, sur une largeur de min(440 px, fenêtre − 16 px) (J2) ; toute erreur qui porte le quota, 429 quota
   compris, met le titre à jour (J3) ; la reprise d'une carte vide le champ « Modifier… » (J4) ; « Modifier… » envoie les réglages de la
   géométrie affichée (champ reglages), que le modèle garde comme valeurs par défaut (J5) ; pendant un travail annulable, la ligne d'état
   collée porte un petit bouton « Annuler » (J6).
   Corrections K1 et K3 (02/11, relectures de l'atelier 7) : le recalage borne la position VOULUE du panneau (le mémo lu, à défaut la
   place d'origine ancrée à droite et recalculée avec la largeur de la fenêtre, ou la position lâchée d'un glisser), jamais la position
   déjà bornée : rétréci puis rendu à sa largeur, le panneau revient à sa place et ne reste pas sur Ma bibliothèque (K1) ; le nom d'un
   réglage suit la même expression Unicode que le serveur, si bien qu'un réglage accentué part avec « Modifier… » (K3).
   Corrections L1 à L3 (02/11, relectures de l'atelier 8) : un panneau lâché près du bord droit reste ancré à droite (position voulue
   {dr, t}, à l'écart réel du lâcher ; le mémo de même, l'ancienne forme {l, t} toujours lue ; la frontière de 24 px de L1 est remplacée
   par M1), et un geste sur le titre n'est un glisser que si le pointeur s'éloigne d'au moins 4 px du point d'appui (L1) ; au recalage,
   le haut affiché laisse au moins 250 px de hauteur au panneau, sans toucher au haut voulu (L2) ; le commentaire de reglagesPour dit la
   règle exacte des noms de réglage (L3).
   Corrections M1 et M2 (02/11, relectures de l'atelier 9) : au lâcher d'un glisser, le panneau reste attaché au côté de la fenêtre dont
   il est le plus proche, avec son écart réel — {dr, t} si l'écart au bord droit est au plus la gauche (égalité comprise), sinon {l, t} —
   si bien qu'une dérive de quelques pixels vers la gauche, en demi-écran, ne le fige plus sur Ma bibliothèque (M1) ; au recalage, la
   borne L2 du haut affiché ne descend jamais sous RESERVE_VERTICALE − MARGE_BAS (74 px) : la place d'origine (haut 60) est gardée à
   toute hauteur de fenêtre, et le panneau ne monte jamais sur l'en-tête de l'app (M2).
   Correction N1 (03/11, relectures de l'atelier 10) : les heuristiques d'ancrage ne suffisaient pas — lâché un peu à droite du milieu
   d'un grand écran, le panneau retombait sur Ma bibliothèque dans une fenêtre plus étroite. L'invariant « le panneau ne recouvre jamais
   Ma bibliothèque quand la fenêtre a la place de le poser à côté » se garantit désormais par la bibliothèque elle-même : au recalage
   (construction, ouverture, resize), si le conteneur de Ma bibliothèque (#libPanel d'app.html) est affiché, dans la moitié gauche de
   la fenêtre, et que la fenêtre a la place de poser le panneau à sa droite, la gauche affichée ne passe pas sous son bord droit + 8 px ;
   panneau ouvert, un ResizeObserver sur ce conteneur recale aussi quand la palette se replie, se rouvre ou change de largeur.
   La position voulue et le mémo ne changent pas, le glisser n'est pas contraint, l'ancrage M1 et le seuil de 4 px restent.
   Décision O1 (06/11, après la mise en service : un appel dure 260 à 310 s, dont environ 90 % de réflexion sans aucun delta de texte, et le
   panneau restait sur « Connexion au service… », qu'on prenait pour un blocage) : pendant un appel, la ligne d'état collée montre un titre
   (« BPO crée votre objet paramétrique »), une barre, puis la ligne de détail — « Connexion au service… » jusqu'à l'événement debut du
   flux ou au premier delta, « Le modèle réfléchit… {0} (cela peut prendre plusieurs minutes) », le compteur de caractères, « Contrôle… ».
   La barre est une ESTIMATION, car l'avancement réel de la réflexion est inconnu : ni pourcentage affiché ni durée promise ; elle ne recule
   jamais dans un tour et n'arrive jamais au bout ; un tour de correction (I6) ou un rejeu F11 la fait repartir du début. Voir la section
   « barre de progression » plus bas, et le commentaire de CSS pour la mise en page. Le texte de la ligne s'écrit au plus une fois par
   seconde (D8) ; le chemin court de statut() pose aussi le mémo __fr du nœud de texte : hors du français, translateDOM d'app.html
   remettait à chaque passage la PREMIÈRE valeur vue de ce nœud, et le compteur restait figé sur « Connexion au service… ». */

const VERSION = '20261106a';
const KIT_URL = './bpo-geo-kit.js?v=' + VERSION;
const FONCTION = '/functions/v1/objet-ia';
const DELAI_MS = 6000;            /* délai d'une construction dans le worker : au-delà, terminate + recréation (§4.3) */
const MAX_CORRECTIONS = 2;        /* tours 2 et 3 (§4.4) */
const FID = 'ia_objets';          /* dossier « Objets décrits », identifiant FIXE comme 'imp_objets' (§4.5) */
const FID_IMPORT = 'imp_objets';  /* dossier « Objets importes » de bpo-import.js, créé par bake s'il manque (D7) */
const NOM_DOSSIER = 'Objets décrits';
const LABEL_CARTE = 'objet décrit';
const PLAFOND_DESCRIPTION = 1500; /* D10 : description ≤ 1 500 caractères, comme le serveur (§3.1) */
const PLAFOND_CODE = 60000;       /* D4 : fichier produit ≤ 60 000 caractères ; au-delà, 'trop_long' et pas de tour de correction */
const RAFRAICHISSEMENT_MS = 1000; /* D8, O1 : le texte de la ligne d'état se rafraîchit au plus une fois par seconde (compteur de caractères,
                                     temps de réflexion) : chaque écriture de texte relance translateDOM d'app.html, hors du français. Son
                                     observateur suit childList, subtree et characterData, pas les attributs : la largeur de la barre (style)
                                     et aria-valuetext ne le relancent pas */
/* O1 : la barre de progression d'un appel, une ESTIMATION (voir « barre de progression » plus bas). DUREE_REFLEXION_S est la constante de temps,
   réglée sur l'essai réel du 06/11/2026 (effort low : environ 110 s de réflexion) : réflexion = 3 + 67 × (1 − exp(−t / 70)), soit environ 42 % à 1 min,
   56 % à 110 s et 69 % à 5 min. */
const DUREE_REFLEXION_S = 70;
const BARRE_DEPART = 3;           /* O1 : la connexion, et le départ de la réflexion */
const BARRE_REFLEXION = 70;       /* O1 : la réflexion s'en approche sans jamais l'atteindre */
const BARRE_ECRITURE = 92;        /* O1 : plafond de l'écriture, atteint à CARACTERES_ECRITURE caractères */
const BARRE_CONTROLE = 96;        /* O1 : contrôle et construction ; la barre ne va jamais au-delà, elle est retirée à la fin réelle */
const CARACTERES_ECRITURE = 9000; /* O1 : l'écriture va de la valeur atteinte à BARRE_ECRITURE selon texte.length / 9 000 caractères */
const FENETRE_JOURS = 30;         /* E18 : fenêtre des quotas à défaut de quota.fenetre_jours reçu du serveur (debut / fin, corps d'un 429) */
const MARGE_BAS = 56;             /* I3 : le bas du panneau reste à 56 px au moins du bas de la fenêtre (barre BETA d'app.html, #bpoPromptBar :
                                     fixed, bas 12 px, environ 33 px de haut, z-index 99990) */
const RESERVE_VERTICALE = 130;    /* I3 : hauteur maximale calc(100vh - 130px) à la place par défaut (haut à 60 px) */
const LARGEUR_PANNEAU = 440;      /* J2 : largeur du panneau, min(440 px, largeur de la fenêtre − 16 px) */
const MARGE_COTE = 8;             /* J2 : le panneau reste à 8 px au moins des bords gauche et droit de la fenêtre */
const ECART_DROIT = 24;           /* J2 : écart au bord droit de la place d'origine (positionDefaut) ; M1 : il ne décide plus de l'ancrage
                                     au lâcher (le côté le plus proche, finGlisse) */
const SEUIL_GLISSER = 4;          /* L1 : un geste sur le titre n'est un glisser que si le pointeur s'éloigne d'au moins 4 px du point d'appui */
const HAUTEUR_UTILE = 250;        /* L2 : au recalage, le haut affiché laisse au moins 250 px de hauteur maximale au panneau */
const ID_BIBLIOTHEQUE = 'libPanel';   /* N1 : le conteneur de Ma bibliothèque dans app.html (bpoLibInit : div#libPanel, ancré en 2e colonne
                                     ou flottant ; en-tête « Ma bibliothèque », corps #libBody qui porte #saveList) — un identifiant, pas
                                     une classe de style */
const ID_LISTE = 'saveList';      /* N1 : à défaut de #libPanel, la liste elle-même (cfgRender → _folderTree : la rangée « Importer ou
                                     recevoir un objet » avec #iaObjBtn, puis les cartes Editer, IA, + Scène, R, X) */
const PLAFOND_REGLAGES = 40;      /* J5 : au plus 40 réglages dans le champ reglages d'une demande « Modifier… », comme le serveur (§3.1) */
const NOM_REGLAGE = /^[\p{L}_][\p{L}\p{M}\p{N}_]{0,39}$/u;   /* J5, K3 : nom d'un réglage que le serveur accepte (§3.1), EXACTEMENT
                                     l'expression de traitement.ts : une lettre Unicode ou _, puis lettres, marques, chiffres ou _,
                                     40 points de code au plus ; ni espace, ni « = », ni tiret, ni séparateur de ligne, ni contrôle,
                                     ni caractère de format invisible (U+200B, U+FEFF, U+202E…) (L3 : règle inchangée) */
const BORNE_REGLAGE = 1e6;        /* J5 : valeur absolue au plus 1e6, comme le serveur */
/* filtre des mots interdits (D3, recette commune FILTRE.md) : on masque d'abord, par UNE regex alternée, les littéraux de chaîne
   ('…' et "…" avec échappements → "") et les commentaires de bloc et de ligne (→ un espace), puis on applique la regex des
   interdits au reste — la même expression que le serveur (§3.3) et qu'essai.js. Un mot interdit dans un libellé n'est plus refusé ;
   « "a // " + fetch(x) » l'est toujours. */
const MASQUE = /'(?:[^'\\\n]|\\[\s\S])*'|"(?:[^"\\\n]|\\[\s\S])*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
const INTERDITS = /\b(require|process|fetch|XMLHttpRequest|eval|Function|globalThis|window\.location|document|importScripts|WebSocket|indexedDB|localStorage|postMessage|self)\b|import\s*\(/;

/* ----------------------------------------------------------------------------
   i18n — clé = chaîne française (convention de bpo-demo-gate.js) ; repli anglais hors dictionnaire.
   ---------------------------------------------------------------------------- */
const I18N = {
en:{"Décrire un objet":"Describe an object","Fermer":"Close","Glisser pour déplacer":"Drag to move","Décrivez l’objet en une ou deux phrases : type, cotes hors tout, matières, équipements.":"Describe the object in one or two sentences: type, overall dimensions, materials, fittings.","Exemple : établi d’atelier 2,00 × 0,80 m, h 0,90, plateau hêtre, piètement acier bleu, étagère basse en tôle":"Example: workshop bench 2.00 × 0.80 m, h 0.90, beech top, blue steel frame, sheet-metal lower shelf","Fabriquer":"Build","Annuler":"Cancel","Recommencer":"Start over","Écriture du code… {0} caractères":"Writing the code… {0} characters","Connexion au service…":"Connecting to the service…","Contrôle…":"Checking…","Correction {0}/{1}…":"Correction {0}/{1}…","Prêt : {0} triangles, {1} × {2} × {3} m":"Ready: {0} triangles, {1} × {2} × {3} m","Construction…":"Building…","Construction trop longue (plus de {0} s) : le code est interrompu.":"Build too long (over {0} s): the code was stopped.","Cotes hors tout":"Overall dimensions","Hypothèses":"Assumptions","Réglages":"Settings","Valeurs par défaut":"Default values","Modifier… (ex. : portes plus hautes, sans roulettes)":"Change… (e.g. taller doors, no casters)","Modifier":"Change","Garder dans Ma bibliothèque":"Keep in My library","Nom de l’objet":"Object name","Garder…":"Keeping…","Objet gardé dans Ma bibliothèque.":"Object kept in My library.","Objet mis à jour dans Ma bibliothèque.":"Object updated in My library.","contrôle : {0}":"check: {0}","{0} faces confondues":"{0} coincident faces","{0} triangles dégénérés":"{0} degenerate triangles","{0} pièces à normales rentrantes":"{0} parts with inward normals","Connectez-vous pour décrire un objet.":"Sign in to describe an object.","Session absente ou expirée — reconnectez-vous.":"No session or session expired — sign in again.","Créez votre compte gratuit pour décrire un objet.":"Create your free account to describe an object.","Décrire un objet est réservé aux abonnés et à l’essai gratuit.":"Describing an object is for subscribers and the free trial.","Cette description est déjà en cours de fabrication : attendez la fin ou recommencez.":"This description is already being built: wait for it to finish or start over.","Quota atteint : {0} objets sur {1} ces {2} derniers jours.":"Quota reached: {0} of {1} objects in the last {2} days.","Réinitialisation le {0}.":"Resets on {0}.","Service pas encore ouvert.":"Service not open yet.","Service momentanément indisponible (clé absente côté serveur).":"Service temporarily unavailable (key missing on the server).","Service saturé : réessayez dans quelques heures.":"Service saturated: try again in a few hours.","Requête refusée par le serveur : {0}":"Request refused by the server: {0}","Erreur du serveur ({0}).":"Server error ({0}).","Client Supabase indisponible : {0}":"Supabase client unavailable: {0}","Service injoignable : pas encore ouvert, ou réseau indisponible.":"Service unreachable: not open yet, or network unavailable.","Demande annulée.":"Request cancelled.","Le flux s’est interrompu avant la fin.":"The stream stopped before the end.","Le modèle n’a pas rendu de code.":"The model returned no code.","Le modèle n’a pas rendu de code ({0}).":"The model returned no code ({0}).","Le modèle a refusé la demande.":"The model declined the request.","Délai dépassé côté serveur.":"Server-side timeout.","Erreur du modèle : {0}":"Model error: {0}","Le code produit a été refusé ({0}) : correction demandée.":"The produced code was refused ({0}): correction requested.","Échec : aucun code ne se construit après {0} tours.":"Failed: no code builds after {0} rounds.","Le module d’import n’est pas chargé : impossible de garder.":"The import module is not loaded: cannot keep.","Impossible de garder : {0}":"Could not keep: {0}","Impossible de garder : stockage plein ou indisponible. Libérez de la place (scènes, configurations), puis recommencez.":"Could not keep: storage full or unavailable. Free up space (scenes, configurations), then try again.","S’abonner":"Subscribe","Créer un compte":"Create an account","Décrivez d’abord l’objet.":"Describe the object first.","Décrivez la modification souhaitée.":"Describe the change you want.","Impossible de charger le kit de géométrie ({0}).":"Could not load the geometry kit ({0}).","Erreur d’exécution : {0}":"Execution error: {0}","Orbite : glisser · zoom : molette · recadrer : double clic":"Orbit: drag · zoom: wheel · reframe: double-click","Reprise de « {0} »":"Resuming “{0}”","Quota : {0}/{1} objets sur {2} jours":"Quota: {0}/{1} objects over {2} days","Trop d’appels pour cet objet : recommencez avec une nouvelle description.":"Too many calls for this object: start again with a new description.","Trop d’appels ces {0} derniers jours : réessayez plus tard.":"Too many calls in the last {0} days: try again later.","Trop d’appels ces {0} derniers jours : réessayez après le {1}.":"Too many calls in the last {0} days: try again after {1}.","Cet objet a épuisé ses appels : la modification compte comme un nouvel objet.":"This object has used up its calls: the change counts as a new object.","Fichier trop long ({0} caractères, {1} au plus) : reformulez ou simplifiez l’objet.":"File too long ({0} characters, {1} at most): rephrase or simplify the object.","Bac à sable indisponible dans ce navigateur.":"Sandbox unavailable in this browser.","L’objet est affiché avec ses défauts : la correction n’a pas pu être demandée.":"The object is shown with its defects: the correction could not be requested.","Cet objet a épuisé ses appels : une nouvelle modification comptera comme un nouvel objet.":"This object has used up its calls: a new change will count as a new object.","Correction annulée : l’objet est affiché avec ses défauts.":"Correction cancelled: the object is shown with its defects.","Réglages ramenés à la dernière géométrie construite.":"Settings brought back to the last built geometry.","Réglages remis aux valeurs par défaut du code.":"Settings reset to the default values of the code.","BPO crée votre objet paramétrique":"BPO is creating your parametric object","Le modèle réfléchit… {0} (cela peut prendre plusieurs minutes)":"The model is thinking… {0} (this can take several minutes)"},
de:{"Décrire un objet":"Ein Objekt beschreiben","Fermer":"Schließen","Glisser pour déplacer":"Zum Verschieben ziehen","Décrivez l’objet en une ou deux phrases : type, cotes hors tout, matières, équipements.":"Beschreiben Sie das Objekt in ein, zwei Sätzen: Typ, Außenmaße, Materialien, Ausstattung.","Exemple : établi d’atelier 2,00 × 0,80 m, h 0,90, plateau hêtre, piètement acier bleu, étagère basse en tôle":"Beispiel: Werkbank 2,00 × 0,80 m, H 0,90, Buchenplatte, blaues Stahlgestell, unteres Blechfach","Fabriquer":"Bauen","Annuler":"Abbrechen","Recommencer":"Neu beginnen","Écriture du code… {0} caractères":"Code wird geschrieben… {0} Zeichen","Connexion au service…":"Verbindung zum Dienst…","Contrôle…":"Prüfung…","Correction {0}/{1}…":"Korrektur {0}/{1}…","Prêt : {0} triangles, {1} × {2} × {3} m":"Fertig: {0} Dreiecke, {1} × {2} × {3} m","Construction…":"Aufbau…","Construction trop longue (plus de {0} s) : le code est interrompu.":"Aufbau zu lang (über {0} s): der Code wurde abgebrochen.","Cotes hors tout":"Außenmaße","Hypothèses":"Annahmen","Réglages":"Einstellungen","Valeurs par défaut":"Standardwerte","Modifier… (ex. : portes plus hautes, sans roulettes)":"Ändern… (z. B. höhere Türen, ohne Rollen)","Modifier":"Ändern","Garder dans Ma bibliothèque":"In Meine Bibliothek übernehmen","Nom de l’objet":"Objektname","Garder…":"Wird übernommen…","Objet gardé dans Ma bibliothèque.":"Objekt in Meine Bibliothek übernommen.","Objet mis à jour dans Ma bibliothèque.":"Objekt in Meine Bibliothek aktualisiert.","contrôle : {0}":"Prüfung: {0}","{0} faces confondues":"{0} deckungsgleiche Flächen","{0} triangles dégénérés":"{0} degenerierte Dreiecke","{0} pièces à normales rentrantes":"{0} Teile mit nach innen gerichteten Normalen","Connectez-vous pour décrire un objet.":"Melden Sie sich an, um ein Objekt zu beschreiben.","Session absente ou expirée — reconnectez-vous.":"Keine oder abgelaufene Sitzung — bitte erneut anmelden.","Créez votre compte gratuit pour décrire un objet.":"Erstellen Sie Ihr kostenloses Konto, um ein Objekt zu beschreiben.","Décrire un objet est réservé aux abonnés et à l’essai gratuit.":"Ein Objekt beschreiben ist Abonnenten und der kostenlosen Testphase vorbehalten.","Cette description est déjà en cours de fabrication : attendez la fin ou recommencez.":"Diese Beschreibung wird bereits gebaut: Warten Sie das Ende ab oder beginnen Sie neu.","Quota atteint : {0} objets sur {1} ces {2} derniers jours.":"Kontingent erreicht: {0} von {1} Objekten in den letzten {2} Tagen.","Réinitialisation le {0}.":"Zurücksetzung am {0}.","Service pas encore ouvert.":"Dienst noch nicht geöffnet.","Service momentanément indisponible (clé absente côté serveur).":"Dienst vorübergehend nicht verfügbar (Schlüssel fehlt serverseitig).","Service saturé : réessayez dans quelques heures.":"Dienst ausgelastet: Versuchen Sie es in einigen Stunden erneut.","Requête refusée par le serveur : {0}":"Anfrage vom Server abgelehnt: {0}","Erreur du serveur ({0}).":"Serverfehler ({0}).","Client Supabase indisponible : {0}":"Supabase-Client nicht verfügbar: {0}","Service injoignable : pas encore ouvert, ou réseau indisponible.":"Dienst nicht erreichbar: noch nicht geöffnet, oder Netzwerk nicht verfügbar.","Demande annulée.":"Anfrage abgebrochen.","Le flux s’est interrompu avant la fin.":"Der Datenstrom brach vor dem Ende ab.","Le modèle n’a pas rendu de code.":"Das Modell hat keinen Code geliefert.","Le modèle n’a pas rendu de code ({0}).":"Das Modell hat keinen Code geliefert ({0}).","Le modèle a refusé la demande.":"Das Modell hat die Anfrage abgelehnt.","Délai dépassé côté serveur.":"Zeitüberschreitung auf dem Server.","Erreur du modèle : {0}":"Modellfehler: {0}","Le code produit a été refusé ({0}) : correction demandée.":"Der erzeugte Code wurde abgelehnt ({0}): Korrektur angefordert.","Échec : aucun code ne se construit après {0} tours.":"Fehlgeschlagen: nach {0} Durchgängen baut sich kein Code.","Le module d’import n’est pas chargé : impossible de garder.":"Das Importmodul ist nicht geladen: Übernehmen nicht möglich.","Impossible de garder : {0}":"Übernehmen nicht möglich: {0}","Impossible de garder : stockage plein ou indisponible. Libérez de la place (scènes, configurations), puis recommencez.":"Übernehmen nicht möglich: Speicher voll oder nicht verfügbar. Schaffen Sie Platz (Szenen, Konfigurationen) und versuchen Sie es erneut.","S’abonner":"Abonnieren","Créer un compte":"Konto erstellen","Décrivez d’abord l’objet.":"Beschreiben Sie zuerst das Objekt.","Décrivez la modification souhaitée.":"Beschreiben Sie die gewünschte Änderung.","Impossible de charger le kit de géométrie ({0}).":"Geometrie-Kit konnte nicht geladen werden ({0}).","Erreur d’exécution : {0}":"Ausführungsfehler: {0}","Orbite : glisser · zoom : molette · recadrer : double clic":"Drehen: ziehen · Zoom: Mausrad · Neu ausrichten: Doppelklick","Reprise de « {0} »":"Wiederaufnahme von „{0}“","Quota : {0}/{1} objets sur {2} jours":"Kontingent: {0}/{1} Objekte in {2} Tagen","Trop d’appels pour cet objet : recommencez avec une nouvelle description.":"Zu viele Aufrufe für dieses Objekt: beginnen Sie mit einer neuen Beschreibung.","Trop d’appels ces {0} derniers jours : réessayez plus tard.":"Zu viele Aufrufe in den letzten {0} Tagen: versuchen Sie es später erneut.","Trop d’appels ces {0} derniers jours : réessayez après le {1}.":"Zu viele Aufrufe in den letzten {0} Tagen: versuchen Sie es nach dem {1} erneut.","Cet objet a épuisé ses appels : la modification compte comme un nouvel objet.":"Dieses Objekt hat seine Aufrufe aufgebraucht: die Änderung zählt als neues Objekt.","Fichier trop long ({0} caractères, {1} au plus) : reformulez ou simplifiez l’objet.":"Datei zu lang ({0} Zeichen, höchstens {1}): formulieren Sie um oder vereinfachen Sie das Objekt.","Bac à sable indisponible dans ce navigateur.":"Sandbox in diesem Browser nicht verfügbar.","L’objet est affiché avec ses défauts : la correction n’a pas pu être demandée.":"Das Objekt wird mit seinen Mängeln angezeigt: die Korrektur konnte nicht angefordert werden.","Cet objet a épuisé ses appels : une nouvelle modification comptera comme un nouvel objet.":"Dieses Objekt hat seine Aufrufe aufgebraucht: eine neue Änderung zählt als neues Objekt.","Correction annulée : l’objet est affiché avec ses défauts.":"Korrektur abgebrochen: das Objekt wird mit seinen Mängeln angezeigt.","Réglages ramenés à la dernière géométrie construite.":"Einstellungen auf die zuletzt gebaute Geometrie zurückgesetzt.","Réglages remis aux valeurs par défaut du code.":"Einstellungen auf die Standardwerte des Codes zurückgesetzt.","BPO crée votre objet paramétrique":"BPO erstellt Ihr parametrisches Objekt","Le modèle réfléchit… {0} (cela peut prendre plusieurs minutes)":"Das Modell denkt nach… {0} (das kann mehrere Minuten dauern)"},
es:{"Décrire un objet":"Describir un objeto","Fermer":"Cerrar","Glisser pour déplacer":"Arrastrar para mover","Décrivez l’objet en une ou deux phrases : type, cotes hors tout, matières, équipements.":"Describa el objeto en una o dos frases: tipo, medidas exteriores, materiales, equipamiento.","Exemple : établi d’atelier 2,00 × 0,80 m, h 0,90, plateau hêtre, piètement acier bleu, étagère basse en tôle":"Ejemplo: banco de taller 2,00 × 0,80 m, h 0,90, tablero de haya, bastidor de acero azul, estante bajo de chapa","Fabriquer":"Fabricar","Annuler":"Cancelar","Recommencer":"Empezar de nuevo","Écriture du code… {0} caractères":"Escribiendo el código… {0} caracteres","Connexion au service…":"Conectando con el servicio…","Contrôle…":"Control…","Correction {0}/{1}…":"Corrección {0}/{1}…","Prêt : {0} triangles, {1} × {2} × {3} m":"Listo: {0} triángulos, {1} × {2} × {3} m","Construction…":"Construcción…","Construction trop longue (plus de {0} s) : le code est interrompu.":"Construcción demasiado larga (más de {0} s): el código se ha interrumpido.","Cotes hors tout":"Medidas exteriores","Hypothèses":"Hipótesis","Réglages":"Ajustes","Valeurs par défaut":"Valores por defecto","Modifier… (ex. : portes plus hautes, sans roulettes)":"Modificar… (p. ej. puertas más altas, sin ruedas)","Modifier":"Modificar","Garder dans Ma bibliothèque":"Guardar en Mi biblioteca","Nom de l’objet":"Nombre del objeto","Garder…":"Guardando…","Objet gardé dans Ma bibliothèque.":"Objeto guardado en Mi biblioteca.","Objet mis à jour dans Ma bibliothèque.":"Objeto actualizado en Mi biblioteca.","contrôle : {0}":"control: {0}","{0} faces confondues":"{0} caras coincidentes","{0} triangles dégénérés":"{0} triángulos degenerados","{0} pièces à normales rentrantes":"{0} piezas con normales hacia dentro","Connectez-vous pour décrire un objet.":"Inicie sesión para describir un objeto.","Session absente ou expirée — reconnectez-vous.":"Sesión ausente o caducada — vuelva a iniciar sesión.","Créez votre compte gratuit pour décrire un objet.":"Cree su cuenta gratuita para describir un objeto.","Décrire un objet est réservé aux abonnés et à l’essai gratuit.":"Describir un objeto está reservado a los suscriptores y a la prueba gratuita.","Cette description est déjà en cours de fabrication : attendez la fin ou recommencez.":"Esta descripción ya se está fabricando: espere a que termine o vuelva a empezar.","Quota atteint : {0} objets sur {1} ces {2} derniers jours.":"Cuota alcanzada: {0} de {1} objetos en los últimos {2} días.","Réinitialisation le {0}.":"Se reinicia el {0}.","Service pas encore ouvert.":"Servicio aún no abierto.","Service momentanément indisponible (clé absente côté serveur).":"Servicio temporalmente no disponible (falta la clave en el servidor).","Service saturé : réessayez dans quelques heures.":"Servicio saturado: vuelva a intentarlo dentro de unas horas.","Requête refusée par le serveur : {0}":"Solicitud rechazada por el servidor: {0}","Erreur du serveur ({0}).":"Error del servidor ({0}).","Client Supabase indisponible : {0}":"Cliente Supabase no disponible: {0}","Service injoignable : pas encore ouvert, ou réseau indisponible.":"Servicio inaccesible: aún no abierto, o red no disponible.","Demande annulée.":"Solicitud cancelada.","Le flux s’est interrompu avant la fin.":"El flujo se interrumpió antes del final.","Le modèle n’a pas rendu de code.":"El modelo no devolvió código.","Le modèle n’a pas rendu de code ({0}).":"El modelo no devolvió código ({0}).","Le modèle a refusé la demande.":"El modelo rechazó la solicitud.","Délai dépassé côté serveur.":"Tiempo de espera agotado en el servidor.","Erreur du modèle : {0}":"Error del modelo: {0}","Le code produit a été refusé ({0}) : correction demandée.":"El código producido fue rechazado ({0}): corrección solicitada.","Échec : aucun code ne se construit après {0} tours.":"Fallo: ningún código se construye tras {0} intentos.","Le module d’import n’est pas chargé : impossible de garder.":"El módulo de importación no está cargado: no se puede guardar.","Impossible de garder : {0}":"No se puede guardar: {0}","Impossible de garder : stockage plein ou indisponible. Libérez de la place (scènes, configurations), puis recommencez.":"No se puede guardar: almacenamiento lleno o no disponible. Libere espacio (escenas, configuraciones) y vuelva a intentarlo.","S’abonner":"Suscribirse","Créer un compte":"Crear una cuenta","Décrivez d’abord l’objet.":"Describa primero el objeto.","Décrivez la modification souhaitée.":"Describa el cambio deseado.","Impossible de charger le kit de géométrie ({0}).":"No se pudo cargar el kit de geometría ({0}).","Erreur d’exécution : {0}":"Error de ejecución: {0}","Orbite : glisser · zoom : molette · recadrer : double clic":"Orbitar: arrastrar · zoom: rueda · reencuadrar: doble clic","Reprise de « {0} »":"Reanudación de «{0}»","Quota : {0}/{1} objets sur {2} jours":"Cuota: {0}/{1} objetos en {2} días","Trop d’appels pour cet objet : recommencez avec une nouvelle description.":"Demasiadas llamadas para este objeto: empiece de nuevo con una nueva descripción.","Trop d’appels ces {0} derniers jours : réessayez plus tard.":"Demasiadas llamadas en los últimos {0} días: inténtelo más tarde.","Trop d’appels ces {0} derniers jours : réessayez après le {1}.":"Demasiadas llamadas en los últimos {0} días: inténtelo después del {1}.","Cet objet a épuisé ses appels : la modification compte comme un nouvel objet.":"Este objeto ha agotado sus llamadas: la modificación cuenta como un objeto nuevo.","Fichier trop long ({0} caractères, {1} au plus) : reformulez ou simplifiez l’objet.":"Archivo demasiado largo ({0} caracteres, {1} como máximo): reformule o simplifique el objeto.","Bac à sable indisponible dans ce navigateur.":"Entorno aislado no disponible en este navegador.","L’objet est affiché avec ses défauts : la correction n’a pas pu être demandée.":"El objeto se muestra con sus defectos: no se pudo solicitar la corrección.","Cet objet a épuisé ses appels : une nouvelle modification comptera comme un nouvel objet.":"Este objeto ha agotado sus llamadas: una nueva modificación contará como un objeto nuevo.","Correction annulée : l’objet est affiché avec ses défauts.":"Corrección cancelada: el objeto se muestra con sus defectos.","Réglages ramenés à la dernière géométrie construite.":"Ajustes devueltos a la última geometría construida.","Réglages remis aux valeurs par défaut du code.":"Ajustes restablecidos a los valores por defecto del código.","BPO crée votre objet paramétrique":"BPO está creando su objeto paramétrico","Le modèle réfléchit… {0} (cela peut prendre plusieurs minutes)":"El modelo está pensando… {0} (puede tardar varios minutos)"},
it:{"Décrire un objet":"Descrivere un oggetto","Fermer":"Chiudi","Glisser pour déplacer":"Trascina per spostare","Décrivez l’objet en une ou deux phrases : type, cotes hors tout, matières, équipements.":"Descrivi l’oggetto in una o due frasi: tipo, ingombri, materiali, dotazioni.","Exemple : établi d’atelier 2,00 × 0,80 m, h 0,90, plateau hêtre, piètement acier bleu, étagère basse en tôle":"Esempio: banco da officina 2,00 × 0,80 m, h 0,90, piano in faggio, telaio in acciaio blu, ripiano basso in lamiera","Fabriquer":"Costruisci","Annuler":"Annulla","Recommencer":"Ricomincia","Écriture du code… {0} caractères":"Scrittura del codice… {0} caratteri","Connexion au service…":"Connessione al servizio…","Contrôle…":"Controllo…","Correction {0}/{1}…":"Correzione {0}/{1}…","Prêt : {0} triangles, {1} × {2} × {3} m":"Pronto: {0} triangoli, {1} × {2} × {3} m","Construction…":"Costruzione…","Construction trop longue (plus de {0} s) : le code est interrompu.":"Costruzione troppo lunga (oltre {0} s): il codice è stato interrotto.","Cotes hors tout":"Ingombri","Hypothèses":"Ipotesi","Réglages":"Regolazioni","Valeurs par défaut":"Valori predefiniti","Modifier… (ex. : portes plus hautes, sans roulettes)":"Modifica… (es. porte più alte, senza ruote)","Modifier":"Modifica","Garder dans Ma bibliothèque":"Salva nella Mia libreria","Nom de l’objet":"Nome dell’oggetto","Garder…":"Salvataggio…","Objet gardé dans Ma bibliothèque.":"Oggetto salvato nella Mia libreria.","Objet mis à jour dans Ma bibliothèque.":"Oggetto aggiornato nella Mia libreria.","contrôle : {0}":"controllo: {0}","{0} faces confondues":"{0} facce coincidenti","{0} triangles dégénérés":"{0} triangoli degeneri","{0} pièces à normales rentrantes":"{0} pezzi con normali rientranti","Connectez-vous pour décrire un objet.":"Accedi per descrivere un oggetto.","Session absente ou expirée — reconnectez-vous.":"Sessione assente o scaduta — accedi di nuovo.","Créez votre compte gratuit pour décrire un objet.":"Crea il tuo account gratuito per descrivere un oggetto.","Décrire un objet est réservé aux abonnés et à l’essai gratuit.":"Descrivere un oggetto è riservato agli abbonati e alla prova gratuita.","Cette description est déjà en cours de fabrication : attendez la fin ou recommencez.":"Questa descrizione è già in costruzione: attendi la fine o ricomincia.","Quota atteint : {0} objets sur {1} ces {2} derniers jours.":"Quota raggiunta: {0} oggetti su {1} negli ultimi {2} giorni.","Réinitialisation le {0}.":"Si azzera il {0}.","Service pas encore ouvert.":"Servizio non ancora aperto.","Service momentanément indisponible (clé absente côté serveur).":"Servizio momentaneamente non disponibile (chiave assente sul server).","Service saturé : réessayez dans quelques heures.":"Servizio saturo: riprova tra qualche ora.","Requête refusée par le serveur : {0}":"Richiesta rifiutata dal server: {0}","Erreur du serveur ({0}).":"Errore del server ({0}).","Client Supabase indisponible : {0}":"Client Supabase non disponibile: {0}","Service injoignable : pas encore ouvert, ou réseau indisponible.":"Servizio irraggiungibile: non ancora aperto, o rete non disponibile.","Demande annulée.":"Richiesta annullata.","Le flux s’est interrompu avant la fin.":"Il flusso si è interrotto prima della fine.","Le modèle n’a pas rendu de code.":"Il modello non ha restituito codice.","Le modèle n’a pas rendu de code ({0}).":"Il modello non ha restituito codice ({0}).","Le modèle a refusé la demande.":"Il modello ha rifiutato la richiesta.","Délai dépassé côté serveur.":"Tempo scaduto lato server.","Erreur du modèle : {0}":"Errore del modello: {0}","Le code produit a été refusé ({0}) : correction demandée.":"Il codice prodotto è stato rifiutato ({0}): correzione richiesta.","Échec : aucun code ne se construit après {0} tours.":"Fallito: nessun codice si costruisce dopo {0} tentativi.","Le module d’import n’est pas chargé : impossible de garder.":"Il modulo di importazione non è caricato: impossibile salvare.","Impossible de garder : {0}":"Impossibile salvare: {0}","Impossible de garder : stockage plein ou indisponible. Libérez de la place (scènes, configurations), puis recommencez.":"Impossibile salvare: archiviazione piena o non disponibile. Libera spazio (scene, configurazioni), poi riprova.","S’abonner":"Abbonati","Créer un compte":"Crea un account","Décrivez d’abord l’objet.":"Descrivi prima l’oggetto.","Décrivez la modification souhaitée.":"Descrivi la modifica desiderata.","Impossible de charger le kit de géométrie ({0}).":"Impossibile caricare il kit di geometria ({0}).","Erreur d’exécution : {0}":"Errore di esecuzione: {0}","Orbite : glisser · zoom : molette · recadrer : double clic":"Orbita: trascina · zoom: rotella · inquadra: doppio clic","Reprise de « {0} »":"Ripresa di «{0}»","Quota : {0}/{1} objets sur {2} jours":"Quota: {0}/{1} oggetti su {2} giorni","Trop d’appels pour cet objet : recommencez avec une nouvelle description.":"Troppe chiamate per questo oggetto: ricomincia con una nuova descrizione.","Trop d’appels ces {0} derniers jours : réessayez plus tard.":"Troppe chiamate negli ultimi {0} giorni: riprova più tardi.","Trop d’appels ces {0} derniers jours : réessayez après le {1}.":"Troppe chiamate negli ultimi {0} giorni: riprova dopo il {1}.","Cet objet a épuisé ses appels : la modification compte comme un nouvel objet.":"Questo oggetto ha esaurito le sue chiamate: la modifica conta come un nuovo oggetto.","Fichier trop long ({0} caractères, {1} au plus) : reformulez ou simplifiez l’objet.":"File troppo lungo ({0} caratteri, al massimo {1}): riformula o semplifica l’oggetto.","Bac à sable indisponible dans ce navigateur.":"Ambiente isolato non disponibile in questo browser.","L’objet est affiché avec ses défauts : la correction n’a pas pu être demandée.":"L’oggetto è mostrato con i suoi difetti: non è stato possibile richiedere la correzione.","Cet objet a épuisé ses appels : une nouvelle modification comptera comme un nouvel objet.":"Questo oggetto ha esaurito le sue chiamate: una nuova modifica conterà come un nuovo oggetto.","Correction annulée : l’objet est affiché avec ses défauts.":"Correzione annullata: l’oggetto è mostrato con i suoi difetti.","Réglages ramenés à la dernière géométrie construite.":"Regolazioni riportate all’ultima geometria costruita.","Réglages remis aux valeurs par défaut du code.":"Regolazioni riportate ai valori predefiniti del codice.","BPO crée votre objet paramétrique":"BPO sta creando il tuo oggetto parametrico","Le modèle réfléchit… {0} (cela peut prendre plusieurs minutes)":"Il modello sta ragionando… {0} (può richiedere alcuni minuti)"},
pt:{"Décrire un objet":"Descrever um objeto","Fermer":"Fechar","Glisser pour déplacer":"Arrastar para mover","Décrivez l’objet en une ou deux phrases : type, cotes hors tout, matières, équipements.":"Descreva o objeto em uma ou duas frases: tipo, dimensões exteriores, materiais, equipamentos.","Exemple : établi d’atelier 2,00 × 0,80 m, h 0,90, plateau hêtre, piètement acier bleu, étagère basse en tôle":"Exemplo: bancada de oficina 2,00 × 0,80 m, h 0,90, tampo em faia, estrutura de aço azul, prateleira baixa em chapa","Fabriquer":"Fabricar","Annuler":"Cancelar","Recommencer":"Recomeçar","Écriture du code… {0} caractères":"A escrever o código… {0} caracteres","Connexion au service…":"A ligar ao serviço…","Contrôle…":"Controlo…","Correction {0}/{1}…":"Correção {0}/{1}…","Prêt : {0} triangles, {1} × {2} × {3} m":"Pronto: {0} triângulos, {1} × {2} × {3} m","Construction…":"Construção…","Construction trop longue (plus de {0} s) : le code est interrompu.":"Construção demasiado longa (mais de {0} s): o código foi interrompido.","Cotes hors tout":"Dimensões exteriores","Hypothèses":"Hipóteses","Réglages":"Ajustes","Valeurs par défaut":"Valores por defeito","Modifier… (ex. : portes plus hautes, sans roulettes)":"Modificar… (ex.: portas mais altas, sem rodízios)","Modifier":"Modificar","Garder dans Ma bibliothèque":"Guardar na Minha biblioteca","Nom de l’objet":"Nome do objeto","Garder…":"A guardar…","Objet gardé dans Ma bibliothèque.":"Objeto guardado na Minha biblioteca.","Objet mis à jour dans Ma bibliothèque.":"Objeto atualizado na Minha biblioteca.","contrôle : {0}":"controlo: {0}","{0} faces confondues":"{0} faces coincidentes","{0} triangles dégénérés":"{0} triângulos degenerados","{0} pièces à normales rentrantes":"{0} peças com normais para dentro","Connectez-vous pour décrire un objet.":"Inicie sessão para descrever um objeto.","Session absente ou expirée — reconnectez-vous.":"Sessão ausente ou expirada — inicie sessão novamente.","Créez votre compte gratuit pour décrire un objet.":"Crie a sua conta gratuita para descrever um objeto.","Décrire un objet est réservé aux abonnés et à l’essai gratuit.":"Descrever um objeto é reservado aos assinantes e ao teste gratuito.","Cette description est déjà en cours de fabrication : attendez la fin ou recommencez.":"Esta descrição já está a ser fabricada: aguarde o fim ou recomece.","Quota atteint : {0} objets sur {1} ces {2} derniers jours.":"Quota atingida: {0} de {1} objetos nos últimos {2} dias.","Réinitialisation le {0}.":"Reinicia a {0}.","Service pas encore ouvert.":"Serviço ainda não aberto.","Service momentanément indisponible (clé absente côté serveur).":"Serviço temporariamente indisponível (chave ausente no servidor).","Service saturé : réessayez dans quelques heures.":"Serviço saturado: tente novamente dentro de algumas horas.","Requête refusée par le serveur : {0}":"Pedido recusado pelo servidor: {0}","Erreur du serveur ({0}).":"Erro do servidor ({0}).","Client Supabase indisponible : {0}":"Cliente Supabase indisponível: {0}","Service injoignable : pas encore ouvert, ou réseau indisponible.":"Serviço inacessível: ainda não aberto, ou rede indisponível.","Demande annulée.":"Pedido cancelado.","Le flux s’est interrompu avant la fin.":"O fluxo interrompeu-se antes do fim.","Le modèle n’a pas rendu de code.":"O modelo não devolveu código.","Le modèle n’a pas rendu de code ({0}).":"O modelo não devolveu código ({0}).","Le modèle a refusé la demande.":"O modelo recusou o pedido.","Délai dépassé côté serveur.":"Tempo esgotado no servidor.","Erreur du modèle : {0}":"Erro do modelo: {0}","Le code produit a été refusé ({0}) : correction demandée.":"O código produzido foi recusado ({0}): correção pedida.","Échec : aucun code ne se construit après {0} tours.":"Falhou: nenhum código se constrói após {0} tentativas.","Le module d’import n’est pas chargé : impossible de garder.":"O módulo de importação não está carregado: impossível guardar.","Impossible de garder : {0}":"Impossível guardar: {0}","Impossible de garder : stockage plein ou indisponible. Libérez de la place (scènes, configurations), puis recommencez.":"Impossível guardar: armazenamento cheio ou indisponível. Liberte espaço (cenas, configurações) e tente novamente.","S’abonner":"Subscrever","Créer un compte":"Criar uma conta","Décrivez d’abord l’objet.":"Descreva primeiro o objeto.","Décrivez la modification souhaitée.":"Descreva a alteração pretendida.","Impossible de charger le kit de géométrie ({0}).":"Não foi possível carregar o kit de geometria ({0}).","Erreur d’exécution : {0}":"Erro de execução: {0}","Orbite : glisser · zoom : molette · recadrer : double clic":"Orbitar: arrastar · zoom: roda · reenquadrar: duplo clique","Reprise de « {0} »":"Retoma de «{0}»","Quota : {0}/{1} objets sur {2} jours":"Quota: {0}/{1} objetos em {2} dias","Trop d’appels pour cet objet : recommencez avec une nouvelle description.":"Demasiadas chamadas para este objeto: recomece com uma nova descrição.","Trop d’appels ces {0} derniers jours : réessayez plus tard.":"Demasiadas chamadas nos últimos {0} dias: tente novamente mais tarde.","Trop d’appels ces {0} derniers jours : réessayez après le {1}.":"Demasiadas chamadas nos últimos {0} dias: tente novamente após {1}.","Cet objet a épuisé ses appels : la modification compte comme un nouvel objet.":"Este objeto esgotou as suas chamadas: a alteração conta como um novo objeto.","Fichier trop long ({0} caractères, {1} au plus) : reformulez ou simplifiez l’objet.":"Ficheiro demasiado longo ({0} caracteres, {1} no máximo): reformule ou simplifique o objeto.","Bac à sable indisponible dans ce navigateur.":"Área restrita indisponível neste navegador.","L’objet est affiché avec ses défauts : la correction n’a pas pu être demandée.":"O objeto é apresentado com os seus defeitos: não foi possível pedir a correção.","Cet objet a épuisé ses appels : une nouvelle modification comptera comme un nouvel objet.":"Este objeto esgotou as suas chamadas: uma nova alteração contará como um novo objeto.","Correction annulée : l’objet est affiché avec ses défauts.":"Correção cancelada: o objeto é apresentado com os seus defeitos.","Réglages ramenés à la dernière géométrie construite.":"Ajustes repostos na última geometria construída.","Réglages remis aux valeurs par défaut du code.":"Ajustes repostos nos valores por defeito do código.","BPO crée votre objet paramétrique":"O BPO está a criar o seu objeto paramétrico","Le modèle réfléchit… {0} (cela peut prendre plusieurs minutes)":"O modelo está a pensar… {0} (pode demorar vários minutos)"}
};

/* langue de l'interface : window.LANG (app.html) → localStorage.bpo_lang → navigator.language (§4.6) */
function langue() {
  let l = '';
  try { if (typeof window !== 'undefined' && typeof window.LANG === 'string') l = window.LANG; } catch (e) { /* hors navigateur */ }
  if (!l) { try { l = localStorage.getItem('bpo_lang') || ''; } catch (e) { /* stockage indisponible */ } }
  if (!l) { try { l = (typeof navigator !== 'undefined' && navigator.language) || ''; } catch (e) { /* idem */ } }
  l = String(l || 'fr').toLowerCase().slice(0, 2);
  return /^[a-z]{2}$/.test(l) ? l : 'fr';
}
function T(fr) {
  const l = langue();
  if (l === 'fr') return fr;
  const d = I18N[l] || I18N.en;
  return (d && d[fr]) || I18N.en[fr] || fr;
}
/* gabarit à repères {0} {1}… */
function fmt(s) {
  const v = Array.prototype.slice.call(arguments, 1);
  return String(s).replace(/\{(\d)\}/g, function (m, i) { return v[+i] === undefined ? m : String(v[+i]); });
}
function nombre(x, dec) {
  const n = +x;
  if (!isFinite(n)) return '–';
  try { return n.toLocaleString(langue(), { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
  catch (e) { return n.toFixed(dec); }
}
function dateCourte(iso) {
  try { const d = new Date(iso); if (isNaN(d.getTime())) return String(iso); return d.toLocaleDateString(langue()); } catch (e) { return String(iso); }
}
/* F12 : une date ISO reçue du serveur n'entre dans un message que si elle se lit */
function dateValide(iso) { return typeof iso === 'string' && iso !== '' && !isNaN(new Date(iso).getTime()); }
function uuid() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* repli ci-dessous */ }
  const b = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.random() * 256 | 0;
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

/* Erreur porteuse d'un code (session, abonnement, quota, delai, programme…) et, pour 403 / 429 quota, d'un lien vers compte.html dont
   le libellé suit le code : « Créer un compte » pour le 403 anonyme (F10, champ libelle), « S'abonner » sinon. */
class ErreurIA extends Error {
  constructor(code, message, extra) { super(message); this.code = code; if (extra) Object.assign(this, extra); }
}

/* ----------------------------------------------------------------------------
   SSE — parserSSE(texte) est une fonction PURE (testable en Node) : découpage des blocs par ligne vide (\n\n ou \r\n\r\n),
   champs event: / data: (plusieurs data: concaténés par \n), JSON décodé quand c'en est. tamponSSE() accumule les
   fragments d'un flux et ne livre que les blocs complets : une coupure au milieu d'un « data: » attend la suite.
   ---------------------------------------------------------------------------- */
function parserSSE(texte) {
  const evts = [];
  String(texte == null ? '' : texte).replace(/\r\n?/g, '\n').split(/\n\n+/).forEach(function (bloc) {
    let event = 'message', vu = false;
    const data = [];
    bloc.split('\n').forEach(function (ligne) {
      if (!ligne || ligne.charAt(0) === ':') return;
      const i = ligne.indexOf(':');
      const champ = i < 0 ? ligne : ligne.slice(0, i);
      let val = i < 0 ? '' : ligne.slice(i + 1);
      if (val.charAt(0) === ' ') val = val.slice(1);
      if (champ === 'event') { event = val; vu = true; }
      else if (champ === 'data') { data.push(val); vu = true; }
    });
    if (!vu) return;
    const brut = data.join('\n');
    let d = brut;
    try { d = JSON.parse(brut); } catch (e) { /* données non JSON : on garde le texte */ }
    evts.push({ event: event, data: d });
  });
  return evts;
}
function tamponSSE() {
  let reste = '';
  const SEP = /\r?\n\r?\n/g;
  return {
    pousser: function (morceau) {
      reste += String(morceau == null ? '' : morceau);
      let fin = -1, m;
      SEP.lastIndex = 0;
      while ((m = SEP.exec(reste)) !== null) fin = m.index + m[0].length;
      if (fin < 0) return [];
      const complet = reste.slice(0, fin);
      reste = reste.slice(fin);
      return parserSSE(complet);
    },
    vider: function () { const r = reste; reste = ''; return r.trim() ? parserSSE(r) : []; }
  };
}

/* ----------------------------------------------------------------------------
   Client serveur — demander(corps, onDelta, signal) : import DYNAMIQUE du client Supabase au premier appel
   (vendor + bpo-config), jeton de session, POST en flux, lecture par getReader + TextDecoder + tamponSSE (§3).
   ---------------------------------------------------------------------------- */
let _client = null;
function clientSupabase() {
  if (!_client) {
    _client = Promise.all([import('./vendor/supabase-js-2.110.7.js'), import('./bpo-config.js')])
      .then(function (r) { return { sb: r[0].createClient(r[1].SUPABASE_URL, r[1].SUPABASE_ANON), url: r[1].SUPABASE_URL }; })
      .catch(function (e) { _client = null; throw e; });
  }
  return _client;
}
/* message « fichier trop long » (D4) : traduit, avec le nombre de caractères quand on le connaît */
function messageTropLong(n) {
  return fmt(T('Fichier trop long ({0} caractères, {1} au plus) : reformulez ou simplifiez l’objet.'), n > 0 ? nombre(n, 0) : '?', nombre(PLAFOND_CODE, 0));
}
function messageFlux(code, message) {
  /* E18 : le détail du serveur (« Réponse interrompue (longueur maximale atteinte) : … ») est repris dans le message */
  if (code === 'vide') return message ? fmt(T('Le modèle n’a pas rendu de code ({0}).'), message) : T('Le modèle n’a pas rendu de code.');
  /* E18 : pour une erreur du modèle, le serveur envoie un message générique (le détail reste dans son journal) : tel quel */
  if (code === 'modele' && message) return message;
  if (code === 'refus') return T('Le modèle a refusé la demande.');
  if (code === 'delai') return T('Délai dépassé côté serveur.');
  if (code === 'code_refuse') return fmt(T('Le code produit a été refusé ({0}) : correction demandée.'), message || code);
  if (code === 'trop_long') {
    /* D4 : le serveur écrit « Fichier trop long (N caractères, 60 000 au plus) : … » ; on reprend N dans la langue de l'interface */
    const m = /(\d[\d\s  ]*)\D/.exec(message || '');
    const n = m ? +m[1].replace(/\D/g, '') : 0;
    return n > 0 || !message ? messageTropLong(n) : message;
  }
  return fmt(T('Erreur du modèle : {0}'), message || code);
}
/* E18 : la fenêtre de jours des quotas n'est plus écrite en dur : quota.fenetre_jours du serveur (événements debut / fin, et un
   429 peut la porter dans son corps), sinon la valeur connue du panneau (dernier quota reçu), sinon FENETRE_JOURS. */
function fenetreJours(q, connue) {
  const n = q ? +q.fenetre_jours : 0;
  return n > 0 ? n : (connue > 0 ? +connue : FENETRE_JOURS);
}
function fenetreConnue() { return (P && P.E && P.E.quota && +P.E.quota.fenetre_jours > 0) ? +P.E.quota.fenetre_jours : 0; }
/* erreur HTTP AVANT le flux (§3.2) → ErreurIA. D9 : les 429 à code appels_session / appels ont leurs messages propres, sans
   lien « S'abonner » ; seul le code quota garde le message de quota et le lien. E18 : 403 'anonyme' (créer son compte) et
   403 autre (réservé aux abonnés et à l'essai), 409 'session' (description déjà en fabrication), 503 'sature' (plafond global, sans lien) ;
   fenetre = fenêtre de jours connue du panneau, pour les messages des 429. F10 : le lien du 403 anonyme s'appelle « Créer un compte »
   (libelle porté par l'erreur, lu par afficherErreur). F12 : un 429 appels dont le corps porte reinit dit « réessayez après le <date> »,
   formatée comme « Réinitialisation le » ; I8 : reinit = date ISO où la somme des appels de la fenêtre repasse sous la garde (H8, côté serveur). */
function erreurHTTP(s, j, fenetre) {
  j = (j && typeof j === 'object') ? j : {};
  if (s === 401) return new ErreurIA('session', T('Session absente ou expirée — reconnectez-vous.'));
  if (s === 403) {
    if (j.code === 'anonyme') return new ErreurIA('anonyme', T('Créez votre compte gratuit pour décrire un objet.'), { lien: 'compte.html', libelle: 'Créer un compte' });
    return new ErreurIA('abonnement', T('Décrire un objet est réservé aux abonnés et à l’essai gratuit.'), { lien: 'compte.html' });
  }
  if (s === 409) return new ErreurIA('en_cours', T('Cette description est déjà en cours de fabrication : attendez la fin ou recommencez.'));
  if (s === 429) {
    const jours = fenetreJours(j.quota || j, fenetre);
    if (j.code === 'appels_session') return new ErreurIA('appels_session', T('Trop d’appels pour cet objet : recommencez avec une nouvelle description.'));
    if (j.code === 'appels') {
      if (dateValide(j.reinit)) return new ErreurIA('appels', fmt(T('Trop d’appels ces {0} derniers jours : réessayez après le {1}.'), jours, dateCourte(j.reinit)), { reinit: j.reinit });
      return new ErreurIA('appels', fmt(T('Trop d’appels ces {0} derniers jours : réessayez plus tard.'), jours));
    }
    const q = j.quota || {};
    let msg = fmt(T('Quota atteint : {0} objets sur {1} ces {2} derniers jours.'), q.utilises == null ? '?' : q.utilises, q.plafond == null ? '?' : q.plafond, jours);
    if (q.reinit) msg += ' ' + fmt(T('Réinitialisation le {0}.'), dateCourte(q.reinit));
    return new ErreurIA('quota', msg, { lien: 'compte.html', quota: q });
  }
  if (s === 404) return new ErreurIA('absent', T('Service pas encore ouvert.'));
  if (s === 503) {
    if (j.code === 'sature') return new ErreurIA('sature', T('Service saturé : réessayez dans quelques heures.'));
    return new ErreurIA('cle', T('Service momentanément indisponible (clé absente côté serveur).'));
  }
  if (s === 400) return new ErreurIA('requete', fmt(T('Requête refusée par le serveur : {0}'), j.error || s));
  return new ErreurIA('serveur', fmt(T('Erreur du serveur ({0}).'), j.error ? s + ' — ' + j.error : s));
}
/* événement erreur du flux (§3.2) → ErreurIA marquée serveur. I7 : quand le serveur y joint le quota ({ utilises, plafond, fenetre_jours } :
   l'objet compté, ou rendu par H7), l'erreur le porte (e.quota) et la boucle met le titre à jour ; sans quota, rien ne change. */
function erreurFlux(d) {
  d = (d && typeof d === 'object') ? d : {};
  const c = d.code || 'erreur', extra = { serveur: true };
  if (d.quota && typeof d.quota === 'object') extra.quota = d.quota;
  return new ErreurIA(c, messageFlux(c, d.message), extra);
}
/* O1 : onDebut, facultatif, est appelé à l'événement debut du flux (le serveur l'envoie dès qu'il a pris la demande, avant l'appel au modèle) */
async function demander(corps, onDelta, signal, onDebut) {
  let cli;
  try { cli = await clientSupabase(); }
  catch (e) { throw new ErreurIA('client', fmt(T('Client Supabase indisponible : {0}'), (e && e.message) || e)); }
  let session = null;
  try { session = (await cli.sb.auth.getSession()).data.session || null; } catch (e) { /* traité comme absence de session */ }
  if (!session) throw new ErreurIA('no-session', T('Connectez-vous pour décrire un objet.'));
  let r;
  try {
    r = await fetch(cli.url + FONCTION, {
      method: 'POST', signal: signal,
      headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps)
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new ErreurIA('annule', T('Demande annulée.'));
    /* E18 : fetch rejette aussi quand la passerelle répond 404 sans en-têtes CORS (fonction non déployée) : on ne peut pas
       le distinguer d'un réseau coupé, le message dit les deux */
    throw new ErreurIA('reseau', T('Service injoignable : pas encore ouvert, ou réseau indisponible.'));
  }
  if (!r.ok) {
    const j = await r.json().catch(function () { return {}; });
    throw erreurHTTP(r.status, j, fenetreConnue());
  }
  const res = { debut: null, fin: null, erreur: null };
  const traiter = function (ev) {
    const d = (ev.data && typeof ev.data === 'object') ? ev.data : {};
    if (ev.event === 'debut') { res.debut = d; if (onDebut) onDebut(d); }
    else if (ev.event === 'delta') { if (typeof d.t === 'string' && onDelta) onDelta(d.t); }
    else if (ev.event === 'fin') res.fin = d;
    else if (ev.event === 'erreur') res.erreur = d;
  };
  if (r.body && typeof r.body.getReader === 'function') {
    const lecteur = r.body.getReader(), dec = new TextDecoder(), tampon = tamponSSE();
    try {
      for (;;) {
        const lu = await lecteur.read();
        if (lu.done) break;
        tampon.pousser(dec.decode(lu.value, { stream: true })).forEach(traiter);
        if (res.fin || res.erreur) break;
      }
      tampon.pousser(dec.decode()).forEach(traiter);
      tampon.vider().forEach(traiter);
    } catch (e) {
      if (e && e.name === 'AbortError') throw new ErreurIA('annule', T('Demande annulée.'));
      if (!res.fin && !res.erreur) throw new ErreurIA('flux', T('Le flux s’est interrompu avant la fin.'));
    }
    try { lecteur.cancel(); } catch (e) { /* flux déjà clos */ }
  } else {
    parserSSE(await r.text()).forEach(traiter);
  }
  if (res.erreur) throw erreurFlux(res.erreur);   /* I7 : le quota de l'événement suit l'erreur */
  if (!res.fin || typeof res.fin.code !== 'string') throw new ErreurIA('flux', T('Le flux s’est interrompu avant la fin.'));
  /* D4 : le serveur refuse déjà au-delà de 60 000 caractères ; même garde ici, sans tour de correction */
  if (res.fin.code.length > PLAFOND_CODE) throw new ErreurIA('trop_long', messageTropLong(res.fin.code.length), { serveur: true });
  return Object.assign({ debut: res.debut }, res.fin);
}
/* le banc peut remplacer l'appel serveur (serveur factice : code_refuse, trop_long, 429…) sans réseau ni Supabase */
let _demander = demander;

/* ----------------------------------------------------------------------------
   Bac à sable (§4.3) — durci le 02/11/2026 (E1 à E3, revue de sécurité : évasion prouvée par la chaîne de prototypes du worker).
   La FRONTIÈRE de confinement est celle du NAVIGATEUR (E1) : le worker est créé DANS un <iframe sandbox="allow-scripts"> (origine
   opaque, sans allow-same-origin) dont le srcdoc porte une Content-Security-Policy — default-src 'none', connect-src 'none',
   script-src 'unsafe-inline' 'unsafe-eval' blob: (le relais inline, le harnais en new Function), worker-src blob: — héritée par
   le Blob worker : fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, importScripts et import() d'une URL distante y sont
   refusés par le moteur, quel que soit le chemin JavaScript emprunté pour les atteindre. Le filtre statique et la neutralisation
   du HARNAIS (E2) ne sont plus que de la défense en profondeur. Le parent et l'iframe ne se parlent que par postMessage : le
   RELAIS inline du srcdoc crée le worker et relaie ses messages ; le parent n'accepte que les messages dont la source est la
   fenêtre de SON iframe. AUCUN repli vers un worker hors iframe : si l'iframe ou le worker ne démarre pas, c'est une erreur
   affichée, jamais une exécution moins confinée. Les tests Node gardent l'injection opts.creerWorker (worker_threads).
   Le HARNAIS est la source de harnaisWorker() sérialisée (ES5 strict, ASCII, aucune dépendance au module) : il capture Function
   et les constructeurs de fonctions avant toute neutralisation, neutralise les membres dangereux sur TOUTE la chaîne de
   prototypes de self, filtre les mots interdits, charge le code en MODE STRICT (le « this » d'une fonction nue est undefined ;
   un OBJET déclaré par var sans ligne d'export est récupéré par la valeur de retour), construit en IGNORANT la valeur de retour
   de make (seule la géométrie construite par le kit compte, E3a), assainit — tableaux, multiples de 3, plafonds de triangles et
   de sommets, indices, groupes (E3b) — puis contrôle, et répond avec TRANSFERT des tampons. Côté page, Bac.recevoir re-vérifie
   un message « construit » avant de le livrer (E3c). Le code de l'objet ne tourne jamais dans la page.
   ---------------------------------------------------------------------------- */
const PLAFOND_TRIANGLES = 200000;   /* E3 : au-delà, « geometrie trop lourde » dans le worker, et refus de la page (E3c) */
const PLAFOND_SOMMETS = 400000;
const PLAFOND_GROUPES = 1000;
const DELAI_RELAIS_MS = 5000;       /* E1 : attente bornée du « relais_pret » de l'iframe, sinon ErreurIA('bac') */
const CSP_BAC = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'";

function harnaisWorker(SRC_INTERDITS, SRC_MASQUE, PLAFOND_TRIANGLES, PLAFOND_SOMMETS) {
  'use strict';
  /* captures AVANT toute neutralisation et avant tout code d'objet : le code de l'objet peut reassigner les globales de son realm
     (String, Array, Error...) et retoucher les prototypes ; ce que le harnais emploie ensuite est pris ici, une fois pour toutes */
  var G = self, post = G.postMessage.bind(G), Fonction = Function, StringOf = String, ErreurW = Error, isArray = Array.isArray,
      hasOwn = Object.prototype.hasOwnProperty, getProto = Object.getPrototypeOf, definir = Object.defineProperty,
      slice = String.prototype.slice, indexOf = String.prototype.indexOf, F32 = Float32Array, U32 = Uint32Array,
      INTERDITS = new RegExp(SRC_INTERDITS), MASQUE = new RegExp(SRC_MASQUE, 'g'), GEO = G.BPO_GEO,
      creerK = GEO ? GEO.creer : null, controlerK = GEO ? GEO.controler : null, OBJET = null, PLAFOND_GROUPES = 1000;
  function bloquer(n) { return function () { throw new ErreurW('acces interdit dans le bac a sable : ' + n); }; }
  function neutraliser(cible, n, valeur) {
    try { definir(cible, n, { value: valeur, writable: false, configurable: false, enumerable: false }); }
    catch (e) { try { cible[n] = valeur; } catch (e2) { /* propriete non modifiable : on la laisse */ } }
  }
  /* E2b : sur self ET sur toute sa chaine de prototypes (dans un vrai worker, fetch, importScripts, navigator, self... vivent sur
     WorkerGlobalScope.prototype, pas sur l'instance), chaque membre dangereux present en propriete PROPRE est remplace par un
     bloqueur (fonctions, constructeurs) ou par undefined (objets, accesseurs). Rien d'autre que post (capture ci-dessus) ne
     reste joignable. 'self' est efface aussi : l'accesseur self de WorkerGlobalScope.prototype, appele sans receveur, rendrait le
     global (regle WebIDL des interfaces [Global]). */
  var BLOQUES = ['fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'WebTransport', 'importScripts', 'open', 'EventSource',
                 'BroadcastChannel', 'Worker', 'SharedWorker', 'Request', 'Response', 'Headers', 'FileReader', 'FileReaderSync',
                 'postMessage', 'setTimeout', 'setInterval', 'queueMicrotask', 'requestAnimationFrame', 'eval', 'Function'],
      EFFACES = ['indexedDB', 'caches', 'navigator', 'location', 'globalThis', 'self'], cible = G, i;
  while (cible) {
    for (i = 0; i < BLOQUES.length; i++) if (hasOwn.call(cible, BLOQUES[i])) neutraliser(cible, BLOQUES[i], bloquer(BLOQUES[i]));
    for (i = 0; i < EFFACES.length; i++) if (hasOwn.call(cible, EFFACES[i])) neutraliser(cible, EFFACES[i], undefined);
    cible = getProto(cible);
  }
  neutraliser(G, 'globalThis', undefined);   /* sur l'instance, meme s'il n'y etait pas en propre */
  if (G.performance) neutraliser(G.performance, 'measureUserAgentSpecificMemory', bloquer('performance.measureUserAgentSpecificMemory'));
  /* E2b : les constructeurs de fonctions, joignables par (function(){}).constructor meme quand la globale Function est neutralisee ;
     les formes async et generateur sont obtenues par la Function capturee, pour que ce fichier reste lisible par un moteur ES5 */
  neutraliser(Fonction.prototype, 'constructor', bloquer('Function'));
  var FORMES = [['AsyncFunction', 'return Object.getPrototypeOf(async function () {}).constructor;'],
                ['GeneratorFunction', 'return Object.getPrototypeOf(function* () {}).constructor;'],
                ['AsyncGeneratorFunction', 'return Object.getPrototypeOf(async function* () {}).constructor;']];
  for (i = 0; i < FORMES.length; i++) {
    try { var C = (new Fonction(FORMES[i][1]))(); if (C && C !== Fonction && C.prototype) neutraliser(C.prototype, 'constructor', bloquer(FORMES[i][0])); }
    catch (e) { /* forme inconnue de ce moteur : rien a neutraliser */ }
  }
  if (GEO) { try { Object.freeze(GEO); } catch (e) { /* kit non gelable : creer et controler sont captures */ } }
  /* D3 (FILTRE.md) : chaines -> "", commentaires -> un espace, puis seulement la regex des interdits */
  function masquer(code) { return code.replace(MASQUE, function (m) { return m.charAt(0) === '/' ? ' ' : '""'; }); }
  function borner(s, n) { return typeof s === 'string' ? (s.length > n ? slice.call(s, 0, n) : s) : ''; }
  function texte(x, n) { return borner(StringOf(x == null ? '' : x), n); }
  function milliers(n) { var s = StringOf(n), out = ''; while (s.length > 3) { out = ' ' + slice.call(s, -3) + out; s = slice.call(s, 0, -3); } return s + out; }
  function nombreOuNull(v) { var n = +v; return (v === null || v === undefined || v === '' || n !== n || n === Infinity || n === -Infinity) ? null : n; }
  function canal(x) { if (typeof x !== 'number' || x !== x) return null; x = x | 0; return x < 0 ? 0 : (x > 255 ? 255 : x); }
  function listeTextes(a, nMax, lMax) {
    var out = [], i, n;
    if (!isArray(a)) return out;
    n = a.length > nMax ? nMax : a.length;
    for (i = 0; i < n; i++) out[i] = texte(a[i], lMax);
    return out;
  }
  function nettoyerParams(P) {
    var out = {}, k, p, mn, mx, df, t, n = 0;
    if (!P || typeof P !== 'object') return out;
    for (k in P) {
      if (++n > 60) break;
      if (k.length > 80) continue;
      p = P[k]; if (!p || typeof p !== 'object') continue;
      mn = nombreOuNull(p.min); mx = nombreOuNull(p.max); df = nombreOuNull(p.def);
      if (df === null) df = mn !== null ? mn : 0;
      if (mn === null) mn = df < 0 ? df : 0;
      if (mx === null) mx = df > mn + 1 ? df : mn + 1;
      if (mx < mn) { t = mn; mn = mx; mx = t; }
      out[k] = { label: texte(p.label || k, 120), unit: p.unit ? texte(p.unit, 32) : '', min: mn, max: mx, def: df < mn ? mn : (df > mx ? mx : df) };
    }
    return out;
  }
  /* 2) charger : filtre, puis le code en MODE STRICT (E2a) par la Function capturee, dans un module et une fenetre factices ;
     OBJET = module.exports.make ? module.exports : (window.OBJET || valeur de retour) ; la valeur de retour recupere un OBJET
     declare par var sans ligne d'export */
  function charger(code) {
    code = StringOf(code == null ? '' : code);
    if (!code.trim()) throw new ErreurW('code vide');
    var m = INTERDITS.exec(masquer(code));
    if (m) throw new ErreurW('mot interdit dans le code : ' + m[0]);
    var module = { exports: {} }, fenetre = {};
    var f = new Fonction('module', 'exports', 'window', 'self', "'use strict';\n" + code + "\n;return (typeof OBJET !== 'undefined') ? OBJET : undefined;");
    var retour = f.call(fenetre, module, module.exports, fenetre, fenetre);
    var O = (module.exports && typeof module.exports.make === 'function') ? module.exports
          : ((fenetre.OBJET && typeof fenetre.OBJET.make === 'function') ? fenetre.OBJET : retour);
    if (!O || typeof O.make !== 'function') throw new ErreurW('OBJET.make introuvable : le fichier doit definir var OBJET = { nom, designation, hypotheses, params, make }');
    OBJET = O;
    return { nom: texte(O.nom || '', 200), designation: texte(O.designation || '', 2000),
             hypotheses: listeTextes(O.hypotheses, 60, 1000), params: nettoyerParams(O.params) };
  }
  function valeurs(params) {
    var o = {}, k, v, P = (OBJET && OBJET.params) || {};
    if (OBJET && OBJET.defauts) for (k in OBJET.defauts) o[k] = OBJET.defauts[k];
    for (k in P) if (P[k] && P[k].def !== undefined) o[k] = P[k].def;
    if (params) for (k in params) { v = params[k]; if (typeof v === 'string' && v !== '' && isFinite(+v)) v = +v; if (v !== undefined && v !== null && v === v) o[k] = v; }
    return o;
  }
  /* E3b : la geometrie rendue par le kit est assainie AVANT le controle : pos et idx tableaux numeriques de longueur multiple de 3,
     plafonds de triangles et de sommets, chaque indice entier dans [0, sommets), au plus PLAFOND_GROUPES groupes (start et count
     entiers >= 0 multiples de 3, start + count <= idx.length, nom tronque a 80, couleur = 3 entiers 0-255 ou null) ; dims recalculees */
  function assainir(g) {
    if (!g || !isArray(g.pos) || !isArray(g.idx)) throw new ErreurW('geometrie invalide : pos et idx doivent etre des tableaux');
    var pos = g.pos, idx = g.idx, np = pos.length, ni = idx.length, i, v, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    if (!ni) throw new ErreurW('geometrie vide : aucune piece construite');
    if (np % 3 !== 0 || ni % 3 !== 0) throw new ErreurW('geometrie invalide : longueurs de pos et idx non multiples de 3');
    if (ni / 3 > PLAFOND_TRIANGLES) throw new ErreurW('geometrie trop lourde : ' + milliers(ni / 3) + ' triangles (' + milliers(PLAFOND_TRIANGLES) + ' au plus)');
    if (np / 3 > PLAFOND_SOMMETS) throw new ErreurW('geometrie trop lourde : ' + milliers(np / 3) + ' sommets (' + milliers(PLAFOND_SOMMETS) + ' au plus)');
    for (i = 0; i < np; i++) { v = pos[i]; if (typeof v !== 'number') throw new ErreurW('geometrie invalide : coordonnee non numerique'); if (v < mn[i % 3]) mn[i % 3] = v; if (v > mx[i % 3]) mx[i % 3] = v; }
    var nv = np / 3;
    for (i = 0; i < ni; i++) { v = idx[i]; if (typeof v !== 'number' || v !== (v | 0) || v < 0 || v >= nv) throw new ErreurW('geometrie invalide : indice de sommet hors bornes'); }
    var groups = isArray(g.groups) ? g.groups : [], n = groups.length, propres = [], gr, name, start, count, col;
    if (n > PLAFOND_GROUPES) throw new ErreurW('trop de groupes : ' + milliers(n) + ' (' + milliers(PLAFOND_GROUPES) + ' au plus)');
    for (i = 0; i < n; i++) {
      gr = groups[i];
      if (!gr || typeof gr !== 'object') throw new ErreurW('groupe hors bornes : #' + i);
      name = texte(gr.name, 80); start = gr.start; count = gr.count;
      if (typeof start !== 'number' || typeof count !== 'number' || start !== (start | 0) || count !== (count | 0) || start < 0 || count < 0 ||
          start % 3 !== 0 || count % 3 !== 0 || start + count > ni) throw new ErreurW('groupe hors bornes : ' + name);
      col = (isArray(gr.col) && gr.col.length >= 3) ? [canal(gr.col[0]), canal(gr.col[1]), canal(gr.col[2])] : null;
      if (col && (col[0] === null || col[1] === null || col[2] === null)) col = null;
      propres[i] = { name: name, col: col, tex: null, start: start, count: count };
    }
    return { pos: pos, idx: idx, groups: propres, dims: { L: mx[0] - mn[0], P: mx[2] - mn[2], H: mx[1] - mn[1] } };
  }
  /* 3) construire : fusion def + valeurs, K = BPO_GEO.creer(), OBJET.make(K, o) dont la VALEUR DE RETOUR EST IGNOREE (E3a) : la
     geometrie est TOUJOURS K.finir() (pris sur K avant make : le code ne peut pas le remplacer), assainie puis controlee */
  function construire(params) {
    if (!creerK || !controlerK) throw new ErreurW('kit de geometrie absent du worker');
    if (!OBJET) throw new ErreurW('aucun objet charge');
    var K = creerK(), finir = K.finir;
    OBJET.make(K, valeurs(params));
    var g = assainir(finir());
    var rapport = controlerK(g), pos = new F32(g.pos), idx = new U32(g.idx);
    return { pos: pos, idx: idx, groups: g.groups, dims: g.dims, rapport: rapport, triangles: idx.length / 3 };
  }
  function pileDe(e) {
    var s = e && e.stack, out = '', i = 0, j, n = 0;
    if (typeof s !== 'string') return '';
    s = borner(s, 4000);
    while (n < 4 && i <= s.length) { j = indexOf.call(s, '\n', i); if (j < 0) j = s.length; out += (n ? '\n' : '') + slice.call(s, i, j); n++; i = j + 1; }
    return out;
  }
  function traiter(m) {
    var id = m && m.id;
    try {
      if (!m || !m.type) throw new ErreurW('message sans type');
      if (m.type === 'charger') { var meta = charger(m.code); meta.type = 'charge'; meta.id = id; post(meta); }
      else if (m.type === 'construire') {
        var r = construire(m.params);
        post({ type: 'construit', id: id, pos: r.pos, idx: r.idx, groups: r.groups, dims: r.dims, rapport: r.rapport, triangles: r.triangles }, [r.pos.buffer, r.idx.buffer]);
      }
      else if (m.type === 'ping') post({ type: 'pong', id: id });
      else throw new ErreurW('message inconnu : ' + m.type);
    } catch (e) {
      /* 4) exception : message + 4 lignes de pile, bornes */
      post({ type: 'erreur', id: id, message: texte((e && e.message) || e, 2000), pile: pileDe(e) });
    }
  }
  var recevoir = function (ev) { traiter(ev && ev.data); };
  if (typeof G.addEventListener === 'function') G.addEventListener('message', recevoir); else G.onmessage = recevoir;
  post({ type: 'pret', kit: GEO ? GEO.version : null });
}
const HARNAIS = '(' + harnaisWorker.toString() + ')(' + JSON.stringify(INTERDITS.source) + ', ' + JSON.stringify(MASQUE.source) + ', ' + PLAFOND_TRIANGLES + ', ' + PLAFOND_SOMMETS + ');\n';

/* E1 : le RELAIS inline du srcdoc, sérialisé par toString comme le HARNAIS (ES5, ASCII, aucune dépendance au module). Il n'accepte
   que les messages de la fenêtre parente ; { type:'charger', kit, harnais, code, id } crée le Blob worker [kit + harnais] s'il
   manque et lui transmet charger ; { type:'construire', params, id } et ping sont relayés ; { type:'terminer' } arrête le worker ;
   chaque message du worker revient au parent (tampons de pos et idx re-transférés), worker.onerror → { type:'erreur_worker',
   message } ; au chargement : { type:'relais_pret' }. targetOrigin '*' des deux côtés (l'iframe est d'origine opaque) : c'est le
   filtre sur la source (ev.source) qui fait l'appariement, et rien de secret ne circule. */
function relaisBac() {
  'use strict';
  var parent = window.parent, w = null, url = null;
  function envoyer(m, transferts) {
    try { parent.postMessage(m, '*', transferts || []); }
    catch (e) { try { parent.postMessage({ type: 'erreur_worker', message: 'relais : ' + String((e && e.message) || e) }, '*'); } catch (e2) { /* parent disparu */ } }
  }
  function revoquer() { if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* deja revoquee */ } url = null; } }
  function arreter() { if (w) { try { w.terminate(); } catch (e) { /* deja arrete */ } w = null; } revoquer(); }
  function demarrer(kit, harnais) {
    url = URL.createObjectURL(new Blob([String(kit), '\n;\n', String(harnais)], { type: 'text/javascript' }));
    var worker = new Worker(url);
    worker.onmessage = function (ev) {
      var m = ev.data, t = [];
      if (m && m.type === 'construit') { if (m.pos && m.pos.buffer) t.push(m.pos.buffer); if (m.idx && m.idx.buffer) t.push(m.idx.buffer); }
      revoquer();
      envoyer(m, t);
    };
    worker.onerror = function (e) { try { e.preventDefault(); } catch (e2) { /* sans evenement */ } envoyer({ type: 'erreur_worker', message: String((e && e.message) || 'worker') }); };
    w = worker;
  }
  window.addEventListener('message', function (ev) {
    if (ev.source !== parent) return;
    var m = ev.data;
    if (!m || typeof m !== 'object' || typeof m.type !== 'string') return;
    if (m.type === 'terminer') { arreter(); return; }
    if (m.type === 'charger') {
      if (!w) { try { demarrer(m.kit, m.harnais); } catch (e) { envoyer({ type: 'erreur_worker', message: String((e && e.message) || e) }); return; } }
      w.postMessage({ type: 'charger', code: m.code, id: m.id });
      return;
    }
    if (!w) { envoyer({ type: 'erreur', id: m.id, message: 'bac a sable non charge' }); return; }
    w.postMessage({ type: m.type, params: m.params, id: m.id });
  });
  envoyer({ type: 'relais_pret' });
}
const SRCDOC_BAC = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + CSP_BAC +
                   '"><title>bac</title></head><body><script>(' + relaisBac.toString() + ')();</script></body></html>';

let _kit = null;
async function texteKit() {
  if (_kit) return _kit;
  const url = new URL(KIT_URL, import.meta.url).href;
  let r;
  try { r = await fetch(url); } catch (e) { throw new ErreurIA('kit', fmt(T('Impossible de charger le kit de géométrie ({0}).'), (e && e.message) || e)); }
  if (!r.ok) throw new ErreurIA('kit', fmt(T('Impossible de charger le kit de géométrie ({0}).'), r.status));
  const t = await r.text();
  if (t.indexOf('BPO_GEO') < 0) throw new ErreurIA('kit', fmt(T('Impossible de charger le kit de géométrie ({0}).'), 'contenu'));
  _kit = t;
  return t;
}
/* E1 : l'iframe sandbox et son adaptateur de la forme d'un Worker (postMessage, terminate, onmessage, onerror) pour la classe Bac.
   La promesse se résout au « relais_pret », ou rejette ErreurIA('bac') après delaiRelais ; terminate() envoie « terminer » puis
   RETIRE l'iframe du document (destruction dure, worker compris). Seuls les messages dont ev.source est la fenêtre de cette iframe
   sont écoutés. Sans document ni window (Node) : ErreurIA('bac'), jamais un autre chemin. */
function creerBacIframe(kit, harnais, delaiRelais) {
  return new Promise(function (res, rej) {
    const indispo = function () { return new ErreurIA('bac', T('Bac à sable indisponible dans ce navigateur.')); };
    if (typeof document === 'undefined' || typeof window === 'undefined' || typeof window.addEventListener !== 'function') { rej(indispo()); return; }
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');          /* PAS allow-same-origin : origine opaque, aucun accès à la page ni à son stockage */
    iframe.setAttribute('aria-hidden', 'true'); iframe.setAttribute('tabindex', '-1'); iframe.setAttribute('title', 'bac');
    iframe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;border:0;visibility:hidden;pointer-events:none';
    let pret = false, vivant = true, minuterie = 0;
    function ecoute(ev) {
      if (!vivant || !ev || ev.source !== iframe.contentWindow) return;   /* seule la fenêtre de NOTRE iframe est écoutée */
      const m = ev.data;
      if (!m || typeof m !== 'object' || typeof m.type !== 'string') return;
      if (m.type === 'relais_pret') { if (!pret) { pret = true; clearTimeout(minuterie); res(a); } return; }
      if (m.type === 'erreur_worker') { if (a.onerror) a.onerror({ message: typeof m.message === 'string' ? m.message : 'worker' }); return; }
      if (a.onmessage) a.onmessage({ data: m });
    }
    const a = {
      onmessage: null, onerror: null, iframe: iframe,
      postMessage: function (m) {
        const cw = vivant ? iframe.contentWindow : null;
        if (!cw) throw indispo();
        if (m && m.type === 'charger') cw.postMessage({ type: 'charger', id: m.id, code: m.code, kit: kit, harnais: harnais }, '*');
        else cw.postMessage(m, '*');
      },
      terminate: function () {
        if (!vivant) return;
        vivant = false; clearTimeout(minuterie);
        window.removeEventListener('message', ecoute);
        try { if (iframe.contentWindow) iframe.contentWindow.postMessage({ type: 'terminer' }, '*'); } catch (e) { /* iframe déjà partie */ }
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }
    };
    window.addEventListener('message', ecoute);
    minuterie = setTimeout(function () { if (!pret) { a.terminate(); rej(indispo()); } }, delaiRelais || DELAI_RELAIS_MS);
    try { iframe.srcdoc = SRCDOC_BAC; (document.body || document.documentElement).appendChild(iframe); }
    catch (e) { a.terminate(); rej(indispo()); }
  });
}
/* E3c : la page re-vérifie un message « construit » avant de le livrer à la vue : tableaux de longueur multiple de 3, plafonds,
   chaque indice dans [0, sommets), groupes dans les bornes ; triangles et dims recalculés dans la page (le worker est confiné, pas
   de confiance pour autant). Rend le message normalisé, ou null. */
function geometrieRecevable(m) {
  const pos = m.pos, idx = m.idx;
  if (!pos || !idx || typeof pos.length !== 'number' || typeof idx.length !== 'number') return null;
  if (!idx.length || pos.length % 3 !== 0 || idx.length % 3 !== 0) return null;
  if (idx.length / 3 > PLAFOND_TRIANGLES || pos.length / 3 > PLAFOND_SOMMETS) return null;
  const nv = pos.length / 3;
  for (let i = 0; i < idx.length; i++) { const k = idx[i]; if (!(k >= 0 && k < nv && k === Math.floor(k))) return null; }
  if (!Array.isArray(m.groups) || m.groups.length > PLAFOND_GROUPES) return null;
  for (let g = 0; g < m.groups.length; g++) {
    const gr = m.groups[g];
    if (!gr || typeof gr !== 'object' || typeof gr.name !== 'string' || gr.name.length > 80) return null;
    if (!Number.isInteger(gr.start) || !Number.isInteger(gr.count) || gr.start < 0 || gr.count < 0 || gr.start % 3 || gr.count % 3 || gr.start + gr.count > idx.length) return null;
    if (gr.col !== null && !(Array.isArray(gr.col) && gr.col.length === 3 && gr.col.every(function (c) { return Number.isInteger(c) && c >= 0 && c <= 255; }))) return null;
  }
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) { const v = pos[i], a = i % 3; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
  m.dims = { L: mx[0] - mn[0], P: mx[2] - mn[2], H: mx[1] - mn[1] };
  m.triangles = idx.length / 3;
  if (!m.rapport || typeof m.rapport !== 'object') m.rapport = { ok: false, triangles: m.triangles, sommets: nv, degeneres: 0, volumesNegatifs: [], coplanaires: [] };
  return m;
}
/* un message « charge » est borné de même (textes, nombre d'hypothèses et de réglages, bornes numériques finies) */
function metaRecevable(m) {
  const texte = function (s, n) { return typeof s === 'string' ? s.slice(0, n) : ''; };
  const meta = { type: 'charge', id: m.id, nom: texte(m.nom, 200), designation: texte(m.designation, 2000), hypotheses: [], params: {} };
  if (Array.isArray(m.hypotheses)) m.hypotheses.slice(0, 60).forEach(function (h) { if (typeof h === 'string') meta.hypotheses.push(h.slice(0, 1000)); });
  if (m.params && typeof m.params === 'object') Object.keys(m.params).slice(0, 60).forEach(function (k) {
    const p = m.params[k];
    if (k.length > 80 || !p || typeof p !== 'object' || ![p.min, p.max, p.def].every(Number.isFinite) || p.min > p.max) return;
    meta.params[k] = { label: texte(p.label, 120) || k, unit: texte(p.unit, 32), min: p.min, max: p.max, def: Math.min(p.max, Math.max(p.min, p.def)) };
  });
  return meta;
}
/* Bac : un bac (iframe sandbox + worker, ou worker direct injecté par les tests), une file de messages (un à la fois), un délai par
   message armé AU DÉPART RÉEL du message ; au-delà : destruction (terminer + retrait de l'iframe), recréation paresseuse au
   prochain envoi (le code courant est rechargé automatiquement) ; même destruction sur « bac a sable non charge » du relais (F13). */
class Bac {
  constructor(opts) {
    opts = opts || {};
    this.creerWorker = opts.creerWorker || null;   /* tests Node : worker direct (worker_threads) ; sinon l'iframe sandbox (E1), sans repli */
    this.texteKit = opts.texteKit || texteKit;
    this.delai = opts.delai || DELAI_MS;
    this.delaiRelais = opts.delaiRelais || DELAI_RELAIS_MS;
    this.w = null; this.n = 0; this.file = []; this.courant = null; this.code = null; this.codeCharge = false;
  }
  async worker() {
    if (this.w) return this.w;
    const kit = await this.texteKit();
    const w = this.creerWorker ? await this.creerWorker(kit + '\n;\n' + HARNAIS) : await creerBacIframe(kit, HARNAIS, this.delaiRelais);
    if (this.w) { try { w.terminate(); } catch (e) { /* doublon d'une création concurrente */ } return this.w; }
    w.onmessage = (ev) => this.recevoir(ev.data, w);
    w.onerror = (e) => { if (this.w === w) this.panne(new ErreurIA('worker', fmt(T('Erreur d’exécution : {0}'), (e && e.message) || 'worker'))); };
    this.w = w; this.codeCharge = false;
    return w;
  }
  recevoir(m) {
    if (!m || m.id == null) return;                   /* 'pret' et messages sans correspondant */
    const a = this.courant;
    if (!a || a.id !== m.id) return;
    this.courant = null; clearTimeout(a.timer);
    if (m.type === 'erreur') {
      a.rej(new ErreurIA('programme', fmt(T('Erreur d’exécution : {0}'), typeof m.message === 'string' ? m.message.slice(0, 2000) : 'erreur'), { pile: typeof m.pile === 'string' ? m.pile.slice(0, 4000) : '' }));
      /* F13 : le relais répond ainsi quand son worker n'existe plus (un « terminer » arrivé hors bande, par exemple) : sans destruction,
         chaque envoi suivant échouerait de même ; le bac est recréé paresseusement au prochain envoi, le code courant rechargé */
      if (m.message === 'bac a sable non charge') this.detruire();
    }
    else if (m.type === 'construit') {
      const g = geometrieRecevable(m);                /* E3c */
      if (g) a.res(g); else a.rej(new ErreurIA('programme', fmt(T('Erreur d’exécution : {0}'), 'geometrie irrecevable (longueurs, plafonds ou indices)')));
    }
    else if (m.type === 'charge') a.res(metaRecevable(m));
    else a.res(m);
    this.pomper();
  }
  panne(err) {
    const l = this.file; this.file = [];
    const c = this.courant; this.courant = null;
    this.detruire();
    if (c) { clearTimeout(c.timer); c.rej(err); }
    l.forEach(function (a) { a.rej(err); });
  }
  detruire() {
    if (this.w) { try { this.w.terminate(); } catch (e) { /* déjà arrêté */ } this.w = null; this.codeCharge = false; }
  }
  pomper() {
    if (this.courant || !this.file.length) return;
    const a = this.file.shift();
    this.courant = a;
    this.worker().then((w) => {
      if (this.courant !== a) return;
      a.timer = setTimeout(() => {
        if (this.courant !== a) return;
        this.courant = null;
        this.detruire();                              /* worker tué (terminer + iframe retirée) : le code qui boucle ne reviendra pas */
        a.rej(new ErreurIA('delai', fmt(T('Construction trop longue (plus de {0} s) : le code est interrompu.'), Math.round(this.delai / 1000))));
        this.pomper();
      }, this.delai);
      w.postMessage(a.msg);
    }).catch((e) => { if (this.courant === a) { this.courant = null; a.rej(e); this.pomper(); } });
  }
  envoyer(msg, remplacable) {
    return new Promise((res, rej) => {
      if (remplacable) {
        /* un réglage de curseur remplace celui qui attend encore son tour */
        this.file = this.file.filter(function (a) { if (a.remplacable) { a.rej(new ErreurIA('remplace', 'remplacé')); return false; } return true; });
      }
      msg.id = ++this.n;
      this.file.push({ id: msg.id, msg: msg, res: res, rej: rej, timer: 0, remplacable: !!remplacable });
      this.pomper();
    });
  }
  async charger(code) {
    this.code = code; this.codeCharge = false;
    const m = await this.envoyer({ type: 'charger', code: code });
    if (this.code === code) this.codeCharge = true;   /* H1 : un code retenu entre-temps (retenir) reste à charger */
    return m;
  }
  /* H1 : le code que les réglages reconstruisent ; s'il n'est pas celui du dernier chargement, il est rechargé au prochain construire */
  retenir(code) { if (typeof code === 'string' && code !== this.code) { this.code = code; this.codeCharge = false; } }
  async construire(params, remplacable) {
    if (!this.w || !this.codeCharge) { if (this.code == null) throw new ErreurIA('programme', 'aucun code'); await this.charger(this.code); }
    return this.envoyer({ type: 'construire', params: params || {} }, remplacable);
  }
}

/* ----------------------------------------------------------------------------
   Aperçu 3D — canvas 2D, rendu logiciel : projection perspective, élimination des faces arrière, tri peintre par
   profondeur, ombrage plat (normale · lumière fixe + ambiant) avec la couleur de la pièce, sol en grille, orbite au
   glisser, molette = zoom, double clic = recadrer, devicePixelRatio. Normales et centres précalculés par géométrie.
   ---------------------------------------------------------------------------- */
const LUM = (function () { const l = [0.35, 0.8, 0.5], n = Math.hypot(l[0], l[1], l[2]); return [l[0] / n, l[1] / n, l[2] / n]; })();
const NIV = 20;
function joli(x) {
  if (!(x > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
class Vue {
  constructor(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d'); this.geo = null; this.n = 0;
    this.theta = 0.75; this.phi = 0.40; this.dist = 4; this.cible = [0, 0.5, 0]; this.rayon = 1; this.fov = 0.6;
    this.raf = 0; this.W = 1; this.H = 1; this.dpr = 1;
    this.brancher();
  }
  brancher() {
    const cv = this.cv;
    let glisse = null;
    cv.addEventListener('pointerdown', (e) => { glisse = { x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (er) { /* capture impossible */ } cv.style.cursor = 'grabbing'; });
    cv.addEventListener('pointermove', (e) => {
      if (!glisse) return;
      this.theta -= (e.clientX - glisse.x) * 0.01; this.phi += (e.clientY - glisse.y) * 0.01;
      this.phi = Math.max(-1.45, Math.min(1.5, this.phi));
      glisse = { x: e.clientX, y: e.clientY }; this.demander();
    });
    const lacher = () => { glisse = null; cv.style.cursor = 'grab'; };
    cv.addEventListener('pointerup', lacher); cv.addEventListener('pointercancel', lacher);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.dist *= Math.exp(Math.max(-60, Math.min(60, e.deltaY)) * 0.0025);
      this.dist = Math.max(this.rayon * 1.08 + 0.05, Math.min(this.rayon * 25, this.dist)); this.demander();
    }, { passive: false });
    cv.addEventListener('dblclick', () => { this.cadrer(); this.demander(); });
  }
  charger(geo) {
    const pos = geo.pos, idx = geo.idx, n = idx.length / 3 | 0;
    this.geo = geo; this.n = n;
    this.ctr = new Float32Array(n * 3); this.nrm = new Float32Array(n * 3); this.grp = new Uint16Array(n);
    this.prof = new Float32Array(n); this.ordre = new Int32Array(n);
    const nv = pos.length / 3 | 0;
    this.px = new Float32Array(nv); this.py = new Float32Array(nv); this.pz = new Float32Array(nv);
    const groups = geo.groups || [];
    this.cols = groups.map(function (g) { return (g.col && g.col.length >= 3) ? g.col : [160, 160, 160]; });
    this.teintes = this.cols.map(function () { return new Array(NIV + 1); });
    groups.forEach(function (g, gi) { const t0 = g.start / 3 | 0, t1 = (g.start + g.count) / 3 | 0; for (let t = t0; t < t1 && t < n; t++) this.grp[t] = gi; }, this);
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { const v = pos[i + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
    for (let t = 0; t < n; t++) {
      const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
      const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
      const ux = pos[b] - ax, uy = pos[b + 1] - ay, uz = pos[b + 2] - az, vx = pos[c] - ax, vy = pos[c + 1] - ay, vz = pos[c + 2] - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      this.nrm[t * 3] = nx; this.nrm[t * 3 + 1] = ny; this.nrm[t * 3 + 2] = nz;
      this.ctr[t * 3] = (ax + pos[b] + pos[c]) / 3; this.ctr[t * 3 + 1] = (ay + pos[b + 1] + pos[c + 1]) / 3; this.ctr[t * 3 + 2] = (az + pos[b + 2] + pos[c + 2]) / 3;
    }
    if (isFinite(mn[0])) {
      this.cible = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      this.rayon = Math.max(0.05, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2);
      this.etendue = Math.max(mx[0] - mn[0], mx[2] - mn[2], 0.3);
    }
    this.cadrer(); this.demander();
  }
  vider() { this.geo = null; this.n = 0; this.demander(); }
  cadrer() { this.dist = this.rayon / Math.sin(this.fov / 2) * 1.12; this.theta = 0.75; this.phi = 0.40; }
  demander() { if (this.raf) return; this.raf = requestAnimationFrame(() => { this.raf = 0; this.rendre(); }); }
  dimensionner() {
    const r = this.cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
    if (this.cv.width !== Math.round(W * dpr) || this.cv.height !== Math.round(H * dpr)) { this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr); }
    this.W = W; this.H = H; this.dpr = dpr;
  }
  teinte(gi, niv) {
    const cache = this.teintes[gi];
    if (!cache[niv]) { const c = this.cols[gi], k = niv / NIV; cache[niv] = 'rgb(' + Math.round(c[0] * k) + ',' + Math.round(c[1] * k) + ',' + Math.round(c[2] * k) + ')'; }
    return cache[niv];
  }
  rendre() {
    this.dimensionner();
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!this.geo) return;
    const cp = Math.cos(this.phi), sp = Math.sin(this.phi), ct = Math.cos(this.theta), st = Math.sin(this.theta);
    const c = this.cible, d = this.dist;
    const cam = [c[0] + d * cp * st, c[1] + d * sp, c[2] + d * cp * ct];
    let f = [c[0] - cam[0], c[1] - cam[1], c[2] - cam[2]];
    let l = Math.hypot(f[0], f[1], f[2]) || 1; f = [f[0] / l, f[1] / l, f[2] / l];
    let r = [-f[2], 0, f[0]]; l = Math.hypot(r[0], r[2]); r = l > 1e-6 ? [r[0] / l, 0, r[2] / l] : [1, 0, 0];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const F = (H / 2) / Math.tan(this.fov / 2), cx = W / 2, cy = H / 2, NEAR = 0.02;
    const pos = this.geo.pos, idx = this.geo.idx, px = this.px, py = this.py, pz = this.pz;
    for (let i = 0, j = 0; j < pos.length; i++, j += 3) {
      const dx = pos[j] - cam[0], dy = pos[j + 1] - cam[1], dz = pos[j + 2] - cam[2];
      let z = dx * f[0] + dy * f[1] + dz * f[2]; if (z < NEAR) z = NEAR;
      pz[i] = z; px[i] = cx + (dx * r[0] + dy * r[1] + dz * r[2]) * F / z; py[i] = cy - (dx * u[0] + dy * u[1] + dz * u[2]) * F / z;
    }
    this.grille(ctx, cam, r, u, f, F, cx, cy, NEAR);
    const nrm = this.nrm, ctr = this.ctr, prof = this.prof, ordre = this.ordre;
    let nv = 0;
    for (let t = 0; t < this.n; t++) {
      const k = t * 3, nx = nrm[k], ny = nrm[k + 1], nz = nrm[k + 2];
      if (nx * (cam[0] - ctr[k]) + ny * (cam[1] - ctr[k + 1]) + nz * (cam[2] - ctr[k + 2]) <= 0) continue;   /* face arrière */
      prof[t] = pz[idx[k]] + pz[idx[k + 1]] + pz[idx[k + 2]];
      ordre[nv++] = t;
    }
    const ord = ordre.subarray(0, nv);
    ord.sort(function (a, b) { return prof[b] - prof[a]; });
    ctx.lineWidth = 0.75; ctx.lineJoin = 'round';
    let cur = null;
    for (let q = 0; q < nv; q++) {
      const t = ord[q], k = t * 3, nx = nrm[k], ny = nrm[k + 1], nz = nrm[k + 2];
      let e = 0.34 + 0.56 * Math.max(0, nx * LUM[0] + ny * LUM[1] + nz * LUM[2]) + 0.10 * Math.max(0, -(nx * f[0] + ny * f[1] + nz * f[2]));
      const s = this.teinte(this.grp[t], Math.round(Math.min(1, e) * NIV));
      if (s !== cur) { if (cur) { ctx.fill(); ctx.stroke(); } ctx.beginPath(); ctx.fillStyle = s; ctx.strokeStyle = s; cur = s; }
      const a = idx[k], b = idx[k + 1], cc = idx[k + 2];
      ctx.moveTo(px[a], py[a]); ctx.lineTo(px[b], py[b]); ctx.lineTo(px[cc], py[cc]); ctx.closePath();
    }
    if (cur) { ctx.fill(); ctx.stroke(); }
  }
  grille(ctx, cam, r, u, f, F, cx, cy, NEAR) {
    const E0 = this.etendue || 1, pas = joli(E0 / 6), E = Math.ceil(E0 * 0.85 / pas) * pas + pas;
    const vue = (x, y, z) => { const dx = x - cam[0], dy = y - cam[1], dz = z - cam[2]; return [dx * r[0] + dy * r[1] + dz * r[2], dx * u[0] + dy * u[1] + dz * u[2], dx * f[0] + dy * f[1] + dz * f[2]]; };
    const seg = (a, b) => {
      let A = vue(a[0], a[1], a[2]), B = vue(b[0], b[1], b[2]);
      if (A[2] < NEAR && B[2] < NEAR) return;
      if (A[2] < NEAR) { const k = (NEAR - A[2]) / (B[2] - A[2]); A = [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, NEAR]; }
      if (B[2] < NEAR) { const k = (NEAR - B[2]) / (A[2] - B[2]); B = [B[0] + (A[0] - B[0]) * k, B[1] + (A[1] - B[1]) * k, NEAR]; }
      ctx.moveTo(cx + A[0] * F / A[2], cy - A[1] * F / A[2]); ctx.lineTo(cx + B[0] * F / B[2], cy - B[1] * F / B[2]);
    };
    const ox = this.cible[0], oz = this.cible[2], y = -0.0005;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(128,140,160,0.22)'; ctx.beginPath();
    for (let k = -E; k <= E + 1e-9; k += pas) { if (Math.abs(k) < 1e-9) continue; seg([ox - E, y, oz + k], [ox + E, y, oz + k]); seg([ox + k, y, oz - E], [ox + k, y, oz + E]); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(128,140,160,0.45)'; ctx.beginPath(); seg([ox - E, y, oz], [ox + E, y, oz]); seg([ox, y, oz - E], [ox, y, oz + E]); ctx.stroke();
  }
}

/* ----------------------------------------------------------------------------
   Panneau (§4.2) — DOM construit à la main, styles injectés une fois, déplaçable par son titre, fermable.
   ---------------------------------------------------------------------------- */
/* I2 : les enfants du corps ne rétrécissent plus (la ligne d'état n'est plus écrasée à 18 px sous l'aperçu), c'est le corps qui défile ;
   la ligne d'état est collée en haut du corps défilant (sticky, top 0, fond opaque du panneau, au-dessus de l'aperçu) : ses lignes et son
   lien restent visibles et cliquables quand on agit en bas (Modifier, Garder) ; le corps n'a pas de rembourrage en haut (son premier
   enfant porte la marge) : collée, la ligne d'état touche le haut du corps et rien ne défile au-dessus d'elle (un sticky s'arrête au
   bord du contenu, sous le rembourrage). I3 : max-height calc(100vh - 130px) à la place par défaut ; placer() la règle sur le haut du
   panneau (construirePanneau) pour que le bas reste au-dessus de la barre BETA d'app.html. J6 : pendant un travail (classe travail),
   la ligne d'état est une rangée souple — le texte à gauche, et, quand le travail s'annule (boucle, reprise), le petit bouton
   « Annuler » à droite ; le libellé du bouton vient de data-libelle par ::before, pour que le textContent de la ligne d'état reste le
   texte de l'état (lu par noter, montrerMeilleur, reprendre et par les bancs).
   O1 : pendant un appel (data-barre="1"), la rangée souple passe à la ligne : le titre à gauche (libellé par ::before, data-libelle, même
   raison que le bouton), « Annuler » à droite, la barre sur toute la largeur (sa base de 100 % force le passage à la ligne), puis le texte
   de l'état, seul nœud de texte de la ligne ; les order négatifs les placent avant ce texte, qui reste le premier enfant (chemin court de
   statut). min-height réserve le titre, la barre et deux lignes de détail : le passage d'une phase à l'autre, ou un tour de correction,
   ne fait pas sauter la ligne ; align-content empêche d'écarter les rangées dans cette réserve. Le fond de la barre est la couleur
   atténuée du thème à 30 %, lisible sur les thèmes clairs comme sombres ; le remplissage suit --am. */
const CSS = [
'.bpo-ia-pan{position:fixed;z-index:9000;width:440px;max-width:calc(100vw - 16px);max-height:calc(100vh - 130px);display:flex;flex-direction:column;background:var(--pn,#20242c);color:var(--tx,#e8e9ec);border:1px solid var(--ln,#343a45);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.45);font:12px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-sizing:border-box}',
'.bpo-ia-pan *{box-sizing:border-box}',
'.bpo-ia-titre{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--ln,#343a45);cursor:move;user-select:none;font-weight:600;font-size:13px;touch-action:none}',
'.bpo-ia-quota{margin-left:auto;font-weight:400;font-size:10px;color:var(--dm,#8b92a0);white-space:nowrap}',
'.bpo-ia-x{background:transparent;border:0;color:var(--dm,#8b92a0);font-size:14px;cursor:pointer;padding:2px 6px;border-radius:4px;line-height:1}',
'.bpo-ia-x:hover{background:var(--ln,#343a45);color:var(--tx,#e8e9ec)}',
'.bpo-ia-corps{overflow:auto;padding:0 10px 10px;display:flex;flex-direction:column;gap:8px}',
'.bpo-ia-corps>*{flex-shrink:0}',
'.bpo-ia-corps>:first-child{margin-top:10px}',
'.bpo-ia-pan textarea,.bpo-ia-pan input[type=text]{width:100%;background:var(--p2,#262b34);color:var(--tx,#e8e9ec);border:1px solid var(--ln,#343a45);border-radius:6px;padding:6px 8px;font:inherit;resize:vertical}',
'.bpo-ia-pan textarea{min-height:58px}',
'.bpo-ia-ligne{display:flex;gap:6px;align-items:center;flex-wrap:wrap}',
'.bpo-ia-ligne input[type=text]{flex:1;width:auto}',
'.bpo-ia-pan button{font:inherit;font-size:11px;padding:6px 10px;border-radius:6px;border:1px solid var(--ln,#343a45);background:var(--p2,#262b34);color:var(--tx,#e8e9ec);cursor:pointer}',
'.bpo-ia-pan button:hover{background:var(--ln,#343a45)}',
'.bpo-ia-pan button:disabled{opacity:.45;cursor:default}',
'.bpo-ia-pan button.bpo-ia-prim{background:var(--am,#ff8a3d);border-color:var(--am,#ff8a3d);color:#151515;font-weight:600}',
'.bpo-ia-pan button.bpo-ia-prim:hover{filter:brightness(1.08)}',
'.bpo-ia-etat{position:sticky;top:0;z-index:2;background:var(--pn,#20242c);padding:2px 0;min-height:18px;font-size:11px;color:var(--dm,#8b92a0);white-space:pre-wrap;word-break:break-word}',
'.bpo-ia-etat.erreur{color:#ff7a6b}.bpo-ia-etat.alerte{color:var(--am,#ff8a3d)}.bpo-ia-etat.ok{color:var(--tx,#e8e9ec)}',
'.bpo-ia-etat a{color:var(--am,#ff8a3d);text-decoration:underline;margin-left:6px}',
'.bpo-ia-etat.travail{display:flex;align-items:flex-start;justify-content:space-between}',
'.bpo-ia-pan .bpo-ia-etat button.bpo-ia-ann{flex-shrink:0;margin:0 0 0 8px;padding:1px 8px;font-size:10px;line-height:14px}',
'.bpo-ia-ann::before{content:attr(data-libelle)}',
'.bpo-ia-etat[data-barre="1"]{flex-wrap:wrap;align-content:flex-start;min-height:64px}',
'.bpo-ia-etat[data-barre="1"] .bpo-ia-ann{order:-2}',
'.bpo-ia-ptitre{order:-3;flex:1 1 0;min-width:0;font-size:12px;line-height:16px;font-weight:600;color:var(--tx,#e8e9ec)}',
'.bpo-ia-ptitre::before{content:attr(data-libelle)}',
'.bpo-ia-barre{order:-1;flex:0 0 100%;position:relative;height:6px;margin:3px 0;border-radius:3px;overflow:hidden}',
'.bpo-ia-barre::before{content:"";position:absolute;top:0;right:0;bottom:0;left:0;background:var(--dm,#8b92a0);opacity:.3}',
'.bpo-ia-plein{position:relative;width:0;height:100%;border-radius:3px;background:var(--am,#ff8a3d);transition:width 1s linear}',
'@media (prefers-reduced-motion:reduce){.bpo-ia-plein{transition:none}}',
'.bpo-ia-vue{width:100%;height:250px;display:block;background:var(--p2,#262b34);border:1px solid var(--ln,#343a45);border-radius:6px;cursor:grab;touch-action:none}',
'.bpo-ia-badge{display:none;font-size:10px;color:#151515;background:var(--am,#ff8a3d);border-radius:10px;padding:2px 8px;width:max-content;max-width:100%}',
'.bpo-ia-cotes{font-size:11px;color:var(--dm,#8b92a0)}',
'.bpo-ia-desig{font-size:11px;color:var(--dm,#8b92a0);margin-top:3px}',
'.bpo-ia-hyp{margin:0;padding-left:16px;font-size:11px;color:var(--dm,#8b92a0);max-height:110px;overflow:auto}',
'.bpo-ia-curs{display:grid;grid-template-columns:1fr 72px;gap:3px 8px;align-items:center;font-size:11px}',
'.bpo-ia-curs label{display:flex;flex-direction:column;gap:1px;color:var(--dm,#8b92a0)}',
'.bpo-ia-curs input[type=range]{width:100%;margin:0;accent-color:var(--am,#ff8a3d)}',
'.bpo-ia-val{text-align:right;color:var(--tx,#e8e9ec);font-variant-numeric:tabular-nums;align-self:end;padding-bottom:3px}',
'.bpo-ia-sec{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--dm,#8b92a0);margin-top:2px}',
'.bpo-ia-cache{display:none !important}'
].join('\n');

let P = null;   /* panneau courant : éléments + état */

/* D6a : translateDOM d'app.html mémorise la « valeur française » d'une infobulle ou d'un placeholder dans n.__fr_title /
   n.__fr_placeholder à la première vue, puis la réécrit à chaque passage de son observateur (tout changement de texte de la
   page le relance) — il remettait ainsi en français ce que le module avait traduit. On lui donne pour mémo le texte que le
   module vient de poser : il le cherche dans son dictionnaire, ne le trouve pas, et le laisse tel quel. */
function poserTitre(n, fr) { n.title = T(fr); n.__fr_title = n.title; }
function poserPlaceholder(n, fr) { n.placeholder = T(fr); n.__fr_placeholder = n.placeholder; }
function el(tag, attrs, enfants) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'text') e.textContent = attrs[k];
    else if (k === 'cls') e.className = attrs[k];
    else if (k === 'fr') { e.setAttribute('data-fr', attrs[k]); e.textContent = T(attrs[k]); }
    else if (k === 'frTitle') { e.setAttribute('data-fr-title', attrs[k]); poserTitre(e, attrs[k]); }
    else if (k === 'frPh') { e.setAttribute('data-fr-ph', attrs[k]); poserPlaceholder(e, attrs[k]); }
    else e.setAttribute(k, attrs[k]);
  }
  (enfants || []).forEach(function (c) { if (c) e.appendChild(c); });
  return e;
}
function retraduire() {
  if (!P) return;
  P.pan.querySelectorAll('[data-fr]').forEach(function (n) { n.textContent = T(n.getAttribute('data-fr')); });
  P.pan.querySelectorAll('[data-fr-title]').forEach(function (n) { poserTitre(n, n.getAttribute('data-fr-title')); });
  P.pan.querySelectorAll('[data-fr-ph]').forEach(function (n) { poserPlaceholder(n, n.getAttribute('data-fr-ph')); });
  /* J6 : le libellé du petit bouton « Annuler » de la ligne d'état (data-libelle, lu par ::before, et aria-label) */
  if (P.bAnnEtat) { P.bAnnEtat.setAttribute('data-libelle', T('Annuler')); P.bAnnEtat.setAttribute('aria-label', T('Annuler')); }
  libellesBarre();   /* O1 */
}
/* D10 : la description est plafonnée à 1 500 caractères (textarea maxlength, et ici pour ce qui n'en vient pas) */
function descriptionPropre(s) { return String(s == null ? '' : s).trim().slice(0, PLAFOND_DESCRIPTION); }
function injecterStyles() {
  if (document.getElementById('bpo-ia-styles')) return;
  const s = document.createElement('style'); s.id = 'bpo-ia-styles'; s.textContent = CSS;
  document.head.appendChild(s);
}
/* N1 : le conteneur de Ma bibliothèque (#libPanel, à défaut #saveList), ou null (page sans bibliothèque) */
function conteneurBibliotheque() {
  try { return document.getElementById(ID_BIBLIOTHEQUE) || document.getElementById(ID_LISTE); } catch (e) { return null; }
}
function construirePanneau() {
  injecterStyles();
  const hote = document.getElementById('app') || document.body;
  const pan = el('div', { cls: 'bpo-ia-pan', role: 'dialog' });
  const quota = el('span', { cls: 'bpo-ia-quota' });
  const x = el('button', { cls: 'bpo-ia-x', type: 'button', frTitle: 'Fermer', text: '✕' });
  const titre = el('div', { cls: 'bpo-ia-titre', frTitle: 'Glisser pour déplacer' }, [el('span', { text: '✨' }), el('span', { fr: 'Décrire un objet' }), quota, x]);
  const desc = el('textarea', { rows: '3', maxlength: String(PLAFOND_DESCRIPTION), frPh: 'Exemple : établi d’atelier 2,00 × 0,80 m, h 0,90, plateau hêtre, piètement acier bleu, étagère basse en tôle', frTitle: 'Décrivez l’objet en une ou deux phrases : type, cotes hors tout, matières, équipements.' });
  const bFab = el('button', { cls: 'bpo-ia-prim', type: 'button', fr: 'Fabriquer' });
  const bAnn = el('button', { type: 'button', fr: 'Annuler', cls: 'bpo-ia-cache' });
  const bRec = el('button', { type: 'button', fr: 'Recommencer' });
  const etat = el('div', { cls: 'bpo-ia-etat', 'aria-live': 'polite' });
  const bAnnEtat = el('button', { cls: 'bpo-ia-ann', type: 'button' });   /* J6 : posé dans la ligne d'état par statut() */
  /* O1 : le titre et la barre d'un appel, posés dans la ligne d'état par statut() ; role progressbar, sans aria-valuenow : la valeur est une estimation */
  const pTitre = el('div', { cls: 'bpo-ia-ptitre' });
  const pPlein = el('div', { cls: 'bpo-ia-plein' });
  const pBarre = el('div', { cls: 'bpo-ia-barre', role: 'progressbar' }, [pPlein]);
  const cv = el('canvas', { cls: 'bpo-ia-vue', frTitle: 'Orbite : glisser · zoom : molette · recadrer : double clic' });
  const badge = el('div', { cls: 'bpo-ia-badge' });
  const cotes = el('div', { cls: 'bpo-ia-cotes' });
  const nom = el('input', { type: 'text', frPh: 'Nom de l’objet', frTitle: 'Nom de l’objet' });
  const desig = el('div', { cls: 'bpo-ia-desig' });
  const hypT = el('div', { cls: 'bpo-ia-sec', fr: 'Hypothèses' });
  const hyp = el('ul', { cls: 'bpo-ia-hyp' });
  const cursT = el('div', { cls: 'bpo-ia-sec', fr: 'Réglages' });
  const curs = el('div', { cls: 'bpo-ia-curs' });
  const bDef = el('button', { type: 'button', fr: 'Valeurs par défaut' });
  const modif = el('input', { type: 'text', frPh: 'Modifier… (ex. : portes plus hautes, sans roulettes)' });
  const bMod = el('button', { type: 'button', fr: 'Modifier' });
  const bGar = el('button', { cls: 'bpo-ia-prim', type: 'button', fr: 'Garder dans Ma bibliothèque' });
  const zoneObjet = el('div', { cls: 'bpo-ia-objet bpo-ia-cache' }, [
    badge, cotes, nom, desig, hypT, hyp, cursT, curs, el('div', { cls: 'bpo-ia-ligne' }, [bDef]),
    el('div', { cls: 'bpo-ia-ligne' }, [modif, bMod]), el('div', { cls: 'bpo-ia-ligne' }, [bGar])
  ]);
  zoneObjet.style.display = 'flex'; zoneObjet.style.flexDirection = 'column'; zoneObjet.style.gap = '8px';
  const corps = el('div', { cls: 'bpo-ia-corps' }, [desc, el('div', { cls: 'bpo-ia-ligne' }, [bFab, bAnn, bRec]), etat, cv, zoneObjet]);
  pan.appendChild(titre); pan.appendChild(corps);
  hote.appendChild(pan);
  /* position : à droite sous la barre, mémorisée par navigateur (simple commodité, jamais indispensable). I3 : le bas du panneau ne passe
     jamais sous la barre BETA d'app.html — placer() règle la hauteur maximale sur le haut, calc(100vh - max(130, haut + 56) px), si bien
     que le bas reste à 56 px au moins du bas de la fenêtre même quand le panneau grandit après coup (objet affiché) ; le haut, lui, est
     borné pour que le titre reste au-dessus de cette limite (hautMax) */
  let posMem = null; try { posMem = JSON.parse(localStorage.getItem('bpo_ia_pos') || 'null'); } catch (e) { posMem = null; }
  const placer = function (t) { pan.style.top = t + 'px'; pan.style.maxHeight = 'calc(100vh - ' + Math.max(RESERVE_VERTICALE, t + MARGE_BAS) + 'px)'; };
  const hautMax = function (hFenetre) { return hFenetre - MARGE_BAS - (titre.offsetHeight || 40) - 2; };
  /* J2 : le panneau est toujours dans la fenêtre. Largeur min(440 px, innerWidth − 16 px) ; gauche dans [8, innerWidth − largeur − 8]
     (au moins 0) ; haut dans les bornes de placer() (0 … hautMax). recaler() pose ces bornes sur la position VOULUE (K1, L1, L2, ci-dessous) : à
     la construction, à l'ouverture (ouvrir) et sur l'événement resize de window (écouteur posé par ouvrir, retiré par fermer) — un
     panneau ouvert dans une fenêtre large ne s'ouvre plus hors de l'écran après un rétrécissement. Le glisser suit les mêmes bornes, et
     la position mémorisée est écrite bornée. La position affichée est lue sur le style posé ici (left, top en px : panneau fixe,
     offsetLeft et offsetTop identiques). */
  const largeur = function () { return Math.max(0, Math.min(LARGEUR_PANNEAU, window.innerWidth - 2 * MARGE_COTE)); };
  const gauchePermise = function (l) { return Math.max(0, Math.min(window.innerWidth - largeur() - MARGE_COTE, Math.max(MARGE_COTE, +l || 0))); };
  const hautPermis = function (t) { return Math.max(0, Math.min(hautMax(window.innerHeight), +t || 0)); };
  /* K1 : P.voulue garde la position VOULUE : le mémo lu s'il existe (tel quel, non borné) ; à défaut null, c'est-à-dire la place
     d'origine, ancrée à droite et recalculée à chaque recalage avec la largeur de fenêtre du moment (positionDefaut : gauche innerWidth
     − 440 − 24, au moins 8 ; haut 60) ; après un glisser, la position lâchée, celle que le mémo reçoit. recaler() borne cette position
     voulue, jamais la position déjà bornée : après un rétrécissement puis un ré-élargissement (fenêtre aimantée en demi-écran puis
     rendue), le panneau revient à sa place au lieu de rester sur Ma bibliothèque, ✕ et réouverture comprises. Un glisser fait pendant
     que la fenêtre est étroite donne la nouvelle position voulue.
     L1 : la position voulue a deux formes. {l, t} : la gauche (la forme d'avant L1, celle d'un mémo ancien) ; {dr, t} : ancrée à
     droite, dr étant l'écart au bord droit (gauche = innerWidth − largeur − dr, puis bornée). M1 : au lâcher, le panneau reste attaché
     au côté de la fenêtre dont il est le plus proche, avec son écart réel : sur la position lâchée et bornée, dr = innerWidth − (gauche
     + largeur) ; si dr ≤ gauche (égalité comprise, c'est-à-dire le milieu du panneau dans la moitié droite de la fenêtre ou sur son
     milieu), {dr, t}, sinon {l, t} ; l'écart RÉEL est gardé, si bien que le panneau ne saute pas au relâché. Poussé à droite, seulement
     baissé ou à peine dérivé de quelques pixels (vers la gauche comme vers la droite) dans une fenêtre en demi-écran, il revient à
     droite quand la fenêtre est rendue, et Ma bibliothèque reste libre ; lâché dans la moitié gauche (contre le bord gauche compris :
     c'est le choix de l'utilisateur), {l, t} ; sous 456 px de large, gauche et droite valent 8 : {dr, t}, comme la place d'origine
     (ECART_DROIT, 24 px, ne sert plus à cette décision). Le mémo est écrit sous la même forme ; voulueLue lit les deux — {dr, t} si dr
     et t sont des nombres finis, sinon {l, t} comme avant — et
     ignore tout autre mémo. Un geste sur le titre n'est un glisser que si le pointeur s'éloigne d'au moins SEUIL_GLISSER px (distance
     euclidienne) du point d'appui : en deçà, le panneau ne bouge pas, et ni la position voulue ni le mémo ne changent (un clic, même
     avec une dérive d'un ou deux pixels, ne fige pas la place bornée).
     L2 : recaler() borne aussi le haut AFFICHÉ à innerHeight − MARGE_BAS − HAUTEUR_UTILE : la hauteur maximale que pose placer()
     laisse alors au moins 250 px au panneau quand la fenêtre le permet, et un haut voulu trop bas pour la fenêtre (panneau glissé en
     bas d'un écran plus haut, mémo ancien) ne réduit plus le panneau à sa barre de titre. La position voulue n'est pas modifiée : le
     haut revient quand la fenêtre retrouve sa hauteur. Le glisser, lui, reste borné par hautMax seulement ; le haut lâché devient le
     haut voulu, que le recalage suivant (ouverture, resize) borne.
     M2 : cette borne ne descend jamais sous RESERVE_VERTICALE − MARGE_BAS (130 − 56 = 74 px), et non plus 0 : haut affiché =
     min(hautPermis(haut voulu), max(innerHeight − MARGE_BAS − HAUTEUR_UTILE, RESERVE_VERTICALE − MARGE_BAS)). Sous 380 px de haut, la
     réserve I3 plafonne déjà la hauteur maximale à innerHeight − 130 pour tout haut de 74 px au plus : monter plus haut ne gagnerait
     rien. Un haut voulu de 74 px au plus (la place d'origine, 60, comprise) est donc gardé à toute hauteur de fenêtre, dans la limite
     de hautMax, et le panneau ne monte jamais sur l'en-tête de l'app ; un haut voulu plus bas s'affiche au plus bas à
     max(innerHeight − 306, 74) px.
     N1 : le panneau ne recouvre jamais Ma bibliothèque quand la fenêtre a la place de le poser à côté. recaler() le garantit par la
     bibliothèque elle-même (bordBibliotheque, ci-dessous) : si son conteneur est affiché et situé dans la moitié gauche de la
     fenêtre, et si innerWidth − largeur − MARGE_COTE ≥ son bord droit + MARGE_COTE, la gauche AFFICHÉE vaut max(gauche calculée, bord
     droit + MARGE_COTE), puis gauchePermise ; sinon (fenêtre trop étroite, demi-écran) rien ne change et la position de l'utilisateur
     est gardée. La position voulue et le mémo ne sont jamais modifiés : la bibliothèque repliée, ou la fenêtre rendue, la place voulue
     revient au recalage suivant. Le glisser lui-même n'est pas contraint et rien ne saute au lâcher (finGlisse lit la gauche lâchée
     et n'appelle pas recaler) ; un panneau lâché sur la bibliothèque y reste jusqu'au recalage suivant (✕ et réouverture, resize de
     la fenêtre, ou la bibliothèque qui change de taille). Ce dernier déclencheur est un ResizeObserver sur le conteneur, posé par
     ouvrir et retiré par fermer comme l'écouteur resize : app.html émet bien un resize quand sa palette se replie ou se rouvre, mais
     tout de suite puis 300 ms après le clic, pendant la transition de grille de 0,28 s qui l'ouvre — vu au banc, le panneau restait
     sur la bibliothèque rouverte ; l'observateur suit la palette jusqu'à sa largeur finale. La règle d'ancrage M1 et le seuil de 4 px
     ne changent pas. */
  /* N1 : bord droit (getBoundingClientRect) du conteneur VISIBLE de Ma bibliothèque — #libPanel, à défaut #saveList (ID_BIBLIOTHEQUE,
     ID_LISTE) —, ou null : aucune contrainte. null si le conteneur n'est pas trouvé (page sans bibliothèque), s'il n'est pas affiché
     (largeur 0 : palette repliée par ✕ ou par sa languette, ancrée ou flottante) ou si son milieu n'est pas dans la moitié gauche de la
     fenêtre (palette flottante posée à droite ; disposition portrait d'app.html, où elle prend toute la largeur). */
  const bordBibliotheque = function () {
    const b = conteneurBibliotheque();
    let r = null;
    if (!b || typeof b.getBoundingClientRect !== 'function') return null;   /* conteneur introuvable : aucune contrainte */
    try { r = b.getBoundingClientRect(); } catch (e) { r = null; }
    if (!r || !(r.width > 0)) return null;                                  /* masquée : aucune contrainte */
    const g = +r.left, d = (typeof r.right === 'number') ? r.right : g + r.width;
    if (!Number.isFinite(g) || !Number.isFinite(d) || !(g + d < window.innerWidth)) return null;   /* milieu hors de la moitié gauche */
    return d;
  };
  const positionDefaut = function () { return { l: Math.max(MARGE_COTE, window.innerWidth - LARGEUR_PANNEAU - ECART_DROIT), t: 60 }; };
  const voulueLue = (posMem && Number.isFinite(posMem.dr) && Number.isFinite(posMem.t)) ? { dr: posMem.dr, t: posMem.t }   /* L1 */
    : (posMem && isFinite(posMem.l) && isFinite(posMem.t)) ? { l: +posMem.l, t: +posMem.t } : null;
  let ici = null;   /* le P de ce panneau, posé plus bas */
  const recaler = function () {
    const v = (ici && ici.voulue) || positionDefaut();
    pan.style.width = largeur() + 'px';
    let l = (typeof v.dr === 'number') ? window.innerWidth - largeur() - v.dr : v.l;   /* L1 : ancrée à droite, ou la gauche */
    /* N1 : la place existe à droite de Ma bibliothèque → la gauche affichée n'y passe pas dessous ; sinon rien ne change */
    const bib = bordBibliotheque();
    if (bib !== null && window.innerWidth - largeur() - MARGE_COTE >= bib + MARGE_COTE) l = Math.max(+l || 0, bib + MARGE_COTE);
    pan.style.left = gauchePermise(l) + 'px';
    /* L2 : 250 px de hauteur au moins ; M2 : la borne ne descend pas sous RESERVE_VERTICALE − MARGE_BAS (74), jamais sur l'en-tête */
    placer(Math.min(hautPermis(v.t), Math.max(window.innerHeight - MARGE_BAS - HAUTEUR_UTILE, RESERVE_VERTICALE - MARGE_BAS)));
  };
  let glisse = null;
  titre.addEventListener('pointerdown', (e) => {
    if (e.target && e.target.closest && e.target.closest('button')) return;
    glisse = { dx: e.clientX - parseFloat(pan.style.left), dy: e.clientY - parseFloat(pan.style.top), x: e.clientX, y: e.clientY, bouge: false };
    try { titre.setPointerCapture(e.pointerId); } catch (er) { /* capture impossible */ }
  });
  titre.addEventListener('pointermove', (e) => {
    if (!glisse) return;
    if (!glisse.bouge) {
      /* L1 : tant que le pointeur reste à moins de SEUIL_GLISSER px du point d'appui, ce n'est pas un glisser : le panneau ne bouge pas */
      if (!(Math.hypot(e.clientX - glisse.x, e.clientY - glisse.y) >= SEUIL_GLISSER)) return;
      glisse.bouge = true;   /* K1, L1 : le pointeur s'est éloigné d'au moins 4 px, c'est un glisser, jusqu'au relâché */
    }
    const l = gauchePermise(e.clientX - glisse.dx), t = Math.max(0, Math.min(hautMax(window.innerHeight), e.clientY - glisse.dy));
    pan.style.left = l + 'px'; placer(t);   /* I3 : le bas borné à 100vh - 56 px par la hauteur maximale ; J2 : la gauche dans la fenêtre */
  });
  const finGlisse = () => {
    if (!glisse) return;
    const bouge = glisse.bouge;
    glisse = null;
    if (!bouge) return;   /* K1, L1 : un appui sans déplacement, ou une dérive de moins de 4 px, ne change ni la position voulue ni le mémo */
    /* J2 : la position mémorisée est écrite bornée ; K1 : cette position lâchée devient la position voulue ; L1, M1 : elle reste attachée
       au côté de la fenêtre dont elle est le plus proche, avec son écart réel — {dr, t} si l'écart au bord droit est au plus la gauche
       (égalité comprise), sinon {l, t} — et le mémo prend la même forme */
    const l = gauchePermise(parseFloat(pan.style.left)), t = hautPermis(parseFloat(pan.style.top)), dr = window.innerWidth - (l + largeur());
    const v = dr <= l ? { dr: dr, t: t } : { l: l, t: t };
    if (ici) ici.voulue = v;
    try { localStorage.setItem('bpo_ia_pos', JSON.stringify(v)); } catch (e) { /* stockage indisponible */ }
  };
  titre.addEventListener('pointerup', finGlisse); titre.addEventListener('pointercancel', finGlisse);
  const vue = new Vue(cv);
  P = ici = { pan, titre, quota, desc, bFab, bAnn, bRec, etat, bAnnEtat, pTitre, pBarre, pPlein, avance: null, cv, badge, cotes, nom, desig, hyp, curs, bDef, modif, bMod, bGar, zoneObjet, vue,
        bac: new Bac(), E: etatNeuf(), minuterie: 0, verrou: false, garde: 0, curseurs: {},
        recaler: recaler, voulue: voulueLue, redimPose: false, obsBib: null, surRedim: function () { if (P && P.pan === pan && pan.style.display !== 'none') recaler(); } };
  recaler();   /* J2, K1 : la place de construction est la position voulue, bornée */
  x.onclick = function () { fermer(); };
  bFab.onclick = function () { fabriquer(); };
  bAnn.onclick = function () { annuler(); };
  bAnnEtat.onclick = function () { annuler(); };   /* J6 : même action que le bouton « Annuler » */
  bRec.onclick = function () { recommencer(); };
  bDef.onclick = function () { valeursParDefaut(); };
  bMod.onclick = function () { modifier(); };
  modif.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); modifier(); } });
  desc.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); fabriquer(); } });
  bGar.onclick = function () { garder(); };
  try { document.addEventListener('bpo-lang', retraduire); } catch (e) { /* sans évènement de langue */ }
  if (window.ResizeObserver) { try { new ResizeObserver(function () { vue.demander(); }).observe(cv); } catch (e) { /* pas d'observateur */ } }
  return P;
}
function etatNeuf() {
  /* I1 : paramsGeo = réglages qui ont construit la géométrie affichée ; attente = reconstructions de curseur en cours dans le bac ;
     differe = anti-rebond d'un curseur en cours. I4 : retablir = remise de l'objet affiché (carte, session, description) quand
     « Fabriquer » ne produit rien. I5 : tentative = { description, session } de la dernière création ratée */
  return { session: null, description: '', code: null, meta: null, geo: null, params: {}, paramsGeo: null, attente: 0, differe: false,
           modele: null, quota: null, cfg: null, enCours: null, repli: null, retablir: null, tentative: null, jeton: 0, defauts: false };
}

/* ---- affichage ---- */
/* F10 : le libellé du lien suit l'erreur (« Créer un compte » pour le 403 anonyme) ; « S'abonner » à défaut.
   J6 : pendant un travail annulable — classe travail ET verrou (boucle, reprise : le bouton « Annuler » du haut est montré) — la ligne
   d'état porte le petit bouton « Annuler » (P.bAnnEtat, même action). Quand il y est déjà, seul le nœud texte change : le bouton reste
   le même nœud, si bien qu'un clic commencé pendant une mise à jour du compteur (au plus une fois par seconde, D8, O1) n'est pas perdu (un nœud
   retiré entre l'appui et le relâché ne reçoit pas le clic). Hors d'un travail annulable, la ligne est réécrite et le bouton s'en va.
   O1 : tout état qui n'est pas un travail met fin à la barre d'un appel (fin, erreur, annulation) ; pendant un appel, le titre et la
   barre suivent le bouton dans la ligne, et le chemin court les laisse en place. Le chemin court pose aussi t0.__fr, le mémo de
   translateDOM (comme __fr_title en D6a) : sans lui, hors du français, translateDOM réécrit dans ce nœud la première valeur qu'il y a vue. */
function statut(texte, type, lien, libelle) {
  if (!P) return;
  if (P.avance && type !== 'travail') retirerBarre();
  const ann = P.bAnnEtat, annulable = type === 'travail' && !!P.verrou && !lien, apres = P.avance ? P.pTitre : null;
  P.etat.className = 'bpo-ia-etat' + (type ? ' ' + type : '');
  const t0 = P.etat.firstChild;
  if (annulable && ann && ann.parentNode === P.etat && t0 && t0.nodeType === 3 && t0.nextSibling === ann && ann.nextSibling === apres && texte) {
    t0.nodeValue = texte;
    t0.__fr = texte;
    return;
  }
  P.etat.textContent = texte || '';
  if (lien) { const a = el('a', { href: lien, target: '_blank', rel: 'noopener', fr: libelle || 'S’abonner' }); P.etat.appendChild(a); }
  if (annulable && ann) { ann.setAttribute('data-libelle', T('Annuler')); ann.setAttribute('aria-label', T('Annuler')); P.etat.appendChild(ann); }
  if (P.avance) { P.etat.appendChild(P.pTitre); P.etat.appendChild(P.pBarre); }
}
/* ---- barre de progression d'un appel (O1) ----
   Une ESTIMATION : l'avancement réel de la réflexion est inconnu (environ 90 % de l'appel, sans aucun delta de texte). Jamais de pourcentage
   affiché ni de durée promise ; la valeur ne recule jamais dans un tour et ne dépasse jamais BARRE_CONTROLE : c'est le retrait de la barre qui
   dit la fin réelle. Connexion : 3 %. Réflexion : barreReflexion, de 3 % vers 70 % sans l'atteindre. Écriture : barreEcriture, de la valeur
   atteinte à 92 %. Contrôle et construction : 96 %. P.avance est l'état de la barre du tour en cours (null : pas d'appel) ; boucle() en lance
   une à chaque tour (lancerBarre) : la largeur repart du début sans remonter à reculons, et l'ancienne minuterie est arrêtée. Tout état
   qui n'est pas un travail (statut) et la fin du verrou (verrouiller) la retirent : fin, erreur, « Annuler », fermeture du panneau, Recommencer.
   Temps et valeurs se calculent sur l'horloge, jamais en comptant les tics : un onglet en arrière-plan ralentit les minuteries, pas la lecture.
   aria-live est coupé pendant la barre (le temps change chaque seconde, un lecteur d'écran n'arrêterait pas de parler) : la barre porte la
   ligne de détail dans aria-valuetext, et aria-live revient avant le texte qui dit l'issue. */
/* « 0 s », « 59 s », « 1 min 00 s », « 61 min 05 s » : symboles d'unité, les mêmes dans toutes les langues */
function dureeTexte(ms) {
  const s = (Number.isFinite(+ms) && +ms > 0) ? Math.floor(+ms / 1000) : 0;
  return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s';
}
function barreReflexion(ms) {
  const t = (Number.isFinite(+ms) && +ms > 0) ? +ms / 1000 : 0;
  return Math.min(BARRE_REFLEXION - 0.01, BARRE_DEPART + (BARRE_REFLEXION - BARRE_DEPART) * (1 - Math.exp(-t / DUREE_REFLEXION_S)));
}
function barreEcriture(origine, n) {
  const o = Math.min(BARRE_ECRITURE, Math.max(BARRE_DEPART, +origine || 0));
  return o + (BARRE_ECRITURE - o) * Math.min(1, Math.max(0, +n || 0) / CARACTERES_ECRITURE);
}
function libellesBarre() {
  if (!P || !P.pTitre) return;
  const t = T('BPO crée votre objet paramétrique');
  P.pTitre.setAttribute('data-libelle', t); P.pBarre.setAttribute('aria-label', t);
}
function lancerBarre() {
  const avant = P.avance;
  if (avant) { clearTimeout(avant.minuterie); avant.phase = 'fini'; }
  const a = { depart: performance.now(), phase: 'connexion', valeur: BARRE_DEPART, origine: BARRE_DEPART, minuterie: 0 };
  P.avance = a;
  libellesBarre();
  P.etat.setAttribute('data-barre', '1'); P.etat.setAttribute('aria-live', 'off');
  P.pPlein.style.transition = 'none';
  P.pPlein.style.width = BARRE_DEPART + '%';
  if (avant) void P.pPlein.offsetWidth;   /* barre déjà affichée (tour de correction) : la largeur saute au départ, sans animation à reculons */
  P.pPlein.style.transition = '';
  return a;
}
function poserBarre(a, v) {
  if (!P || P.avance !== a) return;
  const n = Math.min(BARRE_CONTROLE, Math.max(a.valeur, v));
  if (n === a.valeur) return;
  a.valeur = n;
  P.pPlein.style.width = n.toFixed(2) + '%';
}
function retirerBarre() {
  if (!P || !P.avance) return;
  clearTimeout(P.avance.minuterie);
  P.avance.phase = 'fini';
  P.avance = null;
  if (P.pTitre.parentNode === P.etat) P.etat.removeChild(P.pTitre);
  if (P.pBarre.parentNode === P.etat) P.etat.removeChild(P.pBarre);
  P.etat.setAttribute('data-barre', '0'); P.etat.setAttribute('aria-live', 'polite');
}
/* J6 : le petit bouton « Annuler » quitte la ligne d'état dès que rien n'est plus annulable (fin du verrou) */
function retirerAnnulerEtat() {
  if (P && P.bAnnEtat && P.bAnnEtat.parentNode === P.etat) P.etat.removeChild(P.bAnnEtat);
}
/* texte : affiché à la place de e.message (H1 : appels_session sur un tour corriger ; H5 : la note F11 au-dessus) ; lien et libellé suivent e */
function afficherErreur(e, texte) {
  const msg = texte != null ? texte : ((e && e.message) || String(e));
  statut(msg, 'erreur', e && e.lien ? e.lien : null, e && e.libelle ? e.libelle : null);
}
function verrouiller(on) {
  if (!P) return;
  P.verrou = !!on;
  P.bAnn.classList.toggle('bpo-ia-cache', !on);
  if (!on) { retirerBarre(); retirerAnnulerEtat(); }   /* O1, J6 */
  majBoutons();
}
/* J1 : l'objet affiché ne change pas pendant une boucle ou une reprise (verrou), NI pendant un « Garder » (P.garde) : Fabriquer, Modifier,
   « Valeurs par défaut » et les curseurs sont inactifs dans les deux cas ; Recommencer l'est pendant un « Garder » seulement (pendant une
   boucle, il l'arrête). Chaque fonction garde aussi sa propre défense en tête (fabriquer, modifier, recommencer, valeursParDefaut, le
   curseur, la reprise d'ouvrir) : un raccourci clavier ou un appel direct ne passe pas plus qu'un clic. */
function occupe() { return !!P && (!!P.verrou || P.garde > 0); }
function majBoutons() {
  if (!P) return;
  const on = occupe();
  P.bFab.disabled = on; P.bMod.disabled = on; P.bDef.disabled = on; P.bRec.disabled = P.garde > 0;
  P.curs.querySelectorAll('input').forEach(function (i) { i.disabled = on; });
  majGarder();
}
/* I1 (b) : « Garder » n'est actif que pour une géométrie affichée dont les réglages sont connus (E.paramsGeo) : ni verrou (boucle,
   reprise), ni « Garder » en cours, ni réglage de curseur qui attend sa géométrie (anti-rebond, ou reconstruction dans le bac) */
function majGarder() {
  if (!P) return;
  const E = P.E;
  P.bGar.disabled = !!P.verrou || !E.geo || !!E.enCours || P.garde > 0 || E.attente > 0 || !!E.differe;
}
function majQuota(q) {
  if (!P || !q || q.plafond == null) return;
  P.E.quota = q;
  P.quota.textContent = fmt(T('Quota : {0}/{1} objets sur {2} jours'), q.utilises == null ? '?' : q.utilises, q.plafond, fenetreJours(q, 0));   /* E18 */
}
function texteDefauts(rapport) {
  const parts = [];
  if (rapport.coplanaires && rapport.coplanaires.length) parts.push(fmt(T('{0} faces confondues'), rapport.coplanaires.length));
  if (rapport.degeneres) parts.push(fmt(T('{0} triangles dégénérés'), rapport.degeneres));
  if (rapport.volumesNegatifs && rapport.volumesNegatifs.length) parts.push(fmt(T('{0} pièces à normales rentrantes'), rapport.volumesNegatifs.length));
  return parts.join(', ');
}
function afficherGeo(geo) {
  const E = P.E; E.geo = geo;
  P.vue.charger(geo);
  const d = geo.dims || {};
  P.cotes.textContent = T('Cotes hors tout') + ' : ' + nombre(d.L, 2) + ' × ' + nombre(d.P, 2) + ' × ' + nombre(d.H, 2) + ' m';
  const rap = geo.rapport || {};
  E.defauts = rap.ok === false;
  if (E.defauts) { P.badge.textContent = fmt(T('contrôle : {0}'), texteDefauts(rap)); P.badge.style.display = 'inline-block'; }
  else P.badge.style.display = 'none';
  statut(fmt(T('Prêt : {0} triangles, {1} × {2} × {3} m'), nombre(geo.triangles, 0), nombre(d.L, 2), nombre(d.P, 2), nombre(d.H, 2)), E.defauts ? 'alerte' : 'ok');
  majGarder();
}
function pasDe(p) {
  const etendue = Math.abs(p.max - p.min) || 1;
  const entiers = [p.min, p.max, p.def].every(function (v) { return Number.isInteger(v); });
  if (entiers && etendue <= 1000) return 1;
  const brut = etendue / 100, pow = Math.pow(10, Math.floor(Math.log10(brut))), m = brut / pow;
  return Math.max(0.001, (m >= 5 ? 5 : m >= 2 ? 2 : 1) * pow);
}
function decimalesDe(pas) { return Math.max(0, Math.min(3, -Math.floor(Math.log10(pas) + 1e-9))); }
/* valeur d'un réglage pour son curseur : un nombre (ou un texte numérique, comme le lit le HARNAIS) borné à [min, max], sinon la valeur
   par défaut — le curseur montre ce que la construction a reçu */
function valeurCurseur(p, x) {
  const n = (typeof x === 'number' || (typeof x === 'string' && x !== '')) ? +x : NaN;
  return isFinite(n) ? Math.min(p.max, Math.max(p.min, n)) : p.def;
}
function texteCurseur(p, dec, v) { return nombre(v, dec) + (p.unit ? ' ' + p.unit : ''); }
function afficherMeta(meta, valeurs) {
  const E = P.E; E.meta = meta;
  P.nom.value = meta.nom || '';
  P.desig.textContent = meta.designation || '';
  P.hyp.innerHTML = '';
  (meta.hypotheses || []).forEach(function (h) { P.hyp.appendChild(el('li', { text: h })); });
  P.hyp.style.display = (meta.hypotheses || []).length ? '' : 'none';
  P.hyp.previousSibling.style.display = P.hyp.style.display;
  P.curs.innerHTML = '';
  const params = meta.params || {}, cles = Object.keys(params);
  E.params = {}; P.curseurs = {};
  cles.forEach(function (k) {
    const p = params[k], pas = pasDe(p), dec = decimalesDe(pas);
    const v = valeurCurseur(p, valeurs ? valeurs[k] : undefined);
    E.params[k] = v;
    const range = el('input', { type: 'range', min: String(p.min), max: String(p.max), step: String(pas), value: String(v) });
    range.disabled = occupe();   /* J1 */
    const val = el('div', { cls: 'bpo-ia-val', text: texteCurseur(p, dec, v) });
    const lab = el('label', {}, [el('span', { text: p.label }), range]);
    P.curseurs[k] = { range: range, val: val, p: p, dec: dec };   /* I1 (b) : de quoi ramener le curseur à la géométrie affichée */
    range.addEventListener('input', function () {
      /* J1 : pendant une boucle, une reprise ou un « Garder », le curseur revient à sa valeur et rien ne se reconstruit */
      if (occupe() || P.E !== E) { range.value = String(E.params[k]); return; }
      const nv = +range.value; E.params[k] = nv; val.textContent = texteCurseur(p, dec, nv);
      reglerBientot();
    });
    P.curs.appendChild(lab); P.curs.appendChild(val);
  });
  const avec = cles.length > 0;
  P.curs.style.display = avec ? '' : 'none'; P.curs.previousSibling.style.display = avec ? '' : 'none'; P.bDef.parentNode.style.display = avec ? '' : 'none';
  P.zoneObjet.classList.remove('bpo-ia-cache');
}
function appliquer(code, resultat, valeurs) {
  P.E.code = code;
  /* H1 : le meilleur état d'une boucle peut venir d'un tour antérieur au dernier code chargé dans le bac : le bac retient le code
     affiché, pour que les réglages reconstruisent CET objet (rechargé au prochain construire) et que « Garder » écrive le code de
     la géométrie affichée */
  P.bac.retenir(code);
  /* I1 (a) : la recette que « Garder » écrira est celle de la géométrie affichée : les réglages qui l'ont construite (rendus par
     construireCode ; à défaut, les valeurs données, sinon les valeurs par défaut du code) */
  P.E.paramsGeo = Object.assign({}, resultat.params || valeurs || valeursDefaut(resultat.meta && resultat.meta.params));
  afficherMeta(resultat.meta, valeurs);
  afficherGeo(resultat.geo);
}
/* I1 (b) : dès qu'un curseur bouge, « Garder » attend la géométrie de ces réglages (anti-rebond, puis reconstruction dans le bac) */
function reglerBientot() {
  const E = P.E;
  clearTimeout(P.minuterie);
  E.differe = true; majGarder();
  P.minuterie = setTimeout(function () { E.differe = false; if (P && P.E === E) regler(); }, 120);   /* anti-rebond 120 ms */
}
/* I1 : une reconstruction réussie pose E.paramsGeo = la copie des réglages envoyée ; une reconstruction qui échoue (exception du code,
   géométrie trop lourde, délai) ramène E.params et les curseurs à E.paramsGeo — l'état dit l'erreur puis « Réglages ramenés à la
   dernière géométrie construite. » — et « Garder » redevient actif : recette et maillage concordent. Tant qu'une autre reconstruction
   attend, ou qu'un curseur bouge encore, c'est elle qui décide ; sans géométrie affichée (reprise dont rien ne s'est construit),
   l'erreur seule. */
function regler() {
  if (!P) return;
  const E = P.E;
  if (!E.code || E.enCours) { majGarder(); return; }
  const jeton = E.jeton, params = Object.assign({}, E.params);
  E.attente = (E.attente || 0) + 1; majGarder();
  statut(T('Construction…'), 'travail');
  const rendu = function () { E.attente = Math.max(0, E.attente - 1); return !!P && P.E === E; };
  P.bac.construire(params, true).then(function (geo) {
    if (!rendu()) return;
    if (E.jeton !== jeton) { majGarder(); return; }
    E.paramsGeo = params;
    afficherGeo(geo);
  }, function (e) {
    if (!rendu()) return;
    if (E.jeton !== jeton || (e && e.code === 'remplace')) { majGarder(); return; }
    if (E.geo && !E.attente && !E.differe) {
      ramenerReglages();
      afficherErreur(e, ((e && e.message) || String(e)) + '\n' + T('Réglages ramenés à la dernière géométrie construite.'));
    } else afficherErreur(e);
    majGarder();
  });
}
/* I1 (b) : E.params et les curseurs reviennent aux réglages de la géométrie affichée (E.paramsGeo) */
function ramenerReglages() {
  const E = P.E, g = E.paramsGeo || {};
  Object.keys(P.curseurs || {}).forEach(function (k) {
    const c = P.curseurs[k], v = valeurCurseur(c.p, g[k]);
    E.params[k] = v; c.range.value = String(v); c.val.textContent = texteCurseur(c.p, c.dec, v);
  });
}
function valeursParDefaut() {
  if (!P || !P.E.meta || occupe()) return;   /* J1 */
  const params = P.E.meta.params || {};
  P.curs.querySelectorAll('input[type=range]').forEach(function (r, i) {
    const k = Object.keys(params)[i]; if (!k) return;
    r.value = String(params[k].def); r.dispatchEvent(new Event('input'));
  });
}
function valeursDefaut(params) { const o = {}; for (const k in (params || {})) o[k] = params[k].def; return o; }
/* J5 : le champ reglages d'une demande « Modifier… » = les réglages de la géométrie affichée (E.paramsGeo), en objet de nombres ; le
   serveur les donne au modèle, qui les garde comme valeurs par défaut (def) des params du même nom, dans leurs bornes, sauf si la
   modification demandée les change ; le code modifié se construit ensuite à ses valeurs par défaut. Seuls passent les réglages que le
   serveur accepte (§3.1 : 40 au plus, nom NOM_REGLAGE, nombre fini de valeur absolue ≤ 1e6 ; un texte numérique, tel que le lit le
   HARNAIS, devient un nombre) : un réglage hors de ces règles est laissé de côté — le modèle garde alors la valeur par défaut de son
   code — plutôt que de faire refuser toute la demande (400). Rien à envoyer → null (champ absent). K3 : NOM_REGLAGE est l'expression
   Unicode du serveur, si bien qu'un réglage accentué (« épaisseur », « écartement », « diamètre ») part comme les autres.
   L3 : la règle est « lettre ou _ en tête, puis lettres, marques, chiffres ou _, 40 points de code au plus » (une lettre hors du plan
   de base compte pour un point de code, soit deux unités UTF-16). Sont donc écartés, par exemple, un espace, un tiret, un « = », un
   « $ », un point, un chiffre ou une marque en tête, les séparateurs de ligne (\n, \r, U+2028, U+2029, U+0085) et les caractères de
   FORMAT invisibles (U+200B, U+FEFF, U+202E…) ; les marques et les remplisseurs invisibles que la règle admet (U+034F, U+3164…) ne
   peuvent casser aucune ligne. Règle inchangée : c'est celle du serveur. */
function reglagesPour(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {};
  let n = 0;
  Object.keys(p).forEach(function (k) {
    let v = p[k];
    if (typeof v === 'string' && v.trim() !== '') v = +v;
    if (n >= PLAFOND_REGLAGES || k === '__proto__' || !NOM_REGLAGE.test(k) || typeof v !== 'number' || !isFinite(v) || Math.abs(v) > BORNE_REGLAGE) return;
    out[k] = v; n++;
  });
  return n ? out : null;
}

/* ---- bac à sable côté page ---- */
async function construireCode(code, params) {
  const meta = await P.bac.charger(code);
  const reglages = params ? Object.assign({}, params) : valeursDefaut(meta.params);   /* I1 (a) : les réglages de cette géométrie */
  const geo = await P.bac.construire(reglages);
  return { meta: meta, geo: geo, params: reglages };
}
function rapportPour(erreur, resultat) {
  const r = { erreur: erreur ? String(erreur).slice(0, 800) : null, controle: null, bbox: null, triangles: 0 };
  if (resultat && resultat.geo) {
    const c = resultat.geo.rapport || {}, d = resultat.geo.dims || {};
    r.controle = { ok: !!c.ok, triangles: c.triangles, sommets: c.sommets, degeneres: c.degeneres, volumesNegatifs: (c.volumesNegatifs || []).slice(0, 20), coplanaires: (c.coplanaires || []).slice(0, 25), bbox: c.bbox };
    r.bbox = { L: +(+d.L).toFixed(4), P: +(+d.P).toFixed(4), H: +(+d.H).toFixed(4) };
    r.triangles = resultat.geo.triangles || 0;
  }
  /* plafond serveur : rapport sérialisé ≤ 6 000 caractères */
  while (JSON.stringify(r).length > 5800 && r.controle && r.controle.coplanaires.length > 2) r.controle.coplanaires.length = Math.floor(r.controle.coplanaires.length / 2);
  return r;
}
function nbDefauts(resultat) {
  const c = (resultat && resultat.geo && resultat.geo.rapport) || {};
  return ((c.coplanaires || []).length) + (c.degeneres || 0) + ((c.volumesNegatifs || []).length);
}

/* ---- boucle de fabrication (§4.4) ----
   H1 : quand la REQUÊTE d'un tour corriger n'aboutit pas (503 sature, 429 appels ou appels_session, erreur du modèle, flux, réseau,
   délai du serveur, fichier trop long…) alors qu'un code de cette boucle s'est déjà construit avec des défauts (meilleur), ce code est
   affiché — l'objet produit n'est plus perdu — avec deux lignes d'alerte sous « Prêt : … » : la cause, puis le message de l'erreur (son
   lien conservé) ; la session ne change pas. Arrêtée par l'utilisateur pendant un tour corriger (« Annuler », fermeture du panneau), la
   boucle montre de même son meilleur état : annuler() appelle E.repli. boucle() rend true quand un objet a été appliqué pendant cet appel
   (succès, meilleur état après le 3e tour, meilleur état après une correction qui n'a pas abouti), false sinon.
   I1 (c) : en sortie SANS objet appliqué alors qu'un objet est au panneau (E.code), le bac retient le code affiché : les curseurs
   reconstruisent cet objet, pas le dernier code chargé par la boucle (annuler() fait de même quand il n'y a rien à montrer). I4 : un
   objet appliqué efface E.retablir (et, en creer, la tentative de I5) ; sinon E.retablir, posé par fabriquer(), rattache l'objet
   affiché à sa carte. I6 : pendant un tour de correction, « Correction n/2… » reste en tête de la progression, sous la note F11 s'il y
   en a une. I7 : une erreur du flux qui porte le quota met le titre à jour. O1 : chaque tour a sa barre, et sa réflexion chronométrée depuis
   SON départ (voir « barre de progression ») ; la minuterie de réflexion s'arrête au premier delta et dès que la requête du tour se termine. */
async function boucle(mode, extra) {
  const E = P.E;
  if (E.enCours) return false;
  /* E18 : sans AbortController (moteurs anciens : Chromium 64 de la palette SketchUp 2021), la boucle tourne quand même,
     sans annulation du fetch en cours */
  const ctrl = (typeof AbortController === 'function') ? new AbortController() : { signal: undefined, abort: function () {} };
  E.enCours = ctrl;
  if (mode !== 'creer') E.retablir = null;   /* I4 : seul « Fabriquer » détache l'objet affiché de sa carte (et pose de quoi l'y remettre) */
  const jeton = ++E.jeton;
  const vivant = function () { return P && P.E === E && E.jeton === jeton; };
  verrouiller(true);
  let corps = { session: E.session, mode: mode, description: E.description, lang: langue() };
  if (mode !== 'creer') corps.code = E.code || '';
  if (mode === 'modifier') {
    corps.instruction = extra.instruction;
    /* J5 : les réglages de la géométrie affichée partent avec la demande (le rejeu F11 garde le même corps) ; jamais en creer ni corriger */
    const reglages = reglagesPour(E.paramsGeo);
    if (reglages) corps.reglages = reglages;
  }
  let corrections = 0, meilleur = null, derniereErreur = null, rejoue = false, note = '', etiquette = '', applique = false;
  /* F11 : pendant le tour rejoué sous une session neuve, la note reste en première ligne de l'état, au-dessus de la progression puis
     de « Prêt : … » (la ligne d'état est en pre-wrap) ; H5 : au-dessus d'une erreur aussi, et de son lien */
  const avecNote = function (texte) { return note ? note + '\n' + texte : texte; };
  /* I6 : pendant un tour de correction, son étiquette « Correction n/2… » reste en tête de la progression (sous la note F11) */
  const progres = function (texte) {
    statut(avecNote(etiquette ? etiquette + '\n' + texte : texte), 'travail');
    if (P && P.avance) P.pBarre.setAttribute('aria-valuetext', etiquette ? etiquette + ' ' + texte : texte);   /* O1 */
  };
  const noter = function () { if (note && P) P.etat.textContent = note + '\n' + P.etat.textContent; };
  /* I4 / I5 : un objet a été appliqué pendant cette boucle — plus rien à remettre, et une création n'est plus une tentative ratée */
  const marquer = function () { applique = true; E.retablir = null; if (mode === 'creer') E.tentative = null; };
  /* H1 : le meilleur état de la boucle, puis des lignes d'alerte sous « Prêt : … » (et le lien de l'erreur, s'il y en a un) */
  const montrerMeilleur = function (lignes, lien, libelle) {
    appliquer(meilleur.code, meilleur.resultat, null);
    statut(avecNote(P.etat.textContent + '\n' + lignes.join('\n')), 'alerte', lien || null, libelle || null);
    marquer();
  };
  /* H1 : un 429 appels_session sur un tour corriger, quand un objet est (ou va être) au panneau : le prochain « Modifier… » repartira
     sous une session neuve (F11), on ne conseille plus une nouvelle description. I5 : pendant une création, seul le meilleur état de
     CETTE boucle compte — l'objet affiché avant « Fabriquer » garde sa propre session (I4) : le texte de creer reste vrai */
  const messageDe = function (e) {
    if (e && e.code === 'appels_session' && corps.mode === 'corriger' && (meilleur || (E.code && mode !== 'creer'))) return T('Cet objet a épuisé ses appels : une nouvelle modification comptera comme un nouvel objet.');
    return (e && e.message) || String(e);
  };
  /* H1 : le repli qu'annuler() appelle — seulement pendant un tour corriger qui a un meilleur état à montrer */
  const repli = function () {
    if (!meilleur || corps.mode !== 'corriger' || !P || P.E !== E) return false;
    montrerMeilleur([T('Correction annulée : l’objet est affiché avec ses défauts.')]);
    return true;
  };
  E.repli = repli;
  try {
    for (;;) {
      let texte = '', dernierAffichage = 0;
      /* D4 : un code précédent au-delà du plafond ne part pas (le serveur le refuserait) ; pas de tour de correction */
      if (corps.code && corps.code.length > PLAFOND_CODE) throw new ErreurIA('trop_long', messageTropLong(corps.code.length));
      const av = lancerBarre();                     /* O1 : la barre de ce tour, et l'heure de son départ */
      const compteur = function () {
        poserBarre(av, barreEcriture(av.origine, texte.length));
        progres(fmt(T('Écriture du code… {0} caractères'), nombre(texte.length, 0)));
      };
      /* O1 : réécrit la ligne au plus une fois par seconde, tant que la réflexion dure ; temps et valeur lus sur l'horloge */
      const reflechir = function () {
        if (av.phase !== 'reflexion' || !vivant()) return;
        const ms = performance.now() - av.depart;
        poserBarre(av, barreReflexion(ms));
        progres(fmt(T('Le modèle réfléchit… {0} (cela peut prendre plusieurs minutes)'), dureeTexte(ms)));
        av.minuterie = setTimeout(reflechir, RAFRAICHISSEMENT_MS);
      };
      /* E18 : « Connexion au service… » jusqu'à l'événement debut ou au premier delta — plus de « 0 caractères » avant un refus du serveur */
      progres(T('Connexion au service…'));
      let refus = null, res = null;
      try {
        res = await _demander(corps, function (t) {
          if (!t) return;                           /* E18 : un delta vide n'affiche pas « 0 caractères » */
          texte += t;
          /* O1 : le premier delta arrête la réflexion ; l'écriture part de la valeur atteinte */
          if (av.phase === 'connexion' || av.phase === 'reflexion') { clearTimeout(av.minuterie); av.phase = 'ecriture'; av.origine = av.valeur; }
          /* D8 : le compteur s'écrit au premier delta, puis au plus une fois par seconde (chaque écriture relance translateDOM
             dans app.html) */
          const maintenant = performance.now();
          if ((dernierAffichage === 0 || maintenant - dernierAffichage >= RAFRAICHISSEMENT_MS) && av.phase !== 'fini' && vivant()) { dernierAffichage = maintenant; compteur(); }
        }, ctrl.signal, function () {
          /* O1 : l'événement debut, s'il arrive avant le premier delta */
          if (av.phase !== 'connexion' || !vivant()) return;
          av.phase = 'reflexion';
          reflechir();
        });
      } catch (e) {
        /* I7 : l'événement erreur du serveur porte le quota à jour (l'objet compté, ou rendu par H7) : le titre le suit ; J3 : de même
           pour TOUTE ErreurIA qui porte le quota, dont le 429 quota d'avant le flux (son corps porte le compte exact) */
        if (e instanceof ErreurIA && e.quota && vivant()) majQuota(e.quota);
        if (e && e.code === 'code_refuse') refus = e.message;
        else if (e && e.code === 'appels_session' && corps.mode === 'modifier' && !rejoue) {
          /* F11 : l'objet a épuisé ses appels (6 par session) ; plutôt que de le figer, la modification repart UNE fois sous une session
             neuve, que le serveur traite comme une création (D1 : le quota d'objets est consommé, l'événement debut met le compteur à
             jour) ; « Garder » écrira ia.session = E.session. Jamais sur un tour corriger (le serveur répond 400 à une session inconnue
             en corriger) ni en creer ; si la requête rejouée échoue, c'est le chemin d'erreur ordinaire, sans nouvelle boucle. */
          if (!vivant()) return applique;
          rejoue = true; E.session = uuid(); corps.session = E.session;
          note = T('Cet objet a épuisé ses appels : la modification compte comme un nouvel objet.');
          statut(note, 'alerte');
          continue;
        }
        else if (corps.mode === 'corriger' && meilleur) {
          /* H1 : la correction n'a pas abouti ; le meilleur état est affiché, avec ses défauts (session inchangée) */
          if (!vivant()) return applique;
          if (e && e.code === 'annule') montrerMeilleur([T('Correction annulée : l’objet est affiché avec ses défauts.')]);
          else montrerMeilleur([T('L’objet est affiché avec ses défauts : la correction n’a pas pu être demandée.'), messageDe(e)], e && e.lien, e && e.libelle);
          return applique;
        }
        else throw e;
      } finally {
        clearTimeout(av.minuterie);                 /* O1 : plus de réflexion une fois la requête du tour terminée, quelle qu'en soit l'issue */
      }
      if (!vivant()) return applique;
      if (texte.length) compteur();                 /* D8 : le total exact à la fin du flux */
      let erreur = null, resultat = null, code = corps.code || '';
      if (refus) {
        erreur = refus;
        /* D2 : code_refuse au PREMIER tour (mode creer, pas de code précédent) : le texte brut déjà reçu, fences comprises,
           sert de code précédent au tour corriger — sans lui le serveur répondait 400 (code manquant) */
        if (!code) code = texte;
      } else {
        code = res.code;
        majQuota(res.quota || (res.debut && res.debut.quota)); if (res.modele) E.modele = res.modele;
        av.phase = 'controle'; poserBarre(av, BARRE_CONTROLE);   /* O1 */
        progres(T('Contrôle…'));
        try { resultat = await construireCode(code, null); }
        catch (e) { erreur = ((e && e.message) || String(e)) + (e && e.pile ? '\n' + e.pile : ''); }
        if (!vivant()) return applique;
        if (resultat) {
          if (resultat.geo.rapport && resultat.geo.rapport.ok) { appliquer(code, resultat, null); noter(); marquer(); return applique; }
          if (!meilleur || nbDefauts(resultat) < nbDefauts(meilleur.resultat)) meilleur = { code: code, resultat: resultat };
        }
      }
      derniereErreur = erreur;
      if (corrections >= MAX_CORRECTIONS) break;
      corrections++;
      /* I6 : l'étiquette du tour reste en tête de la progression jusqu'à sa fin (« Connexion au service… », compteur, « Contrôle… ») */
      etiquette = fmt(T('Correction {0}/{1}…'), corrections, MAX_CORRECTIONS);
      statut(avecNote(etiquette), 'travail');
      corps = { session: E.session, mode: 'corriger', description: E.description, lang: langue(), code: code, rapport: rapportPour(erreur, resultat) };
    }
    /* après le 3e tour : le meilleur état qui se construit, sinon l'échec (H5 : sous la note F11 s'il y a eu rejeu) */
    if (meilleur) { appliquer(meilleur.code, meilleur.resultat, null); noter(); marquer(); }
    else statut(avecNote(fmt(T('Échec : aucun code ne se construit après {0} tours.'), corrections + 1) + (derniereErreur ? '\n' + String(derniereErreur).split('\n')[0] : '')), 'erreur');
  } catch (e) {
    if (!vivant()) return applique;
    afficherErreur(e, avecNote(messageDe(e)));   /* H1 : appels_session sur un tour corriger ; H5 : la note F11 au-dessus du message et du lien */
  } finally {
    if (E.repli === repli) E.repli = null;
    if (vivant()) {
      E.enCours = null;
      if (!applique) {
        /* I1 (c) : rien d'appliqué : les réglages reconstruisent l'objet affiché, pas le dernier code chargé dans le bac */
        if (E.code) P.bac.retenir(E.code);
        /* I4 : « Fabriquer » n'a rien produit : l'objet affiché retrouve sa carte, sa session et sa description */
        if (typeof E.retablir === 'function') E.retablir();
      }
      verrouiller(false);
    }
  }
  return applique;
}
/* « Fabriquer » : une nouvelle description = un nouvel objet (§3.1, §4.5). I4 : l'objet affiché (repris ou non) n'est détaché de sa
   carte — E.cfg, E.session, E.description — que si la boucle applique un objet ; sinon E.retablir les lui rend (fin de boucle ou
   « Annuler ») et « Garder » met à jour SA carte. I5 : la session est celle de la dernière création ratée quand la description est la
   même (ses nouveaux essais ne comptent pas un objet de plus : 6 appels au plus), une session neuve sinon (un nouvel objet) ; une
   création réussie efface la tentative. Ctrl+Entrée dans la description pendant une boucle ou une reprise ne change rien. J1 : pendant
   un « Garder » non plus (le bouton est inactif, la défense est ici, avant tout message) — sinon le nouvel objet serait rattaché à la
   carte que ce « Garder » écrit, et le « Garder » suivant l'écraserait. */
function fabriquer() {
  if (!P || P.garde > 0) return;
  const E = P.E, d = descriptionPropre(P.desc.value);        /* D10 */
  if (E.enCours || P.verrou) return;                         /* O1 : avant le message, qui retirerait la barre de l'appel en cours */
  if (!d) { statut(T('Décrivez d’abord l’objet.'), 'erreur'); P.desc.focus(); return; }
  if (E.code || E.cfg) {
    const avant = { cfg: E.cfg, session: E.session, description: E.description };
    E.retablir = function () { E.retablir = null; E.cfg = avant.cfg; E.session = avant.session; E.description = avant.description; };
  } else E.retablir = null;
  const t = E.tentative;
  E.session = (t && t.description === d && t.session) ? t.session : uuid();
  E.tentative = { description: d, session: E.session };
  E.cfg = null; E.description = d;
  boucle('creer', {});
}
function modifier() {
  if (!P || occupe()) return;   /* J1 : ni pendant un « Garder », ni pendant une boucle ou une reprise (Entrée dans le champ compris) */
  const E = P.E, ins = P.modif.value.trim();
  if (!E.code) { statut(T('Décrivez d’abord l’objet.'), 'erreur'); return; }
  if (!ins) { statut(T('Décrivez la modification souhaitée.'), 'erreur'); P.modif.focus(); return; }
  if (!E.session) E.session = uuid();
  if (!E.description) E.description = descriptionPropre(P.desc.value);
  /* H1 : le champ n'est vidé que si un objet a été appliqué (la modification, ou son meilleur état) ; sinon l'instruction reste */
  boucle('modifier', { instruction: ins.slice(0, 800) }).then(function (applique) { if (applique && P && P.E === E && !E.enCours) P.modif.value = ''; });
}
/* H1 : arrêtée pendant un tour corriger (bouton « Annuler », fermeture du panneau), la boucle montre son meilleur état au lieu de
   « Demande annulée. » ; sansRepli : recommencer() et la reprise d'une autre carte remplacent l'état, il n'y a rien à montrer.
   Sans repli : I1 (c) le bac retient le code affiché ; I4 une création annulée rend l'objet affiché à sa carte (E.retablir). */
function annuler(sansRepli) {
  if (!P) return;
  const E = P.E, repli = E.repli;
  if (E.enCours) { try { E.enCours.abort(); } catch (e) { /* déjà terminé */ } }
  E.jeton++; E.enCours = null; E.repli = null;
  verrouiller(false);
  if (!sansRepli && typeof repli === 'function' && repli()) return;
  if (!sansRepli) {
    if (E.code) P.bac.retenir(E.code);
    if (typeof E.retablir === 'function') E.retablir();
  }
  statut(T('Demande annulée.'), 'alerte');
}
function recommencer() {
  if (!P || P.garde > 0) return;   /* J1 : pas pendant un « Garder » (pendant une boucle, Recommencer l'arrête) */
  annuler(true);
  P.bac.detruire();
  P.E = etatNeuf();
  P.zoneObjet.classList.add('bpo-ia-cache');
  P.badge.style.display = 'none'; P.cotes.textContent = ''; P.hyp.innerHTML = ''; P.curs.innerHTML = ''; P.curseurs = {}; P.nom.value = ''; P.desig.textContent = ''; P.modif.value = '';
  P.vue.vider();
  P.quota.textContent = '';
  statut('', '');
  P.desc.focus();
}

/* ---- « Garder » (§4.5) ----
   E15 : cfgStore d'app.html avale une erreur de stockage plein (alerte, rien d'écrit) : la fiche est relue après l'écriture et doit
   porter cet enregistrement (sa date) ; sinon statut d'erreur et E.cfg inchangé.
   Objet NEUF : bake d'abord, puis la fiche, relue ; sur échec l'objet est défait (BPO_import.retirer, E16) pour ne laisser ni maillage
   ni enregistrement IndexedDB orphelins, et les dossiers que ce « Garder » vient de créer et où aucune fiche n'est rangée sont retirés
   (« Objets importes », D7 ; « Objets décrits », G5). H4 : si bake n'a pas pu écrire sa fiche (stockage plein), rien n'est réécrit et
   l'échec suit tout de suite — une seule alerte d'app.html. H3 : « Objets décrits » n'est créé que pour y ranger la fiche d'un objet
   neuf ; en reprise ou en report (E17), la fiche garde son dossier et ce dossier n'est jamais recréé.
   H2 — reprise EN PLACE (fiche et maillage présents) : la fiche (cfg.ia neuf, nom, étiquette ; dossier inchangé) s'écrit et se relit
   AVANT BPO_import.rebake ; si elle ne s'écrit pas, rien d'autre ne change (ni maillage, ni IndexedDB, ni scène, ni E.cfg) ; si rebake
   échoue, les fiches d'avant sont remises. Un nom changé au panneau suit dans bpo-import (E17, BPO_import.renommer : étiquette de scène,
   enregistrement). Sans cfgLoad / cfgStore : rebake seul.
   E17 — fiche présente SANS maillage (objet synchronisé depuis un autre appareil) : bake sous un nouveau pid, que la fiche existante
   reprend — jamais deux cartes — puis, après l'écriture vérifiée, les instances de scène de l'ancien pid passent sur le nouveau. */
/* D7 / G5 : un dossier créé pendant ce « Garder » et resté vide (aucune des fiches n'y est rangée) → retiré : « Objets importes »
   (FID_IMPORT, créé par bake s'il manque ; succès comme échec, D7) et « Objets décrits » (FID, créé par garder pour la fiche d'un objet
   neuf avant son écriture ; échec de l'écriture vérifiée seulement, G5, H3). L'appelant ne le demande que pour un dossier absent avant ce
   « Garder » ; rien n'est écrit si le dossier n'est pas là (en stockage plein, cfgFoldStore d'app.html a pu échouer en silence). */
function retirerDossierVide(id, fiches) {
  if (fiches.some(function (c) { return c && c.parent === id; })) return;
  const apres = window.cfgFoldLoad() || [];
  if (apres.some(function (f) { return f && f.id === id; })) window.cfgFoldStore(apres.filter(function (f) { return !(f && f.id === id); }));
}
async function garder() {
  if (!P || !P.E.geo) return;
  const E = P.E, g = E.geo, BI = window.BPO_import;
  if (!BI || typeof BI.bake !== 'function') { statut(T('Le module d’import n’est pas chargé : impossible de garder.'), 'erreur'); return; }
  const nom = (P.nom.value || '').trim() || (E.meta && E.meta.nom) || 'Objet';
  const pos = g.pos.slice(), idx = g.idx.slice(), groups = g.groups.map(function (gr) { return Object.assign({}, gr); });
  /* J1 : le jeton de l'objet affiché au départ ; après les await de bake / rebake, E.cfg n'est posé que si cet objet est toujours
     celui du panneau (même état, jeton inchangé, aucune boucle en cours) — défense en profondeur derrière les boutons inactifs */
  const jeton = E.jeton;
  const libre = function () { return !!P && P.E === E && E.jeton === jeton && !E.enCours; };
  P.garde = (P.garde || 0) + 1; majBoutons();   /* I1 (b) : « Garder » inactif pendant l'opération ; J1 : Fabriquer, Modifier… aussi */
  try {
    statut(T('Garder…'), 'travail');   /* E18 */
    const dossiers = (typeof window.cfgFoldLoad === 'function' && typeof window.cfgFoldStore === 'function');
    const fiches = (typeof window.cfgLoad === 'function' && typeof window.cfgStore === 'function');
    const rendre = function () { if (typeof window.cfgRender === 'function') window.cfgRender(); };
    const plein = function () { statut(T('Impossible de garder : stockage plein ou indisponible. Libérez de la place (scènes, configurations), puis recommencez.'), 'erreur'); };
    /* D7 : bake crée « Objets importes » s'il manque, puis l'objet décrit est rangé ailleurs : on note s'il existait avant ;
       G5 : de même pour « Objets décrits », que ce « Garder » crée pour la fiche d'un objet neuf (H3) */
    const dossiersAvant = dossiers ? (window.cfgFoldLoad() || []) : [];
    const avaitImport = dossiersAvant.some(function (f) { return f && f.id === FID_IMPORT; });
    const avaitIA = dossiersAvant.some(function (f) { return f && f.id === FID; });
    /* E17 : la fiche reprise et son maillage ; sans maillage, bake sous un nouveau pid reporté ensuite sur la fiche existante */
    /* J1 : la carte de l'objet au départ, lue avant tout await (E.cfg ne sert plus après) */
    const cfg0 = E.cfg;
    const ancien = (cfg0 && cfg0.prod) || null, nomAvant = (cfg0 && cfg0.name) || null;
    const maillage = !!(ancien && window.TEX_OBJECTS && window.TEX_OBJECTS[ancien]);
    /* I1 (a) : ia.params = les réglages de la géométrie gardée (E.paramsGeo), jamais les valeurs courantes des curseurs (E.params).
       I4 : la description est celle de l'objet affiché ; le champ ne la remplace que pour un objet neuf sans description, hors création
       ratée (après un « Fabriquer » sans résultat, le champ porte la description ratée, pas celle de l'objet affiché ni de sa carte) */
    const description = E.description || ((cfg0 || E.tentative) ? '' : descriptionPropre(P.desc.value));
    const ia = { v: 1, description: description, code: E.code, params: Object.assign({}, E.paramsGeo),
                 hypotheses: (E.meta && E.meta.hypotheses) || [], designation: (E.meta && E.meta.designation) || '',
                 modele: E.modele || null, lang: langue(), date: new Date().toISOString(), session: E.session || null };
    if (maillage && typeof BI.rebake === 'function') {
      /* H2 : (1) la fiche d'abord, sur une copie des fiches lues, écrite puis relue ; (2) si elle ne s'écrit pas, rien d'autre ne
         change ; (3) puis le maillage, et sur échec les fiches d'avant ; (4) nom, E.cfg, rendu */
      let avant = null, fiche = null;
      if (fiches) {
        avant = window.cfgLoad() || [];
        const copie = JSON.parse(JSON.stringify(avant));
        copie.forEach(function (c) {
          if (!c || c.prod !== ancien || (cfg0.id != null && c.id !== cfg0.id)) return;
          c.ia = ia; c.name = nom; c.label = LABEL_CARTE; fiche = c;   /* le dossier reste celui de l'utilisateur (E17, H3) */
        });
        /* fiche introuvable (retirée entre-temps) : rien à écrire, l'échec est le même */
        if (fiche) window.cfgStore(copie);
        const ecrite = !!fiche && (window.cfgLoad() || []).some(function (c) { return c && c.prod === ancien && c.ia && c.ia.date === ia.date; });
        if (!ecrite) { plein(); return; }
      }
      let pid = ancien;
      try { pid = (await BI.rebake(ancien, pos, idx, groups)) || ancien; }
      catch (e) {
        if (avant) { window.cfgStore(avant); rendre(); }
        statut(fmt(T('Impossible de garder : {0}'), (e && e.message) || e), 'erreur');
        return;
      }
      /* E17 : le nom tenu par bpo-import (étiquette de scène et d'export, enregistrement IndexedDB) suit le panneau */
      if (nom !== nomAvant && typeof BI.renommer === 'function') { try { await BI.renommer(pid, nom); } catch (e) { /* la fiche porte déjà le nom */ } }
      if (fiche) { if (libre()) E.cfg = fiche; rendre(); }   /* J1 */
      statut(T('Objet mis à jour dans Ma bibliothèque.'), 'ok');
      return;
    }
    /* objet neuf, ou fiche sans maillage (E17) : bake d'abord, puis la fiche, relue (E15) */
    const pid = await BI.bake(nom, pos, idx, groups);
    const reporter = !!(cfg0 && cfg0.id != null && ancien && ancien !== pid);
    if (fiches) {
      let list = window.cfgLoad() || [], trouve = null, report = false;
      if (reporter) {
        /* E17 : la fiche existante reçoit le nouveau pid ; la fiche que bake (addImport) vient d'ajouter est retirée */
        const existante = list.filter(function (c) { return c && c.id === cfg0.id; })[0];
        if (existante) { existante.prod = pid; list = list.filter(function (c) { return !(c && c.prod === pid && c.id !== cfg0.id); }); report = true; }
      }
      list.forEach(function (c) {
        if (!c || c.prod !== pid) return;
        /* E17 / H3 : seule la fiche d'un objet neuf (« Objets importes » de bake, ou sans dossier) va dans « Objets décrits » ; une fiche
           reportée garde le rangement choisi par l'utilisateur */
        if (!report && (!c.parent || c.parent === FID_IMPORT)) c.parent = FID;
        c.label = LABEL_CARTE; c.ia = ia; c.name = nom; trouve = c;
      });
      /* H4 : aucune fiche du pid (addImport n'a pas pu l'écrire : stockage plein) → pas de second cfgStore, l'échec suit */
      let ecrite = false;
      if (trouve) {
        /* H3 : « Objets décrits » est créé s'il manque, seulement pour y ranger la fiche d'un objet neuf */
        if (dossiers && !report && trouve.parent === FID) {
          const folds = window.cfgFoldLoad() || [];
          if (!folds.some(function (f) { return f && f.id === FID; })) { folds.unshift({ id: FID, name: NOM_DOSSIER, parent: null, open: true }); window.cfgFoldStore(folds); }
        }
        window.cfgStore(list);
        /* E15 : relecture ; la fiche doit porter CET enregistrement (sa date), pas celui d'une reprise précédente */
        ecrite = (window.cfgLoad() || []).some(function (c) { return c && c.prod === pid && c.ia && c.ia.date === ia.date; });
      }
      if (!ecrite) {
        if (typeof BI.retirer === 'function') { try { await BI.retirer(pid); } catch (e) { /* rien de plus à défaire */ } }
        /* les dossiers que ce « Garder » vient de créer (cfgFoldStore a pu réussir, lui) ne doivent pas rester vides : « Objets importes »
           créé par bake (D7) et « Objets décrits » créé ci-dessus (G5), chacun s'il n'existait pas avant et qu'aucune fiche n'y est rangée */
        if (dossiers) {
          const restantes = window.cfgLoad() || [];
          if (!avaitImport) retirerDossierVide(FID_IMPORT, restantes);
          if (!avaitIA) retirerDossierVide(FID, restantes);
        }
        rendre();
        plein();
        return;
      }
      if (libre()) E.cfg = trouve;   /* J1 : seulement si l'objet du départ est toujours celui du panneau */
      /* D7 : « Objets importes » n'existait pas et rien n'y est rangé : on retire ce dossier vide avant le rendu */
      if (dossiers && !avaitImport) retirerDossierVide(FID_IMPORT, list);
      rendre();
    }
    /* E17 : les instances de scène de l'ancien pid (sans maillage) passent sur le nouveau, au mieux */
    if (reporter && window.SCENE && Array.isArray(window.SCENE.instances)) {
      try {
        window.SCENE.instances.forEach(function (i) { if (i && i.prod === ancien) i.prod = pid; });
        if (typeof window.build === 'function' && window.MODE === 'scene') window.build();
      } catch (e) { /* la scène se remettra au prochain rendu */ }
    }
    statut(T('Objet gardé dans Ma bibliothèque.'), 'ok');
  } catch (e) {
    statut(fmt(T('Impossible de garder : {0}'), (e && e.message) || e), 'erreur');   /* E18 */
  } finally {
    P.garde = Math.max(0, (P.garde || 1) - 1); majBoutons();   /* J1 : les boutons reviennent */
  }
}

/* ---- reprise d'un objet importé qui porte cfg.ia ----
   I1 (d) : si les réglages gardés (ia.params) ne se construisent pas (exception du code, géométrie trop lourde ou irrecevable, délai),
   un seul nouvel essai aux valeurs par défaut du code, signalé sous « Prêt : … » (l'erreur, puis « Réglages remis aux valeurs par défaut
   du code. ») ; si rien ne se construit, ou si le code ne se charge pas, l'erreur s'affiche mais la carte reste reprise : E.code = ia.code
   et E.cfg restent posés, la zone de l'objet est montrée (nom, désignation, hypothèses, réglages quand le code s'est chargé, « Modifier… »)
   sans géométrie ni « Garder » : « Modifier… » repart de ce code, et un curseur peut chercher des réglages qui se construisent. */
async function reprendre(cfg) {
  const E = P.E, ia = cfg.ia || {}, code = typeof ia.code === 'string' ? ia.code : '';
  const valeurs = (ia.params && typeof ia.params === 'object') ? ia.params : null;
  E.cfg = cfg; E.session = ia.session || uuid(); E.description = descriptionPropre(ia.description); E.modele = ia.modele || null;   /* D10 */
  P.desc.value = E.description;
  const jeton = ++E.jeton;
  const vivant = function () { return P && P.E === E && E.jeton === jeton; };
  verrouiller(true);
  statut(fmt(T('Reprise de « {0} »'), cfg.name || ia.designation || ''), 'travail');
  let meta = null;
  try {
    meta = await P.bac.charger(code);
    if (!vivant()) return;
    let reglages = valeurs ? Object.assign({}, valeurs) : valeursDefaut(meta.params), geo = null, rate = null;
    try { geo = await P.bac.construire(reglages); }
    catch (e) {
      if (!vivant()) return;
      if (!valeurs || !e || (e.code !== 'programme' && e.code !== 'delai')) throw e;
      rate = e; reglages = valeursDefaut(meta.params);
      geo = await P.bac.construire(reglages);
    }
    if (!vivant()) return;
    appliquer(code, { meta: meta, geo: geo, params: reglages }, rate ? null : valeurs);
    if (cfg.name) P.nom.value = cfg.name;
    if (rate) statut(P.etat.textContent + '\n' + (rate.message || String(rate)) + '\n' + T('Réglages remis aux valeurs par défaut du code.'), 'alerte');
  } catch (e) {
    if (!vivant()) return;
    /* I1 (d) : la carte n'est jamais morte — son code reste celui que « Modifier… » enverra */
    E.code = code;
    P.badge.style.display = 'none'; P.cotes.textContent = '';
    afficherMeta(meta || metaRecevable({ nom: cfg.name, designation: ia.designation, hypotheses: ia.hypotheses, params: null }), valeurs);
    if (cfg.name) P.nom.value = cfg.name;
    afficherErreur(e);
  } finally {
    if (vivant()) verrouiller(false);
  }
}

/* ----------------------------------------------------------------------------
   Exports (§4.1)
   ---------------------------------------------------------------------------- */
/* J1 : pendant un « Garder », la reprise d'une carte (bouton IA) est ignorée : le panneau s'affiche, l'objet en cours d'écriture reste.
   J2 : à l'ouverture, le panneau est recalé dans la fenêtre, et l'écouteur resize de window est posé (une fois ; fermer le retire) ;
   K1 : c'est la position voulue (P.voulue, à défaut la place d'origine) qui est bornée, si bien qu'après ✕ le panneau rouvre à sa place ;
   L1 : ancrée à droite ({dr, t}) ou à gauche ({l, t}) ; L2 : le haut affiché laisse au moins 250 px de hauteur au panneau ;
   M1 : au lâcher, le côté le plus proche ; M2 : le haut affiché ne monte jamais au-dessus de 74 px, sauf haut voulu plus haut ;
   N1 : la gauche affichée laisse Ma bibliothèque libre quand la fenêtre a la place de poser le panneau à côté ; un ResizeObserver sur
   son conteneur, posé ici et retiré par fermer, recale quand elle se replie, se rouvre ou change de largeur.
   J4 : une reprise vide le champ « Modifier… », comme Recommencer : l'instruction tapée pour l'objet d'avant ne part pas vers la carte. */
export function ouvrir(opts) {
  opts = opts || {};
  if (!P) construirePanneau();
  P.pan.style.display = 'flex';
  P.recaler();
  if (!P.redimPose && typeof window.addEventListener === 'function') { window.addEventListener('resize', P.surRedim); P.redimPose = true; }
  /* N1 : la bibliothèque qui se replie, se rouvre ou change de largeur recale aussi le panneau (observateur retiré par fermer) */
  if (!P.obsBib && typeof window.ResizeObserver === 'function') {
    const bib = conteneurBibliotheque();
    if (bib) { try { P.obsBib = new window.ResizeObserver(P.surRedim); P.obsBib.observe(bib); } catch (e) { P.obsBib = null; } }
  }
  retraduire();
  if (opts.cfg && opts.cfg.ia) {
    if (P.garde > 0) { P.vue.demander(); return P.pan; }
    if (P.E.enCours) annuler(true);              /* H1 : l'état est remplacé par la reprise, rien à montrer */
    P.bac.detruire(); P.E = etatNeuf();
    P.zoneObjet.classList.add('bpo-ia-cache'); P.vue.vider();
    P.modif.value = '';                          /* J4 */
    reprendre(opts.cfg);
  } else if (!P.E.code) {
    P.desc.focus();
  }
  P.vue.demander();
  return P.pan;
}
export function fermer() {
  if (!P) return;
  if (P.E.enCours) annuler();
  P.pan.style.display = 'none';
  /* J2 : l'écouteur resize vit le temps de l'ouverture */
  if (P.redimPose) { try { window.removeEventListener('resize', P.surRedim); } catch (e) { /* sans window */ } P.redimPose = false; }
  if (P.obsBib) { try { P.obsBib.disconnect(); } catch (e) { /* observateur déjà parti */ } P.obsBib = null; }   /* N1 */
  P.bac.detruire();   /* le worker est recréé au prochain usage (kit en cache) */
}
export async function disponible() {
  try { const cli = await clientSupabase(); return !!(await cli.sb.auth.getSession()).data.session; }
  catch (e) { return false; }
}
/* ENTRÉE DE BANC : court-circuite le serveur ; ne touche ni réseau ni Supabase (le kit est lu par fetch relatif au module). */
export const _essai = {
  fabriquerDepuisCode: async function (code, params) {
    ouvrir({});
    const E = P.E;
    E.cfg = null;                                   /* un code fourni au banc est un objet neuf : jamais de rebake d'un objet repris */
    E.retablir = null;                              /* I4 : rien à remettre, l'objet du banc remplace l'objet affiché */
    if (!E.session) E.session = uuid();
    if (!E.description) E.description = descriptionPropre(P.desc.value);
    const jeton = ++E.jeton;
    verrouiller(true);
    statut(T('Contrôle…'), 'travail');
    try {
      const r = await construireCode(code, params || null);
      if (P && P.E === E && E.jeton === jeton) appliquer(code, r, params || null);
      return r;
    } catch (e) {
      if (P && P.E === E && E.jeton === jeton) afficherErreur(e);
      throw e;
    } finally {
      if (P && P.E === E && E.jeton === jeton) verrouiller(false);
    }
  },
  rendu: function () { if (!P) return null; P.vue.rendre(); return P.cv; },
  parserSSE: parserSSE,
  /* compléments de banc (hors §4.1, additifs) : tampon de flux, harnais du worker, filtre et masque (D3), rapport envoyé au
     serveur (D10), erreurs HTTP et messages du flux (D4, D9, E18), bac et délais, CSP et srcdoc de l'iframe sandbox (E1), plafonds de
     géométrie (E3), fenêtre de jours (E18), erreur du flux et son quota (erreurFlux, I7) ; panneau() rend l'état du panneau, et
     remplacerDemander(fn) substitue un serveur factice à l'appel réseau (fn(corps, onDelta, signal) → résultat de fin, ou
     lance une erreur portant .code) — rend l'appel précédent ; remplacerDemander(null) rétablit le vrai. boucle(mode, extra)
     lance la boucle de fabrication sur l'état du panneau et rend sa promesse : true quand un objet a été appliqué (H1).
     reglagesPour(p) rend le champ reglages qu'une demande « Modifier… » porterait pour ces réglages (J5). O1 : fn reçoit aussi un
     4e argument, onDebut, à appeler à l'événement debut ; dureeTexte, barreReflexion, barreEcriture et les constantes de la barre. */
  tamponSSE: tamponSSE,
  reglagesPour: reglagesPour,
  HARNAIS: HARNAIS,
  INTERDITS: INTERDITS,
  MASQUE: MASQUE,
  rapportPour: rapportPour,
  erreurHTTP: erreurHTTP,
  messageFlux: messageFlux,
  Bac: Bac,
  DELAI_MS: DELAI_MS,
  DELAI_RELAIS_MS: DELAI_RELAIS_MS,
  CSP_BAC: CSP_BAC,
  SRCDOC_BAC: SRCDOC_BAC,
  PLAFOND_TRIANGLES: PLAFOND_TRIANGLES,
  PLAFOND_SOMMETS: PLAFOND_SOMMETS,
  PLAFOND_GROUPES: PLAFOND_GROUPES,
  PLAFOND_CODE: PLAFOND_CODE,
  PLAFOND_DESCRIPTION: PLAFOND_DESCRIPTION,
  FENETRE_JOURS: FENETRE_JOURS,
  fenetreJours: fenetreJours,
  dateValide: dateValide,
  erreurFlux: erreurFlux,
  VERSION: VERSION,
  dureeTexte: dureeTexte,
  barreReflexion: barreReflexion,
  barreEcriture: barreEcriture,
  DUREE_REFLEXION_S: DUREE_REFLEXION_S,
  RAFRAICHISSEMENT_MS: RAFRAICHISSEMENT_MS,
  panneau: function () { return P; },
  boucle: boucle,
  remplacerDemander: function (fn) { const avant = _demander; _demander = (typeof fn === 'function') ? fn : demander; return avant; }
};
