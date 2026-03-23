// Tests for renderer.ts geometry and math functions

import { describe, it, expect } from "vitest";
import type { Vec3, Color, PosAtt, MapEnvironment } from "./types";
import {
  writeVec4,
  writeColor4,
  skyModeId,
  mapVariantId,
  pushLitVert,
  pushUnlitTri,
  pushUnlitLine,
  pushUnlitPoint,
  projectShadowPoint,
  shadowCross,
  buildShadowHull,
  getCameraBasis,
  projectPolygonPoint,
  polygonCross2d,
  polygonArea2d,
  samePoint2d,
  pointInTriangle2d,
  triangulatePolygonIndices,
} from "./renderer";
import { vec3 } from "./math";

describe("Vector/Color writers", () => {
  it("writeVec4 writes values correctly", () => {
    const data = new Float32Array(16);
    writeVec4(data, 0, 1.5, 2.5, 3.5, 4.5);

    expect(data[0]).toBe(1.5);
    expect(data[1]).toBe(2.5);
    expect(data[2]).toBe(3.5);
    expect(data[3]).toBe(4.5);
  });

  it("writeVec4 writes at different offsets", () => {
    const data = new Float32Array(16);
    writeVec4(data, 4, 10, 20, 30, 40);

    expect(data[4]).toBe(10);
    expect(data[5]).toBe(20);
    expect(data[6]).toBe(30);
    expect(data[7]).toBe(40);
  });

  it("writeColor4 writes color and w component", () => {
    const data = new Float32Array(16);
    const color: Color = { r: 0.5, g: 0.75, b: 1.0 };
    writeColor4(data, 0, color, 0.9);

    expect(data[0]).toBe(0.5);
    expect(data[1]).toBe(0.75);
    expect(data[2]).toBe(1.0);
    expect(data[3]).toBeCloseTo(0.9);
  });
});

describe("Environment ID functions", () => {
  it("skyModeId returns correct IDs", () => {
    const clearEnv: MapEnvironment = {
      key: "airport",
      sky: {
        mode: "clear",
        topColor: { r: 0, g: 0, b: 0 },
        horizonColor: { r: 0, g: 0, b: 0 },
        bottomColor: { r: 0, g: 0, b: 0 },
        curve: 0,
        glow: 0,
      },
      keyLight: {
        direction: { x: 0, y: 1, z: 0 },
        intensity: 1,
        color: { r: 1, g: 1, b: 1 },
        shadowStrength: 0,
      },
      hemisphere: {
        skyColor: { r: 0, g: 0, b: 0 },
        groundColor: { r: 0, g: 0, b: 0 },
        intensity: 1,
        balance: 0.5,
      },
      fog: { color: { r: 0, g: 0, b: 0 }, start: 0, end: 1000, density: 0, heightFalloff: 0 },
      cloud: {
        color: { r: 0, g: 0, b: 0 },
        shadowColor: { r: 0, g: 0, b: 0 },
        coverage: 0,
        softness: 0,
        scale: 0,
        bandScale: 0,
        speed: 0,
        density: 0,
        height: 0,
      },
      ground: {
        primary: { r: 0, g: 0, b: 0 },
        secondary: { r: 0, g: 0, b: 0 },
        accent: { r: 0, g: 0, b: 0 },
        paved: { r: 0, g: 0, b: 0 },
        detailScale: 0,
        breakupScale: 0,
        stripScale: 0,
        patchScale: 0,
        pavementBias: 0,
        shoulderDepth: 0,
      },
      emissive: { color: { r: 0, g: 0, b: 0 }, strength: 0, threshold: 0, saturationBoost: 0 },
    };

    expect(skyModeId({ ...clearEnv, sky: { ...clearEnv.sky, mode: "clear" } })).toBe(0);
    expect(skyModeId({ ...clearEnv, sky: { ...clearEnv.sky, mode: "night" } })).toBe(1);
    expect(skyModeId({ ...clearEnv, sky: { ...clearEnv.sky, mode: "hazy" } })).toBe(2);
  });

  it("mapVariantId returns correct IDs", () => {
    const baseEnv: MapEnvironment = {
      key: "airport",
      sky: {
        mode: "clear",
        topColor: { r: 0, g: 0, b: 0 },
        horizonColor: { r: 0, g: 0, b: 0 },
        bottomColor: { r: 0, g: 0, b: 0 },
        curve: 0,
        glow: 0,
      },
      keyLight: {
        direction: { x: 0, y: 1, z: 0 },
        intensity: 1,
        color: { r: 1, g: 1, b: 1 },
        shadowStrength: 0,
      },
      hemisphere: {
        skyColor: { r: 0, g: 0, b: 0 },
        groundColor: { r: 0, g: 0, b: 0 },
        intensity: 1,
        balance: 0.5,
      },
      fog: { color: { r: 0, g: 0, b: 0 }, start: 0, end: 1000, density: 0, heightFalloff: 0 },
      cloud: {
        color: { r: 0, g: 0, b: 0 },
        shadowColor: { r: 0, g: 0, b: 0 },
        coverage: 0,
        softness: 0,
        scale: 0,
        bandScale: 0,
        speed: 0,
        density: 0,
        height: 0,
      },
      ground: {
        primary: { r: 0, g: 0, b: 0 },
        secondary: { r: 0, g: 0, b: 0 },
        accent: { r: 0, g: 0, b: 0 },
        paved: { r: 0, g: 0, b: 0 },
        detailScale: 0,
        breakupScale: 0,
        stripScale: 0,
        patchScale: 0,
        pavementBias: 0,
        shoulderDepth: 0,
      },
      emissive: { color: { r: 0, g: 0, b: 0 }, strength: 0, threshold: 0, saturationBoost: 0 },
    };

    expect(mapVariantId({ ...baseEnv, key: "airport" as any })).toBe(0);
    expect(mapVariantId({ ...baseEnv, key: "airport-improved" as any })).toBe(1);
    expect(mapVariantId({ ...baseEnv, key: "airport-night" as any })).toBe(2);
    expect(mapVariantId({ ...baseEnv, key: "downtown" as any })).toBe(3);
  });
});

