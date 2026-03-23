import { describe, it, expect } from "vitest";
import type { Vec3, Attitude, Axis, PosAtt, ScreenPoint, Projection } from "./types";
import {
  sin16,
  cos16,
  setPoint,
  addPoint,
  subPoint,
  mulPoint,
  innerPoint,
  outerProduct,
  length2,
  lengthPoint3,
  normalize,
  vec3,
  cloneVec3,
  addV3,
  subV3,
  mulV3,
  averageNormalVector,
  makeTrigonomy,
  rotLtoG,
  rotFastLtoG,
  rotGtoL,
  rotFastGtoL,
  convLtoG,
  convGtoL,
  pntAngToAxis,
  project,
  getStdProjection,
  vectorToHeadPitch,
  pitchUp,
  vectorToAngle,
  nearClipPolyg,
  twist3,
  BITWIST_UNKNOWN,
  BITWIST_RIGHT,
  BITWIST_LEFT,
  colorFromSRF15,
  colorFromRGB,
} from "./math";

describe("Angle conversions (16-bit)", () => {
  it("sin16 computes correct sine values", () => {
    expect(sin16(0)).toBeCloseTo(0);
    expect(sin16(8192)).toBeCloseTo(Math.SQRT2 / 2); // 45 degrees
    expect(sin16(16384)).toBeCloseTo(1); // 90 degrees
    expect(sin16(24576)).toBeCloseTo(Math.SQRT2 / 2); // 135 degrees
  });

  it("cos16 computes correct cosine values", () => {
    expect(cos16(0)).toBeCloseTo(1);
    expect(cos16(8192)).toBeCloseTo(Math.SQRT2 / 2); // 45 degrees
    expect(cos16(16384)).toBeCloseTo(0); // 90 degrees
    expect(cos16(24576)).toBeCloseTo(-Math.SQRT2 / 2); // 135 degrees
  });

  it("sin16 and cos16 are orthogonal", () => {
    const angle = 8192; // 45 degrees
    const s = sin16(angle);
    const c = cos16(angle);
    expect(s * s + c * c).toBeCloseTo(1, 10);
  });
});

