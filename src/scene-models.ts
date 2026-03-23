import type { Color, Pc2, Pc2Object, SrfModel, SrfPolygon, SrfVertex, Vec2, Vec3 } from "./types";
import { vec3 } from "./math";

const FAR_LOD = 10000000;

// --- Interfaces ---

export interface RoadMarkingSpec {
  offsetX: number;
  width: number;
  color: Color;
  dashLength: number;
  gapLength: number;
  inset?: number;
}

export interface RoadStyle {
  shoulderColor: Color;
  asphaltColor: Color;
  shoulderWidth: number;
  medianColor?: Color;
  medianWidth?: number;
  medianInset?: number;
  markings: RoadMarkingSpec[];
}

export interface BuildingSpec {
  name: string;
  pos: { p: Vec3; a: { h: number; p: number; b: number } };
  model: SrfModel;
}

// --- Vertex / Polygon Primitives ---

function createVertex(x: number, y: number, z: number): SrfVertex {
  const pos = vec3(x, y, z);
  return { pos, normal: { ...pos }, smoothFlag: 0 };
}

function createPolygon(
  vertexIds: number[],
  normal: Vec3,
  center: Vec3,
  color: Color,
  bright = 0
): SrfPolygon {
  return { backFaceRemove: 1, color, normal, center, vertexIds, bright, nVt: vertexIds.length };
}

function buildBoundingBox(points: Vec3[]): Vec3[] {
  let min = { ...points[0] };
  let max = { ...points[0] };
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.x < min.x) min.x = p.x;
    if (p.y < min.y) min.y = p.y;
    if (p.z < min.z) min.z = p.z;
    if (p.x > max.x) max.x = p.x;
    if (p.y > max.y) max.y = p.y;
    if (p.z > max.z) max.z = p.z;
  }
  return [
    vec3(min.x, min.y, min.z),
    vec3(max.x, min.y, min.z),
    vec3(min.x, max.y, min.z),
    vec3(max.x, max.y, min.z),
    vec3(min.x, min.y, max.z),
    vec3(max.x, min.y, max.z),
    vec3(min.x, max.y, max.z),
    vec3(max.x, max.y, max.z),
  ];
}

// --- SRF Model Builders ---

export function createBoxModel(
  width: number,
  depth: number,
  height: number,
  wallColor: Color,
  roofColor: Color
): SrfModel {
  const hx = width * 0.5;
  const hz = depth * 0.5;
  const vertices: SrfVertex[] = [
    createVertex(-hx, 0, -hz),
    createVertex(hx, 0, -hz),
    createVertex(hx, height, -hz),
    createVertex(-hx, height, -hz),
    createVertex(-hx, 0, hz),
    createVertex(hx, 0, hz),
    createVertex(hx, height, hz),
    createVertex(-hx, height, hz),
  ];
  const polygons: SrfPolygon[] = [
    createPolygon([0, 1, 2, 3], vec3(0, 0, -1), vec3(0, height * 0.5, -hz), wallColor),
    createPolygon([4, 5, 6, 7], vec3(0, 0, 1), vec3(0, height * 0.5, hz), wallColor),
    createPolygon([1, 2, 6, 5], vec3(1, 0, 0), vec3(hx, height * 0.5, 0), wallColor),
    createPolygon([3, 0, 4, 7], vec3(-1, 0, 0), vec3(-hx, height * 0.5, 0), wallColor),
    createPolygon([2, 3, 7, 6], vec3(0, 1, 0), vec3(0, height, 0), roofColor),
  ];
  return {
    bbox: buildBoundingBox(vertices.map((v) => v.pos)),
    nv: vertices.length,
    vertices,
    np: polygons.length,
    polygons,
  };
}

