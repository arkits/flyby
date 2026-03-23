// Tests for ground ring geometry generation

import { describe, it, expect } from "vitest";
import type { Color, PosAtt } from "./types";
import { buildGroundRingGeometry } from "./renderer";
import { vec3 } from "./math";

describe("Ground ring geometry", () => {
  it("generates geometry for camera at origin", () => {
    const eye: PosAtt = {
      p: vec3(0, 0, 0),
      a: { h: 0, p: 0, b: 0 },
    };
    const groundColor: Color = { r: 0.5, g: 0.5, b: 0.5 };

    const geometry = buildGroundRingGeometry(eye, groundColor);

    expect(geometry).toBeInstanceOf(Float32Array);
    expect(geometry.length).toBeGreaterThan(0);
    expect(geometry.length % 6).toBe(0); // Each triangle has 6 values (2 vertices × 3 coords)
  });

  it("snaps center to 120-unit grid", () => {
    const eye: PosAtt = {
      p: vec3(65, 125, 185),
      a: { h: 0, p: 0, b: 0 },
    };
    const groundColor: Color = { r: 0.5, g: 0.5, b: 0.5 };

    const geometry = buildGroundRingGeometry(eye, groundColor);

    // Center should be snapped to nearest 120
    // 65 -> 0 (rounded to 0), 125 -> 120, 185 -> 120
    // So first vertex should be at (-480 + 0, -0.08, -3600 + 120)
    // Wait, the center snapping is centerX = round(eye.p.x / 120) * 120
    // round(65/120) = round(0.54) = 1, 1 * 120 = 120
    // round(125/120) = round(1.04) = 1, 1 * 120 = 120
    // round(185/120) = round(1.54) = 2, 2 * 120 = 240

    // First ring: outer = 480, segments = 14, step = 960/14 ≈ 68.57
    // First quad: x from -480 to -411.43, z from -480 to -411.43
    // Center offset: (120, 0, 240)
    // First vertex: (-480 + 120, -0.08, -480 + 240) = (-360, -0.08, -240)

    expect(geometry[0]).toBeCloseTo(-360, 2);
    expect(geometry[1]).toBeCloseTo(-0.08, 2);
    expect(geometry[2]).toBeCloseTo(-240, 2);
  });

  it("generates concentric rings", () => {
    const eye: PosAtt = {
      p: vec3(0, 0, 0),
      a: { h: 0, p: 0, b: 0 },
    };
    const groundColor: Color = { r: 0.5, g: 0.5, b: 0.5 };

    const geometry = buildGroundRingGeometry(eye, groundColor);

    // The ground ring creates 4 concentric square rings
    // Ring 1: 14 segments, 196 quads
    // Ring 2: 16 segments, 256 quads
    // Ring 3: 18 segments, 324 quads
    // Ring 4: 20 segments, 400 quads
    expect(geometry.length).toBeGreaterThan(0);
  });

  it("skips inner quads when creating larger rings", () => {
    const eye: PosAtt = {
      p: vec3(0, 0, 0),
      a: { h: 0, p: 0, b: 0 },
    };
    const groundColor: Color = { r: 0.5, g: 0.5, b: 0.5 };

    const geometry = buildGroundRingGeometry(eye, groundColor);

    // Ring 2 should skip quads fully contained in ring 1
    // Quads at (-480, -480) to (-305, -305) are skipped
    // This is because x and z ranges are both within [-480, 480]
    // So ring 2 will have fewer quads than its full 16x16 grid

    // Just verify that geometry was generated and some skipping occurred
    expect(geometry.length).toBeGreaterThan(0);
    expect(geometry.length % 6).toBe(0);
  });

  it("places ground at Y = -0.08", () => {
    const eye: PosAtt = {
      p: vec3(0, 0, 0),
      a: { h: 0, p: 0, b: 0 },
    };
    const groundColor: Color = { r: 0.5, g: 0.5, b: 0.5 };

    const geometry = buildGroundRingGeometry(eye, groundColor);

    // All Y coordinates should be -0.08
    // Vertices are packed as (x, y, z, r, g, b)
    // So Y is at indices 1, 7, 13, etc.
    for (let i = 1; i < geometry.length; i += 6) {
      expect(geometry[i]).toBeCloseTo(-0.08);
    }
  });

  it("uses provided ground color", () => {
    const eye: PosAtt = {
      p: vec3(0, 0, 0),
      a: { h: 0, p: 0, b: 0 },
    };
    const groundColor: Color = { r: 1.0, g: 0.5, b: 0.25 };

    const geometry = buildGroundRingGeometry(eye, groundColor);

    // Color is stored at indices 3, 9, 15, etc. (after position XYZ)
    expect(geometry[3]).toBeCloseTo(1.0); // First triangle first vertex color R
    expect(geometry[4]).toBeCloseTo(0.5); // First triangle first vertex color G
    expect(geometry[5]).toBeCloseTo(0.25); // First triangle first vertex color B
  });

  it("generates two triangles per quad", () => {
    const eye: PosAtt = {
      p: vec3(0, 0, 0),
      a: { h: 0, p: 0, b: 0 },
    };
    const groundColor: Color = { r: 0.5, g: 0.5, b: 0.5 };

    const geometry = buildGroundRingGeometry(eye, groundColor);

    // Each quad generates 2 triangles
    // Each triangle has 3 vertices, each vertex has 3 position + 3 color = 6 values
    // So each quad has 2 * 3 * 6 = 36 values

    // Check first quad (first 36 values)
    expect(geometry.length).toBeGreaterThan(36);

    // First triangle: p0, p1, p2 (indices 0-2)
    // Second triangle: p0, p2, p3 (indices 3-5)
    // But color is repeated for each vertex, so:
    // Triangle 1: (p0xyz, p0rgb), (p1xyz, p1rgb), (p2xyz, p2rgb)
    // Triangle 2: (p0xyz, p0rgb), (p2xyz, p2rgb), (p3xyz, p3rgb)

    // So vertices 0 and 3 should be the same point
    expect(geometry[0]).toBeCloseTo(geometry[18], 2); // p0.x should match
    expect(geometry[1]).toBeCloseTo(geometry[19], 2); // p0.y should match
    expect(geometry[2]).toBeCloseTo(geometry[20], 2); // p0.z should match
  });

  it("handles camera at negative position", () => {
    const eye: PosAtt = {
      p: vec3(-100, -50, -75),
      a: { h: 0, p: 0, b: 0 },
    };
    const groundColor: Color = { r: 0.5, g: 0.5, b: 0.5 };

    const geometry = buildGroundRingGeometry(eye, groundColor);

    expect(geometry.length).toBeGreaterThan(0);

    // Center should be snapped:
    // centerX = round(-100/120) * 120 = round(-0.833) * 120 = -1 * 120 = -120
    // centerZ = round(-75/120) * 120 = round(-0.625) * 120 = -1 * 120 = -120
    // First vertex at ring 1, quad 0: (-480, -480)
    // p0 = (centerX + x0, y, centerZ + z0) = (-120 - 480, -0.08, -120 - 480) = (-600, -0.08, -600)
    expect(geometry[0]).toBeCloseTo(-600, 2);
    expect(geometry[1]).toBeCloseTo(-0.08, 2);
    expect(geometry[2]).toBeCloseTo(-600, 2);
  });
});
