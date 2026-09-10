/* ============================================================================
   BPO — GENERATEUR ArchiCAD (.gsm par HSF), PARTAGE ENTRE LES DEUX PAGES
   ----------------------------------------------------------------------------
   Extrait de moulinette.html le 10/09/2026, par CODE/gsm/extraire-bpo-gsm.py.
   NE PAS MODIFIER A LA MAIN : rejouer l'extracteur, sinon moulinette.html et ce
   fichier divergeront — c'est precisement ce qu'on cherchait a eviter.

   CE QUE CA PRODUIT, ET CE QUE CA NE PRODUIT PAS. Pas un .gsm : un ZIP contenant
   un dossier HSF (les XML de bibliotheque, les scripts GDL 2D/3D, l'apercu, les
   textures) et un script de conversion. C'est ArchiCAD, par son LP_XMLConverter,
   qui compile le .gsm — aucun navigateur ne sait le faire. Le dire a
   l'utilisateur fait partie du travail.

   LE CONTRAT :
     BPO_GSM.zip(ex, opts) -> Promise<Blob>
       ex.base   nom de l'objet (le suffixe « L » de decimation est retire)
       ex.obj    texte OBJ  (v / vt / usemtl / f — les vn sont ignorees)
       ex.mtl    texte MTL  (newmtl / Kd / map_Kd / d ; map_Kd reduit au nom de
                 fichier seul)
       ex.texs   [{name, blob}] — les images citees par map_Kd
       opts.up   'Y' pour reaxer Y-haut -> Z-haut, sinon la geometrie est deja
                 Z-haut. ArchiCAD travaille en Z-haut.
       opts.preview      Uint8Array d'un PNG, ou null (pas de vignette)
       opts.telecharger  false pour recuperer le Blob sans declencher le
                         telechargement (utile pour mesurer, ou pour envoyer)
       opts.nomZip       nom du fichier telecharge

   Le dialecte GDL est celui de l'importateur SKP d'ArchiCAD (specimen
   72_HWX_INSERT), valide dans AC28 le 28/07. On n'y touche pas sans un temoin.
   ============================================================================ */
(function(glob){
'use strict';
var CRC_T=(function(){ var t=new Uint32Array(256);
  for(var n=0;n<256;n++){ var c=n;
    for(var k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
    t[n]=c>>>0; } return t; })();
function crc32(u8){ var c=0xFFFFFFFF;
  for(var i=0;i<u8.length;i++)c=CRC_T[(c^u8[i])&0xFF]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0; }
function deflateRaw(u8){
  if(typeof CompressionStream==='undefined')return Promise.resolve(null);
  try{ var st=new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Response(st).arrayBuffer().then(function(ab){ return new Uint8Array(ab); })
      .catch(function(){ return null; }); }
  catch(e){ return Promise.resolve(null); }
}
function makeZip(entries){
  var enc=new TextEncoder(), parts=[], central=[], off=0;
  var chain=Promise.resolve();
  entries.forEach(function(e){
    chain=chain.then(function(){ return deflateRaw(e.data).then(function(comp){
      var method=8;
      if(!comp||comp.length>=e.data.length){ comp=e.data; method=0; }
      var nb=enc.encode(e.name), crc=crc32(e.data);
      var lh=new DataView(new ArrayBuffer(30));
      lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true);
      lh.setUint16(8,method,true);
      lh.setUint32(14,crc,true); lh.setUint32(18,comp.length,true); lh.setUint32(22,e.data.length,true);
      lh.setUint16(26,nb.length,true);
      parts.push(lh.buffer,nb,comp);
      central.push({nb:nb,crc:crc,cs:comp.length,us:e.data.length,method:method,off:off});
      off+=30+nb.length+comp.length;
    }); });
  });
  return chain.then(function(){
    var cdStart=off, cdLen=0;
    central.forEach(function(c){
      var ch=new DataView(new ArrayBuffer(46));
      ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true);
      ch.setUint16(8,0x0800,true); ch.setUint16(10,c.method,true);
      ch.setUint32(16,c.crc,true); ch.setUint32(20,c.cs,true); ch.setUint32(24,c.us,true);
      ch.setUint16(28,c.nb.length,true);
      ch.setUint32(42,c.off,true);
      parts.push(ch.buffer,c.nb); cdLen+=46+c.nb.length; });
    var eo=new DataView(new ArrayBuffer(22));
    eo.setUint32(0,0x06054b50,true); eo.setUint16(8,central.length,true); eo.setUint16(10,central.length,true);
    eo.setUint32(12,cdLen,true); eo.setUint32(16,cdStart,true);
    parts.push(eo.buffer);
    return new Blob(parts,{type:'application/zip'});
  });
}

function dl(blob,name){ var a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=name; a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); },4000); }

