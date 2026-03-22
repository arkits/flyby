// FLYBY2 — Smoke Trail System
// Ported from ASMOKE.C

import type {
  SmokeClass, SmokeInst, SmokeNode, SmokeAttr,
  PosAtt, Vec3, Color, Axis,
} from './types';
import {
  ARS_RIBBONSMOKE, ARS_TRAILSMOKE, ARS_WIRESMOKE,
  ARS_MAX_TIP_PER_INST, ARS_SOLIDSMOKE, BiVecX, BiVecY, BiOrgP,
} from './types';
import {
  vec3, addV3, subV3, mulV3, pntAngToAxis, rotFastLtoG,
} from './math';

const RIBBON_MAX_ALPHA = 0.32;
const RIBBON_MIN_ALPHA = 0.06;
const SOLID_MAX_ALPHA = 0.24;
const SOLID_MIN_ALPHA = 0.08;

export function initSmokeClass(sw: number): SmokeClass {
  const defAttr: SmokeAttr = {
    t0: 0, t1: 1, iniw: 1, maxw: 1, dw: 0,
    inic: { r: 1, g: 1, b: 1 }, endc: { r: 1, g: 1, b: 1 }, tc: 0,
  };
  return {
    stp: [1, 2, 4],
    bbx: [
      vec3(200, 200, 200),
      vec3(500, 500, 500),
      vec3(500, 500, 500),
    ],
    sw,
    rbn: { ...defAttr },
    wir: { ...defAttr },
    trl: { ...defAttr },
    sld: { ...defAttr },
  };
}

export function initSmokeInstance(nMax: number, nDel: number): SmokeInst {
  return {
    nMax,
    nDel,
    nPth: 0,
    nTip: 0,
    tip: new Int32Array(ARS_MAX_TIP_PER_INST * 2),
    pth: [],
  };
}

export function clearSmokeInstance(inst: SmokeInst): void {
  inst.nPth = 0;
  inst.nTip = 0;
  inst.pth.length = 0;
}

export function beginAppendSmokeNode(inst: SmokeInst): void {
  if (inst.nTip >= ARS_MAX_TIP_PER_INST) {
    // Shift tips
    for (let i = 0; i < ARS_MAX_TIP_PER_INST - 1; i++) {
      inst.tip[i * 2] = inst.tip[i * 2 + 2];
      inst.tip[i * 2 + 1] = inst.tip[i * 2 + 3];
    }
    inst.nTip = ARS_MAX_TIP_PER_INST - 1;
  }
  inst.tip[inst.nTip * 2] = inst.nPth;
  inst.tip[inst.nTip * 2 + 1] = inst.nPth;
  inst.nTip++;
}

export function appendSmokeNode(inst: SmokeInst, pos: PosAtt, t: number): void {
  if (inst.nTip <= 0) return;

  // Overflow handling
  if (inst.nPth >= inst.nMax) {
    if (inst.nDel > 0) {
      const newLen = inst.nMax - inst.nDel;
      for (let i = 0; i < newLen; i++) {
        inst.pth[i] = inst.pth[i + inst.nDel];
      }
      for (let i = 0; i < ARS_MAX_TIP_PER_INST * 2; i++) {
        inst.tip[i] = Math.max(0, inst.tip[i] - inst.nDel);
      }
      inst.pth.length = newLen;
      inst.nPth = newLen;
    } else {
      return; // overflow, silently drop
    }
  }

  const node: SmokeNode = { axs: {} as Axis, left: vec3(0,0,0), up: vec3(0,0,0), t };
  pntAngToAxis(node.axs, pos);
  rotFastLtoG(node.left, BiVecX, node.axs.t);
  rotFastLtoG(node.up, BiVecY, node.axs.t);
  inst.pth.push(node);

  inst.tip[inst.nTip * 2 - 1] = inst.nPth;
  inst.nPth++;
}

export function endAppendSmokeNode(inst: SmokeInst): void {
  if (inst.nTip > 0) {
    inst.tip[inst.nTip * 2 - 1] = inst.nPth - 1;
  }
}

