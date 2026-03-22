# Smoke Trail System Specification

Ported from `ASMOKE.C` (512 lines) + `ASMOKE.H` (66 lines).

## Overview

The smoke system tracks aircraft position over time, creating trail geometry behind it.
Each trail segment is defined by two consecutive smoke nodes. Nodes store position, attitude,
and derived left/up vectors for width expansion.

## Smoke Types

### Ribbon Smoke (DEFAULT)
Flat ribbon trailing behind aircraft. Two triangles per segment.
```
    n0.left * w0/2     n1.left * w1/2
    +-------------------+
    |  \                |
    |    \    tri1      |
    |      \            |
    n0.p ----+          |
    |      /            |
    |    /    tri2      |
    |  /                |
    +-------------------+
    -n0.left * w0/2    -n1.left * w1/2
```

### Wire Smoke
Simple line segments connecting nodes.

### Trail Smoke
Two parallel lines (like contrails), offset by left vector.

### Solid Smoke
3D volumetric tube with cross-shaped cross-section (4 quad faces per segment).
Uses left and up vectors for the cross shape.

## Data Flow

```
BeginAppendSmokeNode  →  marks start of new trail
AppendSmokeNode(obj, t) →  records position at time t
EndAppendSmokeNode    →  marks end of trail

DrawSmoke → iterates all trail segments, generates geometry
```

## Node Structure

Each smoke node stores:
- `axs: Axis` — position + attitude at this point (built via `pntAngToAxis`)
- `left: Vec3` — X-axis rotated by attitude (for width offset)
- `up: Vec3` — Y-axis rotated by attitude (for solid smoke cross)
- `t: number` — timestamp when node was recorded

### Node Creation (ASMOKE.C:192-232)

```typescript
function appendSmokeNode(inst: SmokeInst, pos: PosAtt, t: number): void {
  const node = new SmokeNode();
  node.axs = pntAngToAxis(pos);       // position + attitude + trig cache
  node.left = rotFastLtoG(Vec3.X, node.axs.t);  // local X → global
  node.up = rotFastLtoG(Vec3.Y, node.axs.t);    // local Y → global
  node.t = t;
  inst.pth.push(node);
}
```

## Tip Management

A "tip" marks a contiguous trail segment (start/end index pair).
`tip[i*2]` = start node index, `tip[i*2+1]` = end node index.

- `beginAppendSmokeNode`: creates new tip, sets start=current node count
- `appendSmokeNode`: updates tip's end index to latest node
- `endAppendSmokeNode`: finalizes tip's end index

Max tips per instance: `ARS_MAX_TIP_PER_INST = 8`. When exceeded, oldest tip is discarded.

## Overflow Handling

When node count exceeds `nMax`:
1. If `nDel > 0`: delete oldest `nDel` nodes, shift array, adjust tip indices
2. If `nDel == 0`: overflow error (silently drop)

## Geometry Generation (per frame)

### ArInsSmoke (ASMOKE.C:504-512)

```typescript
function drawSmoke(
  cla: SmokeClass, inst: SmokeInst, ctim: number, eye: PosAtt
): RenderVertex[] {
  const vertices: RenderVertex[] = [];
  for (let i = 0; i < inst.nTip; i++) {
    const nSta = inst.tip[i * 2 + 1];  // end of trail (newest)
    const nEnd = inst.tip[i * 2];       // start of trail (oldest)
    
    if (cla.sw & ARS_RIBBONSMOKE) {
      drawRibbonTips(cla.rbn, inst.pth, nEnd, nSta, ctim, eye, vertices);
    }
    // ... other smoke types
  }
  return vertices;
}
```

### LOD Step (ASMOKE.C:258-275)

Based on distance from eye, select step size (1, 2, or 4 nodes per segment).
Closer = more detail, farther = fewer segments.

```typescript
function getSmokeStep(nodePos: Vec3, eyePos: Vec3, cla: SmokeClass): number {
  const dx = Math.abs(eyePos.x - nodePos.x);
  const dy = Math.abs(eyePos.y - nodePos.y);
  const dz = Math.abs(eyePos.z - nodePos.z);
  for (let i = 0; i < 3; i++) {
    if (dx < cla.bbx[i].x && dy < cla.bbx[i].y && dz < cla.bbx[i].z) {
      return cla.stp[i];
    }
  }
  return cla.stp[2];
}
```

### Ribbon Smoke Geometry (ASMOKE.C:291-323)

For each segment between node[n0] and node[n1]:

```typescript
function insRibbonSmoke(
  att: SmokeAttr, node: SmokeNode[], n0: number, n1: number, t: number,
  vertices: RenderVertex[]
): void {
  const rt0 = t - node[n0].t;  // age of node n0
  const rt1 = t - node[n1].t;  // age of node n1
  
  if (rt0 < att.t0 || rt1 > att.t1) return;  // outside life span
  
  const c = getCurrentSmokeColor(att, rt0);
  const w0 = Math.min(att.iniw + att.dw * rt0, att.maxw);
  const w1 = Math.min(att.iniw + att.dw * rt1, att.maxw);
  
  const v1 = mulV3(node[n0].left, w0 / 2);
  const v2 = mulV3(node[n1].left, w1 / 2);
  
  // Quad corners
  const sq0 = addV3(node[n0].axs.p, v1);   // n0 +left
  const sq1 = subV3(node[n0].axs.p, v1);   // n0 -left
  const sq2 = addV3(node[n1].axs.p, v2);   // n1 +left
  const sq3 = subV3(node[n1].axs.p, v2);   // n1 -left
  
  // Two triangles
  pushTri(vertices, sq0, sq1, sq2, c);
  pushTri(vertices, sq2, sq1, sq3, c);
}
```

### Color Transition (ASMOKE.C:277-289)

```typescript
function getCurrentSmokeColor(att: SmokeAttr, rt: number): Color {
  if (att.tc < rt) {
    // Transition complete
    return att.endc;
  }
  const ratio = rt / att.tc;
  return {
    r: att.inic.r + (att.endc.r - att.inic.r) * ratio,
    g: att.inic.g + (att.endc.g - att.inic.g) * ratio,
    b: att.inic.b + (att.endc.b - att.inic.b) * ratio,
  };
}
```

## Configuration (FLYBY.C:210-231)

```typescript
// Smoke class (main trail)
const smokeClass: SmokeClass = {
  stp: [1, 2, 4],
  bbx: [
    {x:200, y:200, z:200},
    {x:500, y:500, z:500},
    {x:500, y:500, z:500},
  ],
  sw: ARS_RIBBONSMOKE,  // Default from flyby.inf
  rbn: { t0: 0.2, t1: 30.0, iniw: 0, maxw: 10, dw: 3, inic: White, endc: White, tc: 0 },
  wir: /* ... */, trl: /* ... */, sld: /* ... */,
};

// Vapor class (thin short trails)
const vaporClass: SmokeClass = {
  sw: ARS_TRAILSMOKE,
  trl: { t0: 0.1, t1: 1.0, iniw: 10, maxw: 10, dw: 0, inic: White, endc: White, tc: 0 },
};

// Instances
const smokeInst: SmokeInst = { nMax: 1000, nDel: 100, ... };
const vaporInst: SmokeInst = { nMax: 100, nDel: 10, ... };
```

## Usage in Maneuvers

- `flyByAhead`: No smoke (straight flight)
- `flyByPitch`: Both smoke + vapor appended during pitch
- `flyByBank`: Vapor only during bank
- `flyByTurn`: Both smoke + vapor appended during turn

Each maneuver clears instances at start via `clearSmokeInstance`.
