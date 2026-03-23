import { describe, it, expect } from "vitest";
import type { PosAtt, Terrain, Pc2Object, Axis } from "./types";
import {
  isFiniteVec3,
  isValidPosAtt,
  isWithinLod,
  distanceSquared,
  terrainBlockIndex,
  terrainPoint,
  createPrimitiveBuckets,
  isPc2ObjectVisible,
  buildGroundRingGeometry,
} from "./renderer";
import { vec3, makeTrigonomy } from "./math";

describe("isFiniteVec3", () => {
  it("returns true for valid Vec3", () => {
    expect(isFiniteVec3(vec3(1, 2, 3))).toBe(true);
    expect(isFiniteVec3(vec3(0, 0, 0))).toBe(true);
    expect(isFiniteVec3(vec3(-1.5, 2.5, 0))).toBe(true);
  });

  it("returns false for null/undefined", () => {
    expect(isFiniteVec3(null)).toBe(false);
    expect(isFiniteVec3(undefined)).toBe(false);
  });

  it("returns false for non-finite components", () => {
    expect(isFiniteVec3({ x: Infinity, y: 0, z: 0 })).toBe(false);
    expect(isFiniteVec3({ x: 0, y: NaN, z: 0 })).toBe(false);
    expect(isFiniteVec3({ x: 0, y: 0, z: Infinity })).toBe(false);
  });
});

describe("isValidPosAtt", () => {
  it("returns true for valid PosAtt", () => {
    const pos: PosAtt = { p: vec3(1, 2, 3), a: { h: 0, p: 0, b: 0 } };
    expect(isValidPosAtt(pos)).toBe(true);
  });

  it("returns false for null/undefined", () => {
    expect(isValidPosAtt(null)).toBe(false);
    expect(isValidPosAtt(undefined)).toBe(false);
  });

  it("returns false for invalid position", () => {
    expect(isValidPosAtt({ p: { x: Infinity, y: 0, z: 0 }, a: { h: 0, p: 0, b: 0 } })).toBe(false);
  });

  it("returns false for invalid attitude", () => {
    expect(isValidPosAtt({ p: vec3(0, 0, 0), a: { h: NaN, p: 0, b: 0 } })).toBe(false);
    expect(isValidPosAtt({ p: vec3(0, 0, 0), a: { h: 0, p: Infinity, b: 0 } })).toBe(false);
    expect(isValidPosAtt({ p: vec3(0, 0, 0), a: { h: 0, p: 0, b: Infinity } })).toBe(false);
  });
});

describe("distanceSquared", () => {
  it("returns 0 for same point", () => {
    expect(distanceSquared(vec3(1, 2, 3), vec3(1, 2, 3))).toBe(0);
  });

  it("computes squared Euclidean distance", () => {
    expect(distanceSquared(vec3(0, 0, 0), vec3(3, 4, 0))).toBe(25);
    expect(distanceSquared(vec3(1, 1, 1), vec3(4, 5, 1))).toBe(9 + 16);
  });

  it("handles negative coordinates", () => {
    expect(distanceSquared(vec3(-1, -2, -3), vec3(1, 2, 3))).toBe(4 + 16 + 36);
  });
});

describe("isWithinLod", () => {
  it("returns true when within LOD distance", () => {
    const pos: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
    const eye: PosAtt = { p: vec3(100, 0, 0), a: { h: 0, p: 0, b: 0 } };
    expect(isWithinLod(pos, 200, eye)).toBe(true);
  });

  it("returns false when outside LOD distance", () => {
    const pos: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
    const eye: PosAtt = { p: vec3(100, 0, 0), a: { h: 0, p: 0, b: 0 } };
    expect(isWithinLod(pos, 50, eye)).toBe(false);
  });

  it("returns false for invalid inputs", () => {
    const eye: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
    expect(isWithinLod(null!, 100, eye)).toBe(false);
    expect(isWithinLod({ p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } }, 100, null!)).toBe(false);
  });

  it("returns true for infinite LOD distance", () => {
    const pos: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
    const eye: PosAtt = { p: vec3(10000, 0, 0), a: { h: 0, p: 0, b: 0 } };
    expect(isWithinLod(pos, Infinity, eye)).toBe(true);
  });

  it("returns true when exactly at LOD distance", () => {
    const pos: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
    const eye: PosAtt = { p: vec3(100, 0, 0), a: { h: 0, p: 0, b: 0 } };
    expect(isWithinLod(pos, 100, eye)).toBe(true);
  });

  it("returns true for zero LOD distance when at same position", () => {
    const pos: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
    const eye: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
    expect(isWithinLod(pos, 0, eye)).toBe(true);
  });

  it("handles negative LOD distance as zero", () => {
    const pos: PosAtt = { p: vec3(100, 0, 0), a: { h: 0, p: 0, b: 0 } };
    const eye: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
    expect(isWithinLod(pos, -50, eye)).toBe(false);
  });
});

