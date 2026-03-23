// Tests for renderer.ts matrix and transform functions

import { describe, it, expect } from "vitest";
import type { Vec3, PosAtt, Projection } from "./types";
import {
  buildModelMatrix,
  buildViewMatrix,
  buildPerspectiveMatrix,
  buildViewProjMatrix,
  mat4Multiply,
  debugViewTransform,
} from "./renderer";
import { vec3 } from "./math";

describe("Matrix construction", () => {
  describe("buildModelMatrix", () => {
    it("creates identity model matrix for zero position and rotation", () => {
      const pos: PosAtt = {
        p: vec3(0, 0, 0),
        a: { h: 0, p: 0, b: 0 },
      };

      const mat = buildModelMatrix(pos);

      expect(mat).toHaveLength(16);
      expect(mat[0]).toBeCloseTo(1); // Right X
      expect(mat[1]).toBeCloseTo(0); // Right Y
      expect(mat[2]).toBeCloseTo(0); // Right Z
      expect(mat[3]).toBeCloseTo(0); // Right W
      expect(mat[4]).toBeCloseTo(0); // Up X
      expect(mat[5]).toBeCloseTo(1); // Up Y
      expect(mat[6]).toBeCloseTo(0); // Up Z
      expect(mat[7]).toBeCloseTo(0); // Up W
      expect(mat[8]).toBeCloseTo(0); // Forward X
      expect(mat[9]).toBeCloseTo(0); // Forward Y
      expect(mat[10]).toBeCloseTo(1); // Forward Z
      expect(mat[11]).toBeCloseTo(0); // Forward W
      expect(mat[12]).toBeCloseTo(0); // Translation X
      expect(mat[13]).toBeCloseTo(0); // Translation Y
      expect(mat[14]).toBeCloseTo(0); // Translation Z
      expect(mat[15]).toBeCloseTo(1); // Translation W
    });

    it("includes translation in model matrix", () => {
      const pos: PosAtt = {
        p: vec3(5, 10, 15),
        a: { h: 0, p: 0, b: 0 },
      };

      const mat = buildModelMatrix(pos);

      expect(mat[12]).toBeCloseTo(5);
      expect(mat[13]).toBeCloseTo(10);
      expect(mat[14]).toBeCloseTo(15);
    });

    it("applies heading rotation", () => {
      const pos: PosAtt = {
        p: vec3(0, 0, 0),
        a: { h: 8192, p: 0, b: 0 }, // 45 degrees — heading formula uses reflection across YZ plane
      };

      const mat = buildModelMatrix(pos);

      // Blue Impulse heading formula: forward.x = cosh * 0 - sinh * 1 = -sin(45°) ≈ -0.707
      expect(mat[8]).toBeCloseTo(-Math.SQRT2 / 2, 4); // Forward X
      expect(mat[10]).toBeCloseTo(Math.SQRT2 / 2, 4); // Forward Z
    });

    it("applies pitch rotation", () => {
      const pos: PosAtt = {
        p: vec3(0, 0, 0),
        a: { h: 0, p: 8192, b: 0 }, // 45 degrees
      };

      const mat = buildModelMatrix(pos);

      // Bank-pitch-heading order with p=45°:
      // After pitch: tmpp_y = sinp * 1 + cosp * 0 = √2/2, tmpp_z = cosp * 1 = √2/2
      // Heading (no-op since h=0): forward = (0, √2/2, √2/2)
      expect(mat[9]).toBeCloseTo(Math.SQRT2 / 2, 4); // Forward Y
      expect(mat[10]).toBeCloseTo(Math.SQRT2 / 2, 4); // Forward Z
    });

    it("applies bank rotation", () => {
      const pos: PosAtt = {
        p: vec3(0, 0, 0),
        a: { h: 0, p: 0, b: 8192 }, // 45 degrees
      };

      const mat = buildModelMatrix(pos);

      // Bank formula: up.y = cos(45°) = √2/2 ≈ 0.707
      expect(mat[5]).toBeCloseTo(Math.SQRT2 / 2, 4); // Up Y
    });

    it("applies pitch rotation", () => {
      const pos: PosAtt = {
        p: vec3(0, 0, 0),
        a: { h: 0, p: 16384, b: 0 }, // 90 degrees
      };

      const mat = buildModelMatrix(pos);

      // After 90 degree pitch, forward should point up
      expect(mat[9]).toBeCloseTo(1, 4); // Forward Y
      expect(mat[10]).toBeCloseTo(0, 4); // Forward Z
    });

    it("applies bank rotation", () => {
      const pos: PosAtt = {
        p: vec3(0, 0, 0),
        a: { h: 0, p: 0, b: 16384 }, // 90 degrees
      };

      const mat = buildModelMatrix(pos);

      // After 90 degree bank:
      // - Right points along +Y (original up direction)
      // - Up points along -X (negative of original right direction)
      // - Forward stays along +Z
      expect(mat[0]).toBeCloseTo(0, 4); // Right X
      expect(mat[1]).toBeCloseTo(1, 4); // Right Y (became +Y)
      expect(mat[4]).toBeCloseTo(-1, 4); // Up X
      expect(mat[5]).toBeCloseTo(0, 4); // Up Y
    });

    it("creates orthonormal rotation matrix", () => {
      const pos: PosAtt = {
        p: vec3(0, 0, 0),
        a: { h: 4096, p: 2048, b: 1024 }, // Random rotation
      };

      const mat = buildModelMatrix(pos);

      // Extract rotation columns
      const right = { x: mat[0], y: mat[1], z: mat[2] };
      const up = { x: mat[4], y: mat[5], z: mat[6] };
      const forward = { x: mat[8], y: mat[9], z: mat[10] };

      // Check orthonormality: each column should be unit length
      const rightLen = Math.sqrt(right.x * right.x + right.y * right.y + right.z * right.z);
      const upLen = Math.sqrt(up.x * up.x + up.y * up.y + up.z * up.z);
      const forwardLen = Math.sqrt(
        forward.x * forward.x + forward.y * forward.y + forward.z * forward.z
      );

      expect(rightLen).toBeCloseTo(1, 4);
      expect(upLen).toBeCloseTo(1, 4);
      expect(forwardLen).toBeCloseTo(1, 4);

      // Check orthogonality: columns should be perpendicular
      const rightDotUp = right.x * up.x + right.y * up.y + right.z * up.z;
      const rightDotForward = right.x * forward.x + right.y * forward.y + right.z * forward.z;
      const upDotForward = up.x * forward.x + up.y * forward.y + up.z * forward.z;

      expect(rightDotUp).toBeCloseTo(0, 4);
      expect(rightDotForward).toBeCloseTo(0, 4);
      expect(upDotForward).toBeCloseTo(0, 4);
    });
  });

  describe("buildViewMatrix", () => {
    it("creates view matrix for camera at origin", () => {
      const eye: PosAtt = {
        p: vec3(0, 0, 0),
        a: { h: 0, p: 0, b: 0 },
      };

      const mat = buildViewMatrix(eye);

      expect(mat).toHaveLength(16);
      expect(mat[15]).toBeCloseTo(1);
    });

    it("includes translation for camera position", () => {
      const eye: PosAtt = {
        p: vec3(10, 20, 30),
        a: { h: 0, p: 0, b: 0 },
      };

      const mat = buildViewMatrix(eye);

      // Translation should be negative of camera position
      expect(mat[12]).toBeCloseTo(-10);
      expect(mat[13]).toBeCloseTo(-20);
      expect(mat[14]).toBeCloseTo(-30);
    });

    it("applies camera rotation", () => {
      const eye: PosAtt = {
        p: vec3(0, 0, 0),
        a: { h: 8192, p: 0, b: 0 }, // 45 degrees
      };

      const mat = buildViewMatrix(eye);

      // View matrix uses rotFastGtoL (inverse rotation). With h=45°:
      // rX.x = cos(45°) = √2/2, rZ.x = sin(45°) = √2/2
      expect(mat[0]).toBeCloseTo(Math.SQRT2 / 2, 4);
      expect(mat[8]).toBeCloseTo(Math.SQRT2 / 2, 4);
    });
  });

  describe("buildPerspectiveMatrix", () => {
    it("creates perspective matrix for symmetric frustum", () => {
      const prj: Projection = {
        lx: 640,
        ly: 480,
        cx: 320,
        cy: 240,
        magx: 640 / 1.41421356,
        magy: 640 / 1.41421356,
        nearz: 2.5,
        farz: 1000,
      };

      const mat = buildPerspectiveMatrix(prj);

      expect(mat).toHaveLength(16);
      expect(mat[0]).toBeGreaterThan(0); // Scale X
      expect(mat[5]).toBeGreaterThan(0); // Scale Y
    });

    it("correctly maps depth range", () => {
      const prj: Projection = {
        lx: 640,
        ly: 480,
        cx: 320,
        cy: 240,
        magx: 640 / 1.41421356,
        magy: 640 / 1.41421356,
        nearz: 2.5,
        farz: 1000,
      };

      const mat = buildPerspectiveMatrix(prj);

      expect(mat[10]).toBeCloseTo(1000 / (1000 - 2.5));
      expect(mat[14]).toBeCloseTo((-2.5 * 1000) / (1000 - 2.5));
    });
  });

  describe("buildViewProjMatrix", () => {
    it("combines view and projection matrices", () => {
      const eye: PosAtt = {
        p: vec3(0, 0, 0),
        a: { h: 0, p: 0, b: 0 },
      };
      const prj: Projection = {
        lx: 640,
        ly: 480,
        cx: 320,
        cy: 240,
        magx: 640 / 1.41421356,
        magy: 640 / 1.41421356,
        nearz: 2.5,
        farz: 1000,
      };

      const combined = buildViewProjMatrix(eye, prj);

      expect(combined).toHaveLength(16);
      expect(combined[15]).toBeCloseTo(0); // Last element should be 0 after multiplication
    });
  });
});