// --- Geometry Generation ---

function getSmokeStep(ndp: Vec3, eyePos: Vec3, cla: SmokeClass): number {
  const dx = Math.abs(eyePos.x - ndp.x);
  const dy = Math.abs(eyePos.y - ndp.y);
  const dz = Math.abs(eyePos.z - ndp.z);
  for (let i = 0; i < 3; i++) {
    if (dx < cla.bbx[i].x && dy < cla.bbx[i].y && dz < cla.bbx[i].z) {
      return cla.stp[i];
    }
  }
  return cla.stp[2];
}

function getCurrentSmokeColor(att: SmokeAttr, rt: number): Color {
  if (rt < att.tc) {
    const ratio = rt / att.tc;
    return {
      r: att.inic.r + (att.endc.r - att.inic.r) * ratio,
      g: att.inic.g + (att.endc.g - att.inic.g) * ratio,
      b: att.inic.b + (att.endc.b - att.inic.b) * ratio,
    };
  }
  return att.endc;
}

function smokeAlpha(att: SmokeAttr, rt0: number, rt1: number, maxAlpha: number, minAlpha: number): number {
  const lifeSpan = Math.max(att.t1 - att.t0, 0.001);
  const age = Math.max(rt0, rt1);
  const fade = 1 - Math.min(Math.max((age - att.t0) / lifeSpan, 0), 1);
  return minAlpha + (maxAlpha - minAlpha) * fade;
}

function pushTri(verts: number[], p0: Vec3, p1: Vec3, p2: Vec3, c: Color, alpha: number): void {
  // position(3) + shadeNormal(3) + cullNormal(3) + color(3) + bright(1) = 13 floats per vertex
  const nx = (p1.y - p0.y) * (p2.z - p0.z) - (p1.z - p0.z) * (p2.y - p0.y);
  const ny = (p1.z - p0.z) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.z - p0.z);
  const nz = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
  const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  const nnx = nx / nl, nny = ny / nl, nnz = nz / nl;
  for (const p of [p0, p1, p2]) {
    verts.push(p.x, p.y, p.z, nnx, nny, nnz, nnx, nny, nnz, c.r, c.g, c.b, alpha);
  }
}

function pushLine(verts: number[], p0: Vec3, p1: Vec3, c: Color): void {
  verts.push(p0.x, p0.y, p0.z, c.r, c.g, c.b);
  verts.push(p1.x, p1.y, p1.z, c.r, c.g, c.b);
}

function insRibbonSmoke(
  att: SmokeAttr, node: SmokeNode[], n0: number, n1: number, t: number,
  verts: number[],
): void {
  const rt0 = t - node[n0].t;
  const rt1 = t - node[n1].t;
  if (rt0 < att.t0 || rt1 > att.t1) return;

  const c = getCurrentSmokeColor(att, rt0);
  const w0 = Math.min(att.iniw + att.dw * rt0, att.maxw);
  const w1 = Math.min(att.iniw + att.dw * rt1, att.maxw);

  const v1 = mulV3(node[n0].left, w0 / 2);
  const v2 = mulV3(node[n1].left, w1 / 2);

  const sq0 = addV3(node[n0].axs.p, v1);
  const sq1 = subV3(node[n0].axs.p, v1);
  const sq2 = addV3(node[n1].axs.p, v2);
  const sq3 = subV3(node[n1].axs.p, v2);
  const alpha = smokeAlpha(att, rt0, rt1, RIBBON_MAX_ALPHA, RIBBON_MIN_ALPHA);

  pushTri(verts, sq0, sq1, sq2, c, alpha);
  pushTri(verts, sq2, sq1, sq3, c, alpha);
}