describe("Vector operations", () => {
  it("setPoint sets destination coordinates", () => {
    const dst: Vec3 = { x: 0, y: 0, z: 0 };
    setPoint(dst, 1, 2, 3);
    expect(dst.x).toBe(1);
    expect(dst.y).toBe(2);
    expect(dst.z).toBe(3);
  });

  it("addPoint adds two vectors", () => {
    const dst: Vec3 = { x: 0, y: 0, z: 0 };
    const a: Vec3 = { x: 1, y: 2, z: 3 };
    const b: Vec3 = { x: 4, y: 5, z: 6 };
    addPoint(dst, a, b);
    expect(dst.x).toBe(5);
    expect(dst.y).toBe(7);
    expect(dst.z).toBe(9);
  });

  it("subPoint subtracts two vectors", () => {
    const dst: Vec3 = { x: 0, y: 0, z: 0 };
    const a: Vec3 = { x: 4, y: 5, z: 6 };
    const b: Vec3 = { x: 1, y: 2, z: 3 };
    subPoint(dst, a, b);
    expect(dst.x).toBe(3);
    expect(dst.y).toBe(3);
    expect(dst.z).toBe(3);
  });

  it("mulPoint multiplies vector by scalar", () => {
    const dst: Vec3 = { x: 0, y: 0, z: 0 };
    const src: Vec3 = { x: 1, y: 2, z: 3 };
    mulPoint(dst, src, 2.5);
    expect(dst.x).toBe(2.5);
    expect(dst.y).toBe(5);
    expect(dst.z).toBe(7.5);
  });

  it("innerPoint computes dot product", () => {
    const a: Vec3 = { x: 1, y: 2, z: 3 };
    const b: Vec3 = { x: 4, y: 5, z: 6 };
    expect(innerPoint(a, b)).toBe(1 * 4 + 2 * 5 + 3 * 6); // 32
  });

  it("outerProduct computes cross product", () => {
    const ou: Vec3 = { x: 0, y: 0, z: 0 };
    const v1: Vec3 = { x: 1, y: 0, z: 0 };
    const v2: Vec3 = { x: 0, y: 1, z: 0 };
    outerProduct(ou, v1, v2);
    expect(ou.x).toBeCloseTo(0);
    expect(ou.y).toBeCloseTo(0);
    expect(ou.z).toBeCloseTo(1);
  });

  it("length2 computes 2D length", () => {
    expect(length2(3, 4)).toBeCloseTo(5);
    expect(length2(0, 0)).toBe(0);
  });

  it("lengthPoint3 computes 3D length", () => {
    const p: Vec3 = { x: 1, y: 2, z: 2 };
    expect(lengthPoint3(p)).toBeCloseTo(3);
  });

  it("normalize normalizes vector", () => {
    const dst: Vec3 = { x: 0, y: 0, z: 0 };
    const src: Vec3 = { x: 3, y: 0, z: 0 };
    normalize(dst, src);
    expect(dst.x).toBeCloseTo(1);
    expect(dst.y).toBeCloseTo(0);
    expect(dst.z).toBeCloseTo(0);
  });

  it("normalize handles zero-length vector", () => {
    const dst: Vec3 = { x: 1, y: 1, z: 1 };
    const src: Vec3 = { x: 0, y: 0, z: 0 };
    normalize(dst, src);
    // Should remain unchanged for zero-length input
    expect(dst.x).toBe(1);
    expect(dst.y).toBe(1);
    expect(dst.z).toBe(1);
  });

  it("vec3 creates vector", () => {
    const v = vec3(1, 2, 3);
    expect(v.x).toBe(1);
    expect(v.y).toBe(2);
    expect(v.z).toBe(3);
  });

  it("cloneVec3 clones vector", () => {
    const v: Vec3 = { x: 1, y: 2, z: 3 };
    const clone = cloneVec3(v);
    expect(clone.x).toBe(v.x);
    expect(clone.y).toBe(v.y);
    expect(clone.z).toBe(v.z);
    expect(clone).not.toBe(v); // Different reference
  });

  it("addV3 adds vectors", () => {
    const a: Vec3 = { x: 1, y: 2, z: 3 };
    const b: Vec3 = { x: 4, y: 5, z: 6 };
    const result = addV3(a, b);
    expect(result.x).toBe(5);
    expect(result.y).toBe(7);
    expect(result.z).toBe(9);
  });

  it("subV3 subtracts vectors", () => {
    const a: Vec3 = { x: 4, y: 5, z: 6 };
    const b: Vec3 = { x: 1, y: 2, z: 3 };
    const result = subV3(a, b);
    expect(result.x).toBe(3);
    expect(result.y).toBe(3);
    expect(result.z).toBe(3);
  });

  it("mulV3 multiplies vector by scalar", () => {
    const v: Vec3 = { x: 1, y: 2, z: 3 };
    const result = mulV3(v, 2.5);
    expect(result.x).toBe(2.5);
    expect(result.y).toBe(5);
    expect(result.z).toBe(7.5);
  });
});

describe("Average normal vector", () => {
  it("averageNormalVector computes normal for triangle", () => {
    const nom: Vec3 = { x: 0, y: 0, z: 0 };
    const p: Vec3[] = [vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0)];
    const result = averageNormalVector(nom, p.length, p);
    expect(result).toBe(true);
    expect(nom.x).toBeCloseTo(0);
    expect(nom.y).toBeCloseTo(0);
    expect(nom.z).toBeCloseTo(1);
  });

  it("averageNormalVector returns false for collinear points", () => {
    const nom: Vec3 = { x: 0, y: 0, z: 0 };
    const p: Vec3[] = [vec3(0, 0, 0), vec3(1, 0, 0), vec3(2, 0, 0)];
    const result = averageNormalVector(nom, p.length, p);
    expect(result).toBe(false);
  });
});

