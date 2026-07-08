/* Chargement à la demande : les meshes/textures vivent dans data/haworth/<id>.js */
var TEX_OBJECTS={}, TEX_POOL={};
function BPO_prod(id,o){ TEX_OBJECTS[id]={meta:o.meta,geo:o.geo,groups:o.groups}; if(o.tex){ for(var k in o.tex){ if(!TEX_POOL[k]) TEX_POOL[k]=o.tex[k]; } } }
