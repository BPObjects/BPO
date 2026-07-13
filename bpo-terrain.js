/* ============================================================================
   BPO — CONFIGURATEUR TERRAIN (MNT depuis DXF de points cotés)
   ----------------------------------------------------------------------------
   Charge un DXF topo (altitudes écrites en MTEXT = points cotés), en extrait les
   cotes, et construit un Modèle Numérique de Terrain éditable :
     · maille (résolution grille), lissage, découpe au contour réel,
     · bande d'altitude (pour écarter profondeurs / fils d'eau),
     · rendu maillé coloré par altitude, posable en scène comme tout objet.
   100 % JS, sans CDN (fonctionne hors-ligne). Le maillage est poussé dans FC,
   donc rendu en logiciel ET WebGL comme les autres configurateurs.
   Exposé : window.BPO_terrain { PTERR, setDXF, buildFC, buildUI, hasData }.
   ============================================================================ */
(function () {
  var glob = window, doc = document;
  function tr(s){ return (typeof glob.tr === 'function') ? glob.tr(s) : s; }

  /* Paramètres du configurateur (objet paramétrique du mode 'terrain'). */
  var PTERR = {
    step: 3.0,        // maille de la grille (m)
    smooth: 1.0,      // lissage (0 = brut)
    cut: 12,          // distance de découpe au contour réel (m)
    bandMin: 18,      // altitude mini retenue (écarte profondeurs ~1-2 m)
    bandMax: 45,      // altitude maxi retenue
    exag: 1.0,        // exagération verticale
    colorByAlt: 1,    // 1 = dégradé d'altitude, 0 = matière unie (FINISH.terrain)
    absolute: 0,      // 1 = garde l'altitude ABSOLUE (base ~ z réel), 0 = base à 0
    drape: 0,         // 1 = drape les lignes du DXF (voiries/bâti) sur le terrain
    drapeLayers: null,// { nomCalque: 1 } couches drapées
    contours: 0,      // 1 = courbes de niveau sur le terrain
    contourInt: 0.5,  // équidistance des courbes (m)
    contourW: 20,     // épaisseur des courbes (cm)
    contourMaster: 5, // courbe maîtresse (plus épaisse) tous les N intervalles (0 = aucune)
    mesh: 0,          // 1 = afficher la maille (lignes de grille)
    thick: 0,         // épaisseur du socle (cm ; 0 = surface seule)
    thickFlat: 1,     // 1 = fond plat horizontal ; 0 = fond parallèle à la surface
    // ---- Terrain CRÉÉ (sans DXF) : plateforme d'une forme donnée ----
    src: 'dxf',       // 'dxf' (points cotés) | 'shape' (forme paramétrique)
    shape: 'rect',    // 'rect' | 'u' | 't' | 'libre'
    sw: 8000, sd: 6000,          // emprise L × P (cm)
    uArm: 2500, tArm: 2500,      // largeur des branches U / T (cm)
    sBase: 0,                    // altitude de base (cm)
    sverts: '-40,-30 40,-30 40,30 -40,30',  // polygone libre (m) "x,y x,y ..."
    ctrlN: 3,                    // points de contrôle du relief par côté (grille ctrlN×ctrlN)
    ctrlZ: null,                 // altitudes des points de contrôle (cm), longueur ctrlN²
    name: 'Terrain'
  };
  glob.PTERR = PTERR;

  var RAW = null;       // points bruts {x,y,z} en mètres (toutes cotes numériques)
  var POLYS = null;     // polylignes/lignes {layer, closed, pts:[[x,y]]} (drapé)
  var LAYERS = null;    // couches présentes [{layer,n}] triées
  var MESH = null;      // maillage en cache {V:[[x,y,z]], F:[[a,b,c],col], grid, dims, sig}
  var _name = '';

  /* ---- Parse DXF : points d'insertion MTEXT + valeur numérique (mm -> m) ---- */
  function parseDXFall(text) {
    var lines = text.split(/\r?\n/), n = lines.length;
    var sec = null, cur = null, rec = null, pts = [], plys = [];
    var numre = /^-?\d{1,4}\.\d{1,3}$/;
    function clean(s) { return s.replace(/\\[A-Za-z][^;]*;/g, '').replace(/\\P/g, ' ').replace(/[{}]/g, '').trim(); }
    function flushM() { if (cur === 'MTEXT' && rec) { var t = clean(rec.t).replace(',', '.'); if (numre.test(t) && rec.x != null && rec.y != null) { var z = parseFloat(t); if (z > 0 && z < 500) pts.push({ x: rec.x/1000, y: rec.y/1000, z: z }); } } }
    function flushP() { if ((cur === 'LWPOLYLINE' || cur === 'LINE') && rec && rec.v && rec.v.length >= 2) plys.push({ layer: rec.l, closed: rec.c, pts: rec.v }); }
    for (var k = 0; k + 1 < n; k += 2) {
      var c = lines[k].trim(), v = lines[k + 1];
      if (c === '2') { var vv = v.trim(); if (vv === 'HEADER' || vv === 'ENTITIES' || vv === 'BLOCKS' || vv === 'TABLES' || vv === 'OBJECTS' || vv === 'CLASSES') sec = vv; }
      if (sec !== 'ENTITIES') continue;
      if (c === '0') { flushM(); flushP(); cur = v.trim();
        rec = (cur === 'MTEXT') ? { x: null, y: null, t: '' } : ((cur === 'LWPOLYLINE' || cur === 'LINE') ? { l: '?', c: false, v: [], _px: null, _ax: null, _bx: null } : null);
      } else if (rec) {
        if (c === '8') rec.l = v.trim();
        else if (cur === 'MTEXT') { if (c === '10') { var f = parseFloat(v); if (!isNaN(f)) rec.x = f; } else if (c === '20') { var g = parseFloat(v); if (!isNaN(g)) rec.y = g; } else if (c === '1' || c === '3') rec.t += v; }
        else if (cur === 'LWPOLYLINE') { if (c === '70') rec.c = ((parseInt(v, 10) || 0) & 1) === 1; else if (c === '10') rec._px = parseFloat(v) / 1000; else if (c === '20') { var py = parseFloat(v) / 1000; if (rec._px != null && !isNaN(py)) rec.v.push([rec._px, py]); rec._px = null; } }
        else if (cur === 'LINE') { if (c === '10') rec._ax = parseFloat(v)/1000; else if (c === '20') rec._ay = parseFloat(v)/1000; else if (c === '11') rec._bx = parseFloat(v)/1000; else if (c === '21') { rec._by = parseFloat(v)/1000; if (rec._ax != null && rec._bx != null) rec.v = [[rec._ax, rec._ay], [rec._bx, rec._by]]; } }
      }
    }
    flushM(); flushP();
    return { points: pts, polys: plys };
  }

  function setDXF(text, name) {
    var r = parseDXFall(text); RAW = r.points; POLYS = r.polys; _name = name || ''; MESH = null;
    var lc = {}; for (var i = 0; i < POLYS.length; i++) { var l = POLYS[i].layer; lc[l] = (lc[l] || 0) + 1; }
    LAYERS = Object.keys(lc).map(function (l) { return { layer: l, n: lc[l] }; }).sort(function (a, b) { return b.n - a.n; });
    if (LAYERS.length && !PTERR.drapeLayers) { PTERR.drapeLayers = {}; PTERR.drapeLayers[LAYERS[0].layer] = 1; }
    return RAW.length;
  }
  function hasData() { return !!(RAW && RAW.length); }

  /* ---- Rampe d'altitude (vert bas -> jaune -> brun haut), comme une carte topo ---- */
  function altColor(t) { // t 0..1
    t = Math.max(0, Math.min(1, t));
    var stops = [[80,150,90],[150,175,90],[210,200,120],[170,130,86],[150,140,135]];
    var f = t * (stops.length - 1), i = Math.floor(f), a = stops[i], b = stops[Math.min(stops.length - 1, i + 1)], u = f - i;
    return [Math.round(a[0] + (b[0]-a[0])*u), Math.round(a[1] + (b[1]-a[1])*u), Math.round(a[2] + (b[2]-a[2])*u)];
  }

  /* ---- Construction du MNT (grille) depuis les points, selon PTERR ---- */
  function buildMesh() {
    if (!hasData()) return null;
    var step = Math.max(0.5, +PTERR.step || 3), cut = Math.max(step, +PTERR.cut || 12);
    var bmin = +PTERR.bandMin, bmax = +PTERR.bandMax;
    // 1) filtre bande d'altitude
    var P = [];
    for (var i = 0; i < RAW.length; i++) { var p = RAW[i]; if (p.z > bmin && p.z < bmax) P.push(p); }
    if (P.length < 3) return null;
    // 2) dédoublonnage (cellule 0.5 m, moyenne z)
    var dd = {}, DP = [];
    for (i = 0; i < P.length; i++) { var kx = Math.round(P[i].x/0.5), ky = Math.round(P[i].y/0.5), key = kx+'_'+ky; if (!dd[key]) { dd[key] = 1; DP.push(P[i]); } }
    P = DP;
    // 3) hash spatial (buckets de côté = cut) pour voisins
    var minX=1e18,minY=1e18,maxX=-1e18,maxY=-1e18;
    for (i=0;i<P.length;i++){ var q=P[i]; if(q.x<minX)minX=q.x; if(q.y<minY)minY=q.y; if(q.x>maxX)maxX=q.x; if(q.y>maxY)maxY=q.y; }
    var bs = cut, hb = {};
    function bkey(bx,by){ return bx+'_'+by; }
    for (i=0;i<P.length;i++){ var bx=Math.floor((P[i].x-minX)/bs), by=Math.floor((P[i].y-minY)/bs), kk=bkey(bx,by); (hb[kk]||(hb[kk]=[])).push(i); }
    function nearK(x,y,K){ var bx=Math.floor((x-minX)/bs), by=Math.floor((y-minY)/bs), res=[], ring=1;
      while(ring<300){ res=[];
        for(var ox=-ring;ox<=ring;ox++)for(var oy=-ring;oy<=ring;oy++){ var arr=hb[bkey(bx+ox,by+oy)]; if(arr) for(var j=0;j<arr.length;j++){ var pi=arr[j], dxp=P[pi].x-x, dyp=P[pi].y-y; res.push([dxp*dxp+dyp*dyp,pi]); } }
        if(res.length>=K) break; ring++; }
      res.sort(function(a,b){return a[0]-b[0];}); return res.slice(0,K); }
    // 4) retrait des creux locaux (fils d'eau / regards) : z < médiane voisins - 1.2 m
    var kept=[];
    for(i=0;i<P.length;i++){ var nb=nearK(P[i].x,P[i].y,9), zz=nb.map(function(e){return P[e[1]].z;}).sort(function(a,b){return a-b;}); var med=zz.length?zz[zz.length>>1]:P[i].z; if(P[i].z > med-1.2) kept.push(P[i]); }
    P = kept.length>=3 ? kept : P;
    // recompute bounds + hash sur P nettoyé
    minX=1e18;minY=1e18;maxX=-1e18;maxY=-1e18; for(i=0;i<P.length;i++){var q2=P[i]; if(q2.x<minX)minX=q2.x; if(q2.y<minY)minY=q2.y; if(q2.x>maxX)maxX=q2.x; if(q2.y>maxY)maxY=q2.y;}
    hb={}; for(i=0;i<P.length;i++){ var bx2=Math.floor((P[i].x-minX)/bs), by2=Math.floor((P[i].y-minY)/bs), kk2=bkey(bx2,by2); (hb[kk2]||(hb[kk2]=[])).push(i); }
    // 5) grille
    var nx=Math.floor((maxX-minX)/step)+1, ny=Math.floor((maxY-minY)/step)+1;
    if (nx<2||ny<2||nx*ny>900000) { if(nx*ny>900000) return {tooBig:true}; return null; }
    var NC=nx*ny;
    // 5a) présence des points sur la grille -> distance transform (chamfer 2 passes)
    var INF=1e9, dt=new Float32Array(NC); for(i=0;i<NC;i++) dt[i]=INF;
    for(i=0;i<P.length;i++){ var gx=Math.round((P[i].x-minX)/step), gy=Math.round((P[i].y-minY)/step); if(gx>=0&&gx<nx&&gy>=0&&gy<ny) dt[gy*nx+gx]=0; }
    var d1=1.0, d2=1.41421356;
    for(var y=0;y<ny;y++)for(var x=0;x<nx;x++){ var idx=y*nx+x, m=dt[idx];
      if(x>0)m=Math.min(m,dt[idx-1]+d1); if(y>0)m=Math.min(m,dt[idx-nx]+d1);
      if(x>0&&y>0)m=Math.min(m,dt[idx-nx-1]+d2); if(x<nx-1&&y>0)m=Math.min(m,dt[idx-nx+1]+d2); dt[idx]=m; }
    for(y=ny-1;y>=0;y--)for(x=nx-1;x>=0;x--){ var idx2=y*nx+x, m2=dt[idx2];
      if(x<nx-1)m2=Math.min(m2,dt[idx2+1]+d1); if(y<ny-1)m2=Math.min(m2,dt[idx2+nx]+d1);
      if(x<nx-1&&y<ny-1)m2=Math.min(m2,dt[idx2+nx+1]+d2); if(x>0&&y<ny-1)m2=Math.min(m2,dt[idx2+nx-1]+d2); dt[idx2]=m2; }
    var cutCells=cut/step;
    var mask=new Uint8Array(NC); for(i=0;i<NC;i++) mask[i]= dt[i]<=cutCells ? 1:0;
    // 5b) fermeture morpho (dilate r, remplir trous, erode r) pour combler les îlots
    var r=Math.max(1, Math.round(cut/step));
    mask=dilate(mask,nx,ny,r); mask=fillHoles(mask,nx,ny); mask=erode(mask,nx,ny,r);
    mask=largest(mask,nx,ny);
    // 6) interpolation IDW sur les cellules du masque
    var GZ=new Float32Array(NC);
    for(y=0;y<ny;y++)for(x=0;x<nx;x++){ var id=y*nx+x; if(!mask[id]) continue;
      var wx=minX+x*step, wy=minY+y*step, nn=nearK(wx,wy,10), sw=0, sz=0;
      for(var t=0;t<nn.length;t++){ var d2v=nn[t][0]; if(d2v<1e-6){ sz=P[nn[t][1]].z; sw=1; break; } var w=1/(d2v*d2v); sw+=w; sz+=w*P[nn[t][1]].z; }
      GZ[id]= sw>0 ? sz/sw : NaN; if(!(GZ[id]===GZ[id])) mask[id]=0;
    }
    // 7) lissage (moyenne pondérée gaussienne séparable) sur le masque
    var sig=+PTERR.smooth||0; if(sig>0.01) GZ=smooth(GZ,mask,nx,ny,sig);
    // 8) recentrage + altitude relative
    var z0=1e18; for(i=0;i<NC;i++) if(mask[i]&&GZ[i]<z0) z0=GZ[i];
    var cx=(minX+maxX)/2, cy=(minY+maxY)/2, exag=+PTERR.exag||1;
    var zmax=-1e18; for(i=0;i<NC;i++) if(mask[i]&&GZ[i]>zmax) zmax=GZ[i]; var zr=Math.max(0.01,zmax-z0);
    // 9) sommets (Y-up : x, altitude, -y) + indices
    var vid=new Int32Array(NC); for(i=0;i<NC;i++) vid[i]=-1;
    var V=[], VZ=[], kv=0, zbase=(+PTERR.absolute)?z0:0;
    for(y=0;y<ny;y++)for(x=0;x<nx;x++){ var iv=y*nx+x; if(!mask[iv]) continue; var wx2=minX+x*step-cx, wy2=minY+y*step-cy, zz2=zbase+(GZ[iv]-z0)*exag; vid[iv]=kv++; V.push([wx2, zz2, -wy2]); VZ.push((GZ[iv]-z0)/zr); }
    // 10) faces (quad -> 2 triangles) colorées par altitude moyenne
    var col=(glob.FINISH&&glob.FINISH.terrain)||[150,160,120], F=[];
    for(y=0;y<ny-1;y++)for(x=0;x<nx-1;x++){ var a=vid[y*nx+x], b=vid[y*nx+x+1], c2=vid[(y+1)*nx+x+1], e=vid[(y+1)*nx+x];
      if(a>=0&&b>=0&&c2>=0&&e>=0){ F.push([a,b,c2]); F.push([a,c2,e]); } }
    return { V:V, VZ:VZ, F:F, z0:z0, grid:{ GZ:GZ, mask:mask, nx:nx, ny:ny, minX:minX, minY:minY, step:step, z0:z0, cx:cx, cy:cy, zbase:zbase, exag:exag }, dims:{ w:(maxX-minX), h:(zmax-z0)*exag, d:(maxY-minY), cy:zbase+((zmax-z0)*exag)/2 }, np:P.length, col:col };
  }

  /* ---- morpho binaire (kernel carré séparable) ---- */
  function dilate(m,nx,ny,r){ return morph(m,nx,ny,r,true); }
  function erode(m,nx,ny,r){ return morph(m,nx,ny,r,false); }
  function morph(m,nx,ny,r,dil){ var a=new Uint8Array(m), b=new Uint8Array(m.length);
    // horizontal
    for(var y=0;y<ny;y++)for(var x=0;x<nx;x++){ var v=dil?0:1; for(var o=-r;o<=r;o++){ var xx=x+o; if(xx<0||xx>=nx)continue; var s=a[y*nx+xx]; v=dil?(v|s):(v&s);} b[y*nx+x]=v; }
    var c=new Uint8Array(m.length);
    for(y=0;y<ny;y++)for(x=0;x<nx;x++){ var v2=dil?0:1; for(var o2=-r;o2<=r;o2++){ var yy=y+o2; if(yy<0||yy>=ny)continue; var s2=b[yy*nx+x]; v2=dil?(v2|s2):(v2&s2);} c[y*nx+x]=v2; }
    return c; }
  function fillHoles(m,nx,ny){ // remplit les trous fermés : flood du bord sur les 0, le reste devient 1
    var out=new Uint8Array(m.length), outside=new Uint8Array(m.length), st=[];
    for(var x=0;x<nx;x++){ st.push(x); st.push((ny-1)*nx+x); } for(var y=0;y<ny;y++){ st.push(y*nx); st.push(y*nx+nx-1); }
    while(st.length){ var id=st.pop(); if(outside[id]||m[id])continue; outside[id]=1; var px=id%nx, py=(id/nx)|0;
      if(px>0)st.push(id-1); if(px<nx-1)st.push(id+1); if(py>0)st.push(id-nx); if(py<ny-1)st.push(id+nx); }
    for(var i=0;i<m.length;i++) out[i]= (m[i]||!outside[i])?1:0; return out; }
  function largest(m,nx,ny){ var lab=new Int32Array(m.length), cur=0, best=0, bestn=0;
    for(var s=0;s<m.length;s++){ if(!m[s]||lab[s])continue; cur++; var cnt=0, st=[s]; lab[s]=cur;
      while(st.length){ var id=st.pop(); cnt++; var px=id%nx,py=(id/nx)|0;
        [[px-1,py],[px+1,py],[px,py-1],[px,py+1]].forEach(function(nn){ var nxp=nn[0],nyp=nn[1]; if(nxp<0||nyp<0||nxp>=nx||nyp>=ny)return; var nid=nyp*nx+nxp; if(m[nid]&&!lab[nid]){lab[nid]=cur; st.push(nid);} }); }
      if(cnt>bestn){bestn=cnt;best=cur;} }
    var out=new Uint8Array(m.length); for(var k=0;k<m.length;k++) out[k]= lab[k]===best?1:0; return out; }
  function smooth(GZ,mask,nx,ny,sig){ var rad=Math.max(1,Math.round(sig*2)), ker=[]; var ss=2*sig*sig; for(var o=-rad;o<=rad;o++) ker.push(Math.exp(-o*o/ss));
    var tmp=new Float32Array(GZ.length), out=new Float32Array(GZ.length);
    for(var y=0;y<ny;y++)for(var x=0;x<nx;x++){ var id=y*nx+x; if(!mask[id]){tmp[id]=GZ[id];continue;} var sw=0,sv=0; for(var o2=-rad;o2<=rad;o2++){ var xx=x+o2; if(xx<0||xx>=nx)continue; var nid=y*nx+xx; if(!mask[nid])continue; var w=ker[o2+rad]; sw+=w; sv+=w*GZ[nid]; } tmp[id]= sw>0?sv/sw:GZ[id]; }
    for(y=0;y<ny;y++)for(x=0;x<nx;x++){ var id2=y*nx+x; if(!mask[id2]){out[id2]=tmp[id2];continue;} var sw2=0,sv2=0; for(var o3=-rad;o3<=rad;o3++){ var yy=y+o3; if(yy<0||yy>=ny)continue; var nid2=yy*nx+x; if(!mask[nid2])continue; var w2=ker[o3+rad]; sw2+=w2; sv2+=w2*tmp[nid2]; } out[id2]= sw2>0?sv2/sw2:tmp[id2]; }
    return out; }

  /* ---- signature de cache : rebuild seulement si un param change ---- */
  function sig(){ return [PTERR.src,PTERR.shape,PTERR.sw,PTERR.sd,PTERR.uArm,PTERR.tArm,PTERR.sBase,PTERR.sverts,PTERR.ctrlN,JSON.stringify(PTERR.ctrlZ||[]), PTERR.step,PTERR.smooth,PTERR.cut,PTERR.bandMin,PTERR.bandMax,PTERR.exag, RAW?RAW.length:0].join('|'); }
  /* grille de contrôle du relief : (ré)alloue si taille change */
  function ctrlGrid(){ var cn=Math.max(2,PTERR.ctrlN|0), cz=PTERR.ctrlZ; if(!cz||cz.length!==cn*cn){ cz=new Array(cn*cn); for(var q=0;q<cz.length;q++)cz[q]=0; PTERR.ctrlZ=cz; } return {cn:cn,cz:cz}; }

  /* ---- TERRAIN CRÉÉ (sans DXF) : plateforme plate d'une forme donnée ---- */
  function shapePoly(){
    var w=Math.max(1,(PTERR.sw||8000)/100), d=Math.max(1,(PTERR.sd||6000)/100), hw=w/2, hd=d/2, a=Math.max(0.5,(PTERR.uArm||2500)/100), a2=Math.max(0.5,(PTERR.tArm||2500)/100);
    if(PTERR.shape==='rect') return [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]];
    if(PTERR.shape==='u'){ var t=Math.min(a, w/2-0.5); return [[-hw,-hd],[hw,-hd],[hw,hd],[hw-t,hd],[hw-t,-hd+t],[-hw+t,-hd+t],[-hw+t,hd],[-hw,hd]]; }
    if(PTERR.shape==='t'){ var tw=Math.min(a2,w-0.5), th=Math.min(a,d-0.5); return [[-hw,hd],[hw,hd],[hw,hd-th],[tw/2,hd-th],[tw/2,-hd],[-tw/2,-hd],[-tw/2,hd-th],[-hw,hd-th]]; }
    var pts=[]; (PTERR.sverts||'').trim().split(/\s+/).forEach(function(tok){ var xy=tok.split(','); if(xy.length===2){ var x=parseFloat(xy[0]),y=parseFloat(xy[1]); if(!isNaN(x)&&!isNaN(y)) pts.push([x,y]); } });
    return pts.length>=3?pts:[[-40,-30],[40,-30],[40,30],[-40,30]];
  }
  function inPoly(px,py,poly){ var c=false,n=poly.length,j=n-1; for(var i=0;i<n;i++){ var A=poly[i],B=poly[j]; if(((A[1]>py)!==(B[1]>py)) && (px < (B[0]-A[0])*(py-A[1])/((B[1]-A[1])||1e-9)+A[0])) c=!c; j=i; } return c; }
  function _segD(px,py,ax,ay,bx,by){ var dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy,t=L2>0?((px-ax)*dx+(py-ay)*dy)/L2:0; t=t<0?0:(t>1?1:t); return Math.hypot(px-(ax+t*dx),py-(ay+t*dy)); }
  /* distance signée au polygone (>0 dedans) : linéaire près d'une arête droite → passage à 0 exact sur le bord. */
  function polySD(px,py,poly){ var d=1e18,n=poly.length,j=n-1; for(var i=0;i<n;i++){ var dd=_segD(px,py,poly[j][0],poly[j][1],poly[i][0],poly[i][1]); if(dd<d)d=dd; j=i; } return inPoly(px,py,poly)? d : -d; }
  function buildShapeMesh(){
    var poly=shapePoly(), step=Math.max(0.5,+PTERR.step||3), base=(PTERR.sBase||0)/100, exag=+PTERR.exag||1;
    var minX=1e18,minY=1e18,maxX=-1e18,maxY=-1e18; poly.forEach(function(p){ if(p[0]<minX)minX=p[0]; if(p[0]>maxX)maxX=p[0]; if(p[1]<minY)minY=p[1]; if(p[1]>maxY)maxY=p[1]; });
    var nx=Math.floor((maxX-minX)/step)+2, ny=Math.floor((maxY-minY)/step)+2; if(nx<2||ny<2) return null; if(nx*ny>900000) return {tooBig:true};
    var lib=(PTERR.shape==='libre'), cx=lib?0:(minX+maxX)/2, cy=lib?0:(minY+maxY)/2, NC=nx*ny, mask=new Uint8Array(NC), GZ=new Float32Array(NC), i, x, y;
    var cg=ctrlGrid(), cn=cg.cn, cz=cg.cz, spanX=(maxX-minX)||1, spanY=(maxY-minY)||1;
    function ctrlAt(u,v){ var fx=u*(cn-1), fy=v*(cn-1), ix=Math.min(cn-2,Math.max(0,Math.floor(fx))), iy=Math.min(cn-2,Math.max(0,Math.floor(fy))), tx=fx-ix, ty=fy-iy;
      function g(a,b){ return (cz[b*cn+a]||0)/100; }
      return g(ix,iy)*(1-tx)*(1-ty)+g(ix+1,iy)*tx*(1-ty)+g(ix,iy+1)*(1-tx)*ty+g(ix+1,iy+1)*tx*ty; }
    for(y=0;y<ny;y++)for(x=0;x<nx;x++){ var wx=minX+x*step, wy=minY+y*step; if(inPoly(wx,wy,poly)){ var id=y*nx+x; mask[id]=1; GZ[id]=base+ctrlAt((wx-minX)/spanX,(wy-minY)/spanY); } }
    var sg=+PTERR.smooth||0; if(sg>0.01) GZ=smooth(GZ,mask,nx,ny,sg);
    var z0=1e18,zmax=-1e18; for(i=0;i<NC;i++) if(mask[i]){ if(GZ[i]<z0)z0=GZ[i]; if(GZ[i]>zmax)zmax=GZ[i]; } if(z0>zmax){z0=base;zmax=base;} var zr=Math.max(0.01,zmax-z0);
    var V=[], VZ=[], F=[];
    if(!lib){
      var vid=new Int32Array(NC); for(i=0;i<NC;i++) vid[i]=-1;
      for(y=0;y<ny;y++)for(x=0;x<nx;x++){ var iv=y*nx+x; if(!mask[iv]) continue; vid[iv]=V.length; V.push([(minX+x*step)-cx, GZ[iv]*exag, -((minY+y*step)-cy)]); VZ.push((GZ[iv]-z0)/zr); }
      for(y=0;y<ny-1;y++)for(x=0;x<nx-1;x++){ var a=vid[y*nx+x], b=vid[y*nx+x+1], c2=vid[(y+1)*nx+x+1], e=vid[(y+1)*nx+x]; if(a>=0&&b>=0&&c2>=0&&e>=0){ F.push([a,b,c2]); F.push([a,c2,e]); } }
    } else {
      /* MAILLAGE CONFORME AU CONTOUR (Libre) : chaque cellule est remplie par sa partie
         intérieure au polygone, découpée aux passages à 0 de la distance signée → bord net. */
      var sd=new Float32Array(NC);
      for(y=0;y<ny;y++)for(x=0;x<nx;x++){ var sid=y*nx+x; sd[sid]=polySD(minX+x*step, minY+y*step, poly); }
      var vmap={};
      function _nodeV(nx0,ny0){ var k='n'+nx0+'_'+ny0, id=vmap[k]; if(id!=null) return id; var nid=ny0*nx+nx0, g2=GZ[nid]; id=V.length; vmap[k]=id; V.push([(minX+nx0*step)-cx, g2*exag, -((minY+ny0*step)-cy)]); VZ.push((g2-z0)/zr); return id; }
      function _crossV(ax,ay,bx,by){ var kx0=Math.min(ax,bx),ky0=Math.min(ay,by),kx1=Math.max(ax,bx),ky1=Math.max(ay,by), key='c'+kx0+'_'+ky0+'_'+kx1+'_'+ky1, id=vmap[key]; if(id!=null) return id;
        var s0=sd[ay*nx+ax], s1=sd[by*nx+bx], t=s0/(s0-s1); if(!isFinite(t)) t=0.5; t=t<0?0:(t>1?1:t);
        var wx=(minX+ax*step)+((bx-ax)*step)*t, wy=(minY+ay*step)+((by-ay)*step)*t, gz=base+ctrlAt((wx-minX)/spanX,(wy-minY)/spanY);
        id=V.length; vmap[key]=id; V.push([wx-cx, gz*exag, -(wy-cy)]); VZ.push((gz-z0)/zr); return id; }
      for(y=0;y<ny-1;y++)for(x=0;x<nx-1;x++){
        var cs=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]], ring=[];
        for(var ei=0;ei<4;ei++){ var A=cs[ei], B=cs[(ei+1)%4], inA=sd[A[1]*nx+A[0]]>=0, inB=sd[B[1]*nx+B[0]]>=0;
          if(inA) ring.push(_nodeV(A[0],A[1]));
          if(inA!==inB) ring.push(_crossV(A[0],A[1],B[0],B[1])); }
        for(var fi=1;fi+1<ring.length;fi++) F.push([ring[0], ring[fi], ring[fi+1]]);
      }
    }
    var col=(glob.FINISH&&glob.FINISH.terrain)||[150,160,120];
    return { V:V, VZ:VZ, F:F, z0:z0, grid:{ GZ:GZ,mask:mask,nx:nx,ny:ny,minX:minX,minY:minY,step:step,z0:z0,cx:cx,cy:cy,zbase:z0*exag,exag:exag }, dims:{ w:(maxX-minX), h:Math.max(0.2,(zmax-z0)*exag), d:(maxY-minY), cy:(z0*exag+(zmax-z0)*exag/2) }, np:0, col:col };
  }

  /* Positions (repère de rendu = coords de MESH.V) des points de contrôle du relief,
     pour dessiner/dragger les poignées d'altitude côté vue. Renvoie [{i,x,y,z,cm}]. */
  function ctrlHandles(){
    if(PTERR.src!=='shape') return [];
    var poly=shapePoly(), exag=+PTERR.exag||1, base=(PTERR.sBase||0)/100;
    var minX=1e18,minY=1e18,maxX=-1e18,maxY=-1e18; poly.forEach(function(p){ if(p[0]<minX)minX=p[0]; if(p[0]>maxX)maxX=p[0]; if(p[1]<minY)minY=p[1]; if(p[1]>maxY)maxY=p[1]; });
    var lib=(PTERR.shape==='libre'), cx=lib?0:(minX+maxX)/2, cy=lib?0:(minY+maxY)/2, spanX=(maxX-minX)||1, spanY=(maxY-minY)||1;
    var cg=ctrlGrid(), cn=cg.cn, cz=cg.cz, out=[];
    for(var r=0;r<cn;r++)for(var c=0;c<cn;c++){ var i=r*cn+c, u=cn>1?c/(cn-1):0.5, v=cn>1?r/(cn-1):0.5;
      var wx=minX+u*spanX, wy=minY+v*spanY, cm=cz[i]||0, yy=(base+cm/100)*exag;
      out.push({ i:i, x:wx-cx, y:yy, z:-(wy-cy), cm:cm }); }
    return out;
  }
  /* Fixe l'altitude (cm) d'un point de contrôle et invalide le maillage (rebuild au prochain build). */
  function setCtrlCm(i, cm){ var cg=ctrlGrid(), cz=cg.cz; if(i<0||i>=cz.length) return false; cz[i]=cm; PTERR.ctrlZ=cz; MESH=null; return true; }

  /* ---- Édition d'emprise (forme « Libre ») : sommets au sol draggables comme la dalle.
     sverts = "x,y x,y …" en mètres (plan). Repère de rendu (Libre non recentré) : x=wx, z=-wy. ---- */
  function _svParse(){ var pts=[]; (PTERR.sverts||'').trim().split(/\s+/).forEach(function(t){ var xy=t.split(','); if(xy.length===2){ var a=parseFloat(xy[0]), b=parseFloat(xy[1]); if(!isNaN(a)&&!isNaN(b)) pts.push([a,b]); } }); return pts; }
  function _svWrite(pts){ PTERR.sverts=pts.map(function(p){ return (Math.round(p[0]*100)/100)+','+(Math.round(p[1]*100)/100); }).join(' '); MESH=null; }
  function _distSeg2(px,py,ax,ay,bx,by){ var dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy,t=L2>0?((px-ax)*dx+(py-ay)*dy)/L2:0; t=t<0?0:(t>1?1:t); return Math.hypot(px-(ax+t*dx),py-(ay+t*dy)); }
  function footHandles(){ if(PTERR.src!=='shape'||PTERR.shape!=='libre') return []; var pts=_svParse(), out=[]; for(var i=0;i<pts.length;i++) out.push({ i:i, x:pts[i][0], z:-pts[i][1] }); return out; }
  function setFoot(i,X,Z){ var pts=_svParse(); if(i<0||i>=pts.length) return false; pts[i]=[X,-Z]; _svWrite(pts); return true; }
  function insertFoot(X,Z){ var pts=_svParse(); if(pts.length<2) return false; var px=X, py=-Z, n=pts.length, bi=0, bd=1e18;
    for(var i=0;i<n;i++){ var A=pts[i], B=pts[(i+1)%n], d=_distSeg2(px,py,A[0],A[1],B[0],B[1]); if(d<bd){bd=d;bi=i;} }
    pts.splice(bi+1,0,[px,py]); _svWrite(pts); return pts.length; }
  function removeFoot(i){ var pts=_svParse(); if(pts.length<=3||i<0||i>=pts.length) return false; pts.splice(i,1); _svWrite(pts); return true; }

  /* ---- construit le maillage et le pousse dans FC ; renvoie DIMS ---- */
  function buildFC() {
    var shapeMode=(PTERR.src==='shape');
    if (!shapeMode && !hasData()) { glob.DIMS = { w:1, h:0.1, d:1 }; return glob.DIMS; }
    if (!MESH || MESH.sig !== sig()) { var m = shapeMode ? buildShapeMesh() : buildMesh(); if (m) m.sig = sig(); MESH = m; }
    if (!MESH || MESH.tooBig) { glob.DIMS = { w:1, h:0.1, d:1 }; return glob.DIMS; }
    var FC = glob.FC, V = MESH.V, VZ = MESH.VZ, uni = !(+PTERR.colorByAlt);
    var texKey = (glob.FINISH_TEX && glob.FINISH_TEX.terrain) || null;
    var uCol = (glob.FINISH && glob.FINISH.terrain) || MESH.col;
    for (var f = 0; f < MESH.F.length; f++) {
      var tri = MESH.F[f], a = V[tri[0]], b = V[tri[1]], c = V[tri[2]];
      // normale
      var ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2], vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
      var nx2=uy*vz-uz*vy, ny2=uz*vx-ux*vz, nz2=ux*vy-uy*vx, nl=Math.hypot(nx2,ny2,nz2)||1;
      var col = uni ? uCol : altColor((VZ[tri[0]]+VZ[tri[1]]+VZ[tri[2]])/3);
      FC.push({ verts:[a,b,c], n:[nx2/nl,ny2/nl,nz2/nl], col:col, al:1, tex: uni?texKey:null });
    }
    if (+PTERR.thick > 0) solidFC(FC, MESH);
    if (+PTERR.drape && MESH.grid) drapeFC(FC, MESH.grid);
    if (+PTERR.contours && MESH.grid) contourFC(FC, MESH.grid);
    if (+PTERR.mesh && MESH.grid) gridFC(FC, MESH.grid);
    glob.DIMS = MESH.dims; return MESH.dims;
  }

  /* altitude du terrain au point monde (wx,wy) [avant recentrage], interpolée bilinéaire. */
  function sampleZ(g, wx, wy) {
    var gx=(wx-g.minX)/g.step, gy=(wy-g.minY)/g.step, ix=Math.floor(gx), iy=Math.floor(gy);
    if (ix<0||iy<0||ix>=g.nx-1||iy>=g.ny-1) { var rx=Math.max(0,Math.min(g.nx-1,Math.round(gx))), ry=Math.max(0,Math.min(g.ny-1,Math.round(gy))), rid=ry*g.nx+rx; return g.mask[rid]? g.zbase+(g.GZ[rid]-g.z0)*g.exag : null; }
    var id=iy*g.nx+ix, m00=g.mask[id], m10=g.mask[id+1], m01=g.mask[id+g.nx], m11=g.mask[id+g.nx+1];
    if(!(m00&&m10&&m01&&m11)){ var arr=[id,id+1,id+g.nx,id+g.nx+1]; for(var q=0;q<4;q++) if(g.mask[arr[q]]) return g.zbase+(g.GZ[arr[q]]-g.z0)*g.exag; return null; }
    var fx=gx-ix, fy=gy-iy;
    var z=g.GZ[id]*(1-fx)*(1-fy)+g.GZ[id+1]*fx*(1-fy)+g.GZ[id+g.nx]*(1-fx)*fy+g.GZ[id+g.nx+1]*fx*fy;
    return g.zbase+(z-g.z0)*g.exag;
  }
  /* Géométrie du drapé (rubans plats surélevés épousant le terrain) : {V,F}. */
  function drapeGeo(g) {
    if(!POLYS||!POLYS.length) return null; var sel=PTERR.drapeLayers||{}, w=0.22, eps=0.05, V=[], F=[], cnt=0, cap=140000;
    for(var pi=0;pi<POLYS.length;pi++){ var Pl=POLYS[pi]; if(!sel[Pl.layer]) continue; var v=Pl.pts, m=v.length; if(m<2) continue; var loop=Pl.closed?m:m-1;
      for(var s=0;s<loop;s++){ var a=v[s], b=v[(s+1)%m], za=sampleZ(g,a[0],a[1]), zb=sampleZ(g,b[0],b[1]); if(za==null||zb==null) continue;
        var dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1, px=-dy/L*w, py=dx/L*w, i0=V.length;
        V.push([a[0]+px-g.cx, za+eps, -(a[1]+py-g.cy)]); V.push([a[0]-px-g.cx, za+eps, -(a[1]-py-g.cy)]);
        V.push([b[0]+px-g.cx, zb+eps, -(b[1]+py-g.cy)]); V.push([b[0]-px-g.cx, zb+eps, -(b[1]-py-g.cy)]);
        F.push([i0, i0+2, i0+3]); F.push([i0, i0+3, i0+1]);   /* A1,B1,B2 ; A1,B2,A2 */
        if((cnt+=2)>cap) return {V:V,F:F}; } }
    return {V:V, F:F};
  }
  /* Pousse le drapé dans FC (rendu vivant). */
  function drapeFC(FC, g) { var d=drapeGeo(g); if(!d||!d.F.length) return; var col=[64,66,72];
    for(var f=0;f<d.F.length;f++){ var t=d.F[f]; FC.push({verts:[d.V[t[0]],d.V[t[1]],d.V[t[2]]], n:[0,1,0], col:col, al:1, tex:null}); } }

  /* COURBES DE NIVEAU (marching squares sur la grille) : rubans fins à chaque
     altitude multiple de l'équidistance, épousant le relief. Renvoie {V,F}. */
  function contourGeo(g, interval) {
    interval = Math.max(0.05, interval || 0.5);
    var nx=g.nx, ny=g.ny, GZ=g.GZ, mask=g.mask, step=g.step, minX=g.minX, minY=g.minY;
    var zmin=1e18, zmax=-1e18, i;
    for(i=0;i<GZ.length;i++){ if(mask[i]){ if(GZ[i]<zmin)zmin=GZ[i]; if(GZ[i]>zmax)zmax=GZ[i]; } }
    if(zmax<=zmin) return null;
    var V=[], F=[], w=Math.max(0.02,(PTERR.contourW||20)/100/2), eps=0.09, cnt=0, cap=200000, pts=[];
    var master=Math.max(0,PTERR.contourMaster|0), curW=w;
    function mp(wx,wy,L){ return [wx-g.cx, g.zbase+(L-g.z0)*g.exag+eps, -(wy-g.cy)]; }
    function seg(p1,p2){ var i0=V.length, dx=p2[0]-p1[0], dz=p2[2]-p1[2], L=Math.hypot(dx,dz)||1, px=-dz/L*curW, pz=dx/L*curW;
      V.push([p1[0]+px,p1[1],p1[2]+pz]); V.push([p1[0]-px,p1[1],p1[2]-pz]); V.push([p2[0]+px,p2[1],p2[2]+pz]); V.push([p2[0]-px,p2[1],p2[2]-pz]);
      F.push([i0,i0+2,i0+3]); F.push([i0,i0+3,i0+1]); cnt+=2; }
    var l0=Math.ceil(zmin/interval)*interval, ln=0;
    for(var L=l0; L<=zmax && cnt<cap; L+=interval, ln++){
      curW = (master>1 && (Math.round((L-l0)/interval)%master===0)) ? w*2.4 : w;
      for(var y=0;y<ny-1 && cnt<cap;y++) for(var x=0;x<nx-1;x++){
        var id=y*nx+x; if(!(mask[id]&&mask[id+1]&&mask[id+nx]&&mask[id+nx+1])) continue;
        var z00=GZ[id], z10=GZ[id+1], z01=GZ[id+nx], z11=GZ[id+nx+1];
        var x0=minX+x*step, y0=minY+y*step, x1=x0+step, y1=y0+step; pts.length=0;
        function cr(za,zb,xa,ya,xb,yb){ if((za<L)!==(zb<L)){ var t=(L-za)/(zb-za||1e-9); pts.push([xa+(xb-xa)*t, ya+(yb-ya)*t]); } }
        cr(z00,z10, x0,y0, x1,y0); cr(z10,z11, x1,y0, x1,y1); cr(z11,z01, x1,y1, x0,y1); cr(z01,z00, x0,y1, x0,y0);
        if(pts.length===2) seg(mp(pts[0][0],pts[0][1],L), mp(pts[1][0],pts[1][1],L));
        else if(pts.length===4){ seg(mp(pts[0][0],pts[0][1],L), mp(pts[1][0],pts[1][1],L)); seg(mp(pts[2][0],pts[2][1],L), mp(pts[3][0],pts[3][1],L)); }
      }
    }
    return {V:V, F:F};
  }
  function contourFC(FC, g) { var d=contourGeo(g, +PTERR.contourInt); if(!d||!d.F.length) return; var col=[96,64,42];
    for(var f=0;f<d.F.length;f++){ var t=d.F[f]; FC.push({verts:[d.V[t[0]],d.V[t[1]],d.V[t[2]]], n:[0,1,0], col:col, al:1, tex:null}); } }

  /* MAILLE VISIBLE : lignes de grille (rangées + colonnes) posées sur la surface,
     rubans fins surélevés. Renvoie {V,F}. */
  function gridGeo(g) {
    if(!g||!g.GZ) return null;
    var nx=g.nx, ny=g.ny, GZ=g.GZ, mask=g.mask, step=g.step;
    var w=Math.max(0.01, step*0.02), eps=0.05, V=[], F=[], cnt=0, cap=90000;
    function pt(x,y){ var id=y*nx+x; return [ (g.minX+x*step)-g.cx, g.zbase+(GZ[id]-g.z0)*g.exag+eps, -((g.minY+y*step)-g.cy) ]; }
    function seg(x0,y0,x1,y1){ var p1=pt(x0,y0), p2=pt(x1,y1), i0=V.length, dx=p2[0]-p1[0], dz=p2[2]-p1[2], L=Math.hypot(dx,dz)||1, px=-dz/L*w, pz=dx/L*w;
      V.push([p1[0]+px,p1[1],p1[2]+pz]); V.push([p1[0]-px,p1[1],p1[2]-pz]); V.push([p2[0]+px,p2[1],p2[2]+pz]); V.push([p2[0]-px,p2[1],p2[2]-pz]);
      F.push([i0,i0+2,i0+3]); F.push([i0,i0+3,i0+1]); cnt+=2; }
    var x,y;
    for(y=0;y<ny && cnt<cap;y++) for(x=0;x<nx-1;x++){ if(mask[y*nx+x]&&mask[y*nx+x+1]){ seg(x,y,x+1,y); if(cnt>=cap) break; } }
    for(x=0;x<nx && cnt<cap;x++) for(y=0;y<ny-1;y++){ if(mask[y*nx+x]&&mask[(y+1)*nx+x]){ seg(x,y,x,y+1); if(cnt>=cap) break; } }
    return {V:V, F:F};
  }
  function gridFC(FC, g) { var d=gridGeo(g); if(!d||!d.F.length) return; var col=[95,98,105];
    for(var f=0;f<d.F.length;f++){ var t=d.F[f]; FC.push({verts:[d.V[t[0]],d.V[t[1]],d.V[t[2]]], n:[0,1,0], col:col, al:1, tex:null}); } }

  /* SOCLE (épaisseur) : fond + parois autour du contour, à partir du maillage de surface.
     flat=1 -> fond plat horizontal ; flat=0 -> fond parallèle (surface décalée vers le bas).
     Renvoie {V,F}. t en mètres (déjà exagéré). */
  function solidGeo(MESH, t, flat) {
    var V=MESH.V, F=MESH.F; if(!t||t<=0||!F.length) return null;
    var n=V.length, i, minY=1e18; for(i=0;i<n;i++) if(V[i][1]<minY) minY=V[i][1];
    var floorY=minY-t, BV=new Array(n);
    for(i=0;i<n;i++) BV[i]= flat ? [V[i][0],floorY,V[i][2]] : [V[i][0],V[i][1]-t,V[i][2]];
    var outV=[], outF=[];
    for(i=0;i<n;i++) outV.push(BV[i]);            // 0..n-1 : fond
    for(var f=0;f<F.length;f++){ var tr=F[f]; outF.push([tr[0],tr[2],tr[1]]); }  // fond, winding inversé (normale vers le bas)
    // arêtes de bord = arêtes appartenant à un seul triangle (orientation conservée)
    var em={}; function ek(a,b){ return a<b? a+'_'+b : b+'_'+a; }
    for(f=0;f<F.length;f++){ var tr2=F[f], es=[[tr2[0],tr2[1]],[tr2[1],tr2[2]],[tr2[2],tr2[0]]];
      for(var e=0;e<3;e++){ var k=ek(es[e][0],es[e][1]); if(em[k]) em[k].c++; else em[k]={a:es[e][0],b:es[e][1],c:1}; } }
    var topBase=outV.length; for(i=0;i<n;i++) outV.push([V[i][0],V[i][1],V[i][2]]); // n..2n-1 : dessus
    for(var kk in em){ if(em[kk].c!==1) continue; var a=em[kk].a, b=em[kk].b;
      outF.push([topBase+a, topBase+b, b]); outF.push([topBase+a, b, a]); }   // paroi topA,topB,botB / topA,botB,botA
    return {V:outV, F:outF};
  }
  function solidFC(FC, MESH) {
    var t=(+PTERR.thick||0)/100; if(t<=0) return; t*=(+PTERR.exag||1);
    var d=solidGeo(MESH, t, +PTERR.thickFlat); if(!d||!d.F.length) return;
    var col=(glob.FINISH&&glob.FINISH.terrain)||MESH.col, tk=(glob.FINISH_TEX&&glob.FINISH_TEX.terrain)||null;
    for(var f=0;f<d.F.length;f++){ var tr=d.F[f], A=d.V[tr[0]], B=d.V[tr[1]], C=d.V[tr[2]];
      var ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2], vx=C[0]-A[0],vy=C[1]-A[1],vz=C[2]-A[2];
      var nx2=uy*vz-uz*vy, ny2=uz*vx-ux*vz, nz2=ux*vy-uy*vx, nl=Math.hypot(nx2,ny2,nz2)||1;
      FC.push({verts:[A,B,C], n:[nx2/nl,ny2/nl,nz2/nl], col:col, al:1, tex:tk}); } }

  /* ---- Fige le terrain courant en OBJET IMPORTÉ (bake) : posable/sauvegardable/exportable.
     Groupé par bandes d'altitude pour conserver le dégradé topo une fois figé. ---- */
  function freeze() {
    if (!MESH || MESH.sig !== sig()) { var m = buildMesh(); if (m) m.sig = sig(); MESH = m; }
    if (!MESH || MESH.tooBig || !MESH.V.length) { glob.alert('Aucun terrain à figer (charge un DXF d\'abord).'); return; }
    if (!(glob.BPO_import && glob.BPO_import.bake)) { glob.alert('Module d\'import indisponible.'); return; }
    var V = MESH.V, F = MESH.F, VZ = MESH.VZ, i;
    var pos = new Float32Array(V.length * 3);
    for (i = 0; i < V.length; i++) { pos[i*3]=V[i][0]; pos[i*3+1]=V[i][1]; pos[i*3+2]=V[i][2]; }
    var idx, groups;
    if (+PTERR.colorByAlt) {
      var N = 10, bands = []; for (var k = 0; k < N; k++) bands.push([]);
      for (var f = 0; f < F.length; f++) { var tri = F[f], av = (VZ[tri[0]]+VZ[tri[1]]+VZ[tri[2]])/3, bi = Math.max(0, Math.min(N-1, Math.floor(av*N))); bands[bi].push(tri); }
      var flat = []; groups = []; var start = 0;
      for (k = 0; k < N; k++) { var bd = bands[k]; if (!bd.length) continue; for (var t = 0; t < bd.length; t++) flat.push(bd[t][0], bd[t][1], bd[t][2]); var cnt = bd.length*3; groups.push({ start: start, count: cnt, col: altColor((k+0.5)/N), tex: null, name: 'alt ' + k }); start += cnt; }
      idx = Uint32Array.from(flat);
    } else {
      var flat2 = []; for (var f2 = 0; f2 < F.length; f2++) flat2.push(F[f2][0], F[f2][1], F[f2][2]);
      idx = Uint32Array.from(flat2);
      groups = [{ start: 0, count: idx.length, col: (glob.FINISH && glob.FINISH.terrain) || MESH.col, tex: (glob.FINISH_TEX && glob.FINISH_TEX.terrain) || null, name: 'Terrain' }];
    }
    // inclure le DRAPÉ dans l'objet figé (groupe séparé "Plan (drapé)")
    if (+PTERR.drape && MESH.grid) {
      var dg = drapeGeo(MESH.grid);
      if (dg && dg.F.length) {
        var baseV = V.length;
        var pos2 = new Float32Array((V.length + dg.V.length) * 3); pos2.set(pos);
        for (var di = 0; di < dg.V.length; di++) { pos2[(baseV+di)*3]=dg.V[di][0]; pos2[(baseV+di)*3+1]=dg.V[di][1]; pos2[(baseV+di)*3+2]=dg.V[di][2]; }
        pos = pos2;
        var dstart = idx.length, dflat = [];
        for (var dfi = 0; dfi < dg.F.length; dfi++) dflat.push(dg.F[dfi][0]+baseV, dg.F[dfi][1]+baseV, dg.F[dfi][2]+baseV);
        var idx2 = new Uint32Array(idx.length + dflat.length); idx2.set(idx); idx2.set(dflat, idx.length); idx = idx2;
        groups.push({ start: dstart, count: dflat.length, col: [64,66,72], tex: null, name: 'Plan (drapé)' });
      }
    }
    // inclure les COURBES DE NIVEAU dans l'objet figé (groupe séparé)
    if (+PTERR.contours && MESH.grid) {
      var cg = contourGeo(MESH.grid, +PTERR.contourInt);
      if (cg && cg.F.length) {
        var cbaseV = pos.length / 3;
        var cpos = new Float32Array(pos.length + cg.V.length*3); cpos.set(pos);
        for (var ci = 0; ci < cg.V.length; ci++) { cpos[(cbaseV+ci)*3]=cg.V[ci][0]; cpos[(cbaseV+ci)*3+1]=cg.V[ci][1]; cpos[(cbaseV+ci)*3+2]=cg.V[ci][2]; }
        pos = cpos;
        var cstart = idx.length, cflat = [];
        for (var cfi = 0; cfi < cg.F.length; cfi++) cflat.push(cg.F[cfi][0]+cbaseV, cg.F[cfi][1]+cbaseV, cg.F[cfi][2]+cbaseV);
        var cidx = new Uint32Array(idx.length + cflat.length); cidx.set(idx); cidx.set(cflat, idx.length); idx = cidx;
        groups.push({ start: cstart, count: cflat.length, col: [96,64,42], tex: null, name: 'Courbes de niveau' });
      }
    }
    // inclure le SOCLE (épaisseur) dans l'objet figé (groupe séparé)
    if (+PTERR.thick > 0) {
      var st = (+PTERR.thick||0)/100 * (+PTERR.exag||1);
      var sg = solidGeo(MESH, st, +PTERR.thickFlat);
      if (sg && sg.F.length) {
        var sbaseV = pos.length / 3;
        var spos = new Float32Array(pos.length + sg.V.length*3); spos.set(pos);
        for (var si = 0; si < sg.V.length; si++) { spos[(sbaseV+si)*3]=sg.V[si][0]; spos[(sbaseV+si)*3+1]=sg.V[si][1]; spos[(sbaseV+si)*3+2]=sg.V[si][2]; }
        pos = spos;
        var sstart = idx.length, sflat = [];
        for (var sfi = 0; sfi < sg.F.length; sfi++) sflat.push(sg.F[sfi][0]+sbaseV, sg.F[sfi][1]+sbaseV, sg.F[sfi][2]+sbaseV);
        var sidx = new Uint32Array(idx.length + sflat.length); sidx.set(idx); sidx.set(sflat, idx.length); idx = sidx;
        groups.push({ start: sstart, count: sflat.length, col: (glob.FINISH && glob.FINISH.terrain) || MESH.col, tex: (glob.FINISH_TEX && glob.FINISH_TEX.terrain) || null, name: 'Socle' });
      }
    }
    var def = _name ? ('Terrain ' + _name.replace(/\.dxf$/i, '')) : 'Terrain';
    var nm = glob.prompt('Nom du terrain figé :', def); if (nm === null) return; nm = nm.trim() || def;
    glob.BPO_import.bake(nm, pos, idx, groups).then(function () {
      glob.alert('Terrain figé — disponible dans « Ma bibliothèque › Objets importés ». Posable en scène, sauvegardable, exportable (OBJ/DAE/IFC).');
    }).catch(function (e) { glob.alert('Échec du figeage : ' + (e && e.message || e)); });
  }

  /* ---- Panneau du configurateur ---- */
  /* Bloc partagé : maille apparente + épaisseur (socle). mkSlider(label,unit,key,min,max,step). */
  function meshThickUI(host, mkSlider) {
    function rb(){ if(typeof glob.build==='function'){try{glob.build();}catch(e){}} glob.DIRTY=true; buildUI(host); }
    var mh=doc.createElement('div'); mh.className='slbl'; mh.style.marginTop='8px'; mh.textContent='Maille apparente'; host.appendChild(mh);
    var mtg=doc.createElement('div'); mtg.className='finish-tabs';
    [['0','Sans'],['1','Voir la maille']].forEach(function(o){ var b=doc.createElement('button'); b.textContent=o[1]; if(String(PTERR.mesh)===o[0]) b.className='on'; b.onclick=function(){ PTERR.mesh=+o[0]; rb(); }; mtg.appendChild(b); });
    host.appendChild(mtg);
    var th=doc.createElement('div'); th.className='slbl'; th.style.marginTop='8px'; th.textContent='Épaisseur (socle)'; host.appendChild(th);
    mkSlider('Épaisseur du socle','cm','thick',0,2000,10);
    if(+PTERR.thick>0){
      var ftg=doc.createElement('div'); ftg.className='finish-tabs';
      [['1','Fond plat'],['0','Fond parallèle']].forEach(function(o){ var b=doc.createElement('button'); b.textContent=o[1]; if(String(PTERR.thickFlat)===o[0]) b.className='on'; b.onclick=function(){ PTERR.thickFlat=+o[0]; rb(); }; ftg.appendChild(b); });
      host.appendChild(ftg);
      var tn=doc.createElement('div'); tn.className='exp-note'; tn.textContent='Fond plat : base horizontale (bloc à poser). Fond parallèle : dalle d\'épaisseur constante épousant le relief.'; host.appendChild(tn);
    }
  }

  function buildUI(host) {
    host.innerHTML = '';
    /* SOURCE : DXF (points cotés) ou forme paramétrique créée */
    var srcTg = doc.createElement('div'); srcTg.className = 'finish-tabs'; srcTg.style.marginBottom = '6px';
    [['dxf', 'Depuis DXF'], ['shape', 'Créer une forme']].forEach(function (o) { var b = doc.createElement('button'); b.textContent = o[1]; if (PTERR.src === o[0]) b.className = 'on';
      b.onclick = function () { PTERR.src = o[0]; MESH = null; if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } if (typeof glob.fitCamera === 'function') { try { glob.fitCamera(glob.DIMS); } catch (e) {} } glob.DIRTY = true; buildUI(host); }; srcTg.appendChild(b); });
    host.appendChild(srcTg);
    var bcad = doc.createElement('button'); bcad.className = 'save-add'; bcad.textContent = '⭳ Importer cadastre (fond de plan)'; bcad.style.margin = '2px 0 8px';
    bcad.onclick = function () { if (glob.BPO_cadastre) glob.BPO_cadastre.open(); else glob.alert('Module cadastre non chargé (recharge la page).'); };
    host.appendChild(bcad);
    if (PTERR.src === 'shape') { buildShapeUI(host); return; }
    var card = doc.createElement('div'); card.className = 'fld';
    card.innerHTML = '<div class="fh"><span>Terrain — MNT depuis DXF</span></div>' +
      '<div style="font-size:10.5px;color:var(--dm);line-height:1.5;margin:2px 0 8px;">Chargez un DXF topographique dont les altitudes sont écrites en <b>points cotés</b> (texte). BPO extrait les cotes et construit un terrain maillé, éditable ci-dessous.</div>';
    host.appendChild(card);
    // charger DXF
    var fin = doc.createElement('input'); fin.type = 'file'; fin.accept = '.dxf'; fin.style.display = 'none';
    var bLoad = doc.createElement('button'); bLoad.className = 'save-add'; bLoad.textContent = '⭳Charger un DXF (points cotés)'; bLoad.style.margin = '2px 0 6px';
    bLoad.onclick = function () { fin.click(); };
    fin.onchange = function () { var file = fin.files && fin.files[0]; if (!file) return; bLoad.textContent = '… lecture ' + file.name;
      var rd = new FileReader(); rd.onload = function () { try { var nb = setDXF(rd.result, file.name); bLoad.textContent = '⭳' + file.name + ' — ' + nb + ' cotes';
        info.textContent = nb ? (nb + ' points cotés lus.') : 'Aucun point coté trouvé (le DXF doit contenir des altitudes en texte).';
        if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } if (typeof glob.updateDims === 'function') glob.updateDims(); if (typeof glob.fitCamera === 'function') { try{ glob.fitCamera(glob.DIMS); }catch(e){} } glob.DIRTY = true; buildUI(host);
      } catch (e) { info.textContent = 'Erreur de lecture : ' + (e && e.message || e); } };
      rd.readAsText(file, 'windows-1252'); };   /* DXF AutoCAD = ANSI_1252 : accents des calques OK */
    host.appendChild(bLoad); host.appendChild(fin);
    var info = doc.createElement('div'); info.className = 'exp-note'; info.textContent = hasData() ? (RAW.length + ' points cotés en mémoire.') : 'Aucun terrain chargé.'; host.appendChild(info);
    if (!hasData()) return;
    // stats
    if (MESH && !MESH.tooBig) { var st = doc.createElement('div'); st.className = 'exp-note'; st.style.color = 'var(--am)';
      st.textContent = 'Emprise ' + Math.round(MESH.dims.w) + ' × ' + Math.round(MESH.dims.d) + ' m · relief ' + (MESH.dims.h/(+PTERR.exag||1)).toFixed(2) + ' m · ' + MESH.F.length + ' faces'; host.appendChild(st); }
    // sliders (rebuild à la validation pour éviter de recalculer à chaque pixel)
    function slider(label, unit, key, min, max, step, live) {
      var fld = doc.createElement('div'); fld.className = 'fld';
      fld.innerHTML = '<div class="fh"><label>' + label + (unit ? ' <span class="u">' + unit + '</span>' : '') + '</label>' +
        '<input type="number" min="' + min + '" max="' + max + '" step="' + step + '" value="' + PTERR[key] + '"></div>' +
        '<input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + PTERR[key] + '">';
      var num = fld.querySelector('input[type=number]'), rng = fld.querySelector('input[type=range]');
      function apply(v, rebuild) { v = Math.max(min, Math.min(max, v)); PTERR[key] = v; num.value = v; rng.value = v; if (rebuild) { MESH = null; if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } glob.DIRTY = true; refreshStats(); } }
      rng.oninput = function () { num.value = rng.value; }; rng.onchange = function () { apply(+rng.value, true); };
      num.onchange = function () { if (!isNaN(parseFloat(num.value))) apply(parseFloat(num.value), true); };
      host.appendChild(fld);
    }
    function refreshStats(){ /* recalcule et rafraîchit le panneau après build */ setTimeout(function(){ if (glob.MODE==='terrain') buildUI(host); }, 30); }
    slider('Maille (résolution)', 'm', 'step', 1, 8, 0.5);
    slider('Lissage', '', 'smooth', 0, 6, 0.5);
    slider('Découpe au contour', 'm', 'cut', 4, 40, 1);
    slider('Exagération verticale', '×', 'exag', 1, 20, 0.5);
    slider('Altitude mini retenue', 'm', 'bandMin', 0, 100, 1);
    slider('Altitude maxi retenue', 'm', 'bandMax', 0, 200, 1);
    // couleur : dégradé altitude / matière unie
    var tg = doc.createElement('div'); tg.className = 'finish-tabs'; tg.style.marginTop = '6px';
    [['1', 'Dégradé altitude'], ['0', 'Matière unie']].forEach(function (o) {
      var b = doc.createElement('button'); b.textContent = o[1]; if (String(PTERR.colorByAlt) === o[0]) b.className = 'on';
      b.onclick = function () { PTERR.colorByAlt = +o[0]; MESH = null; if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } glob.DIRTY = true; buildUI(host); }; tg.appendChild(b);
    });
    host.appendChild(tg);
    // altitude : base à 0 (défaut) ou absolue (cale le bâti au bon niveau)
    var ta = doc.createElement('div'); ta.className = 'finish-tabs'; ta.style.marginTop = '6px';
    [['0', 'Base à 0'], ['1', 'Altitude absolue']].forEach(function (o) {
      var b = doc.createElement('button'); b.textContent = o[1]; if (String(PTERR.absolute) === o[0]) b.className = 'on';
      b.onclick = function () { PTERR.absolute = +o[0]; MESH = null; if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } glob.DIRTY = true; buildUI(host); }; ta.appendChild(b);
    });
    host.appendChild(ta);
    if (MESH && MESH.z0 != null) { var za = doc.createElement('div'); za.className = 'exp-note'; za.textContent = 'Altitude de base : ' + MESH.z0.toFixed(2) + ' m' + (+PTERR.absolute ? ' (conservée — cale le bâti au bon niveau)' : ' (ramenée à 0)'); host.appendChild(za); }
    var note = doc.createElement('div'); note.className = 'exp-note'; note.textContent = 'En « Matière unie », la couleur/texture se règle dans Finitions (élément Terrain).'; host.appendChild(note);
    // Drapé du plan DXF sur le relief
    if (POLYS && POLYS.length && LAYERS && LAYERS.length) {
      var dh = doc.createElement('div'); dh.className = 'slbl'; dh.style.marginTop = '8px'; dh.textContent = 'Drapé du plan (lignes DXF)'; host.appendChild(dh);
      var dtg = doc.createElement('div'); dtg.className = 'finish-tabs';
      [['0', 'Sans'], ['1', 'Draper']].forEach(function (o) { var b = doc.createElement('button'); b.textContent = o[1]; if (String(PTERR.drape) === o[0]) b.className = 'on';
        b.onclick = function () { PTERR.drape = +o[0]; if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } glob.DIRTY = true; buildUI(host); }; dtg.appendChild(b); });
      host.appendChild(dtg);
      if (+PTERR.drape) {
        if (!PTERR.drapeLayers) PTERR.drapeLayers = {};
        LAYERS.slice(0, 8).forEach(function (L) {
          var row = doc.createElement('label'); row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:10px;color:var(--dm);margin:2px 0;';
          var cb = doc.createElement('input'); cb.type = 'checkbox'; cb.checked = !!PTERR.drapeLayers[L.layer];
          cb.onchange = function () { PTERR.drapeLayers[L.layer] = cb.checked ? 1 : 0; if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } glob.DIRTY = true; };
          row.appendChild(cb); row.appendChild(doc.createTextNode(L.layer.slice(0, 30) + ' (' + L.n + ')')); host.appendChild(row);
        });
        var dn = doc.createElement('div'); dn.className = 'exp-note'; dn.textContent = 'Projette les polylignes des calques cochés sur le relief (voiries, bâti, parcelles).'; host.appendChild(dn);
      }
    }
    // Courbes de niveau
    var ch = doc.createElement('div'); ch.className = 'slbl'; ch.style.marginTop = '8px'; ch.textContent = 'Courbes de niveau'; host.appendChild(ch);
    var ctg = doc.createElement('div'); ctg.className = 'finish-tabs';
    [['0', 'Sans'], ['1', 'Afficher']].forEach(function (o) { var b = doc.createElement('button'); b.textContent = o[1]; if (String(PTERR.contours) === o[0]) b.className = 'on';
      b.onclick = function () { PTERR.contours = +o[0]; if (typeof glob.build === 'function') { try { glob.build(); } catch (e) {} } glob.DIRTY = true; buildUI(host); }; ctg.appendChild(b); });
    host.appendChild(ctg);
    if (+PTERR.contours) { slider('Équidistance', 'm', 'contourInt', 0.1, 5, 0.1); slider('Épaisseur courbes', 'cm', 'contourW', 3, 80, 1); slider('Courbe maîtresse tous les', '', 'contourMaster', 0, 10, 1); }
    // Maille apparente + épaisseur (socle)
    meshThickUI(host, slider);
    // Figer -> objet
    var bf = doc.createElement('button'); bf.className = 'save-add'; bf.textContent = '❄ Figer le terrain (→ objet réutilisable)'; bf.style.marginTop = '8px'; bf.onclick = freeze; host.appendChild(bf);
    var nf = doc.createElement('div'); nf.className = 'exp-note'; nf.textContent = 'Fige le maillage comme objet importé : posable en scène, sauvegardable, exportable OBJ/DAE/IFC. Re-fige après un réglage pour actualiser.'; host.appendChild(nf);
  }

  /* ---- Panneau du mode « Créer une forme » ---- */
  function buildShapeUI(host){
    var card=doc.createElement('div'); card.className='fld';
    card.innerHTML='<div class="fh"><span>Terrain — plateforme paramétrique</span></div>'+
      '<div style="font-size:10.5px;color:var(--dm);line-height:1.5;margin:2px 0 8px;">Crée une plateforme plate d\'une forme choisie, maillée. Forme, maille et altitude éditables. « Figer » pour la poser en scène / l\'exporter.</div>';
    host.appendChild(card);
    var stg=doc.createElement('div'); stg.className='finish-tabs';
    [['rect','Rectangle'],['u','U'],['t','T'],['libre','Libre']].forEach(function(o){ var b=doc.createElement('button'); b.textContent=o[1]; if(PTERR.shape===o[0]) b.className='on';
      b.onclick=function(){ PTERR.shape=o[0]; MESH=null; if(typeof glob.build==='function'){try{glob.build();}catch(e){}} if(typeof glob.fitCamera==='function'){try{glob.fitCamera(glob.DIMS);}catch(e){}} glob.DIRTY=true; buildUI(host); }; stg.appendChild(b); });
    host.appendChild(stg);
    // Bascule Vue 3D / Vue plan (dessus) — plan pratique pour tracer/caler l'emprise, 3D pour les altitudes
    var vtg=doc.createElement('div'); vtg.className='finish-tabs'; vtg.style.marginTop='6px';
    [['persp','Vue 3D'],['top','Vue plan']].forEach(function(o){ var b=doc.createElement('button'); b.textContent=o[1]; var cur=(glob.SINGLEVIEW==='top')?'top':'persp'; if(cur===o[0]) b.className='on';
      b.onclick=function(){ if(o[0]==='top'){ glob.SINGLEVIEW='top'; glob.LAYOUT='single'; } else { glob.SINGLEVIEW='persp'; } glob.DIRTY=true; buildUI(host); }; vtg.appendChild(b); });
    host.appendChild(vtg);
    function sl(label,unit,key,min,max,step){ var fld=doc.createElement('div'); fld.className='fld';
      fld.innerHTML='<div class="fh"><label>'+label+(unit?' <span class="u">'+unit+'</span>':'')+'</label><input type="number" min="'+min+'" max="'+max+'" step="'+step+'" value="'+PTERR[key]+'"></div><input type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+PTERR[key]+'">';
      var num=fld.querySelector('input[type=number]'), rng=fld.querySelector('input[type=range]');
      function ap(v){ v=Math.max(min,Math.min(max,v)); PTERR[key]=v; num.value=v; rng.value=v; MESH=null; if(typeof glob.build==='function'){try{glob.build();}catch(e){}} glob.DIRTY=true; setTimeout(function(){ if(glob.MODE==='terrain') buildUI(host); },30); }
      rng.oninput=function(){ num.value=rng.value; }; rng.onchange=function(){ ap(+rng.value); }; num.onchange=function(){ if(!isNaN(parseFloat(num.value))) ap(parseFloat(num.value)); };
      host.appendChild(fld); }
    sl('Emprise L','cm','sw',200,80000,50);
    sl('Emprise P','cm','sd',200,80000,50);
    if(PTERR.shape==='u') sl('Largeur des branches','cm','uArm',100,40000,50);
    if(PTERR.shape==='t'){ sl('Hauteur de la barre','cm','uArm',100,40000,50); sl('Largeur du pied','cm','tArm',100,40000,50); }
    sl('Maille','m','step',1,10,0.5);
    sl('Altitude de base','cm','sBase',-5000,5000,10);
    if(PTERR.shape==='libre'){
      var lbl=doc.createElement('div'); lbl.className='slbl'; lbl.style.marginTop='6px'; lbl.textContent='Sommets (m) : « x,y x,y … »'; host.appendChild(lbl);
      var ta=doc.createElement('textarea'); ta.value=PTERR.sverts; ta.style.cssText='width:100%;height:52px;font-size:10px;background:var(--p2);color:var(--tx);border:1px solid var(--ln);border-radius:5px;padding:4px;';
      ta.onchange=function(){ PTERR.sverts=ta.value; MESH=null; if(typeof glob.build==='function'){try{glob.build();}catch(e){}} if(typeof glob.fitCamera==='function'){try{glob.fitCamera(glob.DIMS);}catch(e){}} glob.DIRTY=true; }; host.appendChild(ta);
      var eh=doc.createElement('div'); eh.className='exp-note'; eh.textContent='Emprise à la souris : glisse un sommet orange au sol · double-clic sur un bord = ajouter un sommet · clic droit = supprimer. « Vue plan » facilite le tracé.'; host.appendChild(eh);
    }
    // RELIEF : grille de points de contrôle (altitudes cm) + adoucissement
    var rh=doc.createElement('div'); rh.className='slbl'; rh.style.marginTop='8px'; rh.textContent='Relief — points de contrôle (altitude cm)'; host.appendChild(rh);
    sl('Points de contrôle / côté','','ctrlN',2,8,1);
    sl('Adoucissement','','smooth',0,6,0.5);
    var cg=ctrlGrid(), cn=cg.cn, cz=cg.cz;
    var gwrap=doc.createElement('div'); gwrap.style.cssText='display:grid;grid-template-columns:repeat('+cn+',1fr);gap:3px;margin:4px 0 4px;';
    for(var rr=cn-1;rr>=0;rr--){ for(var cc=0;cc<cn;cc++){ (function(idx){
      var inp=doc.createElement('input'); inp.type='number'; inp.step=10; inp.value=Math.round(cz[idx]||0);
      inp.style.cssText='width:100%;font-size:10px;background:var(--p2);color:var(--tx);border:1px solid var(--ln);border-radius:4px;padding:2px 1px;text-align:center;';
      inp.onchange=function(){ cz[idx]=parseFloat(inp.value)||0; PTERR.ctrlZ=cz; MESH=null; if(typeof glob.build==='function'){try{glob.build();}catch(e){}} glob.DIRTY=true; setTimeout(function(){ if(glob.MODE==='terrain') buildUI(host); },30); };
      gwrap.appendChild(inp);
    })(rr*cn+cc); } }
    host.appendChild(gwrap);
    var rn=doc.createElement('div'); rn.className='exp-note'; rn.textContent='Chaque case = altitude d\'un point de contrôle (grille orientée comme le plan, haut = Nord). Interpolé en relief lisse. Astuce : les pastilles vertes dans la vue se glissent verticalement à la souris (Maj = pas fin) pour sculpter le relief directement.'; host.appendChild(rn);
    // Courbes de niveau (marchent aussi sur le terrain créé)
    var ctg=doc.createElement('div'); ctg.className='finish-tabs'; ctg.style.marginTop='6px';
    [['0','Courbes off'],['1','Courbes de niveau']].forEach(function(o){ var b=doc.createElement('button'); b.textContent=o[1]; if(String(PTERR.contours)===o[0]) b.className='on'; b.onclick=function(){ PTERR.contours=+o[0]; if(typeof glob.build==='function'){try{glob.build();}catch(e){}} glob.DIRTY=true; buildUI(host); }; ctg.appendChild(b); });
    host.appendChild(ctg);
    if(+PTERR.contours){ sl('Équidistance','m','contourInt',0.1,5,0.1); sl('Épaisseur courbes','cm','contourW',3,80,1); sl('Courbe maîtresse tous les','','contourMaster',0,10,1); }
    // Maille apparente + épaisseur (socle)
    meshThickUI(host, sl);
    if(MESH && !MESH.tooBig){ var st=doc.createElement('div'); st.className='exp-note'; st.style.color='var(--am)'; st.textContent='Emprise '+Math.round(MESH.dims.w)+' × '+Math.round(MESH.dims.d)+' m · '+MESH.F.length+' faces'; host.appendChild(st); }
    var note=doc.createElement('div'); note.className='exp-note'; note.textContent='Couleur/texture dans Finitions (élément Terrain). Plateforme plate — l\'édition du relief par points viendra ensuite.'; host.appendChild(note);
    var bf=doc.createElement('button'); bf.className='save-add'; bf.textContent='❄ Figer le terrain (→ objet réutilisable)'; bf.style.marginTop='8px'; bf.onclick=freeze; host.appendChild(bf);
  }

  glob.BPO_terrain = { PTERR: PTERR, setDXF: setDXF, buildFC: buildFC, buildUI: buildUI, hasData: hasData, ctrlHandles: ctrlHandles, setCtrlCm: setCtrlCm, footHandles: footHandles, setFoot: setFoot, insertFoot: insertFoot, removeFoot: removeFoot, _parse: parseDXFall };
})();