describe("terrainBlockIndex", () => {
  const ter: Terrain = {
    xSiz: 10,
    zSiz: 20,
    xWid: 10,
    zWid: 5,
    blocks: [],
    side: [0, 0, 0, 0],
    sdCol: [],
  };

  it("computes correct flat index", () => {
    expect(terrainBlockIndex(ter, 0, 0)).toBe(0);
    expect(terrainBlockIndex(ter, 1, 0)).toBe(1);
    expect(terrainBlockIndex(ter, 0, 1)).toBe(11);
  });
});

describe("terrainPoint", () => {
  it("computes world-space coordinates from grid indices", () => {
    const ter: Terrain = {
      xSiz: 10,
      zSiz: 20,
      xWid: 10,
      zWid: 5,
      blocks: Array.from({ length: 11 * 21 }, () => ({ y: 5, lup: 0, col: [], vis: [1, 1] })),
      side: [0, 0, 0, 0],
      sdCol: [],
    };
    const p = terrainPoint(ter, 3, 0);
    expect(p.x).toBeCloseTo(30);
    expect(p.z).toBeCloseTo(0);
  });
});

describe("createPrimitiveBuckets", () => {
  it("creates empty buckets", () => {
    const buckets = createPrimitiveBuckets();
    expect(buckets.lit).toEqual([]);
    expect(buckets.unlit).toEqual([]);
    expect(buckets.lines).toEqual([]);
    expect(buckets.points).toEqual([]);
  });
});

describe("isPc2ObjectVisible", () => {
  it("returns true for object within visibility distance", () => {
    const obj: Pc2Object = {
      type: "PLG",
      color: { r: 1, g: 0, b: 0 },
      visiDist: 100,
      vertices: [],
      center: { x: 0, y: 0 },
    };
    const pc2Axs: Axis = {
      p: vec3(0, 0, 0),
      a: { h: 0, p: 0, b: 0 },
      t: makeTrigonomy({ h: 0, p: 0, b: 0 }),
    };
    const eyeAxs: Axis = {
      p: vec3(0, 0, 0),
      a: { h: 0, p: 0, b: 0 },
      t: makeTrigonomy({ h: 0, p: 0, b: 0 }),
    };
    expect(isPc2ObjectVisible(obj, pc2Axs, eyeAxs, 0)).toBe(true);
  });

  it("returns false for object outside visibility distance", () => {
    const obj: Pc2Object = {
      type: "PLG",
      color: { r: 1, g: 0, b: 0 },
      visiDist: 10,
      vertices: [],
      center: { x: 100, y: 0 },
    };
    const pc2Axs: Axis = {
      p: vec3(0, 0, 0),
      a: { h: 0, p: 0, b: 0 },
      t: makeTrigonomy({ h: 0, p: 0, b: 0 }),
    };
    const eyeAxs: Axis = {
      p: vec3(0, 0, 0),
      a: { h: 0, p: 0, b: 0 },
      t: makeTrigonomy({ h: 0, p: 0, b: 0 }),
    };
    expect(isPc2ObjectVisible(obj, pc2Axs, eyeAxs, 0)).toBe(false);
  });
});

describe("buildGroundRingGeometry", () => {
  it("returns empty Float32Array for edge-case positions", () => {
    const eye: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
    const result = buildGroundRingGeometry(eye, { r: 0.5, g: 0.5, b: 0.5 });
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBeGreaterThan(0);
  });
});