describe("Trigonometry cache", () => {
  it("makeTrigonomy caches trig values", () => {
    const att: Attitude = { h: 8192, p: 4096, b: 2048 };
    const cache = makeTrigonomy(att);
    expect(cache.sinh).toBeCloseTo(Math.SQRT2 / 2); // sin(45°)
    expect(cache.cosh).toBeCloseTo(Math.SQRT2 / 2); // cos(45°)
    expect(cache.sinp).toBeCloseTo(0.382683432); // sin(22.5°)
    expect(cache.cosp).toBeCloseTo(0.923879532); // cos(22.5°)
    expect(cache.sinb).toBeGreaterThan(0);
    expect(cache.cosb).toBeGreaterThan(0);
  });
});

describe("Rotation (LtoG and GtoL)", () => {
  it("rotLtoG rotates vector with heading", () => {
    const dst: Vec3 = { x: 0, y: 0, z: 0 };
    const src: Vec3 = { x: 1, y: 0, z: 0 };
    const att: Attitude = { h: 8192, p: 0, b: 0 }; // 45 degrees
    rotLtoG(dst, src, att);
    // For h=45 degrees:
    // src = [1,0,0] (right vector)
    // After 45° heading rotation: [cos(45°), 0, sin(45°)] = [√2/2, 0, √2/2]
    expect(dst.x).toBeCloseTo(Math.SQRT2 / 2);
    expect(dst.y).toBeCloseTo(0);
    expect(dst.z).toBeCloseTo(Math.SQRT2 / 2);
  });

  it("rotFastLtoG uses cached trig values", () => {
    const dst: Vec3 = { x: 0, y: 0, z: 0 };
    const src: Vec3 = { x: 1, y: 0, z: 0 };
    const att: Attitude = { h: 8192, p: 0, b: 0 }; // 45 degrees
    const t = makeTrigonomy(att);
    rotFastLtoG(dst, src, t);
    // For h=45 degrees:
    // src = [1,0,0] (right vector)
    // After 45° heading rotation: [cos(45°), 0, sin(45°)] = [√2/2, 0, √2/2]
    expect(dst.x).toBeCloseTo(Math.SQRT2 / 2);
    expect(dst.y).toBeCloseTo(0);
    expect(dst.z).toBeCloseTo(Math.SQRT2 / 2);
  });

  it("rotGtoL is inverse of rotLtoG", () => {
    const original: Vec3 = { x: 1, y: 0, z: 0 };
    const rotated: Vec3 = { x: 0, y: 0, z: 0 };
    const back: Vec3 = { x: 0, y: 0, z: 0 };
    const att: Attitude = { h: 4096, p: 2048, b: 1024 };
    rotLtoG(rotated, original, att);
    rotGtoL(back, rotated, att);
    expect(back.x).toBeCloseTo(original.x, 10);
    expect(back.y).toBeCloseTo(original.y, 10);
    expect(back.z).toBeCloseTo(original.z, 10);
  });

  it("rotFastGtoL uses cached trig values", () => {
    const dst: Vec3 = { x: 0, y: 0, z: 0 };
    const src: Vec3 = { x: 1, y: 0, z: 0 };
    const att: Attitude = { h: 8192, p: 0, b: 0 };
    const t = makeTrigonomy(att);
    rotFastLtoG(dst, src, t);
    const back: Vec3 = { x: 0, y: 0, z: 0 };
    rotFastGtoL(back, dst, t);
    expect(back.x).toBeCloseTo(src.x, 10);
  });
});