var SUBKIND_B64='V1cBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
function _b64bytes(b){ var s=atob(b), a=new Uint8Array(s.length);
  for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i); return a; }
function _bom(t){ return new TextEncoder().encode('\ufeff'+t); }
function _gsafe(s){ return s.replace(/[^A-Za-z0-9._ -]/g,'_'); }
function _f6(x){ return x.toFixed(6); }
/* parse l'OBJ/MTL regeneres par buildExport (memes donnees que la reference python) */
function _parseObjText(txt){
  var V=[],VT=[],mats=[],cur=null, lines=txt.split('\n');
  for(var i=0;i<lines.length;i++){ var l=lines[i];
    if(l.startsWith('v ')){ var p=l.split(/\s+/); V.push([+p[1],+p[2],+p[3]]); }
    else if(l.startsWith('vt ')){ var q=l.split(/\s+/); VT.push([+q[1],+q[2]]); }
    else if(l.startsWith('usemtl')){ cur={name:l.slice(6).trim(),tris:[]}; mats.push(cur); }
    else if(l.startsWith('f ')){ var cs=[],tk=l.split(/\s+/);
      for(var k=1;k<tk.length;k++){ if(!tk[k])continue; var a=tk[k].split('/');
        cs.push([parseInt(a[0],10)-1, (a.length>1&&a[1]!=='')?parseInt(a[1],10)-1:-1]); }
      for(var k2=1;k2<cs.length-1;k2++)cur.tris.push([cs[0],cs[k2],cs[k2+1]]); } }
  return {V:V,VT:VT,mats:mats};
}
function _parseMtlText(txt){
  var out={},cur=null, lines=txt.split('\n');
  for(var i=0;i<lines.length;i++){ var s=lines[i].trim();
    if(s.startsWith('newmtl')){ cur={kd:[0.72,0.72,0.72],map:null,alpha:1}; out[s.slice(6).trim()]=cur; }
    else if(cur&&s.startsWith('Kd ')){ var p=s.split(/\s+/); cur.kd=[+p[1],+p[2],+p[3]]; }
    else if(cur&&/^map_kd/i.test(s)){ cur.map=s.slice(6).trim().replace(/\\/g,'/').split('/').pop(); }
    else if(cur&&s.startsWith('d ')){ var v=parseFloat(s.slice(2)); if(!isNaN(v))cur.alpha=Math.max(0,Math.min(1,v)); } }
  return out;
}
/* geometrie commune : Z-up, centre XY, sol Z=0 (reaxage si la vue est Y-up) */
function _prepGeo(ex, up){
  var od=_parseObjText(ex.obj), MTL=_parseMtlText(ex.mtl);
  var P=od.V.map(function(v){ return (up==='Y')?[v[0],-v[2],v[1]]:[v[0],v[1],v[2]]; });
  var mn=[1e30,1e30,1e30],mx=[-1e30,-1e30,-1e30];
  P.forEach(function(p){ for(var a=0;a<3;a++){ if(p[a]<mn[a])mn[a]=p[a]; if(p[a]>mx[a])mx[a]=p[a]; } });
  var cx=(mn[0]+mx[0])/2, cy=(mn[1]+mx[1])/2, z0=mn[2];
  P=P.map(function(p){ return [p[0]-cx,p[1]-cy,p[2]-z0]; });
  return {P:P, VT:od.VT, mats:od.mats, MTL:MTL,
          dim:[Math.max(mx[0]-mn[0],1e-6),Math.max(mx[1]-mn[1],1e-6),Math.max(mx[2]-mn[2],1e-6)]};
}
/* silhouette vue de dessus : grille d'occupation + bords + Douglas-Peucker.
   Retourne des boucles de points [[x,y],...] en coordonnees objet (XY, origine centre). */
