/* Base de données des fabricants — Building Product Objects
   Pilote la branche « Fabricants » du catalogue. Pour ajouter un fabricant ou un
   produit : ajouter une entrée ici (et le maillage correspondant dans data/).
   - status : 'ready' (produits dispo) ou 'todo' (à venir)
   - subs[].render : 'webgl' (maillage WEBGL_OBJECTS) | 'webgl-tex' (BUREAU_TEX, texturé)
   - subs[].data   : nom de la variable globale contenant le maillage */
var FABRICANTS_DB = [
  { id:'al_design', label:'Architecture-AL Design', status:'ready', subs:[
      { id:'quadripod', label:'Quadripode',          render:'webgl', data:'WEBGL_OBJECTS.quadripod', categorie:'assise',   description:'Tabouret / guéridon, assise tissu épais, pieds chrome.' },
      { id:'woo',       label:'Desserte à roulettes', render:'webgl', data:'WEBGL_OBJECTS.woo',       categorie:'mobilier', description:'Desserte mobile, plateau Corian, roulettes caoutchouc.' }
  ]},
  { id:'haworth', label:'Haworth', status:'ready', subs:[
      { id:'bureau', label:'Bureau administratif 1p', render:'webgl-tex', data:'BUREAU_TEX', categorie:'bureau', source:'DAE ArchiCAD', description:'Poste de travail complet, modèle texturé haute fidélité.' }
  ]},
  { id:'technal', label:'Technal', status:'todo' },
  { id:'velux',   label:'Velux',   status:'todo' }
];
