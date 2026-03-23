import { describe, it, expect } from "vitest";
import type { PosAtt } from "./types";
import {
  initSmokeClass,
  initSmokeInstance,
  clearSmokeInstance,
  beginAppendSmokeNode,
  appendSmokeNode,
  endAppendSmokeNode,
  drawSmoke,
} from "./smoke";
import { ARS_RIBBONSMOKE, ARS_TRAILSMOKE, ARS_WIRESMOKE, ARS_SOLIDSMOKE } from "./types";
import { vec3 } from "./math";

describe("Smoke System", () => {
  describe("Initialization", () => {
    it("initSmokeClass creates proper smoke class", () => {
      const sw = ARS_RIBBONSMOKE | ARS_SOLIDSMOKE;
      const smokeClass = initSmokeClass(sw);

      expect(smokeClass.sw).toBe(sw);
      expect(smokeClass.stp).toEqual([1, 2, 4]);
      expect(smokeClass.bbx.length).toBe(3);
      expect(smokeClass.rbn.iniw).toBe(1);
      expect(smokeClass.rbn.maxw).toBe(1);
      expect(smokeClass.rbn.dw).toBe(0);
      expect(smokeClass.rbn.inic.r).toBe(1);
      expect(smokeClass.rbn.endc.r).toBe(1);
      expect(smokeClass.rbn.tc).toBe(0);
      expect(smokeClass.wir).toEqual(smokeClass.rbn);
      expect(smokeClass.trl).toEqual(smokeClass.rbn);
      expect(smokeClass.sld).toEqual(smokeClass.rbn);
    });

    it("initSmokeInstance creates proper smoke instance", () => {
      const nMax = 100;
      const nDel = 10;
      const smokeInst = initSmokeInstance(nMax, nDel);

      expect(smokeInst.nMax).toBe(nMax);
      expect(smokeInst.nDel).toBe(nDel);
      expect(smokeInst.nPth).toBe(0);
      expect(smokeInst.nTip).toBe(0);
      expect(smokeInst.tip.length).toBe(2 * 8); // ARS_MAX_TIP_PER_INST * 2
      expect(smokeInst.pth.length).toBe(0);
    });

    it("clearSmokeInstance resets instance", () => {
      const smokeInst = initSmokeInstance(100, 10);
      smokeInst.nPth = 5;
      smokeInst.nTip = 2;
      smokeInst.pth = [
        {
          axs: {
            p: { x: 0, y: 0, z: 0 },
            a: { h: 0, p: 0, b: 0 },
            t: { sinh: 0, cosh: 0, sinp: 0, cosp: 0, sinb: 0, cosb: 0 },
          },
          left: { x: 0, y: 0, z: 0 },
          up: { x: 0, y: 0, z: 0 },
          t: 0,
        },
        {
          axs: {
            p: { x: 1, y: 0, z: 0 },
            a: { h: 0, p: 0, b: 0 },
            t: { sinh: 0, cosh: 0, sinp: 0, cosp: 0, sinb: 0, cosb: 0 },
          },
          left: { x: 0, y: 0, z: 0 },
          up: { x: 0, y: 0, z: 0 },
          t: 0,
        },
        {
          axs: {
            p: { x: 2, y: 0, z: 0 },
            a: { h: 0, p: 0, b: 0 },
            t: { sinh: 0, cosh: 0, sinp: 0, cosp: 0, sinb: 0, cosb: 0 },
          },
          left: { x: 0, y: 0, z: 0 },
          up: { x: 0, y: 0, z: 0 },
          t: 0,
        },
        {
          axs: {
            p: { x: 3, y: 0, z: 0 },
            a: { h: 0, p: 0, b: 0 },
            t: { sinh: 0, cosh: 0, sinp: 0, cosp: 0, sinb: 0, cosb: 0 },
          },
          left: { x: 0, y: 0, z: 0 },
          up: { x: 0, y: 0, z: 0 },
          t: 0,
        },
        {
          axs: {
            p: { x: 4, y: 0, z: 0 },
            a: { h: 0, p: 0, b: 0 },
            t: { sinh: 0, cosh: 0, sinp: 0, cosp: 0, sinb: 0, cosb: 0 },
          },
          left: { x: 0, y: 0, z: 0 },
          up: { x: 0, y: 0, z: 0 },
          t: 0,
        },
      ];

      clearSmokeInstance(smokeInst);

      expect(smokeInst.nPth).toBe(0);
      expect(smokeInst.nTip).toBe(0);
      expect(smokeInst.pth.length).toBe(0);
    });
  });

  describe("Node Management", () => {
    it("beginAppendSmokeNode sets up tip tracking", () => {
      const smokeInst = initSmokeInstance(100, 10);
      smokeInst.nPth = 10;

      beginAppendSmokeNode(smokeInst);

      expect(smokeInst.tip[0]).toBe(10);
      expect(smokeInst.tip[1]).toBe(10);
      expect(smokeInst.nTip).toBe(1);
    });

    it("beginAppendSmokeNode handles overflow", () => {
      const smokeInst = initSmokeInstance(100, 10);
      // Fill up the tip array (ARS_MAX_TIP_PER_INST = 8)
      for (let i = 0; i < 8; i++) {
        smokeInst.tip[i * 2] = i;
        smokeInst.tip[i * 2 + 1] = i;
      }
      smokeInst.nTip = 8;
      smokeInst.nPth = 50;

      beginAppendSmokeNode(smokeInst);

      // Should have shifted tips
      expect(smokeInst.nTip).toBe(8); // Still at max
      expect(smokeInst.tip[0]).toBe(1); // Shifted: tip[0] gets old tip[2] which was 1
      expect(smokeInst.tip[1]).toBe(1);
      expect(smokeInst.tip[14]).toBe(50); // New tip (index 7*2 = 14)
      expect(smokeInst.tip[15]).toBe(50);
    });

    it("appendSmokeNode adds node to path", () => {
      const smokeInst = initSmokeInstance(100, 10);
      const pos: PosAtt = {
        p: vec3(10, 20, 30),
        a: { h: 0, p: 0, b: 0 },
      };

      beginAppendSmokeNode(smokeInst);
      appendSmokeNode(smokeInst, pos, 1000);
      endAppendSmokeNode(smokeInst);

      expect(smokeInst.nPth).toBe(1);
      expect(smokeInst.pth.length).toBe(1);
      const node = smokeInst.pth[0];
      expect(node.axs.p.x).toBe(10);
      expect(node.axs.p.y).toBe(20);
      expect(node.axs.p.z).toBe(30);
      expect(node.t).toBe(1000);
    });

    it("appendSmokeNode handles overflow by deleting old nodes", () => {
      const smokeInst = initSmokeInstance(5, 2); // Small buffer for testing

      // Fill up the path with increasing x values
      for (let i = 0; i < 5; i++) {
        const pos: PosAtt = { p: vec3(i * 10, 0, 0), a: { h: 0, p: 0, b: 0 } };
        beginAppendSmokeNode(smokeInst);
        appendSmokeNode(smokeInst, pos, i * 100);
        endAppendSmokeNode(smokeInst);
      }

      // Add one more - should trigger overflow handling
      const pos2: PosAtt = { p: vec3(50, 0, 0), a: { h: 0, p: 0, b: 0 } };
      beginAppendSmokeNode(smokeInst);
      appendSmokeNode(smokeInst, pos2, 500);
      endAppendSmokeNode(smokeInst);

      // Add another
      const pos3: PosAtt = { p: vec3(60, 0, 0), a: { h: 0, p: 0, b: 0 } };
      beginAppendSmokeNode(smokeInst);
      appendSmokeNode(smokeInst, pos3, 600);
      endAppendSmokeNode(smokeInst);

      // Should have 5 nodes: [200, 300, 400, 500, 600]
      // (removed 2 oldest with x=0 and x=10, added 2 new with x=50 and x=60)
      expect(smokeInst.pth.length).toBe(5);
      expect(smokeInst.nPth).toBe(5);
      // First node should now be the third original (index 2, which had x=20)
      expect(smokeInst.pth[0].axs.p.x).toBe(20);
      expect(smokeInst.pth[0].t).toBe(200);
    });

    it("endAppendSmokeNode finalizes tip tracking", () => {
      const smokeInst = initSmokeInstance(100, 10);
      const pos: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };

      beginAppendSmokeNode(smokeInst);
      appendSmokeNode(smokeInst, pos, 1000);
      appendSmokeNode(smokeInst, pos, 1100); // Second node
      endAppendSmokeNode(smokeInst);

      expect(smokeInst.tip[0]).toBe(0); // Start index of the tip
      expect(smokeInst.tip[1]).toBe(1); // End index of the tip (nPth-1)
      expect(smokeInst.nTip).toBe(1);
    });
  });

  describe("Geometry Generation", () => {
    it("drawSmoke returns empty geometry for no tips", () => {
      const smokeClass = initSmokeClass(ARS_RIBBONSMOKE);
      const smokeInst = initSmokeInstance(100, 10);
      const eye: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };

      const result = drawSmoke(smokeClass, smokeInst, 0, eye);

      expect(result.lit.length).toBe(0);
      expect(result.lines.length).toBe(0);
    });

    it("drawSmoke generates ribbon smoke geometry", () => {
      // Use default smoke class values: t0=0, t1=1 (smoke lives 1 time unit)
      const smokeClass = initSmokeClass(ARS_RIBBONSMOKE);
      smokeClass.rbn.iniw = 10; // Width 10
      smokeClass.rbn.maxw = 10;
      smokeClass.rbn.dw = 0;

      const smokeInst = initSmokeInstance(100, 10);
      const eye: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };

      // Add two nodes very close in time and space
      // ctim = 50, node times = 49 and 50
      // Ages: 50-49=1 and 50-50=0, both within [0, 1]
      beginAppendSmokeNode(smokeInst);
      appendSmokeNode(smokeInst, { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } }, 49); // time 49
      appendSmokeNode(smokeInst, { p: vec3(10, 0, 0), a: { h: 0, p: 0, b: 0 } }, 50); // time 50
      endAppendSmokeNode(smokeInst);

      const result = drawSmoke(smokeClass, smokeInst, 50, eye);

      // Debug: let's see what we got
      console.log(
        `Smoke inst: nTip=${smokeInst.nTip}, nPth=${smokeInst.nPth}, pth length=${smokeInst.pth.length}`
      );
      console.log(`Result: lit length=${result.lit.length}, lines length=${result.lines.length}`);

      // Should have generated some lit vertices (triangles)
      expect(result.lit.length).toBeGreaterThan(0);
      // Should be multiple of 13 (lit stride)
      expect(result.lit.length % 13).toBe(0);
      // Ribbon smoke should NOT generate line vertices
      expect(result.lines.length).toBe(0);
    });

    it("drawSmoke respects smoke attribute time ranges", () => {
      const smokeClass = initSmokeClass(ARS_RIBBONSMOKE);
      smokeClass.rbn.iniw = 10;
      smokeClass.rbn.maxw = 10;
      smokeClass.rbn.dw = 0;
      smokeClass.rbn.t0 = 50; // Minimum age: 50ms
      smokeClass.rbn.t1 = 150; // Maximum age: 150ms
      smokeClass.rbn.inic = { r: 1, g: 0, b: 0 }; // Red start
      smokeClass.rbn.endc = { r: 0, g: 0, b: 1 }; // Blue end
      smokeClass.rbn.tc = 500;

      const smokeInst = initSmokeInstance(100, 10);
      const eye: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };

      // Create smoke nodes with times that will be in range when ctim=200
      // For ctim=200, we want node times where: 200 - t is in [50, 150] => t in [50, 150]
      beginAppendSmokeNode(smokeInst);
      appendSmokeNode(smokeInst, { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } }, 50); // t=50 (age 150, should be blue-ish)
      appendSmokeNode(smokeInst, { p: vec3(0, 10, 0), a: { h: 0, p: 0, b: 0 } }, 100); // t=100 (age 100, should be purple-ish)
      appendSmokeNode(smokeInst, { p: vec3(0, 20, 0), a: { h: 0, p: 0, b: 0 } }, 150); // t=150 (age 50, should be red-ish)
      endAppendSmokeNode(smokeInst);

      const result = drawSmoke(smokeClass, smokeInst, 200, eye);

      // Should have generated some lit vertices (triangles)
      expect(result.lit.length).toBeGreaterThan(0);
    });

    it("drawSmoke handles different smoke types", () => {
      const eye: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
      const smokeInst = initSmokeInstance(100, 10);

      // Setup nodes with times that will be in range when ctim=50
      // For ctim=50, we want node times where: 50 - t is in [0, 100] => t in [-50, 50]
      // Since we can't have negative times, we'll use [0, 50]
      beginAppendSmokeNode(smokeInst);
      appendSmokeNode(smokeInst, { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } }, 0); // t=0
      appendSmokeNode(smokeInst, { p: vec3(0, 10, 0), a: { h: 0, p: 0, b: 0 } }, 30); // t=30
      endAppendSmokeNode(smokeInst);

      // Test ribbon smoke
      const ribbonClass = initSmokeClass(ARS_RIBBONSMOKE);
      ribbonClass.rbn.iniw = 5;
      ribbonClass.rbn.maxw = 5;
      ribbonClass.rbn.t0 = 0; // Valid from t=0
      ribbonClass.rbn.t1 = 100; // Valid until t=100
      let result = drawSmoke(ribbonClass, smokeInst, 50, eye);
      expect(result.lit.length).toBeGreaterThan(0);

      // Test trail smoke
      const trailClass = initSmokeClass(ARS_TRAILSMOKE);
      trailClass.trl.iniw = 5;
      trailClass.trl.maxw = 5;
      trailClass.trl.t0 = 0;
      trailClass.trl.t1 = 100;
      result = drawSmoke(trailClass, smokeInst, 50, eye);
      expect(result.lines.length).toBeGreaterThan(0);

      // Test wire smoke
      const wireClass = initSmokeClass(ARS_WIRESMOKE);
      wireClass.wir.iniw = 5;
      wireClass.wir.maxw = 5;
      wireClass.wir.t0 = 0;
      wireClass.wir.t1 = 100;
      result = drawSmoke(wireClass, smokeInst, 50, eye);
      expect(result.lines.length).toBeGreaterThan(0);

      // Test solid smoke
      const solidClass = initSmokeClass(ARS_SOLIDSMOKE);
      solidClass.sld.iniw = 5;
      solidClass.sld.maxw = 5;
      solidClass.sld.t0 = 0;
      solidClass.sld.t1 = 100;
      result = drawSmoke(solidClass, smokeInst, 50, eye);
      expect(result.lit.length).toBeGreaterThan(0);
    });
  });
});