function insTrailSmoke(
  att: SmokeAttr, node: SmokeNode[], n0: number, n1: number, t: number,
  lineVerts: number[],
): void {
  const rt0 = t - node[n0].t;
  const rt1 = t - node[n1].t;
  if (rt0 < att.t0 || rt1 > att.t1) return;

  const c = getCurrentSmokeColor(att, rt0);
  const w0 = Math.min(att.iniw + att.dw * rt0, att.maxw);
  const w1 = Math.min(att.iniw + att.dw * rt1, att.maxw);

  const v1 = mulV3(node[n0].left, w0 / 2);
  const v2 = mulV3(node[n1].left, w1 / 2);

  const sq0 = addV3(node[n0].axs.p, v1);
  const sq1 = subV3(node[n0].axs.p, v1);
  const sq2 = addV3(node[n1].axs.p, v2);
  const sq3 = subV3(node[n1].axs.p, v2);

  pushLine(lineVerts, sq0, sq2, c);
  pushLine(lineVerts, sq1, sq3, c);
}

function insWireSmoke(
  att: SmokeAttr, node: SmokeNode[], n0: number, n1: number, t: number,
  lineVerts: number[],
): void {
  const rt0 = t - node[n0].t;
  const rt1 = t - node[n1].t;
  if (rt0 < att.t0 || rt1 > att.t1) return;

  const c = getCurrentSmokeColor(att, rt0);
  const p0 = node[n0].axs.p;
  const p1 = node[n1].axs.p;
  pushLine(lineVerts, p0, p1, c);
}

function insSolidSmoke(
  att: SmokeAttr, node: SmokeNode[], n0: number, n1: number, t: number,
  verts: number[],
): void {
  const rt0 = t - node[n0].t;
  const rt1 = t - node[n1].t;
  if (rt0 < att.t0 || rt1 > att.t1) return;

  const c = getCurrentSmokeColor(att, rt0);
  const w0 = Math.min(att.iniw + att.dw * rt0, att.maxw);
  const w1 = Math.min(att.iniw + att.dw * rt1, att.maxw);
  const alpha = smokeAlpha(att, rt0, rt1, SOLID_MAX_ALPHA, SOLID_MIN_ALPHA);

  const lv1 = mulV3(node[n0].left, w0 / 2);
  const lv2 = mulV3(node[n1].left, w1 / 2);
  const uv1 = mulV3(node[n0].up, w0 / 2);
  const uv2 = mulV3(node[n1].up, w1 / 2);

  // 8 vertices for the cross-section box
  const vtx: Vec3[] = [
    addV3(node[n0].axs.p, lv1),
    subV3(node[n0].axs.p, lv1),
    addV3(node[n1].axs.p, lv2),
    subV3(node[n1].axs.p, lv2),
    addV3(node[n0].axs.p, uv1),
    subV3(node[n0].axs.p, uv1),
    addV3(node[n1].axs.p, uv2),
    subV3(node[n1].axs.p, uv2),
  ];

  // 8 normals (one per vertex for smooth shading)
  const nom: Vec3[] = [
    node[n0].left,
    subV3(BiOrgP, node[n0].left),
    node[n1].left,
    subV3(BiOrgP, node[n1].left),
    node[n0].up,
    subV3(BiOrgP, node[n0].up),
    node[n1].up,
    subV3(BiOrgP, node[n1].up),
  ];

  // 4 faces of the box (each face = 2 triangles)
  // Face 1: vertices 0,2,6,4
  pushLitVert(verts, vtx[0], nom[0], c, alpha);
  pushLitVert(verts, vtx[2], nom[2], c, alpha);
  pushLitVert(verts, vtx[6], nom[6], c, alpha);

  pushLitVert(verts, vtx[0], nom[0], c, alpha);
  pushLitVert(verts, vtx[6], nom[6], c, alpha);
  pushLitVert(verts, vtx[4], nom[4], c, alpha);

  // Face 2: vertices 4,6,7,5
  pushLitVert(verts, vtx[4], nom[4], c, alpha);
  pushLitVert(verts, vtx[6], nom[6], c, alpha);
  pushLitVert(verts, vtx[7], nom[7], c, alpha);

  pushLitVert(verts, vtx[4], nom[4], c, alpha);
  pushLitVert(verts, vtx[7], nom[7], c, alpha);
  pushLitVert(verts, vtx[5], nom[5], c, alpha);

  // Face 3: vertices 5,7,3,1
  pushLitVert(verts, vtx[5], nom[5], c, alpha);
  pushLitVert(verts, vtx[7], nom[7], c, alpha);
  pushLitVert(verts, vtx[3], nom[3], c, alpha);

  pushLitVert(verts, vtx[5], nom[5], c, alpha);
  pushLitVert(verts, vtx[3], nom[3], c, alpha);
  pushLitVert(verts, vtx[1], nom[1], c, alpha);

  // Face 4: vertices 1,3,2,0
  pushLitVert(verts, vtx[1], nom[1], c, alpha);
  pushLitVert(verts, vtx[3], nom[3], c, alpha);
  pushLitVert(verts, vtx[2], nom[2], c, alpha);

  pushLitVert(verts, vtx[1], nom[1], c, alpha);
  pushLitVert(verts, vtx[2], nom[2], c, alpha);
  pushLitVert(verts, vtx[0], nom[0], c, alpha);
}

