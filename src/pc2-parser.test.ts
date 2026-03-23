import { describe, it, expect } from "vitest";
import { parsePc2Text } from "./pc2-parser";

describe("parsePc2Text", () => {
  it("parses minimal valid PC2", () => {
    const text = `
      PICT2
      PLG
      COL 255 128 64
      VER 0 0
      VER 1 0
      VER 0 1
      ENDO
      ENDPICT
    `;

    const pc2 = parsePc2Text(text);

    expect(pc2).toHaveProperty("min");
    expect(pc2).toHaveProperty("max");
    expect(pc2).toHaveProperty("objects");
    expect(pc2.objects.length).toBe(1);
    expect(pc2.objects[0].type).toBe("PLG");
    expect(pc2.objects[0].color.r).toBeCloseTo(1);
    expect(pc2.objects[0].color.g).toBeCloseTo(128 / 255);
    expect(pc2.objects[0].color.b).toBeCloseTo(64 / 255);
    expect(pc2.objects[0].vertices.length).toBe(3);
  });

  it("parses multiple objects", () => {
    const text = `
      PICT2
      PLG
      COL 255 0 0
      VER 0 0
      VER 1 0
      VER 0 1
      ENDO
      PLL
      COL 0 255 0
      VER 1 1
      VER 2 1
      VER 2 2
      ENDO
      ENDPICT
    `;

    const pc2 = parsePc2Text(text);

    expect(pc2.objects.length).toBe(2);
    expect(pc2.objects[0].type).toBe("PLG");
    expect(pc2.objects[1].type).toBe("PLL");
  });

  it("parses PST object type", () => {
    const text = `
      PICT2
      PST
      COL 255 255 255
      VER 0 0
      ENDO
      ENDPICT
    `;

    const pc2 = parsePc2Text(text);

    expect(pc2.objects[0].type).toBe("PST");
  });

  it("parses LSQ object type", () => {
    const text = `
      PICT2
      LSQ
      COL 255 255 255
      VER 0 0
      VER 1 0
      VER 1 1
      VER 0 1
      ENDO
      ENDPICT
    `;

    const pc2 = parsePc2Text(text);

    expect(pc2.objects[0].type).toBe("LSQ");
  });

  it("parses visibility distance", () => {
    const text = `
      PICT2
      PLG
      COL 255 255 255
      DST 1000
      VER 0 0
      VER 1 0
      VER 0 1
      ENDO
      ENDPICT
    `;

    const pc2 = parsePc2Text(text);

    expect(pc2.objects[0].visiDist).toBe(1000);
  });

  it("uses default visibility distance when not specified", () => {
    const text = `
      PICT2
      PLG
      COL 255 255 255
      VER 0 0
      VER 1 0
      VER 0 1
      ENDO
      ENDPICT
    `;

    const pc2 = parsePc2Text(text);

    expect(pc2.objects[0].visiDist).toBe(8000000.0);
  });

  it("computes bounding box correctly", () => {
    const text = `
      PICT2
      PLG
      COL 255 255 255
      VER -10 -20
      VER 30 40
      VER 0 10
      ENDO
      ENDPICT
    `;

    const pc2 = parsePc2Text(text);

    expect(pc2.min.x).toBe(-10);
    expect(pc2.min.y).toBe(-20);
    expect(pc2.max.x).toBe(30);
    expect(pc2.max.y).toBe(40);
  });

  it("computes vertex center correctly", () => {
    const text = `
      PICT2
      PLG
      COL 255 255 255
      VER 0 0
      VER 2 0
      VER 0 2
      ENDO
      ENDPICT
    `;

    const pc2 = parsePc2Text(text);

    expect(pc2.objects[0].center.x).toBeCloseTo(2 / 3);
    expect(pc2.objects[0].center.y).toBeCloseTo(2 / 3);
  });

  it("handles empty object", () => {
    const text = `
      PICT2
      PLG
      COL 255 255 255
      ENDO
      ENDPICT
    `;

    const pc2 = parsePc2Text(text);

    expect(pc2.objects[0].vertices.length).toBe(0);
    expect(pc2.objects[0].center.x).toBe(0);
    expect(pc2.objects[0].center.y).toBe(0);
  });

  it("ignores comments and empty lines", () => {
    const text = `
      # This is a comment
      PICT2

      # Another comment
      PLG
      COL 255 255 255
      VER 0 0
      ENDO
      ENDPICT
    `;

    const pc2 = parsePc2Text(text);

    expect(pc2.objects.length).toBe(1);
  });

  it("handles case-insensitive commands", () => {
    const text = `
      pict2
      plg
      col 255 255 255
      ver 0 0
      ver 1 0
      endo
      endpict
    `;

    const pc2 = parsePc2Text(text);

    expect(pc2.objects.length).toBe(1);
    expect(pc2.objects[0].vertices.length).toBe(2);
  });

  it("throws error for missing PICT2 header", () => {
    const text = `
      PLG
      COL 255 255 255
      VER 0 0
      ENDO
      ENDPICT
    `;

    expect(() => parsePc2Text(text)).toThrow("Invalid PC2: missing Pict2 header");
  });

  it("handles multiple vertices", () => {
    const text = `
      PICT2
      PLG
      COL 255 255 255
      VER 0 0
      VER 1 0
      VER 1 1
      VER 0 1
      VER 0.5 0.5
      ENDO
      ENDPICT
    `;

    const pc2 = parsePc2Text(text);

    expect(pc2.objects[0].vertices.length).toBe(5);
  });

  it("updates bounding box across multiple objects", () => {
    const text = `
      PICT2
      PLG
      COL 255 255 255
      VER 0 0
      VER 10 0
      ENDO
      PLL
      COL 255 255 255
      VER -5 -5
      VER -5 5
      ENDO
      ENDPICT
    `;

    const pc2 = parsePc2Text(text);

    expect(pc2.min.x).toBe(-5);
    expect(pc2.min.y).toBe(-5);
    expect(pc2.max.x).toBe(10);
    expect(pc2.max.y).toBe(5);
  });

  it("handles negative coordinates", () => {
    const text = `
      PICT2
      PLG
      COL 255 255 255
      VER -100 -200
      VER 50 -150
      ENDO
      ENDPICT
    `;

    const pc2 = parsePc2Text(text);

    expect(pc2.min.x).toBe(-100);
    expect(pc2.min.y).toBe(-200);
    expect(pc2.max.x).toBe(50);
    expect(pc2.max.y).toBe(-150);
  });

  it("handles floating point coordinates", () => {
    const text = `
      PICT2
      PLG
      COL 255 255 255
      VER 0.5 1.25
      VER 2.75 3.125
      ENDO
      ENDPICT
    `;

    const pc2 = parsePc2Text(text);

    expect(pc2.objects[0].vertices[0].x).toBe(0.5);
    expect(pc2.objects[0].vertices[0].y).toBe(1.25);
    expect(pc2.objects[0].vertices[1].x).toBe(2.75);
    expect(pc2.objects[0].vertices[1].y).toBe(3.125);
  });
});
