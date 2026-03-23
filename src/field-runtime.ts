// FLYBY2 — Field Runtime Helpers
// Ported from ifield.c / iterrain.c / imodel.c query helpers

import type { Attitude, Axis, Color, Field, PosAtt, Terrain, Vec2, Vec3 } from "./types";
import {
  convGtoL,
  convLtoG,
  cos16,
  makeTrigonomy,
  rotFastLtoG,
  sin16,
  vec3,
  vectorToAngle,
} from "./math";

export type FieldObjectType = "pc2" | "srf" | "plt" | "ter" | "rgn" | "fld";

export interface FieldObjectIdentity {
  id: number;
  tag: string;
}

export interface FieldRegionResult extends FieldObjectIdentity {
  inside: boolean;
}

export interface FieldElevationResult extends FieldObjectIdentity {
  inside: boolean;
  elevation: number;
  eyeVec: Vec3;
  upVec: Vec3;
}

export interface FieldCollisionResult extends FieldObjectIdentity {
  inside: boolean;
}

function angleToVectors(att: Attitude): { eye: Vec3; up: Vec3 } {
  const eye = vec3(0, 0, 1);
  const up = vec3(0, 1, 0);
  const t = makeTrigonomy(att);
  rotFastLtoG(eye, eye, t);
  rotFastLtoG(up, up, t);
  return { eye, up };
}

function axisFromPosAtt(src: PosAtt): Axis {
  return { p: { ...src.p }, a: { ...src.a }, t: makeTrigonomy(src.a) };
}

function composePosAtt(local: PosAtt, parent: PosAtt): PosAtt {
  const parentAxs = axisFromPosAtt(parent);
  const { eye, up } = angleToVectors(local.a);
  const worldEye = vec3(0, 0, 0);
  const worldUp = vec3(0, 0, 0);
  rotFastLtoG(worldEye, eye, parentAxs.t);
  rotFastLtoG(worldUp, up, parentAxs.t);

  const out: PosAtt = {
    p: vec3(0, 0, 0),
    a: { h: 0, p: 0, b: 0 },
  };
  convLtoG(out.p, local.p, parentAxs);
  vectorToAngle(out.a, worldEye, worldUp);
  return out;
}

function getFieldObjectList(field: Field, type: FieldObjectType) {
  switch (type) {
    case "pc2":
      return field.pc2;
    case "srf":
      return field.srf;
    case "plt":
      return field.plt;
    case "ter":
      return field.ter;
    case "rgn":
      return field.rgn;
    case "fld":
      return field.fld;
  }
}

export function getFieldNumObj(field: Field, type: FieldObjectType): number {
  return getFieldObjectList(field, type).length;
}

export function getFieldObjPosition(
  field: Field,
  layout: PosAtt,
  type: FieldObjectType,
  id: number
): PosAtt | null {
  const list = getFieldObjectList(field, type);
  if (id < 0 || id >= list.length) return null;
  return composePosAtt(list[id].pos, layout);
}

export function getFieldObjId(
  field: Field,
  type: FieldObjectType,
  id: number
): FieldObjectIdentity | null {
  const list = getFieldObjectList(field, type);
  if (id < 0 || id >= list.length) return null;
  const obj = list[id];
  if ("id" in obj && "tag" in obj) {
    return { id: obj.id, tag: obj.tag };
  }
  return null;
}

export function getFieldGroundSky(field: Field): { ground: Color; sky: Color } {
  return {
    ground: field.gnd,
    sky: field.sky,
  };
}

function getTerrainBlockIndex(ter: Terrain, x: number, z: number): number {
  return z * (ter.xSiz + 1) + x;
}

function getTerrainPoint(ter: Terrain, x: number, z: number): Vec3 {
  const blk = ter.blocks[getTerrainBlockIndex(ter, x, z)];
  return vec3(ter.xWid * x, blk.y, ter.zWid * z);
}

function getTerrainTriangle(ter: Terrain, locx: number, locz: number): [Vec3, Vec3, Vec3] | null {
  const bx = Math.floor(locx / ter.xWid);
  const bz = Math.floor(locz / ter.zWid);
  if (bx < 0 || bz < 0 || bx >= ter.xSiz || bz >= ter.zSiz) return null;

  const ibx = locx - bx * ter.xWid;
  const ibz = locz - bz * ter.zWid;
  const blk = ter.blocks[getTerrainBlockIndex(ter, bx, bz)];
  const ed0 = getTerrainPoint(ter, bx, bz);
  const ed1 = getTerrainPoint(ter, bx + 1, bz);
  const ed2 = getTerrainPoint(ter, bx, bz + 1);
  const ed3 = getTerrainPoint(ter, bx + 1, bz + 1);

  if (blk.lup === 1) {
    return ibz / ter.zWid > 1.0 - ibx / ter.xWid ? [ed1, ed3, ed2] : [ed0, ed1, ed2];
  }

  return ibz / ter.zWid > ibx / ter.xWid ? [ed0, ed3, ed2] : [ed0, ed1, ed3];
}

function triangleHeightOnXZ(tri: [Vec3, Vec3, Vec3], x: number, z: number): number {
  const [a, b, c] = tri;
  const ab = vec3(b.x - a.x, b.y - a.y, b.z - a.z);
  const ac = vec3(c.x - a.x, c.y - a.y, c.z - a.z);
  const nx = ab.y * ac.z - ab.z * ac.y;
  const ny = ab.z * ac.x - ab.x * ac.z;
  const nz = ab.x * ac.y - ab.y * ac.x;
  if (Math.abs(ny) < 1e-6) return a.y;
  return a.y - (nx * (x - a.x) + nz * (z - a.z)) / ny;
}