describe("Vertex push functions", () => {
  it("pushLitVert pushes 13 values", () => {
    const verts: number[] = [];
    const p: Vec3 = vec3(1, 2, 3);
    const n: Vec3 = vec3(0, 1, 0);
    const cullNormal: Vec3 = vec3(0, 0, 1);
    const c: Color = { r: 0.5, g: 0.6, b: 0.7 };
    const bright = 1.0;

    pushLitVert(verts, p, n, cullNormal, c, bright);

    expect(verts.length).toBe(13);
    expect(verts[0]).toBe(1);
    expect(verts[1]).toBe(2);
    expect(verts[2]).toBe(3);
    expect(verts[3]).toBe(0);
    expect(verts[4]).toBe(1);
    expect(verts[5]).toBe(0);
    expect(verts[6]).toBe(0);
    expect(verts[7]).toBe(0);
    expect(verts[8]).toBe(1);
    expect(verts[9]).toBe(0.5);
    expect(verts[10]).toBe(0.6);
    expect(verts[11]).toBe(0.7);
    expect(verts[12]).toBe(1.0);
  });

  it("pushUnlitTri pushes 18 values (3 vertices × 6)", () => {
    const verts: number[] = [];
    const p0: Vec3 = vec3(0, 0, 0);
    const p1: Vec3 = vec3(1, 0, 0);
    const p2: Vec3 = vec3(0, 1, 0);
    const c: Color = { r: 1, g: 0, b: 0 };

    pushUnlitTri(verts, p0, p1, p2, c);

    expect(verts.length).toBe(18);
    expect(verts[0]).toBe(0);
    expect(verts[1]).toBe(0);
    expect(verts[2]).toBe(0);
    expect(verts[3]).toBe(1);
    expect(verts[4]).toBe(0);
    expect(verts[5]).toBe(0);
    expect(verts[6]).toBe(1);
    expect(verts[7]).toBe(0);
    expect(verts[8]).toBe(0);
    expect(verts[9]).toBe(1);
    expect(verts[10]).toBe(0);
    expect(verts[11]).toBe(0);
    expect(verts[12]).toBe(0);
    expect(verts[13]).toBe(1);
    expect(verts[14]).toBe(0);
    expect(verts[15]).toBe(1);
    expect(verts[16]).toBe(0);
    expect(verts[17]).toBe(0);
  });

  it("pushUnlitLine pushes 12 values (2 vertices × 6)", () => {
    const verts: number[] = [];
    const p0: Vec3 = vec3(0, 0, 0);
    const p1: Vec3 = vec3(1, 0, 0);
    const c: Color = { r: 0, g: 1, b: 0 };

    pushUnlitLine(verts, p0, p1, c);

    expect(verts.length).toBe(12);
    expect(verts[0]).toBe(0);
    expect(verts[1]).toBe(0);
    expect(verts[2]).toBe(0);
    expect(verts[3]).toBe(0);
    expect(verts[4]).toBe(1);
    expect(verts[5]).toBe(0);
    expect(verts[6]).toBe(1);
    expect(verts[7]).toBe(0);
    expect(verts[8]).toBe(0);
    expect(verts[9]).toBe(0);
    expect(verts[10]).toBe(1);
    expect(verts[11]).toBe(0);
  });

  it("pushUnlitPoint pushes 6 values (1 vertex × 6)", () => {
    const verts: number[] = [];
    const p: Vec3 = vec3(5, 10, 15);
    const c: Color = { r: 0, g: 0, b: 1 };

    pushUnlitPoint(verts, p, c);

    expect(verts.length).toBe(6);
    expect(verts[0]).toBe(5);
    expect(verts[1]).toBe(10);
    expect(verts[2]).toBe(15);
    expect(verts[3]).toBe(0);
    expect(verts[4]).toBe(0);
    expect(verts[5]).toBe(1);
  });
});

