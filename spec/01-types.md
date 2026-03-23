# Types — Data Structure Specification

All data structures ported from `impulse.h` (lines 66-313) and `ASMOKE.H`.

## Core Math Types

```typescript
// BIPOINT (impulse.h:66-68)
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// BIPOINT2 (impulse.h:102-104)
interface Vec2 {
  x: number;
  y: number;
}

// BIANGLE (impulse.h:86-88) — 16-bit integer angles, 0x10000 = 360°
interface Attitude {
  h: number; // heading (long)
  p: number; // pitch (long)
  b: number; // bank (long)
}

// BITRIGON (impulse.h:120-123) — pre-computed trig cache
interface TrigCache {
  sinh: number;
  cosh: number;
  sinp: number;
  cosp: number;
  sinb: number;
  cosb: number;
}

// BIPOSATT / BIPNTANG (impulse.h:95-100)
interface PosAtt {
  p: Vec3;
  a: Attitude;
}

// BIAXIS (impulse.h:133-141) — position + attitude + trig cache
interface Axis {
  p: Vec3;
  a: Attitude;
  t: TrigCache;
}

// BIAXISF (impulse.h:143-147) — same but float angles (unused in flyby, but needed for engine compat)
interface AxisF {
  p: Vec3;
  a: { h: number; p: number; b: number }; // float
  t: TrigCache;
}
```

## Color

```typescript
// BICOLOR (impulse.h:159-161) — NOTE: original stores as unsigned g,r,b (GRB order!)
// We normalize to 0-1 float r,g,b in the port
interface Color {
  r: number; // 0.0 - 1.0
  g: number; // 0.0 - 1.0
  b: number; // 0.0 - 1.0
}
```

### Color Conversion

Original BICOLOR has fields in GRB order (`unsigned g, r, b`). Values are 0-255.
SRF face colors are packed 15-bit: `GGGGG RRRRR BBBBB`.

```
SRF 15-bit color unpacking (imodel.c:559-562):
  col.g = ((col15 >> 10) & 31) / 31.0
  col.r = ((col15 >>  5) & 31) / 31.0
  col.b = ((col15      ) & 31) / 31.0
```

FLD/PC2/TER colors are direct 0-255 RGB values.

## Projection

```typescript
// BIPROJ (impulse.h:152-157)
interface Projection {
  lx: number; // screen width (long)
  ly: number; // screen height (long)
  cx: number; // center x (long)
  cy: number; // center y (long)
  magx: number; // x magnification (real)
  magy: number; // y magnification (real)
  nearz: number; // near clip distance (real)
  farz: number; // far clip distance (real)
}
```

## SRF Model

```typescript
// BISRFVERTEX (impulse.h:202-205)
interface SrfVertex {
  pos: Vec3; // position
  normal: Vec3; // smoothed vertex normal (computed post-load)
  smoothFlag: number; // r: BI_ON if vertex participates in smooth shading
}

// BISRFPOLYGON (impulse.h:207-214)
interface SrfPolygon {
  backFaceRemove: number; // BI_ON or BI_OFF
  color: Color;
  normal: Vec3; // face normal
  center: Vec3; // face center point (from NOR line)
  vertexIds: number[]; // indices into vertex array
  bright: number; // BI_ON = unlit
  nVt: number; // vertex count
}

// BISRF / BISRFMODEL (impulse.h:216-223)
interface SrfModel {
  bbox: Vec3[]; // 8-corner bounding box
  nv: number; // vertex count
  vertices: SrfVertex[];
  np: number; // polygon count
  polygons: SrfPolygon[];
}
```

## Field Scene

```typescript
// BIFLDSRF (impulse.h:265-272)
interface FieldSrf {
  pos: PosAtt;
  srf: SrfModel;
  fn: string;
  id: number;
  tag: string;
  lodDist: number;
}

// BIFLDPC2 (impulse.h:282-288)
interface FieldPc2 {
  pos: PosAtt;
  pc2: Pc2;
  fn: string;
  lodDist: number;
}

// BIFLDTER (impulse.h:274-281)
interface FieldTer {
  pos: PosAtt;
  ter: Terrain;
  fn: string;
  id: number;
  tag: string;
  lodDist: number;
}

// BIFLD / BiFldTag (impulse.h:298-313)
interface Field {
  sky: Color;
  gnd: Color;
  nSrf: number;
  srf: FieldSrf[];
  nTer: number;
  ter: FieldTer[];
  nPc2: number;
  pc2: FieldPc2[];
  nPlt: number;
  plt: FieldPc2[];
}
```