describe("Matrix multiplication", () => {
  it("mat4Multiply multiplies identity matrices", () => {
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    const result = mat4Multiply(identity, identity);

    expect(result).toEqual(identity);
  });

  it("mat4Multiply multiplies translation matrices", () => {
    const translateX = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1]);
    const translateY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 10, 0, 1]);

    const result = mat4Multiply(translateX, translateY);

    expect(result[12]).toBeCloseTo(5);
    expect(result[13]).toBeCloseTo(10);
    expect(result[14]).toBeCloseTo(0);
  });

  it("mat4Multiply multiplies scale matrices", () => {
    const scaleX = new Float32Array([2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const scaleY = new Float32Array([1, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    const result = mat4Multiply(scaleX, scaleY);

    expect(result[0]).toBeCloseTo(2);
    expect(result[5]).toBeCloseTo(3);
    expect(result[10]).toBeCloseTo(1);
  });

  it("mat4Multiply is non-commutative", () => {
    const translate = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1]);
    const scale = new Float32Array([2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    const result1 = mat4Multiply(translate, scale);
    const result2 = mat4Multiply(scale, translate);

    expect(result1[12]).not.toBeCloseTo(result2[12]);
  });

  it("mat4Multiply handles complex transformation", () => {
    const matA = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const matB = new Float32Array([17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);

    const result = mat4Multiply(matA, matB);

    expect(result).toHaveLength(16);
    // Check a few elements manually
    expect(result[0]).toBeCloseTo(1 * 17 + 5 * 18 + 9 * 19 + 13 * 20);
    expect(result[5]).toBeCloseTo(2 * 21 + 6 * 22 + 10 * 23 + 14 * 24);
    expect(result[15]).toBeCloseTo(4 * 29 + 8 * 30 + 12 * 31 + 16 * 32);
  });
});

describe("View transform debug", () => {
  it("debugViewTransform transforms point in view space", () => {
    const point: Vec3 = vec3(10, 0, 0);
    const eye: PosAtt = {
      p: vec3(0, 0, 0),
      a: { h: 0, p: 0, b: 0 },
    };

    const transformed = debugViewTransform(point, eye);

    expect(transformed).toHaveProperty("x");
    expect(transformed).toHaveProperty("y");
    expect(transformed).toHaveProperty("z");
    expect(transformed.x).toBeCloseTo(10);
  });

  it("debugViewTransform handles camera rotation", () => {
    const point: Vec3 = vec3(10, 0, 0);
    const eye: PosAtt = {
      p: vec3(0, 0, 0),
      a: { h: 8192, p: 0, b: 0 }, // 45 degrees
    };

    const transformed = debugViewTransform(point, eye);

    // With h=45°, view matrix gives: transformed.x = cos(45°) * 10 + sin(45°) * 0 = 7.07
    expect(transformed.x).toBeCloseTo((10 * Math.SQRT2) / 2, 4);
  });

  it("debugViewTransform handles camera translation", () => {
    const point: Vec3 = vec3(10, 0, 0);
    const eye: PosAtt = {
      p: vec3(5, 0, 0),
      a: { h: 0, p: 0, b: 0 },
    };

    const transformed = debugViewTransform(point, eye);

    // Point should be at x = 10 - 5 = 5 in view space
    expect(transformed.x).toBeCloseTo(5);
  });
});