function terrainHeightAtPoint(
  ter: Terrain,
  pos: PosAtt,
  worldPoint: Vec3
): { inside: boolean; tri: [Vec3, Vec3, Vec3] | null; elevation: number } {
  const local = vec3(0, 0, 0);
  convGtoL(local, worldPoint, axisFromPosAtt(pos));
  const tri = getTerrainTriangle(ter, local.x, local.z);
  if (!tri) {
    return { inside: false, tri: null, elevation: 0 };
  }
  return {
    inside: true,
    tri,
    elevation: triangleHeightOnXZ(tri, local.x, local.z),
  };
}

function headingUnit2D(hdg: number): Vec2 {
  return { x: -sin16(hdg), y: cos16(hdg) };
}

function terrainEyeUpVectors(
  ter: Terrain,
  pos: PosAtt,
  worldPoint: Vec3,
  hdg: number
): { inside: boolean; eyeVec: Vec3; upVec: Vec3; elevation: number } {
  const hit = terrainHeightAtPoint(ter, pos, worldPoint);
  if (!hit.inside || !hit.tri) {
    return {
      inside: false,
      eyeVec: vec3(-sin16(hdg), 0, cos16(hdg)),
      upVec: vec3(0, 1, 0),
      elevation: 0,
    };
  }

  const [a, b, c] = hit.tri;
  const v1 = vec3(b.x - a.x, b.y - a.y, b.z - a.z);
  const v2 = vec3(c.x - a.x, c.y - a.y, c.z - a.z);
  const vx = Math.abs(v1.x) > 1e-6 ? v1 : v2;
  const vz = vx === v1 ? v2 : v1;
  const dir = headingUnit2D(hdg - pos.a.h);

  const eyeLocal = vec3(
    dir.x + (vz.x / (Math.abs(vz.z) > 1e-6 ? vz.z : 1)) * dir.y,
    (vx.y / (Math.abs(vx.x) > 1e-6 ? vx.x : 1)) * dir.x +
      (vz.y / (Math.abs(vz.z) > 1e-6 ? vz.z : 1)) * dir.y,
    (vx.z / (Math.abs(vx.x) > 1e-6 ? vx.x : 1)) * dir.x + dir.y
  );
  const eyeVec = vec3(0, 0, 0);
  rotFastLtoG(eyeVec, eyeLocal, makeTrigonomy(pos.a));

  const e1 = vec3(b.x - a.x, b.y - a.y, b.z - a.z);
  const e2 = vec3(c.x - b.x, c.y - b.y, c.z - b.z);
  const upLocal = vec3(
    e2.y * e1.z - e2.z * e1.y,
    e2.z * e1.x - e2.x * e1.z,
    e2.x * e1.y - e2.y * e1.x
  );
  const upVec = vec3(0, 0, 0);
  rotFastLtoG(upVec, upLocal, makeTrigonomy(pos.a));

  return {
    inside: true,
    eyeVec,
    upVec,
    elevation: hit.elevation,
  };
}

export function getFieldRegion(field: Field, pos: PosAtt, point: Vec3): FieldRegionResult {
  for (const region of field.rgn) {
    const regionPos = composePosAtt(region.pos, pos);
    const local = vec3(0, 0, 0);
    convGtoL(local, point, axisFromPosAtt(regionPos));
    if (
      region.min.x <= local.x &&
      local.x <= region.max.x &&
      region.min.y <= local.z &&
      local.z <= region.max.y
    ) {
      return { inside: true, id: region.id, tag: region.tag };
    }
  }

  for (const child of field.fld) {
    const childPos = composePosAtt(child.pos, pos);
    const result = getFieldRegion(child.fld, childPos, point);
    if (result.inside) return result;
  }

  return { inside: false, id: 0, tag: "" };
}

export function getFieldElevation(
  field: Field,
  pos: PosAtt,
  point: Vec3,
  hdg: number
): FieldElevationResult {
  for (const ter of field.ter) {
    const terPos = composePosAtt(ter.pos, pos);
    const result = terrainEyeUpVectors(ter.ter, terPos, point, hdg);
    if (result.inside) {
      return {
        inside: true,
        id: ter.id,
        tag: ter.tag,
        elevation: result.elevation,
        eyeVec: result.eyeVec,
        upVec: result.upVec,
      };
    }
  }

  for (const child of field.fld) {
    const childPos = composePosAtt(child.pos, pos);
    const result = getFieldElevation(child.fld, childPos, point, hdg);
    if (result.inside) return result;
  }

  return {
    inside: false,
    id: 0,
    tag: "",
    elevation: 0,
    eyeVec: vec3(-sin16(hdg), 0, cos16(hdg)),
    upVec: vec3(0, 1, 0),
  };
}

export function getFieldSrfCollision(
  field: Field,
  pos: PosAtt,
  point: Vec3,
  bump: number
): FieldCollisionResult {
  for (const srf of field.srf) {
    const srfPos = composePosAtt(srf.pos, pos);
    const local = vec3(0, 0, 0);
    convGtoL(local, point, axisFromPosAtt(srfPos));

    const min = { ...srf.srf.bbox[0] };
    const max = { ...srf.srf.bbox[7] };
    min.x -= bump;
    min.y -= bump;
    min.z -= bump;
    max.x += bump;
    max.y += bump;
    max.z += bump;

    if (
      min.x <= local.x &&
      local.x <= max.x &&
      min.y <= local.y &&
      local.y <= max.y &&
      min.z <= local.z &&
      local.z <= max.z
    ) {
      return { inside: true, id: srf.id, tag: srf.tag };
    }
  }

  for (const child of field.fld) {
    const childPos = composePosAtt(child.pos, pos);
    const result = getFieldSrfCollision(child.fld, childPos, point, bump);
    if (result.inside) return result;
  }

  return { inside: false, id: 0, tag: "" };
}
