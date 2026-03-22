// FLYBY2 — Math Library
// Ported from icalc.c + impulse.h macros (Blue Impulse 3D engine)

import type {
  Vec3, Vec2, Attitude, TrigCache, PosAtt, Axis, Color,
  ScreenPoint, Projection,
} from './types';

import { YSPI, YSEPS } from './types';

// --- Angle Conversions (16-bit: 0x10000 = 360 deg) ---

export function sin16(a: number): number {
  return Math.sin(a * YSPI / 32768.0);
}

export function cos16(a: number): number {
  return Math.cos(a * YSPI / 32768.0);
}

function atan16(s: number): number {
  return Math.atan(s) * 32768.0 / YSPI;
}

// --- Vector Operations ---

export function setPoint(dst: Vec3, x: number, y: number, z: number): void {
  dst.x = x; dst.y = y; dst.z = z;
}

export function addPoint(dst: Vec3, a: Vec3, b: Vec3): void {
  dst.x = a.x + b.x; dst.y = a.y + b.y; dst.z = a.z + b.z;
}

export function subPoint(dst: Vec3, a: Vec3, b: Vec3): void {
  dst.x = a.x - b.x; dst.y = a.y - b.y; dst.z = a.z - b.z;
}

export function mulPoint(dst: Vec3, src: Vec3, m: number): void {
  dst.x = src.x * m; dst.y = src.y * m; dst.z = src.z * m;
}