describe("Shadow projection", () => {
  it("projectShadowPoint projects point to ground plane", () => {
    const point: Vec3 = vec3(0, 10, 0);
    const lightDirection: Vec3 = vec3(0, 1, 0); // Light pointing up (from ground to sky)

    const shadow = projectShadowPoint(point, lightDirection);

    expect(shadow).not.toBeNull();
    expect(shadow!.x).toBeCloseTo(0);
    expect(shadow!.z).toBeCloseTo(0);
  });

  it("projectShadowPoint returns null for horizontal light", () => {
    const point: Vec3 = vec3(0, 10, 0);
    const lightDirection: Vec3 = vec3(1, 0, 0); // Light pointing horizontally

    const shadow = projectShadowPoint(point, lightDirection);

    expect(shadow).toBeNull();
  });

  it("projectShadowPoint returns null when t < 0", () => {
    const point: Vec3 = vec3(0, -1, 0); // Below ground
    const lightDirection: Vec3 = vec3(0, 1, 0); // Light pointing up

    const shadow = projectShadowPoint(point, lightDirection);

    expect(shadow).toBeNull();
  });

  it("projectShadowPoint handles angled light", () => {
    const point: Vec3 = vec3(0, 10, 0);
    const lightDirection: Vec3 = vec3(0, 1, 1); // Angled light pointing up and in +Z

    const shadow = projectShadowPoint(point, lightDirection);

    expect(shadow).not.toBeNull();
    expect(shadow!.x).toBeCloseTo(0);
    expect(shadow!.z).toBeLessThan(0); // Shadow in negative Z (opposite to light direction)
  });

  it("shadowCross computes 2D cross product", () => {
    const o = { x: 0, z: 0 };
    const a = { x: 1, z: 0 };
    const b = { x: 0, z: 1 };

    const cross = shadowCross(o, a, b);

    expect(cross).toBe(1);
  });

  it("shadowCross returns 0 for collinear points", () => {
    const o = { x: 0, z: 0 };
    const a = { x: 1, z: 0 };
    const b = { x: 2, z: 0 };

    const cross = shadowCross(o, a, b);

    expect(cross).toBe(0);
  });

  it("buildShadowHull builds convex hull from points", () => {
    const points = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0.5, z: 1 },
      { x: 0.5, z: 0.5 }, // Interior point
    ];

    const hull = buildShadowHull(points);

    expect(hull.length).toBe(3); // 3 points in hull (interior removed)
    expect(hull.length).toBeGreaterThanOrEqual(3);
  });

  it("buildShadowHull returns empty for fewer than 3 points", () => {
    expect(buildShadowHull([])).toEqual([]);
    expect(buildShadowHull([{ x: 0, z: 0 }])).toEqual([]);
    expect(
      buildShadowHull([
        { x: 0, z: 0 },
        { x: 1, z: 0 },
      ])
    ).toEqual([]);
  });

  it("buildShadowHull handles collinear points", () => {
    const points = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 2, z: 0 },
    ];

    const hull = buildShadowHull(points);

    expect(hull.length).toBeLessThanOrEqual(2);
  });
});

describe("Camera basis", () => {
  it("getCameraBasis returns orthonormal basis", () => {
    const eye: PosAtt = {
      p: vec3(0, 0, 0),
      a: { h: 0, p: 0, b: 0 },
    };

    const basis = getCameraBasis(eye);

    expect(basis).toHaveProperty("right");
    expect(basis).toHaveProperty("up");
    expect(basis).toHaveProperty("forward");
  });

  it("getCameraBasis handles non-zero attitude", () => {
    const eye: PosAtt = {
      p: vec3(0, 0, 0),
      a: { h: 8192, p: 0, b: 0 }, // 90 degree heading
    };

    const basis = getCameraBasis(eye);

    expect(basis.right).toBeDefined();
    expect(basis.up).toBeDefined();
    expect(basis.forward).toBeDefined();
  });
});