describe("Coordinate conversion", () => {
  it("convLtoG converts local to global", () => {
    const dst: Vec3 = { x: 0, y: 0, z: 0 };
    const src: Vec3 = { x: 1, y: 0, z: 0 };
    const axs: Axis = {
      p: vec3(10, 20, 30),
      a: { h: 0, p: 0, b: 0 },
      t: makeTrigonomy({ h: 0, p: 0, b: 0 }),
    };
    convLtoG(dst, src, axs);
    expect(dst.x).toBeCloseTo(11);
    expect(dst.y).toBeCloseTo(20);
    expect(dst.z).toBeCloseTo(30);
  });

  it("convGtoL converts global to local", () => {
    const dst: Vec3 = { x: 0, y: 0, z: 0 };
    const src: Vec3 = { x: 11, y: 20, z: 30 };
    const axs: Axis = {
      p: vec3(10, 20, 30),
      a: { h: 0, p: 0, b: 0 },
      t: makeTrigonomy({ h: 0, p: 0, b: 0 }),
    };
    convGtoL(dst, src, axs);
    expect(dst.x).toBeCloseTo(1);
    expect(dst.y).toBeCloseTo(0);
    expect(dst.z).toBeCloseTo(0);
  });

  it("pntAngToAxis copies PosAtt to Axis", () => {
    const dst: Axis = {
      p: vec3(0, 0, 0),
      a: { h: 0, p: 0, b: 0 },
      t: { sinh: 0, cosh: 0, sinp: 0, cosp: 0, sinb: 0, cosb: 0 },
    };
    const src: PosAtt = { p: vec3(1, 2, 3), a: { h: 4096, p: 2048, b: 1024 } };
    pntAngToAxis(dst, src);
    expect(dst.p.x).toBe(1);
    expect(dst.p.y).toBe(2);
    expect(dst.p.z).toBe(3);
    expect(dst.a.h).toBe(4096);
    expect(dst.a.p).toBe(2048);
    expect(dst.a.b).toBe(1024);
    expect(dst.t).toEqual(makeTrigonomy(src.a));
  });
});

describe("Projection", () => {
  it("project projects 3D point to 2D screen", () => {
    const dst: ScreenPoint = { x: 0, y: 0 };
    const src: Vec3 = { x: 320, y: 240, z: 640 };
    const prj: Projection = {
      lx: 640,
      ly: 480,
      cx: 320,
      cy: 240,
      magx: 640 / 1.41421356,
      magy: 640 / 1.41421356,
      nearz: 2.5,
      farz: 10000,
    };
    project(dst, src, prj);
    expect(dst.x).toBeCloseTo(320 + 320 / Math.SQRT2);
    expect(dst.y).toBeCloseTo(240 - 240 / Math.SQRT2);
  });

  it("getStdProjection returns standard projection", () => {
    const prj = getStdProjection(640, 480);
    expect(prj.lx).toBe(640);
    expect(prj.ly).toBe(480);
    expect(prj.cx).toBe(320);
    expect(prj.cy).toBe(240);
    expect(prj.magx).toBeCloseTo(640 / 1.41421356);
    expect(prj.magy).toBeCloseTo(640 / 1.41421356);
  });
});

describe("Vector to angle", () => {
  it("vectorToHeadPitch converts up vector", () => {
    const an: Attitude = { h: 0, p: 0, b: 0 };
    const eye: Vec3 = { x: 0, y: 1, z: 0 };
    vectorToHeadPitch(an, eye);
    expect(an.h).toBe(0);
    expect(an.p).toBe(0x4000); // 90 degrees
    expect(an.b).toBe(0);
  });

  it("vectorToHeadPitch converts forward vector", () => {
    const an: Attitude = { h: 0, p: 0, b: 0 };
    const eye: Vec3 = { x: 0, y: 0, z: 1 };
    vectorToHeadPitch(an, eye);
    expect(an.h).toBe(0);
    expect(an.p).toBe(0);
    expect(an.b).toBe(0);
  });

  it("vectorToHeadPitch handles negative Y", () => {
    const an: Attitude = { h: 0, p: 0, b: 0 };
    const eye: Vec3 = { x: 0, y: -1, z: 0 };
    vectorToHeadPitch(an, eye);
    expect(an.p).toBe(-0x4000); // -90 degrees
  });
});