export function createWindowedBoxModel(
  width: number,
  depth: number,
  height: number,
  wallColor: Color,
  roofColor: Color,
  windowColor: Color,
  windowCount = 6,
  windowWidth = 5,
  windowHeight = 3.5,
  gapHeight = 3.0
): SrfModel {
  const hx = width * 0.5;
  const hz = depth * 0.5;
  const vertices: SrfVertex[] = [
    createVertex(-hx, 0, -hz),
    createVertex(hx, 0, -hz),
    createVertex(hx, height, -hz),
    createVertex(-hx, height, -hz),
    createVertex(-hx, 0, hz),
    createVertex(hx, 0, hz),
    createVertex(hx, height, hz),
    createVertex(-hx, height, hz),
  ];
  const polygons: SrfPolygon[] = [
    createPolygon([0, 1, 2, 3], vec3(0, 0, -1), vec3(0, height * 0.5, -hz), wallColor),
    createPolygon([4, 5, 6, 7], vec3(0, 0, 1), vec3(0, height * 0.5, hz), wallColor),
    createPolygon([1, 2, 6, 5], vec3(1, 0, 0), vec3(hx, height * 0.5, 0), wallColor),
    createPolygon([3, 0, 4, 7], vec3(-1, 0, 0), vec3(-hx, height * 0.5, 0), wallColor),
    createPolygon([2, 3, 7, 6], vec3(0, 1, 0), vec3(0, height, 0), roofColor),
  ];

  const step = windowHeight + gapHeight;
  const windowGapX = 3.5;
  let vi = vertices.length;

  const addWindow = (
    y0: number,
    y1: number,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    normal: Vec3,
    center: Vec3
  ) => {
    const idx = vi;
    vertices.push(createVertex(x0, y0, z0));
    vertices.push(createVertex(x1, y0, z1));
    vertices.push(createVertex(x1, y1, z1));
    vertices.push(createVertex(x0, y1, z0));
    polygons.push(createPolygon([idx, idx + 1, idx + 2, idx + 3], normal, center, windowColor, 2));
    vi += 4;
  };

  for (let i = 0; i < windowCount; i++) {
    const y0 = gapHeight + i * step;
    const y1 = y0 + windowHeight;
    if (y1 > height - gapHeight) break;

    // Calculate columns for Z axis (front and back faces)
    const maxColsZ = Math.max(2, Math.floor(width / (windowWidth + windowGapX)));
    const colsZ = maxColsZ >= 2 ? maxColsZ : 2;
    const actualGapZ = colsZ >= 2 ? Math.max(0, (width - colsZ * windowWidth) / (colsZ + 1)) : 0;
    const spacingZ = windowWidth + actualGapZ;
    for (let col = 0; col < colsZ; col++) {
      const x0 = -width * 0.5 + actualGapZ + col * spacingZ;
      const x1 = x0 + windowWidth;
      addWindow(y0, y1, x0, x1, hz, hz, vec3(0, 0, 1), vec3((x0 + x1) * 0.5, (y0 + y1) * 0.5, hz));
    }

    for (let col = 0; col < colsZ; col++) {
      const x0 = -width * 0.5 + actualGapZ + col * spacingZ;
      const x1 = x0 + windowWidth;
      addWindow(
        y0,
        y1,
        x0,
        x1,
        -hz,
        -hz,
        vec3(0, 0, -1),
        vec3((x0 + x1) * 0.5, (y0 + y1) * 0.5, -hz)
      );
    }

    // Calculate columns for X axis (left and right faces)
    const maxColsX = Math.max(2, Math.floor(depth / (windowWidth + windowGapX)));
    const colsX = maxColsX >= 2 ? maxColsX : 2;
    const actualGapX = colsX >= 2 ? Math.max(0, (depth - colsX * windowWidth) / (colsX + 1)) : 0;
    const spacingX = windowWidth + actualGapX;
    for (let col = 0; col < colsX; col++) {
      const z0 = -depth * 0.5 + actualGapX + col * spacingX;
      const z1 = z0 + windowWidth;
      addWindow(y0, y1, hx, hx, z0, z1, vec3(1, 0, 0), vec3(hx, (y0 + y1) * 0.5, (z0 + z1) * 0.5));
    }

    for (let col = 0; col < colsX; col++) {
      const z0 = -depth * 0.5 + actualGapX + col * spacingX;
      const z1 = z0 + windowWidth;
      addWindow(
        y0,
        y1,
        -hx,
        -hx,
        z0,
        z1,
        vec3(-1, 0, 0),
        vec3(-hx, (y0 + y1) * 0.5, (z0 + z1) * 0.5)
      );
    }
  }

  return {
    bbox: buildBoundingBox(vertices.map((v) => v.pos)),
    nv: vertices.length,
    vertices,
    np: polygons.length,
    polygons,
  };
}