function _silhouette2D(g){
  var mn=[1e30,1e30],mx=[-1e30,-1e30];
  g.P.forEach(function(p){ if(p[0]<mn[0])mn[0]=p[0]; if(p[0]>mx[0])mx[0]=p[0];
    if(p[1]<mn[1])mn[1]=p[1]; if(p[1]>mx[1])mx[1]=p[1]; });
  var w=Math.max(mx[0]-mn[0],1e-6), h=Math.max(mx[1]-mn[1],1e-6);
  var cell=Math.max(w,h)/220, nx=Math.ceil(w/cell)+4, ny=Math.ceil(h/cell)+4;
  var ox=mn[0]-2*cell, oy=mn[1]-2*cell;
  var occ=new Uint8Array(nx*ny);
  g.mats.forEach(function(m){ m.tris.forEach(function(tri){
    var ax=g.P[tri[0][0]][0],ay=g.P[tri[0][0]][1],
        bx=g.P[tri[1][0]][0],by=g.P[tri[1][0]][1],
        cx=g.P[tri[2][0]][0],cy=g.P[tri[2][0]][1];
    var x0=Math.max(0,Math.floor((Math.min(ax,bx,cx)-ox)/cell)),
        x1=Math.min(nx-1,Math.ceil((Math.max(ax,bx,cx)-ox)/cell)),
        y0=Math.max(0,Math.floor((Math.min(ay,by,cy)-oy)/cell)),
        y1=Math.min(ny-1,Math.ceil((Math.max(ay,by,cy)-oy)/cell));
    var d=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy); if(Math.abs(d)<1e-12)return;
    for(var gy=y0;gy<=y1;gy++)for(var gx=x0;gx<=x1;gx++){
      var px=ox+(gx+0.5)*cell, py=oy+(gy+0.5)*cell;
      var l1=((by-cy)*(px-cx)+(cx-bx)*(py-cy))/d,
          l2=((cy-ay)*(px-cx)+(ax-cx)*(py-cy))/d, l3=1-l1-l2;
      if(l1>=-0.001&&l2>=-0.001&&l3>=-0.001)occ[gy*nx+gx]=1; }
  }); });
  var out=[];
  function addSeg(x1,y1,x2,y2){ out.push([x1,y1,x2,y2]); }
  for(var y=0;y<ny;y++)for(var x=0;x<nx;x++){ if(!occ[y*nx+x])continue;
    if(x===0||!occ[y*nx+x-1])addSeg(x,y,x,y+1);
    if(x===nx-1||!occ[y*nx+x+1])addSeg(x+1,y,x+1,y+1);
    if(y===0||!occ[(y-1)*nx+x])addSeg(x,y,x+1,y);
    if(y===ny-1||!occ[(y+1)*nx+x])addSeg(x,y+1,x+1,y+1); }
  var byPt=new Map();
  function pk(x,y){ return x+'_'+y; }
  out.forEach(function(s,i){ [pk(s[0],s[1]),pk(s[2],s[3])].forEach(function(kk){
    if(!byPt.has(kk))byPt.set(kk,[]); byPt.get(kk).push(i); }); });
  var used=new Uint8Array(out.length), loops=[];
  for(var i0=0;i0<out.length;i0++){ if(used[i0])continue;
    var s0=out[i0]; used[i0]=1;
    var loop=[[s0[0],s0[1]],[s0[2],s0[3]]];
    for(;;){ var last=loop[loop.length-1];
      var cands=(byPt.get(pk(last[0],last[1]))||[]).filter(function(j){ return !used[j]; });
      if(!cands.length)break;
      var j=cands[0], t=out[j]; used[j]=1;
      if(t[0]===last[0]&&t[1]===last[1])loop.push([t[2],t[3]]);
      else loop.push([t[0],t[1]]);
      var f=loop[0], l9=loop[loop.length-1];
      if(f[0]===l9[0]&&f[1]===l9[1])break; }
    if(loop.length>3)loops.push(loop); }
  function dp(pts,eps){
    if(pts.length<3)return pts;
    var dmax=0,idx=0, a=pts[0], b=pts[pts.length-1];
    for(var i=1;i<pts.length-1;i++){ var p=pts[i];
      var dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1e-9;
      var d=Math.abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0])/L;
      if(d>dmax){ dmax=d; idx=i; } }
    if(dmax>eps){ var r1=dp(pts.slice(0,idx+1),eps), r2=dp(pts.slice(idx),eps);
      return r1.slice(0,-1).concat(r2); }
    return [a,b];
  }
  return loops.map(function(lp){
    /* boucle fermee : DP degenere (a==b) -> simplifier en deux moities */
    var closed=lp[0][0]===lp[lp.length-1][0]&&lp[0][1]===lp[lp.length-1][1];
    var simp;
    if(closed&&lp.length>4){ var m=Math.floor(lp.length/2);
      var h1=dp(lp.slice(0,m+1),1.3), h2=dp(lp.slice(m),1.3);
      simp=h1.slice(0,-1).concat(h2); }
    else simp=dp(lp,1.3);
    return simp.map(function(p){ return [ox+p[0]*cell, oy+p[1]*cell]; });
  });
}
/* capture du canvas WebGL en PNG (rendu synchrone puis lecture immediate) */

