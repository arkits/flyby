import { describe, expect, it } from "vitest";

import { enhanceFieldForMap } from "./airport-enhancement";
import { colorFromRGB, vec3 } from "./math";
import type { Field, FieldPc2, Pc2 } from "./types";

function createPc2WithColor(r: number, g: number, b: number): Pc2 {
  return {
    min: { x: -1, y: -1 },
    max: { x: 1, y: 1 },
    objects: [
      {
        type: "PLG",
        color: colorFromRGB(r, g, b),
        visiDist: 1000,
        vertices: [
          { x: -1, y: -1 },
          { x: -1, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: -1 },
        ],
        center: { x: 0, y: 0 },
      },
    ],
  };
}

function createPc2Entry(fn: string, r: number, g: number, b: number): FieldPc2 {
  return {
    fn,
    lodDist: 1000,
    pos: { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } },
    pc2: createPc2WithColor(r, g, b),
  };
}

describe("enhanceFieldForMap", () => {
  it("dims runway paint only for airport-night source runway overlays", () => {
    const white = colorFromRGB(255, 255, 255);
    const field: Field = {
      sky: colorFromRGB(0, 128, 255),
      gnd: colorFromRGB(128, 128, 0),
      srf: [],
      ter: [],
      pc2: [
        createPc2Entry("runway.pc2", 255, 255, 255),
        createPc2Entry("signal.pc2", 255, 255, 255),
      ],
      plt: [],
      rgn: [],
      fld: [],
    };

    const enhanced = enhanceFieldForMap(field, "airport.fld", "airport-night");
    const runwayEntries = enhanced.pc2.filter((entry) => entry.fn === "runway.pc2");
    const signalEntry = enhanced.pc2.find((entry) => entry.fn === "signal.pc2");

    expect(runwayEntries).toHaveLength(1);
    expect(runwayEntries[0].pc2.objects[0].color.r).toBeLessThan(0.5);
    expect(runwayEntries[0].pc2.objects[0].color.g).toBeLessThan(0.52);
    expect(runwayEntries[0].pc2.objects[0].color.b).toBeLessThan(0.56);
    expect(signalEntry?.pc2.objects[0].color).toEqual(white);
  });

  it("adds multicolor runway and horizon lighting for airport-night", () => {
    const field: Field = {
      sky: colorFromRGB(0, 128, 255),
      gnd: colorFromRGB(128, 128, 0),
      srf: [],
      ter: [],
      pc2: [],
      plt: [],
      rgn: [],
      fld: [],
    };

    const enhanced = enhanceFieldForMap(field, "airport.fld", "airport-night");
    const nightOverlay = enhanced.pc2.find((entry) =>
      entry.fn.includes("__browser_airport_night_augmented__")
    );

    expect(nightOverlay).toBeDefined();
    expect(nightOverlay?.pc2.objects.some((obj) => obj.color.g > 0.78 && obj.color.r < 0.4)).toBe(
      true
    );
    expect(nightOverlay?.pc2.objects.some((obj) => obj.color.r > 0.78 && obj.color.g < 0.45)).toBe(
      true
    );
    expect(nightOverlay?.pc2.objects.some((obj) => obj.color.b > 0.78 && obj.color.g > 0.45)).toBe(
      true
    );
    expect(nightOverlay!.pc2.objects.length).toBeGreaterThan(700);
  });
});