export function innerPoint(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function outerProduct(ou: Vec3, v1: Vec3, v2: Vec3): void {
  ou.x = v1.y * v2.z - v1.z * v2.y;
  ou.y = v1.z * v2.x - v1.x * v2.z;
  ou.z = v1.x * v2.y - v1.y * v2.x;
}

export function length2(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function lengthPoint3(p: Vec3): number {
  return length2(p.x, length2(p.y, p.z));
}

export function normalize(dst: Vec3, src: Vec3): void {
  const l = lengthPoint3(src);
  if (l >= YSEPS) {
    dst.x = src.x / l; dst.y = src.y / l; dst.z = src.z / l;
  }
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function cloneVec3(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function addV3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subV3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function mulV3(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

// --- Average Normal Vector (icalc.c:285) ---

function findKeenEdge(np: number, p: Vec3[]): { idx: number; found: boolean } {
  let vCos = 1.0;
  let idTop = 0;
  const v: Vec3[] = [vec3(0,0,0), vec3(0,0,0)];
  for (let i = 0; i < np - 2; i++) {
    subPoint(v[0], p[i + 1], p[i]);
    subPoint(v[1], p[i + 2], p[i + 1]);
    normalize(v[0], v[0]);
    normalize(v[1], v[1]);
    const inr = Math.abs(innerPoint(v[0], v[1]));
    if (inr < vCos) { vCos = inr; idTop = i; }
  }
  return { idx: idTop, found: vCos !== 1.0 };
}

export function averageNormalVector(nom: Vec3, np: number, p: Vec3[]): boolean {
  const { idx, found } = findKeenEdge(np, p);
  if (!found) return false;
  const v0 = subV3(p[idx + 1], p[idx]);
  const v1 = subV3(p[idx + 2], p[idx + 1]);
  outerProduct(nom, v0, v1);
  return true;
}

// --- Trigonometry Cache ---

export function makeTrigonomy(att: Attitude): TrigCache {
  return {
    sinh: sin16(att.h), cosh: cos16(att.h),
    sinp: sin16(att.p), cosp: cos16(att.p),
    sinb: sin16(att.b), cosb: cos16(att.b),
  };
}

// --- Rotation (Euler: bank -> pitch -> heading) ---

export function rotLtoG(dst: Vec3, src: Vec3, ang: Attitude): void {
  const t = makeTrigonomy(ang);
  rotFastLtoG(dst, src, t);
}

export function rotFastLtoG(dst: Vec3, src: Vec3, t: TrigCache): void {
  let tmpp_x = t.cosb * src.x - t.sinb * src.y;
  let tmpp_y = t.sinb * src.x + t.cosb * src.y;
  let tmpp_z = t.cosp * src.z - t.sinp * tmpp_y;
  dst.y     = t.sinp * src.z + t.cosp * tmpp_y;
  dst.x     = t.cosh * tmpp_x - t.sinh * tmpp_z;
  dst.z     = t.sinh * tmpp_x + t.cosh * tmpp_z;
}

export function rotGtoL(dst: Vec3, src: Vec3, ang: Attitude): void {
  const t = makeTrigonomy(ang);
  rotFastGtoL(dst, src, t);
}

export function rotFastGtoL(dst: Vec3, src: Vec3, t: TrigCache): void {
  let tmpp_x =  t.cosh * src.x + t.sinh * src.z;
  let tmpp_z = -t.sinh * src.x + t.cosh * src.z;
  dst.z =  t.cosp * tmpp_z + t.sinp * src.y;
  let tmpp_y = -t.sinp * tmpp_z + t.cosp * src.y;
  dst.x =  t.cosb * tmpp_x + t.sinb * tmpp_y;
  dst.y = -t.sinb * tmpp_x + t.cosb * tmpp_y;
}

// --- Coordinate Conversion ---

export function convLtoG(dst: Vec3, src: Vec3, axs: Axis): void {
  rotFastLtoG(dst, src, axs.t);
  addPoint(dst, dst, axs.p);
}

export function convGtoL(dst: Vec3, src: Vec3, axs: Axis): void {
  subPoint(dst, src, axs.p);
  rotFastGtoL(dst, dst, axs.t);
}

export function pntAngToAxis(dst: Axis, src: PosAtt): void {
  dst.p = { ...src.p };
  dst.a = { ...src.a };
  dst.t = makeTrigonomy(src.a);
}

// --- Projection ---

export function project(dst: ScreenPoint, src: Vec3, prj: Projection): void {
  dst.x = prj.cx + (src.x * prj.magx / src.z);
  dst.y = prj.cy - (src.y * prj.magy / src.z);
}

export function getStdProjection(width: number, height: number): Projection {
  return {
    lx: width, ly: height,
    cx: width / 2, cy: height / 2,
    // Match BiGetStdProjection in the original Blue Impulse engine.
    magx: width / 1.41421356,
    magy: width / 1.41421356,
    nearz: 2.5,
    farz: 10000.0,
  };
}

// --- Vector to Angle ---

function biAngle2(x: number, y: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax < YSEPS && ay < YSEPS) return 0;
  if (ax >= ay) {
    const a = atan16(y / ax);
    if (x > 0) return a;
    return (y > 0) ? (0x8000 - a) : (-0x8000 - a);
  } else {
    const a = atan16(x / ay);
    if (y > 0) return (0x4000 - a);
    return (-0x4000 + a);
  }
}

export function vectorToHeadPitch(an: Attitude, eye: Vec3): void {
  if (Math.abs(eye.x) <= YSEPS && Math.abs(eye.z) <= YSEPS) {
    an.h = 0;
    an.p = eye.y >= 0 ? 0x4000 : -0x4000;
    an.b = 0;
  } else {
    an.h = biAngle2(eye.z, -eye.x);
    const hor = Math.sqrt(eye.x * eye.x + eye.z * eye.z);
    an.p = biAngle2(hor, eye.y);
    an.b = 0;
  }
}

// --- 2D Rotation ---

function rot2(dst: Vec2, src: Vec2, ang: number): void {
  const s = sin16(ang);
  const c = cos16(ang);
  dst.x = c * src.x - s * src.y;
  dst.y = s * src.x + c * src.y;
}

// --- Pitch Up ---

export function pitchUp(dst: Attitude, src: Attitude, pit: number, yaw: number): void {
  let tmp: Vec2 = { x: 0, y: cos16(pit) };
  rot2(tmp, tmp, yaw);
  const eye: Vec3 = { x: tmp.x, y: sin16(pit), z: tmp.y };

  tmp = { x: 0, y: -sin16(pit) };
  rot2(tmp, tmp, yaw);
  const up: Vec3 = { x: tmp.x, y: cos16(pit), z: tmp.y };

  rotLtoG(eye, eye, src);
  rotLtoG(up, up, src);
  vectorToAngle(dst, eye, up);
}

export function vectorToAngle(an: Attitude, eye: Vec3, up: Vec3): void {
  vectorToHeadPitch(an, eye);
  const tmp = vec3(0, 0, 0);
  rotGtoL(tmp, up, an);
  const v2: Vec2 = { x: tmp.y, y: -tmp.x };
  an.b = biAngle2(v2.x, v2.y);
}

// --- Near-Plane Clipping ---

export function nearClipPolyg(p: Vec3[], nearz: number): Vec3[] {
  const out: Vec3[] = [];
  const np = p.length;
  if (np < 3) return out;

  for (let i = 0; i < np - 1; i++) {
    if (p[i].z > nearz) {
      out.push({ ...p[i] });
      if (p[i + 1].z <= nearz) {
        const t = (nearz - p[i].z) / (p[i + 1].z - p[i].z);
        out.push(vec3(
          p[i].x + (p[i+1].x - p[i].x) * t,
          p[i].y + (p[i+1].y - p[i].y) * t,
          nearz,
        ));
      }
    } else if (p[i + 1].z > nearz) {
      const t = (nearz - p[i].z) / (p[i + 1].z - p[i].z);
      out.push(vec3(
        p[i].x + (p[i+1].x - p[i].x) * t,
        p[i].y + (p[i+1].y - p[i].y) * t,
        nearz,
      ));
    }
  }

  // Close polygon
  if (p[np - 1].z > nearz) {
    out.push({ ...p[np - 1] });
    if (p[0].z <= nearz) {
      const t = (nearz - p[np-1].z) / (p[0].z - p[np-1].z);
      out.push(vec3(
        p[np-1].x + (p[0].x - p[np-1].x) * t,
        p[np-1].y + (p[0].y - p[np-1].y) * t,
        nearz,
      ));
    }
  } else if (p[0].z > nearz) {
    const t = (nearz - p[np-1].z) / (p[0].z - p[np-1].z);
    out.push(vec3(
      p[np-1].x + (p[0].x - p[np-1].x) * t,
      p[np-1].y + (p[0].y - p[np-1].y) * t,
      nearz,
    ));
  }

  return out;
}

// --- Twist Check (for winding consistency) ---

export const BITWIST_UNKNOWN = 0;
export const BITWIST_RIGHT = 1;
export const BITWIST_LEFT = 2;

export function twist3(np: number, p: Vec3[], nom: Vec3): number {
  // Simplified: check if polygon winding is consistent with normal
  if (np < 3) return BITWIST_UNKNOWN;
  const v1 = subV3(p[1], p[0]);
  const v2 = subV3(p[2], p[1]);
  const cross = vec3(0, 0, 0);
  outerProduct(cross, v1, v2);
  const dot = innerPoint(cross, nom);
  if (dot > YSEPS) return BITWIST_RIGHT;
  if (dot < -YSEPS) return BITWIST_LEFT;
  return BITWIST_UNKNOWN;
}

// --- Color Utilities ---

export function colorFromSRF15(col15: number): Color {
  return {
    g: ((col15 >> 10) & 31) / 31.0,
    r: ((col15 >> 5) & 31) / 31.0,
    b: (col15 & 31) / 31.0,
  };
}

export function colorFromRGB(r: number, g: number, b: number): Color {
  return { r: r / 255.0, g: g / 255.0, b: b / 255.0 };
}