function gsmZip(ex, opts){
  opts=opts||{};
  var g=_prepGeo(ex, opts.up), name=ex.base.replace(/\s+L$/,''), safe=_gsafe(name);
  var texByFile={}; ex.texs.forEach(function(t){ texByFile[t.name]=t.blob; });
  var L=['! '+name+' \u2014 BPO Moulinette (QEM), objet GDL genere le '+new Date().toISOString().slice(0,10)];
  var texs=[];   /* {key, fn, blob} */
  g.mats.forEach(function(m,i){
    var mi=g.MTL[m.name]||{kd:[0.72,0.72,0.72],map:null,alpha:1};
    if(mi.map&&texByFile[mi.map]){
      var ext=(mi.map.match(/\.[A-Za-z0-9]+$/)||['.png'])[0].toLowerCase();
      var key='bpo_t'+(i+1), fn=safe.toLowerCase().replace(/[^a-z0-9]+/g,'_')+'_'+key+ext;
      texs.push({key:key,fn:fn,blob:texByFile[mi.map]});
      L.push('DEFINE TEXTURE "'+key+'" "'+fn+'", 1, 1, 1, 0');
    } });
  L.push('');
  g.mats.forEach(function(m,i){
    var mi=g.MTL[m.name]||{kd:[0.72,0.72,0.72],map:null,alpha:1};
    var tr=_f6(1-mi.alpha), tx=texs.filter(function(t){return t.key==='bpo_t'+(i+1);})[0];
    if(mi.map&&tx)
      L.push('DEFINE MATERIAL "BPO_M'+(i+1)+'"  21, 1.000000, 1.000000, 1.000000, 1.0, 0.5, 0.5, '+tr+', 3.0, 0, 1, 1, IND(TEXTURE, "'+tx.key+'")');
    else
      L.push('DEFINE MATERIAL "BPO_M'+(i+1)+'"  1, '+_f6(mi.kd[0])+', '+_f6(mi.kd[1])+', '+_f6(mi.kd[2])+', 1.0, 0.5, 0.5, '+tr+', 3.0, 0');
  });
  L.push('', 'MULX A / '+_f6(g.dim[0]), 'MULY B / '+_f6(g.dim[1]), 'MULZ ZZYZX / '+_f6(g.dim[2]), '');
  /* dièdre par arête GÉOMÉTRIQUE (paire de positions, indépendante des coutures UV) :
     cos > 0.64 (~50°) => arête douce (statut 3, AC lisse) sinon dure (statut 1) —
     même seuil que l'ombrage de la visionneuse */
  var edgeSoft=new Map();
  g.mats.forEach(function(m){ m.tris.forEach(function(tri){
    var a=g.P[tri[0][0]], b=g.P[tri[1][0]], c=g.P[tri[2][0]];
    var ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2], wx=c[0]-a[0],wy=c[1]-a[1],wz=c[2]-a[2];
    var nx=uy*wz-uz*wy, ny=uz*wx-ux*wz, nz=ux*wy-uy*wx;
    var l=Math.sqrt(nx*nx+ny*ny+nz*nz)||1; nx/=l;ny/=l;nz/=l;
    for(var k=0;k<3;k++){ var v1=tri[k][0], v2=tri[(k+1)%3][0];
      var ky=(v1<v2)?v1+'_'+v2:v2+'_'+v1, e=edgeSoft.get(ky);
      if(e===undefined)edgeSoft.set(ky,[nx,ny,nz]);
      else if(e!==true&&e!==false)
        edgeSoft.set(ky,(nx*e[0]+ny*e[1]+nz*e[2])>0.64); }
  }); });
  /* DEUX corps : matieres UNIES en VERT (dialecte exact du plugin meubles, lissage
     AC valide de longue date) ; matieres TEXTUREES en TEVE + COOR 1024 (UV). */
  var texIdx=[], plainIdx=[];
  g.mats.forEach(function(m,i){
    (texs.some(function(t){return t.key==='bpo_t'+(i+1);})?texIdx:plainIdx).push(i);
  });
  function emitBody(list, withUV){
    if(!list.length)return;
    var nv=0,ne=0, vmap=new Map(), emap=new Map();
    L.push('BASE','');
    list.forEach(function(i){
      var m=g.mats[i];
      L.push('SET MATERIAL "BPO_M'+(i+1)+'"');
      m.tris.forEach(function(tri){
        var ids=[];
        for(var k=0;k<3;k++){ var vi=tri[k][0], ti=withUV?tri[k][1]:-1;
          var kk=withUV?(vi+'/'+ti):(''+vi), j=vmap.get(kk);
          if(j===undefined){ nv++; j=nv; vmap.set(kk,j);
            var p=g.P[vi];
            if(withUV){ var t=(ti>=0&&ti<g.VT.length)?g.VT[ti]:[0,0];
              L.push('TEVE '+_f6(p[0])+', '+_f6(p[1])+', '+_f6(p[2])+', '+_f6(t[0])+', '+_f6(t[1])); }
            else L.push('VERT '+_f6(p[0])+', '+_f6(p[1])+', '+_f6(p[2])); }
          ids.push(j); }
        var es=[];
        for(var k2=0;k2<3;k2++){ var a=ids[k2], b=ids[(k2+1)%3];
          var ky=(a<b)?a+'_'+b:b+'_'+a, e=emap.get(ky);
          if(e===undefined){ ne++;
            var v1=tri[k2][0], v2=tri[(k2+1)%3][0];
            var gk=(v1<v2)?v1+'_'+v2:v2+'_'+v1;
            var st=(edgeSoft.get(gk)===false)?1:3;	/* dure invisible / douce (lissee) */
            L.push('EDGE '+a+', '+b+', -1, -1, '+st);
            emap.set(ky,{i:ne,a:a}); es.push(ne); }
          else{ es.push(a===e.a?e.i:-e.i); emap.delete(ky); } }	/* pleine (2 usages) : refermee */
        L.push('PGON 3, 0, 2, '+es[0]+', '+es[1]+', '+es[2]);	/* 2 = surface courbe (lissage) */
      });
    });
    if(withUV)L.push('','TEVE 0, 0, 0, 0, 0','TEVE 1, 0, 0, 1, 1','TEVE 0, 1, 0, 1, 1','TEVE 0, 0, 1, 1, 1',
                     'COOR 1024, -1, -2, -3, -4');
    L.push('','BODY -1','');
  }
  emitBody(plainIdx,false);
  emitBody(texIdx,true);
  var gdl=L.join('\n');
  /* symbole 2D cuit : silhouette vue de dessus (boucles -> <Line> du Fragment2) */
  var loops=_silhouette2D(g), f2lines=[];
  loops.forEach(function(lp){ for(var i=0;i<lp.length-1;i++){
    f2lines.push('\t<Line>\n\t\t<DrawIndex>9</DrawIndex>\n\t\t<Pen>1</Pen>\n\t\t<Layer>1</Layer>\n\t\t<Pattern>1</Pattern>\n\t\t<InIndex>0</InIndex>\n\t\t<BegX>'+_f6(lp[i][0])+'</BegX>\n\t\t<BegY>'+_f6(lp[i][1])+'</BegY>\n\t\t<EndX>'+_f6(lp[i+1][0])+'</EndX>\n\t\t<EndY>'+_f6(lp[i+1][1])+'</EndY>\n\t\t<IsContour>true</IsContour>\n\t</Line>'); } });
  var fragment2='<?xml version="1.0" encoding="UTF-8"?>\n<Fragment2 Ordering="DrawQueue">\n'+f2lines.join('\n')+'\n</Fragment2>\n';
  /* la vignette est FOURNIE : _previewPNG tirait tout le moteur WebGL de la
     moulinette. Absente, la balise <Picture> est simplement omise. */
  var preview=opts.preview||null;
  var H='_hsf/'+safe+'/';
  var libpartdata='<?xml version="1.0" encoding="UTF-8"?>\n<LibpartData Owner="0" Signature="1196644685" Version="46">\n\t<Identification>\n\t\t<MainGUID>00000000-0000-0000-0000-000000000000</MainGUID>\n\t\t<IsPlaceable>true</IsPlaceable>\n\t\t<IsArchivable>false</IsArchivable>\n\t\t<MigrationValue>Normal</MigrationValue>\n\t\t<IsTemplate>false</IsTemplate>\n\t</Identification>\n\t<SubKind SectVersion="1" SectionFlags="0" SubIdent="0"/>\n\t<Fragment2 SectVersion="36" SectionFlags="0" SubIdent="0"/>\n\t<Script_2D SectVersion="20" SectionFlags="0" SubIdent="0"/>\n\t<Script_3D SectVersion="20" SectionFlags="0" SubIdent="0"/>\n\t<Comment SectVersion="20" SectionFlags="0" SubIdent="0"/>\n\t<ParamSection SectVersion="16" SectionFlags="0" SubIdent="0"/>\n'+(preview?'\t<Picture MIME="image/png" Name="Preview_0.png" SectVersion="19" SectionFlags="0" SubIdent="0"/>\n':'')+'\t<Ancestry SectVersion="1" SectionFlags="0" SubIdent="0"/>\n</LibpartData>\n';
  var ancestry='<?xml version="1.0" encoding="UTF-8"?>\n<Ancestry>\n\t<MainGUID>F938E33A-329D-4A36-BE3E-85E126820996</MainGUID>\n\t<MainGUID>103E8D2C-8230-42E1-9597-46F84CCE28C0</MainGUID>\n</Ancestry>\n';
  var docs='<?xml version="1.0" encoding="UTF-8"?>\n<libpartdocs>\n\t<CommentSection>\n\t\t<![CDATA[!'+name+' \u2014 allege par BPO Moulinette (QEM)]]>\n\t</CommentSection>\n\n</libpartdocs>\n';
  var params='<?xml version="1.0" encoding="UTF-8"?>\n<ParamSection>\n\t<ParamSectHeader>\n\t\t<AutoHotspots>true</AutoHotspots>\n\t\t<WDLeftFrame>0</WDLeftFrame>\n\t\t<WDRightFrame>0</WDRightFrame>\n\t\t<WDTopFrame>0</WDTopFrame>\n\t\t<WDBotFrame>0</WDBotFrame>\n\t\t<LayFlags>65535</LayFlags>\n\t\t<WDMirrorThickness>0</WDMirrorThickness>\n\t\t<WDWallInset>0</WDWallInset>\n\t</ParamSectHeader>\n\t<Parameters SectVersion="16" SectionFlags="0" SubIdent="0">\n\t\t<Length Name="A">\n\t\t\t<Description><![CDATA["Largeur"]]></Description>\n\t\t\t<Value>'+_f6(g.dim[0])+'</Value>\n\t\t</Length>\n\t\t<Length Name="B">\n\t\t\t<Description><![CDATA["Profondeur"]]></Description>\n\t\t\t<Value>'+_f6(g.dim[1])+'</Value>\n\t\t</Length>\n\t\t<Length Name="zzyzx">\n\t\t\t<Description><![CDATA["Hauteur"]]></Description>\n\t\t\t<Value>'+_f6(g.dim[2])+'</Value>\n\t\t</Length>\n\t</Parameters>\n</ParamSection>\n';
  var bat='@echo off\r\nsetlocal\r\nset "CONV="\r\nfor %%V in (29 28 27 26) do if exist "C:\\Program Files\\Graphisoft\\Archicad %%V\\LP_XMLConverter.exe" if not defined CONV set "CONV=C:\\Program Files\\Graphisoft\\Archicad %%V\\LP_XMLConverter.exe"\r\nif not defined CONV (\r\n  echo LP_XMLConverter introuvable : Archicad 26 a 29 requis.\r\n  pause\r\n  exit /b 1\r\n)\r\n"%CONV%" hsf2libpart "%~dp0_hsf\\'+safe+'" "%~dp0'+safe+' BPO.gsm"\r\nif errorlevel 1 (\r\n  echo ECHEC de la conversion.\r\n  pause\r\n  exit /b 1\r\n)\r\necho.\r\necho OK : "'+safe+' BPO.gsm" cree a cote de ce script.\r\necho Ajoutez CE DOSSIER comme bibliotheque liee dans ArchiCAD\r\necho (Fichier ^> Bibliotheques et objets ^> Gestionnaire de Bibliotheque ^> Ajouter).\r\npause\r\n';
  /* PENDANT macOS du .bat (10/09/2026). Sans lui, le paquet se telechargeait
     sur un Mac et rien ne le convertissait. Le chemin de LP_XMLConverter varie
     selon les versions : on CHERCHE, et si on ne trouve pas on dit comment
     chercher — jamais d'echec muet. */
  var cmd='#!/bin/sh\n'
    +'# BPO — conversion HSF vers .gsm sur macOS (le .bat voisin fait de meme sous Windows).\n'
    +'cd \"$(dirname \"$0\")\" || exit 1\n'
    +'CONV=\"\"\n'
    +'for V in 29 28 27 26; do\n'
    +'  for P in \"/Applications/Graphisoft/Archicad $V/LP_XMLConverter.app/Contents/MacOS/LP_XMLConverter\" \"/Applications/Archicad $V/LP_XMLConverter.app/Contents/MacOS/LP_XMLConverter\" \"/Applications/Graphisoft/Archicad $V/LP_XMLConverter\"; do\n'
    +'    if [ -z \"$CONV\" ] && [ -x \"$P\" ]; then CONV=\"$P\"; fi\n'
    +'  done\n'
    +'done\n'
    +'if [ -z \"$CONV\" ]; then\n'
    +'  echo \"LP_XMLConverter introuvable (il est livre avec Archicad 26 a 29).\"\n'
    +'  echo \"Pour le localiser :   mdfind -name LP_XMLConverter\"\n'
    +'  echo \"Puis :   <chemin> hsf2libpart \\\"$PWD/_hsf/'+safe+'\\\" \\\"$PWD/'+safe+' BPO.gsm\\\"\"\n'
    +'  exit 1\n'
    +'fi\n'
    +'\"$CONV\" hsf2libpart \"$PWD/_hsf/'+safe+'\" \"$PWD/'+safe+' BPO.gsm\" || { echo \"ECHEC de la conversion.\"; exit 1; }\n'
    +'echo \"OK : '+safe+' BPO.gsm cree a cote de ce script.\"\n'
    +'echo \"Ajoutez CE DOSSIER comme bibliotheque liee dans Archicad.\"\n';
  var lisez='Paquet ArchiCAD \u2014 '+name+'\r\n\r\n1) Windows : double-cliquez CONVERTIR EN GSM.bat\r\n   macOS   : dans le Terminal, chmod +x \\\"CONVERTIR EN GSM.command\\\" puis lancez-le\r\n   (Archicad 26 a 29 doit etre installe : la conversion est faite par LUI).\r\n2) Ajoutez le dossier dezippe comme bibliotheque liee dans ArchiCAD\r\n   (le .gsm et le dossier textures\\ doivent rester ensemble).\r\n3) L\u2019objet est etirable via ses parametres A / B / Hauteur.\r\n\r\nGenere par BPO Moulinette (QEM).\r\n';
  var enc=new TextEncoder();
  var entries=[
    {name:H+'libpartdata.xml',data:_bom(libpartdata)},
    {name:H+'ancestry.xml',data:_bom(ancestry)},
    {name:H+'libpartdocs.xml',data:_bom(docs)},
    {name:H+'paramlist.xml',data:_bom(params)},
    {name:H+'binaries/subkind.bin',data:_b64bytes(SUBKIND_B64)},
    {name:H+'binaries/fragment2.xml',data:_bom(fragment2)},
    {name:H+'scripts/2d.gdl',data:_bom('! silhouette cuite (Fragment2) ; repli : PROJECT2 3, 270, 2\nFRAGMENT2 ALL, 1\n')},
    {name:H+'scripts/3d.gdl',data:_bom(gdl)},
    {name:'CONVERTIR EN GSM.bat',data:enc.encode(bat)},
    {name:'CONVERTIR EN GSM.command',data:enc.encode(cmd)},
    {name:'LISEZMOI.txt',data:enc.encode(lisez)}];
  if(preview)entries.push({name:H+'images/Preview_0.png',data:preview});
  var chain=Promise.resolve();
  texs.forEach(function(t){ chain=chain.then(function(){ return t.blob.arrayBuffer().then(function(ab){
    entries.push({name:'textures/'+t.fn,data:new Uint8Array(ab)}); }); }); });
  return chain.then(function(){ return makeZip(entries); })
    .then(function(zip){
      if(opts.telecharger!==false) dl(zip, opts.nomZip||(name+' BPO ArchiCAD.zip'));
      return zip; });
}

glob.BPO_GSM = {
  zip: gsmZip,
  /* exposes pour un banc de controle ou un futur reemploi ; ce sont les memes
     fonctions que celles qu'utilise gsmZip, jamais des copies. */
  prepGeo: _prepGeo, silhouette2D: _silhouette2D, makeZip: makeZip,
  parseObjText: _parseObjText, parseMtlText: _parseMtlText
};
})(typeof window!=='undefined'?window:this);
