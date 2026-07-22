/* ============================================================================
   BPO - import d'objets exterieurs (OBJ, STL, glTF/glb, DAE, IFC)
   Module externe, charge APRES le moteur de meuble.html.
   Objet importe -> entree TEX_OBJECTS[pid] au format lu par fabDecode().
   Conventions catalogue : Y-up, base a y=0, objet recentre en X/Z, en METRES.
   ============================================================================ */
(function (glob) {
  'use strict';

  var IMP_FOLDER_ID = 'imp_objets';
  var IMP_DB = 'BPO_imports', IMP_DBSTORE = 'meshes';

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norml(a) { var L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L]; }

  /* ============================ BACKBONE ================================== */
  function normalizeGeometry(geo, opts) {
    opts = opts || {};
    var pos = geo.pos, nrm = geo.nrm, nv = pos.length / 3, s = isNum(opts.scale) ? opts.scale : 1;
    var up = opts.upAxis || 'Y', i;
    if (up === 'Z') {
      for (i = 0; i < nv; i++) {
        var y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        pos[i * 3 + 1] = z; pos[i * 3 + 2] = -y;
        if (nrm) { var ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2]; nrm[i * 3 + 1] = nz; nrm[i * 3 + 2] = -ny; }
      }
    }
    if (s !== 1) for (i = 0; i < pos.length; i++) pos[i] *= s;
    var bb = computeBB(pos);
    var cx = (bb[0] + bb[3]) / 2, cz = (bb[2] + bb[5]) / 2, my = bb[1];
    for (i = 0; i < nv; i++) { pos[i * 3] -= cx; pos[i * 3 + 1] -= my; pos[i * 3 + 2] -= cz; }
    geo.bb = computeBB(pos);
    return geo;
  }

  function computeBB(pos) {
    var bb = [1e30, 1e30, 1e30, -1e30, -1e30, -1e30];
    for (var i = 0; i < pos.length; i += 3) {
      var x = pos[i], y = pos[i + 1], z = pos[i + 2];
      if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (z < bb[2]) bb[2] = z;
      if (x > bb[3]) bb[3] = x; if (y > bb[4]) bb[4] = y; if (z > bb[5]) bb[5] = z;
    }
    if (bb[0] > bb[3]) bb = [0, 0, 0, 0, 0, 0];
    return bb;
  }

  function ensureNormals(geo) {
    var pos = geo.pos, idx = geo.idx, nv = pos.length / 3;
    var has = geo.nrm && geo.nrm.length === nv * 3;
    if (has) {
      var ok = false;
      for (var k = 0; k < geo.nrm.length; k++) if (geo.nrm[k] !== 0) { ok = true; break; }
      if (ok) return geo;
    }
    var nrm = new Float32Array(nv * 3);
    for (var t = 0; t < idx.length; t += 3) {
      var a = idx[t], b = idx[t + 1], c = idx[t + 2];
      var pa = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]];
      var pb = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]];
      var pc = [pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]];
      var fn = cross(sub(pb, pa), sub(pc, pa));
      nrm[a * 3] += fn[0]; nrm[a * 3 + 1] += fn[1]; nrm[a * 3 + 2] += fn[2];
      nrm[b * 3] += fn[0]; nrm[b * 3 + 1] += fn[1]; nrm[b * 3 + 2] += fn[2];
      nrm[c * 3] += fn[0]; nrm[c * 3 + 1] += fn[1]; nrm[c * 3 + 2] += fn[2];
    }
    for (var v = 0; v < nv; v++) {
      var n = norml([nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]]);
      nrm[v * 3] = n[0]; nrm[v * 3 + 1] = n[1]; nrm[v * 3 + 2] = n[2];
    }
    geo.nrm = nrm; return geo;
  }

  function rotateGeo(geo, ax, deg) {
    if (!deg) return geo;
    var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    function rot(x, y, z) {
      if (ax === 'x') return [x, c * y - s * z, s * y + c * z];
      if (ax === 'y') return [c * x + s * z, y, -s * x + c * z];
      return [c * x - s * y, s * x + c * y, z];
    }
    var p = geo.pos, n = geo.nrm, i, r;
    for (i = 0; i < p.length; i += 3) { r = rot(p[i], p[i + 1], p[i + 2]); p[i] = r[0]; p[i + 1] = r[1]; p[i + 2] = r[2]; }
    if (n) for (i = 0; i < n.length; i += 3) { r = rot(n[i], n[i + 1], n[i + 2]); n[i] = r[0]; n[i + 1] = r[1]; n[i + 2] = r[2]; }
    return geo;
  }
  function scaleGeo(geo, k) { for (var i = 0; i < geo.pos.length; i++) geo.pos[i] *= k; return geo; }

  function signedVolume(geo) {
    var pos = geo.pos, idx = geo.idx, vol = 0;
    for (var t = 0; t < idx.length; t += 3) {
      var a = idx[t], b = idx[t + 1], c = idx[t + 2];
      var pa = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]];
      var pb = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]];
      var pc = [pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]];
      vol += dot(pa, cross(pb, pc));
    }
    return vol / 6;
  }

  function countDegenerate(geo) {
    var pos = geo.pos, idx = geo.idx, n = 0;
    for (var t = 0; t < idx.length; t += 3) {
      var a = idx[t], b = idx[t + 1], c = idx[t + 2];
      var pa = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]];
      var pb = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]];
      var pc = [pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]];
      var ar = Math.hypot.apply(null, cross(sub(pb, pa), sub(pc, pa)));
      if (!(ar > 1e-12)) n++;
    }
    return n;
  }

  function hasNaN(geo) {
    var p = geo.pos, i;
    for (i = 0; i < p.length; i++) if (!isFinite(p[i])) return true;
    if (geo.nrm) for (i = 0; i < geo.nrm.length; i++) if (!isFinite(geo.nrm[i])) return true;
    return false;
  }

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  function quantize(geo) {
    var pos = geo.pos, nrm = geo.nrm, uv = geo.uv, idx = geo.idx;
    var nv = pos.length / 3, bb = geo.bb || computeBB(pos);
    var dx = bb[3] - bb[0] || 1, dy = bb[4] - bb[1] || 1, dz = bb[5] - bb[2] || 1;
    var posQ = new Uint16Array(nv * 3), nrmQ = new Int8Array(nv * 3);
    for (var i = 0; i < nv; i++) {
      posQ[i * 3] = Math.round(clamp01((pos[i * 3] - bb[0]) / dx) * 65535);
      posQ[i * 3 + 1] = Math.round(clamp01((pos[i * 3 + 1] - bb[1]) / dy) * 65535);
      posQ[i * 3 + 2] = Math.round(clamp01((pos[i * 3 + 2] - bb[2]) / dz) * 65535);
      var nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
      nrmQ[i * 3] = Math.max(-127, Math.min(127, Math.round(nx * 127)));
      nrmQ[i * 3 + 1] = Math.max(-127, Math.min(127, Math.round(ny * 127)));
      nrmQ[i * 3 + 2] = Math.max(-127, Math.min(127, Math.round(nz * 127)));
    }
    var uvA = uv && uv.length === nv * 2 ? Float32Array.from(uv) : new Float32Array(nv * 2);
    var idxA = idx instanceof Uint32Array ? idx : Uint32Array.from(idx);
    var meta = { plen: posQ.byteLength, nlen: nrmQ.byteLength, uvlen: uvA.byteLength, ilen: idxA.byteLength, bb: bb, nv: nv, dim: [bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]] };
    var raw = new Uint8Array(meta.plen + meta.nlen + meta.uvlen + meta.ilen), off = 0;
    raw.set(new Uint8Array(posQ.buffer, posQ.byteOffset, posQ.byteLength), off); off += meta.plen;
    raw.set(new Uint8Array(nrmQ.buffer, nrmQ.byteOffset, nrmQ.byteLength), off); off += meta.nlen;
    raw.set(new Uint8Array(uvA.buffer, uvA.byteOffset, uvA.byteLength), off); off += meta.uvlen;
    raw.set(new Uint8Array(idxA.buffer, idxA.byteOffset, idxA.byteLength), off); off += meta.ilen;
    return { raw: raw, meta: meta };
  }

  function dequantize(raw, meta) {
    var off = 0;
    var posQ = new Uint16Array(raw.slice(off, off + meta.plen).buffer); off += meta.plen;
    var nrm = new Int8Array(raw.slice(off, off + meta.nlen).buffer); off += meta.nlen;
    var uv = new Float32Array(raw.slice(off, off + meta.uvlen).buffer); off += meta.uvlen;
    var idx = new Uint32Array(raw.slice(off, off + meta.ilen).buffer); off += meta.ilen;
    var bb = meta.bb, nv = meta.nv, pos = new Float32Array(nv * 3);
    for (var i = 0; i < nv; i++) {
      pos[i * 3] = bb[0] + (posQ[i * 3] / 65535) * (bb[3] - bb[0]);
      pos[i * 3 + 1] = bb[1] + (posQ[i * 3 + 1] / 65535) * (bb[4] - bb[1]);
      pos[i * 3 + 2] = bb[2] + (posQ[i * 3 + 2] / 65535) * (bb[5] - bb[2]);
    }
    var nf = new Float32Array(nv * 3);
    for (var k = 0; k < nv * 3; k++) nf[k] = nrm[k] / 127;
    return { pos: pos, nrm: nf, uv: uv, idx: idx, bb: bb };
  }

  /* ============================ PARSEUR OBJ =============================== */
  function parseOBJ(text, mtlText) {
    var V = [], VT = [], VN = [], mtl = mtlText ? parseMTL(mtlText) : {};
    var verts = [], vmap = {}, curMat = '__default';
    var groupsOrder = [], groupTris = {};
    function pushGroup(m) { if (!groupTris[m]) { groupTris[m] = []; groupsOrder.push(m); } }
    pushGroup(curMat);
    function vert(tok) {
      var gi = vmap[tok]; if (gi !== undefined) return gi;
      var p = tok.split('/');
      var vi = parseInt(p[0], 10); if (vi < 0) vi = V.length + vi + 1;
      var ti = p[1] ? parseInt(p[1], 10) : 0; if (ti < 0) ti = VT.length + ti + 1;
      var ni = p[2] ? parseInt(p[2], 10) : 0; if (ni < 0) ni = VN.length + ni + 1;
      var v = V[vi - 1] || [0, 0, 0], vt = ti ? (VT[ti - 1] || [0, 0]) : [0, 0], vn = ni ? (VN[ni - 1] || [0, 0, 0]) : null;
      verts.push({ p: v, t: vt, n: vn });
      gi = verts.length - 1; vmap[tok] = gi; return gi;
    }
    var lines = text.split(/\r?\n/);
    for (var li = 0; li < lines.length; li++) {
      var ln = lines[li].trim(); if (!ln || ln.charAt(0) === '#') continue;
      var sp = ln.split(/\s+/), tag = sp[0];
      if (tag === 'v') V.push([parseFloat(sp[1]), parseFloat(sp[2]), parseFloat(sp[3])]);
      else if (tag === 'vt') VT.push([parseFloat(sp[1]), parseFloat(sp[2] || 0)]);
      else if (tag === 'vn') VN.push([parseFloat(sp[1]), parseFloat(sp[2]), parseFloat(sp[3])]);
      else if (tag === 'usemtl') { curMat = sp[1] || '__default'; pushGroup(curMat); }
      else if (tag === 'f') {
        var fv = [];
        for (var i = 1; i < sp.length; i++) if (sp[i]) fv.push(vert(sp[i]));
        for (var j = 2; j < fv.length; j++) groupTris[curMat].push([fv[0], fv[j - 1], fv[j]]);
      }
    }
    var nv = verts.length;
    var pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    var anyN = false;
    for (var w = 0; w < nv; w++) {
      var vv = verts[w];
      pos[w * 3] = vv.p[0]; pos[w * 3 + 1] = vv.p[1]; pos[w * 3 + 2] = vv.p[2];
      uv[w * 2] = vv.t[0]; uv[w * 2 + 1] = vv.t[1];
      if (vv.n) { nrm[w * 3] = vv.n[0]; nrm[w * 3 + 1] = vv.n[1]; nrm[w * 3 + 2] = vv.n[2]; anyN = true; }
    }
    var idxArr = [], groups = [];
    groupsOrder.forEach(function (m) {
      var ts = groupTris[m]; if (!ts.length) return;
      var start = idxArr.length;
      ts.forEach(function (t) { idxArr.push(t[0], t[1], t[2]); });
      var mm = mtl[m];
      groups.push({ start: start, count: idxArr.length - start, col: mm && mm.col ? mm.col : null, tex: null, name: m === '__default' ? 'Materiau' : m });
    });
    return { pos: pos, nrm: anyN ? nrm : null, uv: uv, idx: Uint32Array.from(idxArr), groups: groups };
  }

  function parseMTL(text) {
    var out = {}, cur = null, lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim(); if (!ln || ln.charAt(0) === '#') continue;
      var sp = ln.split(/\s+/);
      if (sp[0] === 'newmtl') { cur = sp[1]; out[cur] = {}; }
      else if (sp[0] === 'Kd' && cur) out[cur].col = [Math.round(parseFloat(sp[1]) * 255), Math.round(parseFloat(sp[2]) * 255), Math.round(parseFloat(sp[3]) * 255)];
    }
    return out;
  }

  /* ============================ PARSEUR STL (binaire + ASCII) ============= */
  function parseSTL(u8) {
    if (u8.length >= 84) {
      var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      var n = dv.getUint32(80, true);
      if (u8.length === 84 + n * 50) return parseSTLBinary(u8);
    }
    return parseSTLAscii(bytesToStr(u8));
  }
  function stlWrap(pos, nrm, ntri) {
    var idx = new Uint32Array(ntri * 3); for (var k = 0; k < idx.length; k++) idx[k] = k;
    var anyN = false; for (var q = 0; q < nrm.length; q++) if (nrm[q] !== 0) { anyN = true; break; }
    return { pos: pos, nrm: anyN ? nrm : null, uv: new Float32Array(ntri * 6), idx: idx,
      groups: [{ start: 0, count: idx.length, col: null, tex: null, name: 'STL' }] };
  }
  function parseSTLBinary(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var ntri = dv.getUint32(80, true), off = 84;
    var pos = new Float32Array(ntri * 9), nrm = new Float32Array(ntri * 9);
    for (var i = 0; i < ntri; i++) {
      var nx = dv.getFloat32(off, true), ny = dv.getFloat32(off + 4, true), nz = dv.getFloat32(off + 8, true); off += 12;
      for (var v = 0; v < 3; v++) {
        var x = dv.getFloat32(off, true), y = dv.getFloat32(off + 4, true), z = dv.getFloat32(off + 8, true); off += 12;
        var bi = i * 3 + v; pos[bi * 3] = x; pos[bi * 3 + 1] = y; pos[bi * 3 + 2] = z;
        nrm[bi * 3] = nx; nrm[bi * 3 + 1] = ny; nrm[bi * 3 + 2] = nz;
      }
      off += 2;
    }
    return stlWrap(pos, nrm, ntri);
  }
  function parseSTLAscii(text) {
    var posA = [], nrmA = [], cur = [0, 0, 0], lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim(); if (!t) continue; var sp = t.split(/\s+/);
      if (sp[0] === 'facet' && sp[1] === 'normal') cur = [parseFloat(sp[2]), parseFloat(sp[3]), parseFloat(sp[4])];
      else if (sp[0] === 'vertex') { posA.push(parseFloat(sp[1]), parseFloat(sp[2]), parseFloat(sp[3])); nrmA.push(cur[0], cur[1], cur[2]); }
    }
    var pos = Float32Array.from(posA), nrm = Float32Array.from(nrmA), ntri = (pos.length / 9) | 0;
    return stlWrap(pos, nrm, ntri);
  }

  /* ============================ PARSEUR glTF / glb ======================== */
  function _b64u8(b64) { var bin = glob.atob ? glob.atob(b64) : atob(b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function parseGLTF(data, ext) {
    var json, bin = null;
    var u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    var dv0 = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.length >= 12 && dv0.getUint32(0, true) === 0x46546C67) {
      var len = dv0.getUint32(8, true), off = 12;
      while (off < len) {
        var clen = dv0.getUint32(off, true), ctype = dv0.getUint32(off + 4, true); off += 8;
        if (ctype === 0x4E4F534A) json = JSON.parse(bytesToStr(u8.subarray(off, off + clen)));
        else if (ctype === 0x004E4942) bin = u8.subarray(off, off + clen);
        off += clen;
      }
    } else { json = JSON.parse(bytesToStr(u8)); }
    if (!json) throw new Error('glTF illisible.');
    var buffers = (json.buffers || []).map(function (b) {
      if (b.uri) { var m = /^data:[^;]*;base64,(.*)$/.exec(b.uri); if (m) return _b64u8(m[1]); throw new Error('glTF a buffer externe non supporte (utilisez .glb ou un glTF embarque).'); }
      return bin;
    });
    var COMP = { 5120: { s: 1, f: 'getInt8' }, 5121: { s: 1, f: 'getUint8' }, 5122: { s: 2, f: 'getInt16' }, 5123: { s: 2, f: 'getUint16' }, 5125: { s: 4, f: 'getUint32' }, 5126: { s: 4, f: 'getFloat32' } };
    var NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
    function accessor(idx) {
      var ac = json.accessors[idx], bv = json.bufferViews[ac.bufferView], buf = buffers[bv.buffer];
      var comp = COMP[ac.componentType], ncomp = NC[ac.type], dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      var base = (bv.byteOffset || 0) + (ac.byteOffset || 0), stride = bv.byteStride || (ncomp * comp.s), out = new Float32Array(ac.count * ncomp);
      for (var i = 0; i < ac.count; i++) for (var c = 0; c < ncomp; c++) out[i * ncomp + c] = dv[comp.f](base + i * stride + c * comp.s, true);
      return { data: out, ncomp: ncomp, count: ac.count };
    }
    function mMul(a, b) { var o = new Array(16); for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + i] * b[j * 4 + k]; o[j * 4 + i] = s; } return o; }
    function mId() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
    function trs(t, r, sc) {
      t = t || [0, 0, 0]; r = r || [0, 0, 0, 1]; sc = sc || [1, 1, 1];
      var x = r[0], y = r[1], z = r[2], w = r[3], x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2, sx = sc[0], sy = sc[1], sz = sc[2];
      return [(1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0, (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0, (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0, t[0], t[1], t[2], 1];
    }
    function mP(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }
    function mD(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; }
    var allPos = [], allNrm = [], allUv = [], allIdx = [], groups = [], vbase = 0, anyN = false;
    function primitive(prim, M) {
      if (prim.extensions && prim.extensions.KHR_draco_mesh_compression) throw new Error('glTF Draco compresse non supporte.');
      if (prim.attributes.POSITION == null) return;
      var pos = accessor(prim.attributes.POSITION), nrm = prim.attributes.NORMAL != null ? accessor(prim.attributes.NORMAL) : null, uv = prim.attributes.TEXCOORD_0 != null ? accessor(prim.attributes.TEXCOORD_0) : null, idx = prim.indices != null ? accessor(prim.indices) : null, nv = pos.count;
      for (var i = 0; i < nv; i++) {
        var p = mP(M, pos.data[i * 3], pos.data[i * 3 + 1], pos.data[i * 3 + 2]); allPos.push(p[0], p[1], p[2]);
        if (nrm) { var n = mD(M, nrm.data[i * 3], nrm.data[i * 3 + 1], nrm.data[i * 3 + 2]); allNrm.push(n[0], n[1], n[2]); anyN = true; } else allNrm.push(0, 0, 0);
        if (uv) allUv.push(uv.data[i * 2], uv.data[i * 2 + 1]); else allUv.push(0, 0);
      }
      var start = allIdx.length;
      if (idx) { for (var k = 0; k < idx.count; k++) allIdx.push(idx.data[k] + vbase); } else { for (var k2 = 0; k2 < nv; k2++) allIdx.push(k2 + vbase); }
      vbase += nv;
      var col = null, al = 1, name = 'mesh';
      if (prim.material != null && json.materials && json.materials[prim.material]) {
        var mat = json.materials[prim.material]; name = mat.name || name;
        var pbr = mat.pbrMetallicRoughness; if (pbr && pbr.baseColorFactor) { var bc = pbr.baseColorFactor; col = [Math.round(bc[0] * 255), Math.round(bc[1] * 255), Math.round(bc[2] * 255)]; al = bc[3] == null ? 1 : bc[3]; }
      }
      var grp = { start: start, count: allIdx.length - start, col: col, tex: null, name: name }; if (al < 0.99) grp.al = al; groups.push(grp);
    }
    function node(ni, parentM) {
      var nd = json.nodes[ni]; var local = nd.matrix ? nd.matrix.slice() : trs(nd.translation, nd.rotation, nd.scale); var M = mMul(parentM, local);
      if (nd.mesh != null) (json.meshes[nd.mesh].primitives || []).forEach(function (p) { primitive(p, M); });
      (nd.children || []).forEach(function (ci) { node(ci, M); });
    }
    var scene = json.scenes && json.scenes[json.scene || 0], roots = scene ? scene.nodes : (json.nodes ? json.nodes.map(function (_, i) { return i; }) : []);
    roots.forEach(function (ni) { node(ni, mId()); });
    var geo = { pos: Float32Array.from(allPos), nrm: anyN ? Float32Array.from(allNrm) : null, uv: Float32Array.from(allUv), idx: Uint32Array.from(allIdx), groups: groups.length ? groups : [{ start: 0, count: allIdx.length, col: null, tex: null, name: 'glTF' }] };
    geo._upAxis = 'Y'; geo._unit = 1; return geo;
  }

  /* ============================ PARSEUR DAE (COLLADA) ===================== */
  function parseDAE(text) {
    if (!glob.DOMParser) throw new Error('DOMParser indisponible.');
    var doc = new glob.DOMParser().parseFromString(text, 'application/xml');
    function tags(el, name) { return el.getElementsByTagName(name); }
    function first(el, name) { var t = el.getElementsByTagName(name); return t.length ? t[0] : null; }
    function nums(s) { s = (s || '').trim(); if (!s) return []; var p = s.split(/\s+/), a = new Array(p.length); for (var i = 0; i < p.length; i++) a[i] = parseFloat(p[i]); return a; }
    function ints(s) { s = (s || '').trim(); if (!s) return []; var p = s.split(/\s+/), a = new Array(p.length); for (var i = 0; i < p.length; i++) a[i] = parseInt(p[i], 10); return a; }
    var up = 'Y', unit = 1, asset = first(doc, 'asset');
    if (asset) {
      var ua = first(asset, 'up_axis'); if (ua) { var t = (ua.textContent || '').trim().toUpperCase(); if (t.charAt(0) === 'Z') up = 'Z'; }
      var un = first(asset, 'unit'); if (un) { var mm = parseFloat(un.getAttribute('meter')); if (isFinite(mm) && mm > 0) unit = mm; }
    }
    var allPos = [], allNrm = [], allUv = [], allIdx = [], groups = [], vbase = 0, anyNrm = false;
    function process(inputs, stride, material, idx, vcount) {
      var posSrc = null, nrmSrc = null, uvSrc = null, posOff = 0, nrmOff = 0, uvOff = 0;
      inputs.forEach(function (inp) {
        if (inp.sem === 'VERTEX') { posSrc = inp.srcObj; posOff = inp.off; }
        else if (inp.sem === 'NORMAL') { nrmSrc = inp.srcObj; nrmOff = inp.off; }
        else if (inp.sem === 'TEXCOORD' && !uvSrc) { uvSrc = inp.srcObj; uvOff = inp.off; }
      });
      if (!posSrc) return;
      var vmap = {}, lp = [], ln = [], lu = [], tris = [];
      function vert(ts) {
        var pI = idx[ts + posOff], nI = nrmSrc ? idx[ts + nrmOff] : -1, uI = uvSrc ? idx[ts + uvOff] : -1, key = pI + '/' + nI + '/' + uI;
        if (vmap[key] !== undefined) return vmap[key];
        var ps = posSrc.stride; lp.push(posSrc.data[pI * ps], posSrc.data[pI * ps + 1], posSrc.data[pI * ps + 2]);
        if (nrmSrc) { var ns = nrmSrc.stride; ln.push(nrmSrc.data[nI * ns], nrmSrc.data[nI * ns + 1], nrmSrc.data[nI * ns + 2]); anyNrm = true; } else ln.push(0, 0, 0);
        if (uvSrc) { var us = uvSrc.stride; lu.push(uvSrc.data[uI * us], uvSrc.data[uI * us + 1]); } else lu.push(0, 0);
        var id = lp.length / 3 - 1; vmap[key] = id; return id;
      }
      var tuples = idx.length / stride | 0;
      if (vcount) {
        var cur = 0;
        for (var f = 0; f < vcount.length; f++) { var n = vcount[f], poly = []; for (var v = 0; v < n; v++) poly.push(vert((cur + v) * stride)); cur += n; for (var tt = 2; tt < poly.length; tt++) tris.push(poly[0], poly[tt - 1], poly[tt]); }
      } else {
        for (var tp = 0; tp + 2 < tuples; tp += 3) tris.push(vert(tp * stride), vert((tp + 1) * stride), vert((tp + 2) * stride));
      }
      var start = allIdx.length;
      for (var m = 0; m < tris.length; m++) allIdx.push(tris[m] + vbase);
      for (var a = 0; a < lp.length; a++) allPos.push(lp[a]);
      for (var b = 0; b < ln.length; b++) allNrm.push(ln[b]);
      for (var c = 0; c < lu.length; c++) allUv.push(lu[c]);
      vbase = allPos.length / 3;
      groups.push({ start: start, count: allIdx.length - start, col: null, tex: null, name: material || ('mat' + groups.length) });
    }
    var geos = tags(doc, 'geometry');
    for (var gi = 0; gi < geos.length; gi++) {
      var mesh = first(geos[gi], 'mesh'); if (!mesh) continue;
      var srcMap = {}, srcs = tags(mesh, 'source');
      for (var si = 0; si < srcs.length; si++) {
        var sid = srcs[si].getAttribute('id'), fa = first(srcs[si], 'float_array'), acc = first(srcs[si], 'accessor');
        srcMap['#' + sid] = { data: fa ? nums(fa.textContent) : [], stride: acc ? parseInt(acc.getAttribute('stride') || '1', 10) : 1 };
      }
      var vertsMap = {}, vt = tags(mesh, 'vertices');
      for (var vi = 0; vi < vt.length; vi++) {
        var vid = vt[vi].getAttribute('id'), vin = tags(vt[vi], 'input');
        for (var k = 0; k < vin.length; k++) if (vin[k].getAttribute('semantic') === 'POSITION') vertsMap['#' + vid] = vin[k].getAttribute('source');
      }
      var prims = [];
      ['triangles', 'polylist', 'polygons'].forEach(function (tn) { var ps = tags(mesh, tn); for (var p = 0; p < ps.length; p++) prims.push({ el: ps[p], kind: tn }); });
      for (var pi = 0; pi < prims.length; pi++) {
        var pel = prims[pi].el, kind = prims[pi].kind, inputs = [], maxOff = 0, ch = pel.childNodes;
        for (var c2 = 0; c2 < ch.length; c2++) {
          var nd = ch[c2];
          if (nd.nodeType === 1 && nd.nodeName === 'input') {
            var off = parseInt(nd.getAttribute('offset') || '0', 10); if (off > maxOff) maxOff = off;
            var sem = nd.getAttribute('semantic'), src = nd.getAttribute('source'); if (sem === 'VERTEX') src = vertsMap[src] || src;
            inputs.push({ sem: sem, srcObj: srcMap[src], off: off });
          }
        }
        var stride = maxOff + 1, material = pel.getAttribute('material'), idx, vcount = null;
        if (/lumion/i.test(material || '')) continue;   /* ecarte le "Lumion Node Material" (repere d'export ArchiCAD) */
        if (kind === 'polylist') { vcount = ints((first(pel, 'vcount') || { textContent: '' }).textContent); idx = ints((first(pel, 'p') || { textContent: '' }).textContent); }
        else if (kind === 'polygons') { var pt = tags(pel, 'p'); idx = []; vcount = []; for (var pp = 0; pp < pt.length; pp++) { var a2 = ints(pt[pp].textContent); vcount.push(a2.length / stride | 0); for (var q = 0; q < a2.length; q++) idx.push(a2[q]); } }
        else { idx = ints((first(pel, 'p') || { textContent: '' }).textContent); }
        process(inputs, stride, material, idx, vcount);
      }
    }
    var geo = { pos: Float32Array.from(allPos), nrm: anyNrm ? Float32Array.from(allNrm) : null, uv: Float32Array.from(allUv), idx: Uint32Array.from(allIdx), groups: groups.length ? groups : [{ start: 0, count: allIdx.length, col: null, tex: null, name: 'DAE' }] };
    geo._upAxis = up; geo._unit = unit; return geo;
  }

  function bytesToStr(u8) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u8);
    var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return s;
  }

  /* UV planaires (en metres) pour les maillages sans UV : sinon une texture
     appliquee ne montre qu'un seul texel. Plan choisi par l'axe dominant de la normale. */
  function planarUV(geo) {
    var pos = geo.pos, nrm = geo.nrm, nv = pos.length / 3;
    var uv = (geo.uv && geo.uv.length === nv * 2) ? geo.uv : new Float32Array(nv * 2);
    for (var i = 0; i < nv; i++) {
      if (uv[i * 2] !== 0 || uv[i * 2 + 1] !== 0) continue;   /* garde les vraies UV */
      var nx = Math.abs(nrm ? nrm[i * 3] : 0), ny = Math.abs(nrm ? nrm[i * 3 + 1] : 1), nz = Math.abs(nrm ? nrm[i * 3 + 2] : 0);
      var x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], u, v;
      if (ny >= nx && ny >= nz) { u = x; v = z; }
      else if (nx >= ny && nx >= nz) { u = z; v = y; }
      else { u = x; v = y; }
      uv[i * 2] = u; uv[i * 2 + 1] = v;
    }
    geo.uv = uv; return geo;
  }

  function parseByFormat(ext, data, opts) {
    ext = (ext || '').toLowerCase().replace(/^\./, '');
    var geo;
    if (ext === 'obj') geo = parseOBJ(typeof data === 'string' ? data : bytesToStr(data), opts && opts.mtl);
    else if (ext === 'stl') geo = parseSTL(data instanceof Uint8Array ? data : new Uint8Array(data));
    else if (ext === 'dae') geo = parseDAE(typeof data === 'string' ? data : bytesToStr(data));
    else if (ext === 'gltf' || ext === 'glb') geo = parseGLTF(data instanceof Uint8Array ? data : new Uint8Array(data), ext);
    else throw new Error('Format non branche : ' + ext);
    var up = geo._upAxis || (opts && opts.upAxis) || 'Y';
    var scl = ((opts && opts.scale != null) ? opts.scale : 1) * (geo._unit || 1);
    normalizeGeometry(geo, { upAxis: up, scale: scl });
    ensureNormals(geo);
    planarUV(geo);
    if (!geo.groups || !geo.groups.length) geo.groups = [{ start: 0, count: geo.idx.length, col: null, tex: null, name: 'Materiau' }];
    return geo;
  }

  var core = {
    normalizeGeometry: normalizeGeometry, ensureNormals: ensureNormals, quantize: quantize,
    dequantize: dequantize, signedVolume: signedVolume, countDegenerate: countDegenerate,
    hasNaN: hasNaN, computeBB: computeBB, parseOBJ: parseOBJ, parseMTL: parseMTL, parseSTL: parseSTL,
    parseByFormat: parseByFormat, parseDAE: parseDAE, parseGLTF: parseGLTF, planarUV: planarUV, rotateGeo: rotateGeo, scaleGeo: scaleGeo
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

  /* ========================= MOITIE NAVIGATEUR =========================== */
  var doc = glob.document;

  function bytesToB64(u8) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return glob.btoa(s);
  }
  function b64ToBytes(b64) { var bin = glob.atob(b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  function gzipB64(u8) {
    if (typeof glob.CompressionStream === 'undefined') return Promise.reject(new Error('CompressionStream indisponible.'));
    var cs = new glob.CompressionStream('gzip');
    var stream = new glob.Blob([u8]).stream().pipeThrough(cs);
    return new glob.Response(stream).arrayBuffer().then(function (ab) { return bytesToB64(new Uint8Array(ab)); });
  }
  function gunzipBytes(b64) {
    if (typeof glob.DecompressionStream === 'undefined') return Promise.reject(new Error('DecompressionStream indisponible.'));
    var ds = new glob.DecompressionStream('gzip');
    var stream = new glob.Blob([b64ToBytes(b64)]).stream().pipeThrough(ds);
    return new glob.Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  function idbOpen() {
    return new Promise(function (res, rej) {
      if (!glob.indexedDB) { rej(new Error('IndexedDB indisponible')); return; }
      var rq = glob.indexedDB.open(IMP_DB, 1);
      rq.onupgradeneeded = function () { var db = rq.result; if (!db.objectStoreNames.contains(IMP_DBSTORE)) db.createObjectStore(IMP_DBSTORE, { keyPath: 'pid' }); };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
  }
  function idbPut(rec) { return idbOpen().then(function (db) { return new Promise(function (res, rej) { var tx = db.transaction(IMP_DBSTORE, 'readwrite'); tx.objectStore(IMP_DBSTORE).put(rec); tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(tx.error); }; }); }); }
  function idbGetAll() { return idbOpen().then(function (db) { return new Promise(function (res, rej) { var tx = db.transaction(IMP_DBSTORE, 'readonly'); var rq = tx.objectStore(IMP_DBSTORE).getAll(); rq.onsuccess = function () { res(rq.result || []); }; rq.onerror = function () { rej(rq.error); }; }); }); }
  function idbDel(pid) { return idbOpen().then(function (db) { return new Promise(function (res) { var tx = db.transaction(IMP_DBSTORE, 'readwrite'); tx.objectStore(IMP_DBSTORE).delete(pid); tx.oncomplete = function () { res(); }; tx.onerror = function () { res(); }; }); }); }

  var IMP_NAMES = {};   /* pid -> nom */
  var IMP_REC = {};     /* pid -> { orig:{geo,meta}, groups, xform:{rx,ry,rz,sc} } */

  function registerMesh(pid, D) {
    if (typeof glob.TEX_OBJECTS === 'undefined') glob.TEX_OBJECTS = {};
    glob.TEX_OBJECTS[pid] = D;
    if (glob.FAB_CACHE) delete glob.FAB_CACHE[pid];
  }

  function refreshImported(pid) {
    if (glob.FAB_CACHE) delete glob.FAB_CACHE[pid];
    if (glob.SCENE && glob.SCENE.instances) glob.SCENE.instances.forEach(function (i) { if (i && i.prod === pid) { i._xf = null; i._xk = null; } });
    try {
      if (typeof glob.build === 'function' && glob.MODE === 'scene') glob.build();
      glob.DIRTY = true;
      if (glob.WGL && glob.WGL.gActive && glob.WGL.render) glob.WGL.render();
      if (typeof glob.refreshView === 'function') glob.refreshView();
    } catch (e) {}
  }

  function ensureImportFolder() {
    if (typeof glob.cfgFoldLoad !== 'function') return null;
    var folders = glob.cfgFoldLoad();
    if (!folders.some(function (f) { return f.id === IMP_FOLDER_ID; })) {
      folders.unshift({ id: IMP_FOLDER_ID, name: 'Objets importes', parent: null, open: true });
      glob.cfgFoldStore(folders);
    }
    return IMP_FOLDER_ID;
  }

  /* applique une transfo absolue (deg X/Y/Z + echelle %) a la geometrie d'origine */
  function applyXform(R, xf) {
    return gunzipBytes(R.orig.geo).then(function (raw) {
      var geo = core.dequantize(raw, R.orig.meta);
      core.rotateGeo(geo, 'x', xf.rx || 0);
      core.rotateGeo(geo, 'y', xf.ry || 0);
      core.rotateGeo(geo, 'z', xf.rz || 0);
      var sc = (xf.sc || 100) / 100; if (sc !== 1) core.scaleGeo(geo, sc);
      core.normalizeGeometry(geo, { upAxis: 'Y', scale: 1 });
      core.ensureNormals(geo);
      var q = core.quantize(geo);
      return gzipB64(q.raw).then(function (b64) { return { geo: b64, meta: q.meta, groups: R.groups }; });
    });
  }

  function addImport(name, geo) {
    var q = core.quantize(geo);
    return gzipB64(q.raw).then(function (geoB64) {
      var pid = 'imp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var orig = { geo: geoB64, meta: q.meta };
      var xform = { rx: 0, ry: 0, rz: 0, sc: 100 };
      var D = { geo: geoB64, meta: q.meta, groups: geo.groups };
      IMP_REC[pid] = { orig: orig, groups: geo.groups, xform: xform };
      registerMesh(pid, D); IMP_NAMES[pid] = name;
      var rec = { pid: pid, name: name, date: new Date().toISOString(), groups: geo.groups, xform: xform, orig: orig, D: D };
      var idbP = idbPut(rec).catch(function (e) { console.warn('BPO import: IndexedDB', e); });
      ensureImportFolder();
      var list = glob.cfgLoad();
      list.unshift({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type: 'import', mode: 'fabprod', prod: pid, name: name, label: 'objet importe',
        parent: IMP_FOLDER_ID, date: new Date().toLocaleDateString('fr-FR') });
      glob.cfgStore(list);
      if (typeof glob.cfgRender === 'function') glob.cfgRender();
      return idbP.then(function () { return pid; });
    });
  }

  /* Fige un maillage construit ailleurs (ex. terrain MNT) en OBJET IMPORTÉ :
     mêmes stockage/rendu/scène/export que les imports de fichiers.
       pos    : Float32Array (x,y,z...) déjà en Y-up, échelle mètres
       idx    : Uint32Array (triangles)
       groups : [{start,count,col:[r,g,b]|null,tex:id|null,name}]  (couleurs par groupe)
     Renvoie une Promise -> pid. */
  function bake(name, pos, idx, groups) {
    var geo = {
      pos: (pos instanceof Float32Array) ? pos : Float32Array.from(pos),
      idx: (idx instanceof Uint32Array) ? idx : Uint32Array.from(idx),
      groups: (groups && groups.length) ? groups : [{ start: 0, count: (idx.length), col: null, tex: null, name: 'Terrain' }]
    };
    core.ensureNormals(geo);
    return addImport(name || 'Terrain', geo);
  }

  /* transfo absolue depuis les champs numeriques */
  function setTransform(cfg, xf) {
    var pid = cfg && cfg.prod, R = IMP_REC[pid];
    if (!R) { var D0 = glob.TEX_OBJECTS && glob.TEX_OBJECTS[pid]; if (!D0) return; R = { orig: { geo: D0.geo, meta: D0.meta }, groups: D0.groups, xform: { rx: 0, ry: 0, rz: 0, sc: 100 } }; IMP_REC[pid] = R; }
    applyXform(R, xf).then(function (nD) {
      registerMesh(pid, nD); R.xform = xf; try { delete IMP_PICK[pid]; } catch (e) {} try { delete IMP_UVOK[pid]; } catch (e) {}
      idbGetAll().then(function (all) { var rec = all.filter(function (r) { return r.pid === pid; })[0]; if (rec) { rec.D = nD; rec.xform = xf; rec.orig = rec.orig || R.orig; rec.groups = rec.groups || R.groups; idbPut(rec); } });
      refreshImported(pid);
    }).catch(function (e) { glob.alert('Ajustement echoue : ' + (e && e.message || e)); });
  }

  function addToScene(cfg) {
    var pid = cfg && cfg.prod; if (!pid) return;
    if (glob.MODE !== 'scene' && typeof glob.enterSceneMode === 'function') glob.enterSceneMode();
    if (typeof glob.scnAddFab === 'function') glob.scnAddFab(pid, 0, 0);
    if (typeof glob.refreshView === 'function') glob.refreshView();
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* editeur de finitions (RAL + textures de l'app) reutilise buildProductMatPanel */
  function openFinishEditor(cfg) {
    var pid = cfg && cfg.prod; if (!pid) return;
    if (typeof glob.buildProductMatPanel !== 'function') { glob.alert('Editeur de finitions indisponible dans cette version.'); return; }
    var ex = doc.getElementById('impFinishOverlay'); if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
    var ov = doc.createElement('div'); ov.id = 'impFinishOverlay';
    ov.style.cssText = 'position:fixed;top:0;right:0;width:330px;max-height:100vh;overflow:auto;z-index:100000;padding:12px;background:var(--pn,#1c1c1c);color:var(--tx,#eee);border-left:1px solid var(--ln,#444);box-shadow:-6px 0 20px rgba(0,0,0,.45);font-size:12px;';
    var hdr = doc.createElement('div'); hdr.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;';
    var ttl = doc.createElement('b'); ttl.textContent = 'Finitions - ' + cfg.name; hdr.appendChild(ttl);
    var cl = doc.createElement('button'); cl.textContent = 'x Fermer'; cl.style.cssText = 'font-size:11px;padding:3px 8px;';
    hdr.appendChild(cl); ov.appendChild(hdr);
    var body = doc.createElement('div'); ov.appendChild(body); doc.body.appendChild(ov);
    var _orig = glob.buildFinishPanel;
    function render() { body.innerHTML = ''; var D = glob.TEX_OBJECTS && glob.TEX_OBJECTS[pid]; try { glob.buildProductMatPanel(body, pid, (D && D.groups) || []); } catch (e) { body.textContent = 'Erreur : ' + (e && e.message || e); } }
    function close() { glob.buildFinishPanel = _orig; if (ov.parentNode) ov.parentNode.removeChild(ov); }
    cl.onclick = close;
    glob.buildFinishPanel = render;
    render();
  }

  function buildAdjustControls(cfg) {
    var wrap = doc.createElement('div'); wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:4px 0;';
    var xf = (IMP_REC[cfg.prod] && IMP_REC[cfg.prod].xform) || { rx: 0, ry: 0, rz: 0, sc: 100 };
    function mk(txt, title, fn) { var b = doc.createElement('button'); b.textContent = txt; if (title) b.title = title; b.onclick = fn; return b; }
    function field(lbl, val, ttl) {
      var wr = doc.createElement('label'); wr.style.cssText = 'display:inline-flex;align-items:center;gap:2px;font-size:11px;'; if (ttl) wr.title = ttl;
      wr.appendChild(doc.createTextNode(lbl));
      var inp = doc.createElement('input'); inp.type = 'number'; inp.value = val; inp.step = 'any'; inp.style.cssText = 'width:56px;font-size:11px;padding:3px;';
      wr.appendChild(inp); return { wrap: wr, inp: inp };
    }
    var fx = field('X°', xf.rx, 'Rotation autour de X (deg)'), fy = field('Y°', xf.ry, 'Rotation autour de Y (deg)'), fz = field('Z°', xf.rz, 'Rotation autour de Z (deg)'), fs = field('Echelle %', xf.sc, 'Echelle en pourcent (100 = taille du fichier)');
    function apply() { setTransform(cfg, { rx: parseFloat(fx.inp.value) || 0, ry: parseFloat(fy.inp.value) || 0, rz: parseFloat(fz.inp.value) || 0, sc: parseFloat(fs.inp.value) || 100 }); }
    [fx, fy, fz, fs].forEach(function (f) { f.inp.addEventListener('change', apply); f.inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') apply(); }); });
    wrap.appendChild(fx.wrap); wrap.appendChild(fy.wrap); wrap.appendChild(fz.wrap); wrap.appendChild(fs.wrap);
    wrap.appendChild(mk('OK', 'Appliquer', apply));
    wrap.appendChild(mk('Reset', 'Remettre a zero', function () { fx.inp.value = 0; fy.inp.value = 0; fz.inp.value = 0; fs.inp.value = 100; apply(); }));
    return wrap;
  }

  /* auto-reparation : regenere des UV planaires pour les imports anciens (sans UV) */
  var IMP_UVOK = {};
  function ensureImportUVs(pid) {
    if (IMP_UVOK[pid]) return Promise.resolve(false);
    var D = glob.TEX_OBJECTS && glob.TEX_OBJECTS[pid]; if (!D || !D.geo) return Promise.resolve(false);
    return gunzipBytes(D.geo).then(function (raw) {
      var geo = core.dequantize(raw, D.meta);
      var zero = false; for (var i = 0; i < geo.uv.length; i += 2) { if (geo.uv[i] === 0 && geo.uv[i + 1] === 0) { zero = true; break; } }
      if (!zero) { IMP_UVOK[pid] = true; return false; }
      core.planarUV(geo);
      var q = core.quantize(geo);
      return gzipB64(q.raw).then(function (b64) {
        var nD = { geo: b64, meta: q.meta, groups: D.groups };
        registerMesh(pid, nD); IMP_UVOK[pid] = true; try { delete IMP_PICK[pid]; } catch (e) {}
        var pack = { geo: b64, meta: q.meta }, xf = IMP_REC[pid] && IMP_REC[pid].xform;
        var ident = !xf || ((xf.rx || 0) === 0 && (xf.ry || 0) === 0 && (xf.rz || 0) === 0 && (xf.sc == null || xf.sc === 100));
        if (IMP_REC[pid] && ident) IMP_REC[pid].orig = pack;
        idbGetAll().then(function (all) { var rec = all.filter(function (r) { return r.pid === pid; })[0]; if (rec) { rec.D = nD; if (ident) rec.orig = pack; try { idbPut(rec); } catch (e) {} } }).catch(function () {});
        return true;
      });
    }).catch(function () { return false; });
  }

  function showImportedAlone(pid) {
    var D0 = glob.TEX_OBJECTS && glob.TEX_OBJECTS[pid]; if (!D0) return;
    ensureImportUVs(pid).then(function () {
      var D = glob.TEX_OBJECTS && glob.TEX_OBJECTS[pid]; if (!D) return;
      if (D.meta && !D.meta.dim && D.meta.bb) { var b = D.meta.bb; D.meta.dim = [b[3] - b[0], b[4] - b[1], b[5] - b[2]]; }
      try {
        glob.AL_PRODUCT = pid; glob.PROD_MAT = 0; glob.MODE = 'quadripod';
        if (glob.WGL) { glob.WGL.gActive = false; glob.WGL.texModel = null; }
        if (typeof glob.gizovShow === 'function') { try { glob.gizovShow(false); } catch (e2) {} }
        if (glob.WGL && typeof glob.WGL.show === 'function') glob.WGL.show(pid);
        var d = D.meta && D.meta.dim;
        if (d && glob.WGL && glob.WGL.cam) { glob.WGL.cam.r = Math.hypot(d[0], d[1], d[2]) * 1.15; glob.WGL.cam.ty = d[1] / 2; if (typeof glob.WGL.render === 'function') glob.WGL.render(); }
      } catch (e) {}
    });
  }

  /* panneau de droite (comme un configurateur) : orientation + finitions, pas d'ajout auto en scene */
  function openImportPanel(cfg) {
    var pid = cfg && cfg.prod; if (!pid) return;
    showImportedAlone(pid);
    var host = doc.getElementById('params'); if (!host) return;
    if (typeof glob.setMEP === 'function') { try { glob.setMEP(false); } catch (e) {} }
    host.innerHTML = '';
    var wrap = doc.createElement('div'); wrap.className = 'fld';
    var h = doc.createElement('div'); h.className = 'fh'; h.innerHTML = '<span>Objet importe - ' + esc(cfg.name) + '</span>'; wrap.appendChild(h);
    var add = doc.createElement('button'); add.className = 'save-add'; add.textContent = '+ Ajouter a la scene'; add.style.margin = '2px 0 8px'; add.onclick = function () { addToScene(cfg); }; wrap.appendChild(add);
    var lblA = doc.createElement('div'); lblA.className = 'slbl'; lblA.textContent = 'Orientation & echelle'; wrap.appendChild(lblA);
    wrap.appendChild(buildAdjustControls(cfg));
    var lblF = doc.createElement('div'); lblF.className = 'slbl'; lblF.style.marginTop = '8px'; lblF.textContent = 'Finitions (RAL & textures)'; wrap.appendChild(lblF);
    var finHost = doc.createElement('div'); wrap.appendChild(finHost);
    host.appendChild(wrap);
    try { var _fh = doc.getElementById('finish-hd'), _fs = doc.getElementById('finish-sec'); if (_fh) _fh.style.display = 'none'; if (_fs) _fs.style.display = 'none'; } catch (e) {}
    var _orig = glob.buildFinishPanel;
    function renderFin() {
      if (!doc.body.contains(finHost)) { glob.buildFinishPanel = _orig; if (typeof _orig === 'function') { try { _orig(); } catch (e) {} } return; }
      finHost.innerHTML = ''; var D = glob.TEX_OBJECTS && glob.TEX_OBJECTS[pid];
      try { glob.buildProductMatPanel(finHost, pid, (D && D.groups) || []); } catch (e) { finHost.textContent = 'Erreur : ' + (e && e.message || e); }
    }
    glob.buildFinishPanel = renderFin;
    renderFin();
  }

  function makeItemEl(cfg) {
    var d = doc.createElement('div'); d.className = 'save-item';
    d.innerHTML = '<span class="nm" title="' + esc(cfg.name) + '">[obj] ' + esc(cfg.name) + '</span>' +
      '<span class="meta">objet importe - ' + esc(cfg.date || '') + '</span>';
    d.setAttribute('draggable', 'true');
    d.addEventListener('dragstart', function (e) { glob.SCN_DRAG_CFG = cfg; if (e.dataTransfer) { try { e.dataTransfer.setData('text/plain', cfg.id); } catch (_e) {} } });
    d.addEventListener('dragend', function () { setTimeout(function () { glob.SCN_DRAG_CFG = null; }, 60); });
    var row = doc.createElement('div'); row.className = 'row';
    function mk(txt, title, fn) { var b = doc.createElement('button'); b.textContent = txt; if (title) b.title = title; b.onclick = fn; return b; }
    row.appendChild(mk('Editer', 'Parametres a droite (orientation, finitions)', function () { openImportPanel(cfg); }));
    row.appendChild(mk('+ Scene', 'Ajouter a la scene', function () { addToScene(cfg); }));
    row.appendChild(mk('R', 'Renommer', function () { renameImport(cfg); }));
    row.appendChild(mk('X', 'Supprimer', function () { deleteImport(cfg); }));
    d.appendChild(row);
    d.querySelector('.nm').onclick = function () { openImportPanel(cfg); };
    return d;
  }

  function renameImport(cfg) {
    var nn = glob.prompt('Renommer l objet importe :', cfg.name); if (nn === null) return; nn = nn.trim() || cfg.name;
    var list = glob.cfgLoad(); var it = list.filter(function (c) { return c.id === cfg.id; })[0]; if (it) { it.name = nn; glob.cfgStore(list); }
    IMP_NAMES[cfg.prod] = nn;
    idbGetAll().then(function (all) { var rec = all.filter(function (r) { return r.pid === cfg.prod; })[0]; if (rec) { rec.name = nn; idbPut(rec); } });
    if (typeof glob.cfgRender === 'function') glob.cfgRender();
  }
  function deleteImport(cfg) {
    if (!glob.confirm('Supprimer l objet importe ' + cfg.name + ' ? (les instances posees en scene seront aussi retirees)')) return;
    var pid = cfg.prod;
    var list = glob.cfgLoad().filter(function (c) { return c.id !== cfg.id; }); glob.cfgStore(list);
    idbDel(pid); if (glob.TEX_OBJECTS) delete glob.TEX_OBJECTS[pid]; delete IMP_REC[pid]; try { delete IMP_PICK[pid]; } catch (e) {} try { delete IMP_UVOK[pid]; } catch (e) {}
    if (glob.FAB_CACHE) delete glob.FAB_CACHE[pid];
    if (glob.SCENE && glob.SCENE.instances) {
      glob.SCENE.instances = glob.SCENE.instances.filter(function (i) { return !(i && i.prod === pid); });
      glob.SCENE.sel = -1; glob.SCENE.selSet = [];
      try {
        if (typeof glob.build === 'function' && glob.MODE === 'scene') glob.build();
        glob.DIRTY = true;
        if (glob.WGL && glob.WGL.gActive && glob.WGL.render) glob.WGL.render();
        if (typeof glob.buildSceneUI === 'function') glob.buildSceneUI();
        if (typeof glob.refreshView === 'function') glob.refreshView();
      } catch (e) {}
    }
    if (typeof glob.cfgRender === 'function') glob.cfgRender();
  }

  /* ============================ IMPORT IFC (web-ifc WASM, CDN) ============ */
  var IFC_VER = '0.0.57';
  var IFC_CDN = 'https://cdn.jsdelivr.net/npm/web-ifc@' + IFC_VER + '/';
  var _ifcApiP = null;
  function loadWebIFC() {
    if (_ifcApiP) return _ifcApiP;
    _ifcApiP = new Promise(function (res, rej) {
      function start() {
        try {
          var api = new glob.WebIFC.IfcAPI();
          api.SetWasmPath(IFC_CDN, true);
          api.Init().then(function () { res(api); }).catch(rej);
        } catch (e) { rej(e); }
      }
      if (glob.WebIFC && glob.WebIFC.IfcAPI) { start(); return; }
      var sc = doc.createElement('script');
      sc.src = IFC_CDN + 'web-ifc-api-iife.js';
      sc.onload = function () { if (glob.WebIFC && glob.WebIFC.IfcAPI) start(); else rej(new Error('web-ifc charge mais API absente')); };
      sc.onerror = function () { rej(new Error('Chargement de web-ifc impossible (connexion internet requise au 1er import IFC).')); };
      doc.head.appendChild(sc);
    });
    return _ifcApiP;
  }
  function mat4P(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }
  function mat4D(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; }
  function parseIFC(u8) {
    return loadWebIFC().then(function (api) {
      var modelID = api.OpenModel(u8);
      var buckets = {}, order = [];
      function bucket(col, al) {
        var key = col[0] + '_' + col[1] + '_' + col[2] + '_' + (al < 0.99 ? 't' : 'o');
        if (!buckets[key]) { buckets[key] = { col: col, al: al, pos: [], nrm: [], idx: [], nv: 0 }; order.push(key); }
        return buckets[key];
      }
      var meshes = api.LoadAllGeometry(modelID);
      for (var i = 0; i < meshes.size(); i++) {
        var flat = meshes.get(i), geoms = flat.geometries;
        for (var j = 0; j < geoms.size(); j++) {
          var pg = geoms.get(j), c = pg.color;
          var col = [Math.round((c.x || 0) * 255), Math.round((c.y || 0) * 255), Math.round((c.z || 0) * 255)], al = (c.w == null ? 1 : c.w);
          var mt = pg.flatTransformation;
          var g = api.GetGeometry(modelID, pg.geometryExpressID);
          var verts = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
          var inds = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
          var b = bucket(col, al), base = b.nv, vcount = verts.length / 6;
          for (var v = 0; v < vcount; v++) {
            var p = mat4P(mt, verts[v * 6], verts[v * 6 + 1], verts[v * 6 + 2]);
            var n = mat4D(mt, verts[v * 6 + 3], verts[v * 6 + 4], verts[v * 6 + 5]);
            b.pos.push(p[0], p[1], p[2]); b.nrm.push(n[0], n[1], n[2]);
          }
          for (var k = 0; k < inds.length; k++) b.idx.push(inds[k] + base);
          b.nv += vcount;
          if (g && g.delete) g.delete();
        }
      }
      api.CloseModel(modelID);
      var allPos = [], allNrm = [], allIdx = [], groups = [], vbase = 0, gn = 0;
      order.forEach(function (key) {
        var b = buckets[key]; if (!b.idx.length) return;
        var start = allIdx.length;
        for (var k = 0; k < b.idx.length; k++) allIdx.push(b.idx[k] + vbase);
        for (var a = 0; a < b.pos.length; a++) allPos.push(b.pos[a]);
        for (var m = 0; m < b.nrm.length; m++) allNrm.push(b.nrm[m]);
        vbase += b.nv;
        var grp = { start: start, count: allIdx.length - start, col: b.col, tex: null, name: 'IFC ' + (++gn) };
        if (b.al < 0.99) grp.al = b.al;
        groups.push(grp);
      });
      if (!allIdx.length) throw new Error('Aucune geometrie exploitable dans ce fichier IFC.');
      var geo = { pos: Float32Array.from(allPos), nrm: allNrm.length ? Float32Array.from(allNrm) : null, uv: new Float32Array(allPos.length / 3 * 2), idx: Uint32Array.from(allIdx), groups: groups };
      core.normalizeGeometry(geo, { upAxis: 'Y', scale: 1 });
      core.ensureNormals(geo);
      return geo;
    });
  }

  var ACCEPT = '.obj,.stl,.gltf,.glb,.dae,.ifc';
  function openDialog() {
    var inp = doc.createElement('input'); inp.type = 'file'; inp.accept = ACCEPT; inp.style.display = 'none';
    inp.onchange = function () { if (inp.files && inp.files[0]) handleFile(inp.files[0]); };
    doc.body.appendChild(inp); inp.click(); setTimeout(function () { if (inp.parentNode) inp.parentNode.removeChild(inp); }, 500);
  }
  function finishImport(name, geo) {
    if (core.hasNaN(geo)) { glob.alert('Import annule : coordonnees invalides (NaN).'); return; }
    if (!geo.idx.length) { glob.alert('Import annule : aucune face trouvee.'); return; }
    addImport(name, geo).then(function () {
      var app = doc.getElementById('app'); if (app) app.classList.add('save-open');
      glob.alert(name + ' importe (' + (geo.idx.length / 3) + ' triangles). Voir Mes configurations > Objets importes. Glissez-le dans la vue, puis Ajuster (X/Y/Z deg, echelle %) si besoin.');
    }).catch(function (e) { glob.alert('Import echoue : ' + (e && e.message || e)); });
  }
  function handleFile(file) {
    var name = file.name.replace(/\.[^.]+$/, '');
    var m = file.name.match(/\.([^.]+)$/); var ext = m ? m[1].toLowerCase() : '';
    if (['obj', 'stl', 'dae', 'ifc', 'gltf', 'glb'].indexOf(ext) < 0) { glob.alert('Format non reconnu : .' + ext); return; }
    var opts = {};
    if (ext === 'obj' || ext === 'stl') {
      var unit = (glob.prompt('Unite du fichier ? (m / cm / mm)', ext === 'stl' ? 'mm' : 'm') || 'm').trim().toLowerCase();
      var upA = (glob.prompt('Axe vertical du fichier ? (Y = Blender/glTF, Z = ArchiCAD/AutoCAD/Revit)', 'Y') || 'Y').trim().toUpperCase();
      opts = { upAxis: upA.charAt(0) === 'Z' ? 'Z' : 'Y', scale: unit === 'mm' ? 0.001 : unit === 'cm' ? 0.01 : 1 };
    }
    var binary = (ext === 'stl' || ext === 'ifc' || ext === 'gltf' || ext === 'glb');
    var r = new glob.FileReader();
    r.onload = function () {
      try {
        var input = binary ? new Uint8Array(r.result) : r.result;
        if (ext === 'ifc') { parseIFC(input).then(function (geo) { finishImport(name, geo); }).catch(function (e) { glob.alert('Import IFC echoue : ' + (e && e.message || e)); }); return; }
        finishImport(name, core.parseByFormat(ext, input, opts));
      } catch (e) { glob.alert('Lecture echouee : ' + (e && e.message || e)); }
    };
    if (binary) r.readAsArrayBuffer(file); else r.readAsText(file);
  }

  function injectImportButton() {
    if (doc.getElementById('impObjBtn')) return;
    var listEl = doc.getElementById('saveList'); if (!listEl || !listEl.parentNode) return;
    var b = doc.createElement('button'); b.id = 'impObjBtn'; b.textContent = 'Importer un objet';
    b.title = 'Importer un objet exterieur (OBJ, STL, DAE, IFC, glTF/glb)';
    b.style.cssText = 'width:100%;font-size:11px;padding:6px;margin:2px 0 6px;';
    b.onclick = openDialog;
    listEl.parentNode.insertBefore(b, listEl);
  }

  function installHooks() {
    if (typeof glob.scnAddInstance === 'function' && !glob.scnAddInstance._bpoImp) {
      var _ai = glob.scnAddInstance;
      glob.scnAddInstance = function (cfg, x, z, sy) {
        if (cfg && cfg.prod && glob.TEX_OBJECTS && glob.TEX_OBJECTS[cfg.prod]) {
          if (glob.MODE !== 'scene' && typeof glob.enterSceneMode === 'function') glob.enterSceneMode();
          return glob.scnAddFab(cfg.prod, x, z, sy);   /* forwarde la hauteur de surface (drop sous curseur) */
        }
        return _ai.apply(this, arguments);
      };
      glob.scnAddInstance._bpoImp = true;
    }
    if (typeof glob.fabLabel === 'function' && !glob.fabLabel._bpoImp) {
      var _fl = glob.fabLabel;
      glob.fabLabel = function (pid) { if (IMP_NAMES[pid]) return IMP_NAMES[pid]; return _fl.apply(this, arguments); };
      glob.fabLabel._bpoImp = true;
    }
    if (typeof glob.cfgRender === 'function' && !glob.cfgRender._bpoImp) {
      var _cr = glob.cfgRender;
      glob.cfgRender = function () { var r = _cr.apply(this, arguments); try { injectImportButton(); } catch (e) {} return r; };
      glob.cfgRender._bpoImp = true;
    }
    /* un vrai produit fabricant restaure la section Finition native (qu'on masque pour les imports) */
    if (typeof glob.buildProductUI === 'function' && !glob.buildProductUI._bpoImp) {
      var _bpu = glob.buildProductUI;
      glob.buildProductUI = function () { try { var fh = doc.getElementById('finish-hd'), fs = doc.getElementById('finish-sec'); if (fh) fh.style.display = ''; if (fs) fs.style.display = ''; } catch (e) {} return _bpu.apply(this, arguments); };
      glob.buildProductUI._bpoImp = true;
    }
  }

  /* ---- picking : cliquer une part de l'objet importe -> selectionne son materiau ---- */
  var IMP_PICK = {};
  function getPickGeom(pid) {
    if (IMP_PICK[pid]) return Promise.resolve(IMP_PICK[pid]);
    var D = glob.TEX_OBJECTS && glob.TEX_OBJECTS[pid]; if (!D) return Promise.reject(new Error('pas de maillage'));
    return gunzipBytes(D.geo).then(function (raw) { var g = core.dequantize(raw, D.meta); var pk = { pos: g.pos, idx: g.idx, groups: D.groups || [] }; IMP_PICK[pid] = pk; return pk; });
  }
  function rayTri(o, d, a, b, c) {
    var e1x = b[0]-a[0], e1y = b[1]-a[1], e1z = b[2]-a[2], e2x = c[0]-a[0], e2y = c[1]-a[1], e2z = c[2]-a[2];
    var px = d[1]*e2z - d[2]*e2y, py = d[2]*e2x - d[0]*e2z, pz = d[0]*e2y - d[1]*e2x;
    var det = e1x*px + e1y*py + e1z*pz; if (det > -1e-9 && det < 1e-9) return -1;
    var inv = 1/det, tx = o[0]-a[0], ty = o[1]-a[1], tz = o[2]-a[2];
    var u = (tx*px + ty*py + tz*pz) * inv; if (u < 0 || u > 1) return -1;
    var qx = ty*e1z - tz*e1y, qy = tz*e1x - tx*e1z, qz = tx*e1y - ty*e1x;
    var v = (d[0]*qx + d[1]*qy + d[2]*qz) * inv; if (v < 0 || u+v > 1) return -1;
    var t = (e2x*qx + e2y*qy + e2z*qz) * inv; return t > 1e-5 ? t : -1;
  }
  function pickGroupAt(px, py, W, H, pk) {
    var WG = glob.WGL; if (!WG || !WG.camBasis) return -1;
    var b = WG.camBasis(), c = WG.cam;
    var eye = [c.tx - b.fwd[0]*c.r, c.ty - b.fwd[1]*c.r, c.tz - b.fwd[2]*c.r];
    var fL = 2.14, asp = W/H, sx = (px - W/2)*asp/(fL*(W/2)), sy = (H/2 - py)/(fL*(H/2));
    var d = [b.right[0]*sx + b.up[0]*sy + b.fwd[0], b.right[1]*sx + b.up[1]*sy + b.fwd[1], b.right[2]*sx + b.up[2]*sy + b.fwd[2]];
    var pos = pk.pos, idx = pk.idx, best = 1e30, bestTri = -1;
    for (var t = 0; t < idx.length; t += 3) {
      var ia = idx[t], ib = idx[t+1], ic = idx[t+2];
      var hit = rayTri(eye, d, [pos[ia*3], pos[ia*3+1], pos[ia*3+2]], [pos[ib*3], pos[ib*3+1], pos[ib*3+2]], [pos[ic*3], pos[ic*3+1], pos[ic*3+2]]);
      if (hit > 0 && hit < best) { best = hit; bestTri = t; }
    }
    if (bestTri < 0) return -1;
    var groups = pk.groups;
    for (var gi = 0; gi < groups.length; gi++) { var gs = groups[gi].start || 0, gc = groups[gi].count || 0; if (bestTri >= gs && bestTri < gs + gc) return gi; }
    return -1;
  }
  function bindPicking() {
    var gl = doc.getElementById('glcv'); if (!gl || gl._impPick) return; gl._impPick = true;
    var dn = null;
    gl.addEventListener('mousedown', function (e) { if ((e.button || 0) === 0) dn = { x: e.clientX, y: e.clientY }; });
    gl.addEventListener('mouseup', function (e) {
      if (!dn) return; var moved = Math.hypot(e.clientX - dn.x, e.clientY - dn.y); dn = null; if (moved > 4) return;
      var pid = glob.AL_PRODUCT;
      if (glob.MODE !== 'quadripod' || !pid || !IMP_REC[pid]) return;
      var rect = gl.getBoundingClientRect(), W = rect.width, H = rect.height, px = e.clientX - rect.left, py = e.clientY - rect.top;
      getPickGeom(pid).then(function (pk) {
        var gi = pickGroupAt(px, py, W, H, pk); if (gi < 0) return;
        glob.PROD_MAT = gi;
        if (typeof glob.buildFinishPanel === 'function') { try { glob.buildFinishPanel(); } catch (e2) {} }
      }).catch(function () {});
    });
  }

  /* ---- navigation vol dans la scene : clic DROIT glisse = regarder, FLECHES = avancer (axe du regard) ---- */
  var WALK = { on: false, keys: {}, raf: null, btn: null, look: null, eye: null, r0: 1 };
  function walkBtnUpdate() { if (WALK.btn) { WALK.btn.style.background = WALK.on ? 'var(--am,#e08a3c)' : ''; WALK.btn.textContent = WALK.on ? 'Marche ON (Échap)' : 'Se déplacer'; } }
  function walkUpdateCam() {
    var W = glob.WGL, c = W && W.cam; if (!c || !W.camBasis || !WALK.eye) return;
    var b = W.camBasis();
    c.tx = WALK.eye[0] + b.fwd[0] * c.r; c.ty = WALK.eye[1] + b.fwd[1] * c.r; c.tz = WALK.eye[2] + b.fwd[2] * c.r;
    if (W.render) W.render();
  }
  function walkStart() {
    var W = glob.WGL;
    if (glob.MODE !== 'scene' || !W || !W.gActive || !W.camBasis) { glob.alert('Passez d abord en mode Scene.'); return; }
    var b = W.camBasis(), c = W.cam, r = c.r || 1;
    WALK.eye = [(c.tx || 0) - b.fwd[0] * r, (c.ty || 0) - b.fwd[1] * r, (c.tz || 0) - b.fwd[2] * r];
    WALK.r0 = r; c.r = 0.6;
    WALK.on = true; WALK.keys = {};
    walkUpdateCam();
    if (!WALK.raf) walkLoop();
    walkBtnUpdate();
  }
  function walkStop() {
    var W = glob.WGL, c = W && W.cam;
    if (WALK.eye && c && W.camBasis) { c.r = WALK.r0 || c.r; var b = W.camBasis(); c.tx = WALK.eye[0] + b.fwd[0] * c.r; c.ty = WALK.eye[1] + b.fwd[1] * c.r; c.tz = WALK.eye[2] + b.fwd[2] * c.r; if (W.render) W.render(); }
    WALK.on = false; WALK.keys = {}; WALK.look = null; WALK.eye = null;
    if (WALK.raf) { try { glob.cancelAnimationFrame(WALK.raf); } catch (e) {} WALK.raf = null; }
    walkBtnUpdate();
  }
  function walkToggle() { if (WALK.on) walkStop(); else walkStart(); }
  function walkLoop() {
    WALK.raf = glob.requestAnimationFrame(walkLoop);
    if (!WALK.on || glob.MODE !== 'scene' || !glob.WGL || !glob.WGL.camBasis || !WALK.eye) return;
    var k = WALK.keys, sp = 0.09, b = glob.WGL.camBasis(), f = b.fwd, rt = b.right, moved = false;
    if (k['arrowup']) { WALK.eye[0] += f[0] * sp; WALK.eye[1] += f[1] * sp; WALK.eye[2] += f[2] * sp; moved = true; }
    if (k['arrowdown']) { WALK.eye[0] -= f[0] * sp; WALK.eye[1] -= f[1] * sp; WALK.eye[2] -= f[2] * sp; moved = true; }
    if (k['arrowleft']) { WALK.eye[0] -= rt[0] * sp; WALK.eye[2] -= rt[2] * sp; moved = true; }
    if (k['arrowright']) { WALK.eye[0] += rt[0] * sp; WALK.eye[2] += rt[2] * sp; moved = true; }
    if (k[' '] || k['pageup']) { WALK.eye[1] += sp; moved = true; }
    if (k['shift'] || k['pagedown']) { WALK.eye[1] -= sp; moved = true; }
    if (moved) walkUpdateCam();
  }
  var WALK_KEYS = ['arrowup','arrowdown','arrowleft','arrowright',' ','pageup','pagedown','shift'];
  function walkKeyDown(e) { if (!WALK.on) return; var key = (e.key || '').toLowerCase(); if (WALK_KEYS.indexOf(key) >= 0) { WALK.keys[key] = true; e.preventDefault(); } if (key === 'escape') walkStop(); }
  function walkKeyUp(e) { if (!WALK.on) return; WALK.keys[(e.key || '').toLowerCase()] = false; }
  function walkMouseDown(e) { if (!WALK.on) return; if ((e.button || 0) === 2) { WALK.look = { x: e.clientX, y: e.clientY }; e.preventDefault(); } }
  function walkMouseMove(e) {
    if (!WALK.on || !WALK.look) return;
    var c = glob.WGL && glob.WGL.cam; if (!c) return;
    var ddx = e.clientX - WALK.look.x, ddy = e.clientY - WALK.look.y; WALK.look.x = e.clientX; WALK.look.y = e.clientY;
    c.th = (c.th || 0) - ddx * 0.005;
    c.ph = Math.max(0.05, Math.min(3.09, (c.ph || 1) - ddy * 0.005));
    walkUpdateCam();
  }
  function walkMouseUp() { if (WALK.look) WALK.look = null; }
  function bindWalk() {
    if (WALK._bound) return; WALK._bound = true;
    doc.addEventListener('keydown', walkKeyDown, true);
    doc.addEventListener('keyup', walkKeyUp, true);
    doc.addEventListener('mousedown', walkMouseDown, true);
    doc.addEventListener('mousemove', walkMouseMove, true);
    doc.addEventListener('mouseup', walkMouseUp, true);
    doc.addEventListener('contextmenu', function (e) { if (WALK.on) e.preventDefault(); }, true);
    var vp = doc.getElementById('vp'); if (vp && !doc.getElementById('bpoWalkBtn')) {
      var btn = doc.createElement('button'); btn.id = 'bpoWalkBtn'; btn.className = 'vp-btn';
      btn.title = 'Navigation type Lumion : clic DROIT glisse = regarder à 360°, FLÈCHES = se déplacer. Échap pour sortir.';
      btn.style.cssText = 'left:14px;bottom:14px;top:auto;right:auto;width:auto;padding:0 10px;';
      btn.onclick = walkToggle; vp.appendChild(btn); WALK.btn = btn; walkBtnUpdate();
    }
  }

  function boot() {
    installHooks();
    injectImportButton();
    try { bindPicking(); } catch (e) {}
    try { bindWalk(); } catch (e) {}
    idbGetAll().then(function (all) {
      all.forEach(function (rec) {
        if (!rec || !rec.pid) return;
        IMP_NAMES[rec.pid] = rec.name || rec.pid;
        IMP_REC[rec.pid] = { orig: rec.orig || (rec.D ? { geo: rec.D.geo, meta: rec.D.meta } : null), groups: rec.groups || (rec.D && rec.D.groups) || [], xform: rec.xform || { rx: 0, ry: 0, rz: 0, sc: 100 } };
        if (rec.D) registerMesh(rec.pid, rec.D);
      });
      if (all.length) { try { if (typeof glob.build === 'function' && glob.MODE === 'scene') glob.build(); glob.DIRTY = true; if (glob.WGL && glob.WGL.gActive && glob.WGL.render) glob.WGL.render(); } catch (e) {} }
      if (typeof glob.cfgRender === 'function') { try { glob.cfgRender(); } catch (e) {} }
    }).catch(function (e) { console.warn('BPO import: lecture du stock', e); });
  }

  glob.BPO_import = { _core: core, openDialog: openDialog, makeItemEl: makeItemEl, addToScene: addToScene, setTransform: setTransform, bake: bake, _boot: boot, _installHooks: installHooks };

  if (doc && doc.readyState !== 'loading') setTimeout(boot, 0);
  else if (doc) doc.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); });

})(typeof window !== 'undefined' ? window : globalThis);