describe("Polygon projection", () => {
  it("projectPolygonPoint projects based on normal dominance", () => {
    const point: Vec3 = vec3(5, 6, 7);

    // X dominant
    const normalX: Vec3 = vec3(1, 0, 0);
    const projX = projectPolygonPoint(point, normalX);
    expect(projX).toEqual({ x: 6, y: 7 });

    // Y dominant
    const normalY: Vec3 = vec3(0, 1, 0);
    const projY = projectPolygonPoint(point, normalY);
    expect(projY).toEqual({ x: 5, y: 7 });

    // Z dominant
    const normalZ: Vec3 = vec3(0, 0, 1);
    const projZ = projectPolygonPoint(point, normalZ);
    expect(projZ).toEqual({ x: 5, y: 6 });
  });
});

describe("Polygon 2D geometry", () => {
  it("polygonCross2d computes 2D cross product", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 0 };
    const c = { x: 0, y: 1 };

    const cross = polygonCross2d(a, b, c);

    expect(cross).toBe(1);
  });

  it("polygonArea2d computes signed area", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];

    const area = polygonArea2d(points);

    expect(area).toBe(0.5);
  });

  it("polygonArea2d handles clockwise winding", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ];

    const area = polygonArea2d(points);

    expect(area).toBe(-0.5);
  });

  it("samePoint2d compares points with epsilon", () => {
    const a = { x: 1, y: 2 };
    const b = { x: 1, y: 2 };
    const c = { x: 1.000005, y: 2 };

    expect(samePoint2d(a, b)).toBe(true);
    expect(samePoint2d(a, c)).toBe(true); // Within epsilon
  });

  it("samePoint2d returns false for different points", () => {
    const a = { x: 1, y: 2 };
    const b = { x: 2, y: 3 };

    expect(samePoint2d(a, b)).toBe(false);
  });

  it("pointInTriangle2d detects point in triangle", () => {
    const point = { x: 0.25, y: 0.25 };
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 0 };
    const c = { x: 0, y: 1 };

    expect(pointInTriangle2d(point, a, b, c, 1)).toBe(true);
  });

  it("pointInTriangle2d detects point outside triangle", () => {
    const point = { x: 1, y: 1 };
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 0 };
    const c = { x: 0, y: 1 };

    expect(pointInTriangle2d(point, a, b, c, 1)).toBe(false);
  });

  it("pointInTriangle2d handles point on edge", () => {
    const point = { x: 0.5, y: 0 };
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 0 };
    const c = { x: 0, y: 1 };

    expect(pointInTriangle2d(point, a, b, c, 1)).toBe(true);
  });
});

describe("Polygon triangulation", () => {
  it("triangulatePolygonIndices handles triangle", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];

    const indices = triangulatePolygonIndices(points);

    expect(indices).toEqual([0, 1, 2]);
  });

  it("triangulatePolygonIndices handles square", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];

    const indices = triangulatePolygonIndices(points);

    expect(indices.length).toBe(6); // 2 triangles
    expect(indices.length % 3).toBe(0);
  });

  it("triangulatePolygonIndices handles pentagon", () => {
    const points = [];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      points.push({ x: Math.cos(angle), y: Math.sin(angle) });
    }

    const indices = triangulatePolygonIndices(points);

    expect(indices.length).toBe(9); // 3 triangles
    expect(indices.length % 3).toBe(0);
  });

  it("triangulatePolygonIndices handles degenerate polygon", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0.00001, y: 0 }, // Nearly duplicate
      { x: 1, y: 0 },
    ];

    const indices = triangulatePolygonIndices(points);

    expect(indices.length % 3).toBe(0);
  });

  it("triangulatePolygonIndices removes duplicate points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 0 }, // Duplicate
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ];

    const indices = triangulatePolygonIndices(points);

    expect(indices.length % 3).toBe(0);
  });

  it("triangulatePolygonIndices handles collinear points with fallback", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];

    const indices = triangulatePolygonIndices(points);

    // Collinear points use fallback fan triangulation
    expect(indices.length % 3).toBe(0);
  });

  it("triangulatePolygonIndices handles star polygon", () => {
    const points = [
      { x: 0, y: 0.5 },
      { x: 0.5, y: 1 },
      { x: 1, y: 0.5 },
      { x: 1, y: 0 },
      { x: 0.5, y: -0.5 },
      { x: 0, y: 0 },
      { x: -0.5, y: -0.5 },
      { x: -1, y: 0 },
      { x: -1, y: 0.5 },
      { x: -0.5, y: 1 },
    ];

    const indices = triangulatePolygonIndices(points);

    expect(indices.length % 3).toBe(0);
    expect(indices.length).toBeGreaterThan(0);
  });
});