export function createLightPoleModel(
  height: number,
  lampColor: Color,
  poleColor: Color,
  bright = 2
): SrfModel {
  const ph = 0.9;
  const lh = 2.2;
  const lb = height - 3;
  const baseW = 4;
  const baseH = 1;
  const vertices: SrfVertex[] = [
    // Pole base (on ground)
    createVertex(-baseW, 0, -baseW),
    createVertex(baseW, 0, -baseW),
    createVertex(baseW, baseH, -baseW),
    createVertex(-baseW, baseH, -baseW),
    createVertex(-baseW, 0, baseW),
    createVertex(baseW, 0, baseW),
    createVertex(baseW, baseH, baseW),
    createVertex(-baseW, baseH, baseW),
    // Pole
    createVertex(-ph, baseH, -ph),
    createVertex(ph, baseH, -ph),
    createVertex(ph, height, -ph),
    createVertex(-ph, height, -ph),
    createVertex(-ph, baseH, ph),
    createVertex(ph, baseH, ph),
    createVertex(ph, height, ph),
    createVertex(-ph, height, ph),
    // Lamp
    createVertex(-lh, lb, -lh),
    createVertex(lh, lb, -lh),
    createVertex(lh, height + 1.2, -lh),
    createVertex(-lh, height + 1.2, -lh),
    createVertex(-lh, lb, lh),
    createVertex(lh, lb, lh),
    createVertex(lh, height + 1.2, lh),
    createVertex(-lh, height + 1.2, lh),
  ];
  const polygons: SrfPolygon[] = [
    // Base plate
    createPolygon([0, 1, 2, 3], vec3(0, 0, -1), vec3(0, baseH * 0.5, -baseW), poleColor),
    createPolygon([4, 5, 6, 7], vec3(0, 0, 1), vec3(0, baseH * 0.5, baseW), poleColor),
    createPolygon([1, 5, 6, 2], vec3(1, 0, 0), vec3(baseW, baseH * 0.5, 0), poleColor),
    createPolygon([0, 3, 7, 4], vec3(-1, 0, 0), vec3(-baseW, baseH * 0.5, 0), poleColor),
    createPolygon([3, 2, 6, 7], vec3(0, 1, 0), vec3(0, baseH, 0), poleColor),
    // Pole
    createPolygon([8, 9, 10, 11], vec3(0, 0, -1), vec3(0, (baseH + height) * 0.5, -ph), poleColor),
    createPolygon([12, 13, 14, 15], vec3(0, 0, 1), vec3(0, (baseH + height) * 0.5, ph), poleColor),
    createPolygon([9, 13, 14, 10], vec3(1, 0, 0), vec3(ph, (baseH + height) * 0.5, 0), poleColor),
    createPolygon([8, 11, 15, 12], vec3(-1, 0, 0), vec3(-ph, (baseH + height) * 0.5, 0), poleColor),
    // Lamp
    createPolygon([16, 17, 18, 19], vec3(0, 0, -1), vec3(0, height - 1.4, -lh), lampColor, bright),
    createPolygon([20, 21, 22, 23], vec3(0, 0, 1), vec3(0, height - 1.4, lh), lampColor, bright),
    createPolygon([17, 21, 22, 18], vec3(1, 0, 0), vec3(lh, height - 1.4, 0), lampColor, bright),
    createPolygon([16, 19, 23, 20], vec3(-1, 0, 0), vec3(-lh, height - 1.4, 0), lampColor, bright),
    createPolygon([19, 18, 22, 23], vec3(0, 1, 0), vec3(0, height + 1.2, 0), lampColor, bright),
  ];
  return {
    bbox: buildBoundingBox(vertices.map((v) => v.pos)),
    nv: vertices.length,
    vertices,
    np: polygons.length,
    polygons,
  };
}

// --- PC2 Geometry Builders ---

export function rotatePoint(point: Vec2, heading: number): Vec2 {
  const r = (heading * Math.PI) / 32768.0;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: c * point.x - s * point.y, y: s * point.x + c * point.y };
}

function averagePoint2(vertices: Vec2[]): Vec2 {
  if (vertices.length === 0) return { x: 0, y: 0 };
  let sx = 0,
    sy = 0;
  for (const v of vertices) {
    sx += v.x;
    sy += v.y;
  }
  return { x: sx / vertices.length, y: sy / vertices.length };
}