function pushLitVert(
  verts: number[], p: Vec3, n: Vec3, c: Color, alpha: number,
): void {
  verts.push(p.x, p.y, p.z, n.x, n.y, n.z, n.x, n.y, n.z, c.r, c.g, c.b, alpha);
}

function insSmokeTips(
  cla: SmokeClass, inst: SmokeInst, nEnd: number, nSta: number,
  ctim: number, eyePos: Vec3, litVerts: number[], lineVerts: number[],
): void {
  if (cla.sw & ARS_SOLIDSMOKE) {
    let n = nSta;
    while (n >= 0 && cla.sld.t0 > ctim - inst.pth[n].t) n--;
    while (n > nEnd) {
      const stp = getSmokeStep(inst.pth[n].axs.p, eyePos, cla);
      const m = Math.max(nEnd, n - stp);
      insSolidSmoke(cla.sld, inst.pth, n, m, ctim, litVerts);
      n -= stp;
    }
  }

  if (cla.sw & ARS_RIBBONSMOKE) {
    let n = nSta;
    while (n >= 0 && cla.rbn.t0 > ctim - inst.pth[n].t) n--;
    while (n > nEnd) {
      const stp = getSmokeStep(inst.pth[n].axs.p, eyePos, cla);
      const m = Math.max(nEnd, n - stp);
      insRibbonSmoke(cla.rbn, inst.pth, n, m, ctim, litVerts);
      n -= stp;
    }
  }

  if (cla.sw & ARS_TRAILSMOKE) {
    let n = nSta;
    while (n >= 0 && cla.trl.t0 > ctim - inst.pth[n].t) n--;
    while (n > nEnd) {
      const stp = getSmokeStep(inst.pth[n].axs.p, eyePos, cla);
      const m = Math.max(nEnd, n - stp);
      insTrailSmoke(cla.trl, inst.pth, n, m, ctim, lineVerts);
      n -= stp;
    }
  }

  if (cla.sw & ARS_WIRESMOKE) {
    let n = nSta;
    while (n >= 0 && cla.wir.t0 > ctim - inst.pth[n].t) n--;
    while (n > nEnd) {
      const stp = getSmokeStep(inst.pth[n].axs.p, eyePos, cla);
      const m = Math.max(nEnd, n - stp);
      insWireSmoke(cla.wir, inst.pth, n, m, ctim, lineVerts);
      n -= stp;
    }
  }
}

export function drawSmoke(
  cla: SmokeClass, inst: SmokeInst, ctim: number, eye: PosAtt,
): { lit: Float32Array; lines: Float32Array } {
  const litVerts: number[] = [];
  const lineVerts: number[] = [];
  const eyePos = eye.p;
  for (let i = 0; i < inst.nTip; i++) {
    const nSta = inst.tip[i * 2 + 1];
    const nEnd = inst.tip[i * 2];
    if (nSta > nEnd && inst.pth.length > 0) {
      insSmokeTips(cla, inst, nEnd, nSta, ctim, eyePos, litVerts, lineVerts);
    }
  }
  return {
    lit: new Float32Array(litVerts),
    lines: new Float32Array(lineVerts),
  };
}