describe("Pitch up", () => {
  it("pitchUp computes new attitude", () => {
    const dst: Attitude = { h: 0, p: 0, b: 0 };
    const src: Attitude = { h: 0, p: 0, b: 0 };
    pitchUp(dst, src, 4096, 0); // Pitch up 45 degrees
    expect(dst.p).toBeCloseTo(4096);
  });

  it("vectorToAngle computes attitude from eye and up vectors", () => {
    const an: Attitude = { h: 0, p: 0, b: 0 };
    const eye: Vec3 = { x: 0, y: 0, z: 1 };
    const up: Vec3 = { x: 0, y: 1, z: 0 };
    vectorToAngle(an, eye, up);
    expect(an.p).toBe(0);
    expect(an.h).toBe(0);
    expect(an.b).toBe(0);
  });
});

describe("Near-plane clipping", () => {
  it("nearClipPolyg clips polygon against near plane", () => {
    const p: Vec3[] = [
      vec3(0, 0, -10), // Behind near plane
      vec3(1, 0, 5), // In front
      vec3(0, 1, 5),
    ];
    const result = nearClipPolyg(p, 2.5);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((v) => v.z >= 2.5)).toBe(true);
  });

  it("nearClipPolyg returns empty for all behind plane", () => {
    const p: Vec3[] = [vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0)];
    const result = nearClipPolyg(p, 2.5);
    expect(result).toEqual([]);
  });

  it("nearClipPolyg returns unchanged for all in front", () => {
    const p: Vec3[] = [vec3(0, 0, 10), vec3(1, 0, 10), vec3(0, 1, 10)];
    const result = nearClipPolyg(p, 2.5);
    expect(result.length).toBe(3);
  });
});

describe("Twist check", () => {
  it("twist3 detects right-handed winding", () => {
    const p: Vec3[] = [vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0)];
    const nom: Vec3 = { x: 0, y: 0, z: 1 };
    const result = twist3(p.length, p, nom);
    expect(result).toBe(BITWIST_RIGHT);
  });

  it("twist3 detects left-handed winding", () => {
    const p: Vec3[] = [vec3(0, 0, 0), vec3(0, 1, 0), vec3(1, 0, 0)];
    const nom: Vec3 = { x: 0, y: 0, z: 1 };
    const result = twist3(p.length, p, nom);
    expect(result).toBe(BITWIST_LEFT);
  });

  it("twist3 returns unknown for few points", () => {
    const p: Vec3[] = [vec3(0, 0, 0), vec3(1, 0, 0)];
    const nom: Vec3 = { x: 0, y: 0, z: 1 };
    const result = twist3(p.length, p, nom);
    expect(result).toBe(BITWIST_UNKNOWN);
  });
});

describe("Color utilities", () => {
  it("colorFromSRF15 converts SRF15 to RGB", () => {
    const col = colorFromSRF15(0x7fff); // All max
    expect(col.r).toBeCloseTo(1);
    expect(col.g).toBeCloseTo(1);
    expect(col.b).toBeCloseTo(1);
  });

  it("colorFromSRF15 extracts components correctly", () => {
    const col = colorFromSRF15(0x0000); // All zero
    expect(col.r).toBeCloseTo(0);
    expect(col.g).toBeCloseTo(0);
    expect(col.b).toBeCloseTo(0);
  });

  it("colorFromRGB converts RGB to Color", () => {
    const col = colorFromRGB(255, 128, 64);
    expect(col.r).toBeCloseTo(1);
    expect(col.g).toBeCloseTo(128 / 255);
    expect(col.b).toBeCloseTo(64 / 255);
  });
});