## 2D Picture (PC2)

```typescript
// BIPC2OBJ (impulse.h:177-192)
interface Pc2Polygon {
  color: Color;
  vertices: Vec2[]; // 2D vertices
}

// BIPC2 (impulse.h:194-198)
interface Pc2 {
  min: Vec2;
  max: Vec2;
  polygons: Pc2Polygon[];
}
```

## Terrain

```typescript
// BITERRBLOCK (impulse.h:228-236)
interface TerrainBlock {
  y: number; // height
  col: Color[]; // [top color, side color]
  vis: number[]; // visibility flags
}

// BITER (impulse.h:238-249)
interface Terrain {
  xSiz: number;
  zSiz: number;
  xWid: number;
  zWid: number;
  blocks: TerrainBlock[];
  sdCol: Color[]; // side colors [4]
}
```

## Smoke System

```typescript
// ARSMOKEATTR (ASMOKE.H:2-8)
interface SmokeAttr {
  t0: number; // life start (sec)
  t1: number; // life end (sec)
  iniw: number; // initial width
  maxw: number; // maximum width
  dw: number; // width growth per second
  inic: Color; // initial color
  endc: Color; // end color
  tc: number; // color transition time (sec)
}

// ARSMOKENODE (ASMOKE.H:13-15)
interface SmokeNode {
  axs: Axis; // position + attitude at this point
  left: Vec3; // left vector (rotated X)
  up: Vec3; // up vector (rotated Y)
  t: number; // timestamp
}

// ARSMOKEINST (ASMOKE.H:19-26)
interface SmokeInst {
  nMax: number; // max nodes
  nDel: number; // delete count on overflow
  nPth: number; // active node count
  nTip: number; // tip count
  tip: Int32Array; // tip indices [MAX_TIP * 2]
  pth: SmokeNode[]; // node array
}

// ARSMOKECLASS (ASMOKE.H:35-43)
interface SmokeClass {
  stp: number[]; // LOD steps [3]
  bbx: Vec3[]; // bounding boxes [3]
  sw: number; // smoke type flags (bitmask)
  rbn: SmokeAttr; // ribbon
  wir: SmokeAttr; // wire
  trl: SmokeAttr; // trail
  sld: SmokeAttr; // solid
}

// Smoke type flags (ASMOKE.H:29-33)
const ARS_RIBBONSMOKE = 1;
const ARS_WIRESMOKE = 2;
const ARS_TRAILSMOKE = 4;
const ARS_SOLIDSMOKE = 8;
```

## Constants

```typescript
// BI_OFF / BI_ON (impulse.h:35-37)
const BI_OFF = 0;
const BI_ON = 1;

// BI_OK / BI_ERR (impulse.h:43-45)
const BI_ERR = 0;
const BI_OK = 1;

// Primitive resources (impulse.h:782-797)
const BiOrgP: Vec3 = { x: 0, y: 0, z: 0 };
const BiVecX: Vec3 = { x: 1, y: 0, z: 0 };
const BiVecY: Vec3 = { x: 0, y: 1, z: 0 };
const BiVecZ: Vec3 = { x: 0, y: 0, z: 1 };
const BiOrgPA: PosAtt = { p: BiOrgP, a: { h: 0, p: 0, b: 0 } };

// Named colors (impulse.h:790-797)
const BiBlack: Color = { r: 0, g: 0, b: 0 };
const BiBlue: Color = { r: 0, g: 0, b: 1 };
const BiRed: Color = { r: 1, g: 0, b: 0 };
const BiGreen: Color = { r: 0, g: 1, b: 0 };
const BiCyan: Color = { r: 0, g: 1, b: 1 };
const BiYellow: Color = { r: 1, g: 1, b: 0 };
const BiMagenta: Color = { r: 1, g: 0, b: 1 };
const BiWhite: Color = { r: 1, g: 1, b: 1 };
```

## Render Vertex (GPU format)

```typescript
// Used in vertex buffers sent to WebGPU
interface RenderVertex {
  position: [number, number, number]; // x, y, z
  normal: [number, number, number]; // nx, ny, nz
  color: [number, number, number, number]; // r, g, b, a
  bright: number; // 0 or 1
}
```
