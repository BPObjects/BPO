/* moulinette-i18n.js — traduction FR -> EN de la Moulinette 3D (moulinette.html).
   Convention du site : la chaîne FRANÇAISE est la clé ; hors français, tout le
   monde reçoit l'ANGLAIS (outil pro, jargon anglais). Langue : ?lang=xx sinon
   localStorage bpo_lang (posé par le sélecteur d'app.html) sinon navigateur.
   Nœuds texte via TreeWalker (clé NORMALISÉE : trim, blancs repliés, NBSP→espace,
   ’→') + attributs title/placeholder + MutationObserver (l'UI se construit en JS).
   ⚠ moulinette.html est RÉGÉNÉRÉ par build-moulinette.py : après un rebuild,
   re-vérifier que la ligne <script src="moulinette-i18n.js"> est toujours là. */
(function(){
  "use strict";
  var n="";
  try{
    var p=/[?&]lang=([a-z]{2})/.exec(location.search);
    n=(p&&p[1])||"";
    if(!n){ try{ n=localStorage.getItem("bpo_lang")||""; }catch(e){} }
    if(!n) n=(navigator.language||"fr");
    n=n.toLowerCase().slice(0,2);
  }catch(e){ n="fr"; }
  if(n==="fr") return;                       /* français : rien à faire */

  var D={
  /* --- garde d'accès --- */
  "Vérification de l'accès…":"Checking access…",
  "Exports réservés aux abonnés":"Exports are for subscribers",
  "Préparez et prévisualisez librement — l'export des paquets BPO, ArchiCAD (.gsm) et SketchUp (.dae) est inclus dans l'abonnement BPO.":"Prepare and preview freely — exporting BPO packages, ArchiCAD (.gsm) and SketchUp (.dae) is included in the BPO subscription.",
  "S'abonner":"Subscribe",
  "S'abonner — 100 €/an":"Subscribe — €100/yr",
  "← Continuer sans exporter":"← Continue without exporting",
  /* --- entête + accueil --- */
  "OBJ · DAE · SKP · 3DS → objet allégé (QEM)":"OBJ · DAE · SKP · 3DS → lightened object (QEM)",
  "← Revenir à BPO":"← Back to BPO",
  "Bienvenue dans la Moulinette 3D":"Welcome to Moulinette 3D",
  "Cet outil vous permet de préparer des objets 3D externes — les alléger, nommer leurs matières, affecter textures et finitions — pour vos bibliothèques et scènes BPO comme pour vos logiciels : ArchiCAD (.gsm), SketchUp (.dae)…":"This tool prepares external 3D objects — lighten them, name their materials, assign textures and finishes — for your BPO libraries and scenes as well as your CAD software: ArchiCAD (.gsm), SketchUp (.dae)…",
  "Cette application vous est offerte avec l'abonnement BPO.":"This application is included with your BPO subscription.",
  "Glissez un fichier .obj, .dae, .skp ou .3ds ici":"Drop an .obj, .dae, .skp or .3ds file here",
  "ou le dossier complet (avec .mtl et textures)":"or the whole folder (with .mtl and textures)",
  "cliquez pour choisir des fichiers":"click to choose files",
  "choisir un dossier":"choose a folder",
  "La géométrie est allégée localement — rien ne quitte ce poste.":"Geometry is lightened locally — nothing leaves this computer.",
  "Chargement…":"Loading…",
  /* --- panneau gauche --- */
  "Fichier":"File",
  "↺ Nouveau · page vierge":"↺ New · blank page",
  "Maillage":"Mesh",
  "Unité source":"Source unit",
  "mètres":"meters",
  "centimètres":"centimeters",
  "millimètres":"millimeters",
  "pouces":"inches",
  "pieds":"feet",
  "Allégé":"Lightened",
  "Matières":"Materials",
  "Temps":"Time",
  "Sortie":"Output",
  "Cible (triangles)":"Target (triangles)",
  "Mouliner":"Crunch",
  "Affichage":"Display",
  "Avant":"Before",
  "Après":"After",
  "Filaire":"Wireframe",
  "Orienter les faces":"Orient faces",
  "Reboucher trous":"Fill holes",
  "Lumière":"Light",
  "Fond noir":"Dark background",
  "Fond blanc":"White background",
  /* --- réglages texture --- */
  "Réglages texture":"Texture settings",
  "Projection : UV d'origine":"Projection: original UVs",
  "Projection : plan XY":"Projection: XY plane",
  "Projection : plan XZ":"Projection: XZ plane",
  "Projection : plan YZ":"Projection: YZ plane",
  "Projection : boîte (auto)":"Projection: box (auto)",
  "Éch. U":"Scale U",
  "Éch. V":"Scale V",
  "Métal":"Metal",
  "Déc. U":"Offset U",
  "Déc. V":"Offset V",
  "Mir U":"Flip U",
  "Mir V":"Flip V",
  "Réinit":"Reset",
  "→ toutes":"→ all",
  /* --- export --- */
  "Paquet BPO (.zip)":"BPO package (.zip)",
  "« L.obj » + « L.mtl » seuls":"“L.obj” + “L.mtl” only",
  "→ Ma bibliothèque BPO":"→ My BPO library",
  /* --- objets / matières --- */
  "Objets":"Objects",
  "Surligner":"Highlight",
  "Isoler":"Isolate",
  "✎ Nom":"✎ Name",
  "Copier":"Copy",
  "Coller":"Paste",
  "＋ Nouv.":"＋ New",
  "Suppr.":"Delete",
  "Pinceau":"Brush",
  "Forme":"Shape",
  "Nettoyer identiques":"Merge identical",
  "Rayon":"Radius",
  "Origine":"Origin",
  "Opacité":"Opacity",
  "glisser = orbite · molette = zoom · clic droit = translation":"drag = orbit · wheel = zoom · right-click = pan",
  "Aucun petit trou détecté":"No small holes detected",
  /* --- infobulles --- */
  "Le format .3ds (comme .obj) ne stocke aucune unité : la taille est déduite, corrigez-la ici si besoin":"The .3ds format (like .obj) stores no unit: size is inferred — fix it here if needed",
  "Axe vertical du modèle":"Model up axis",
  "Harmoniser l'orientation des faces (par coque, vote majoritaire) — assainit l'export":"Harmonize face orientation (per shell, majority vote) — cleans up the export",
  "Reboucher les petits trous (boucles de bord de 3 à 5 arêtes = triangles manquants)":"Fill small holes (boundary loops of 3–5 edges = missing triangles)",
  "Fond sombre (viewer uniquement)":"Dark background (viewer only)",
  "Fond blanc uni (viewer uniquement)":"Plain white background (viewer only)",
  "Cyclo studio : fond blanc sans angle, sol et ombre douce sous l'objet (viewer uniquement)":"Studio cyc: seamless white background, floor and soft shadow under the object (viewer only)",
  "Réflexion métallique du studio (chrome ≈ 0,9). Automatique pour les matières nommées chromé / inox / poli.":"Studio metallic reflection (chrome ≈ 0.9). Automatic for materials named chrome / stainless / polished.",
  "Miroir horizontal":"Flip horizontally",
  "Miroir vertical":"Flip vertically",
  "Échanger U et V":"Swap U and V",
  "Réinitialiser cette matière":"Reset this material",
  "Lier les échelles U et V":"Link U and V scales",
  "Copier ces réglages sur toutes les matières":"Copy these settings to all materials",
  "Objet GDL ArchiCAD : HSF + bat de conversion (LP_XMLConverter d'AC 26-29)":"ArchiCAD GDL object: HSF + conversion .bat (AC 26-29 LP_XMLConverter)",
  "COLLADA pour SketchUp (textures incluses)":"COLLADA for SketchUp (textures included)",
  "Teinter en continu la matière sélectionnée":"Continuously tint the selected material",
  "N'afficher QUE la ou les matières sélectionnées (le pinceau ne mord plus sur le reste)":"Show ONLY the selected material(s) (the brush no longer bites the rest)",
  "Renommer la matière":"Rename the material",
  "Copier l'apparence de la matière":"Copy the material appearance",
  "Coller l'apparence copiée sur la matière sélectionnée":"Paste the copied appearance onto the selected material",
  "Créer une matière neuve (grise)":"Create a new (gray) material",
  "Supprimer la ou les matières sélectionnées (Ctrl+clic = multi-sélection) ET leur géométrie":"Delete the selected material(s) (Ctrl+click = multi-select) AND their geometry",
  "Peindre des facettes vers la matière sélectionnée (Ctrl+Z pour annuler)":"Paint facets into the selected material (Ctrl+Z to undo)",
  "Cliquer une FORME entière (pièce d'un seul tenant) pour lui donner la matière sélectionnée":"Click a whole SHAPE (one connected piece) to give it the selected material",
  "Fusionner les matières identiques (couleur, texture, opacité, réglages) et purger celles sans géométrie":"Merge identical materials (color, texture, opacity, settings) and purge those without geometry",
  "1 = une facette à la fois. Le pinceau reste dans la matière visée au centre ; Ctrl enfoncé pour déborder.":"1 = one facet at a time. The brush stays within the material under the center; hold Ctrl to spill over.",
  "Envoie l'objet préparé directement dans votre bibliothèque BPO (dossier « Objets importés ») : couleurs, textures, opacité et métal — prêt à poser en scène.":"Sends the prepared object straight to your BPO library (“Imported objects” folder): colors, textures, opacity and metal — ready to place in a scene.",
  "filtrer les textures BPO…":"filter BPO textures…"
  };

  /* clé normalisée : blancs (dont NBSP) repliés, apostrophe droite */
  function norm(s){ return String(s).replace(/’/g,"'").replace(/[\s ]+/g," ").trim(); }

  function traduire(){
    try{
      var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:function(nd){
        var pn=nd.parentNode?nd.parentNode.nodeName:"";
        return (pn==="SCRIPT"||pn==="STYLE"||pn==="TEXTAREA")?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;
      }});
      var nd,l=[];
      while(nd=w.nextNode()) l.push(nd);
      for(var i=0;i<l.length;i++){ var t=l[i];
        if(t.__fr===undefined) t.__fr=t.nodeValue;
        var v=D[norm(t.__fr)];
        if(v!=null && t.nodeValue!==v) t.nodeValue=v;
      }
      var att=document.body.querySelectorAll("[title],[placeholder]");
      for(var a=0;a<att.length;a++){ var el=att[a];
        ["title","placeholder"].forEach(function(k){
          var raw=el.getAttribute(k); if(raw==null||raw==="") return;
          if(el["__fr_"+k]===undefined) el["__fr_"+k]=raw;
          var tv=D[norm(el["__fr_"+k])];
          if(tv!=null && raw!==tv) el.setAttribute(k,tv);
        });
      }
    }catch(e){}
  }

  function arme(){
    traduire();
    try{
      var pend=false;
      new MutationObserver(function(){
        if(pend) return; pend=true;
        setTimeout(function(){ pend=false; traduire(); },60);
      }).observe(document.body,{childList:true,subtree:true});
    }catch(e){}
    try{ document.documentElement.lang=n; }catch(e){}
  }
  if(document.body) arme(); else document.addEventListener("DOMContentLoaded",arme);
})();