export function createRectangleObject(
  color: Color,
  centerX: number,
  centerY: number,
  width: number,
  length: number,
  heading: number
): Pc2Object {
  const vertices = [
    rotatePoint({ x: -width * 0.5, y: length * 0.5 }, heading),
    rotatePoint({ x: -width * 0.5, y: -length * 0.5 }, heading),
    rotatePoint({ x: width * 0.5, y: -length * 0.5 }, heading),
    rotatePoint({ x: width * 0.5, y: length * 0.5 }, heading),
  ].map((p) => ({ x: centerX + p.x, y: centerY + p.y }));
  return { type: "PLG", color, visiDist: FAR_LOD, vertices, center: { x: centerX, y: centerY } };
}

function createOffsetRectangleObject(
  color: Color,
  cx: number,
  cy: number,
  w: number,
  l: number,
  h: number,
  ox: number,
  oy: number
): Pc2Object {
  const o = rotatePoint({ x: ox, y: oy }, h);
  return createRectangleObject(color, cx + o.x, cy + o.y, w, l, h);
}

export function createPolylineObject(color: Color, vertices: Vec2[]): Pc2Object {
  return { type: "PLL", color, visiDist: FAR_LOD, vertices, center: averagePoint2(vertices) };
}

export function createRoadSegmentObjects(
  cx: number,
  cy: number,
  width: number,
  length: number,
  heading: number,
  style: RoadStyle
): Pc2Object[] {
  const objects: Pc2Object[] = [];
  if (style.shoulderWidth > 0) {
    objects.push(
      createRectangleObject(
        style.shoulderColor,
        cx,
        cy,
        width + style.shoulderWidth * 2,
        length,
        heading
      )
    );
  }
  objects.push(createRectangleObject(style.asphaltColor, cx, cy, width, length, heading));
  if (style.medianColor && style.medianWidth && style.medianWidth > 0) {
    const mi = style.medianInset ?? 18;
    objects.push(
      createRectangleObject(
        style.medianColor,
        cx,
        cy,
        style.medianWidth,
        Math.max(16, length - mi * 2),
        heading
      )
    );
  }
  for (const m of style.markings) {
    const inset = m.inset ?? 10;
    if (m.gapLength <= 0 || m.dashLength <= 0) {
      objects.push(
        createOffsetRectangleObject(
          m.color,
          cx,
          cy,
          m.width,
          Math.max(8, length - inset * 2),
          heading,
          m.offsetX,
          0
        )
      );
      continue;
    }
    const step = m.dashLength + m.gapLength;
    const half = Math.max(0, length * 0.5 - inset - m.dashLength * 0.5);
    for (let y = -half; y <= half + 0.001; y += step) {
      objects.push(
        createOffsetRectangleObject(m.color, cx, cy, m.width, m.dashLength, heading, m.offsetX, y)
      );
    }
  }
  return objects;
}

export function createCrosswalkObject(centerX: number, centerY: number, color: Color): Pc2Object {
  const objects = [
    createRectangleObject(color, centerX - 16, centerY, 6, 22, 0),
    createRectangleObject(color, centerX - 6, centerY, 6, 22, 0),
    createRectangleObject(color, centerX + 6, centerY, 6, 22, 0),
    createRectangleObject(color, centerX + 16, centerY, 6, 22, 0),
  ];
  const vertices: Vec2[] = [];
  for (const o of objects) vertices.push(...o.vertices);
  return { type: "PST", color, visiDist: FAR_LOD, vertices, center: averagePoint2(vertices) };
}

export function createParkingPadObjects(
  cx: number,
  cy: number,
  count: number,
  spacing: number,
  pw: number,
  pl: number,
  pc: Color,
  lc: Color
): Pc2Object[] {
  const objects: Pc2Object[] = [];
  const start = -((count - 1) * spacing * 0.5);
  for (let i = 0; i < count; i++) {
    const y = cy + start + i * spacing;
    objects.push(
      createRectangleObject(pc, cx, y, pw, pl, 16384),
      createRectangleObject(lc, cx, y - pl * 0.5 + 8, pw - 8, 2, 16384),
      createRectangleObject(lc, cx, y + pl * 0.5 - 8, pw - 8, 2, 16384)
    );
  }
  return objects;
}

export function createPc2(objects: Pc2Object[]): Pc2 {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const obj of objects) {
    for (const v of obj.vertices) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY }, objects };
}

export function buildMidpoints(values: number[]): number[] {
  const mids: number[] = [];
  for (let i = 0; i < values.length - 1; i++) mids.push((values[i] + values[i + 1]) * 0.5);
  return mids;
}
