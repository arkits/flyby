# Math — Vector/Angle/Rotation/Projection Specification

Ported from `icalc.c` (1073 lines) and macros in `impulse.h` (lines 946-1178).

## Angle System

The original uses 16-bit integer angles where `0x10000` (65536) = 360°.

```
0x0000 =   0°
0x4000 =  90°
0x8000 = 180°
0xC000 = 270°
0x10000 = 360°
```

### Conversion Functions (impulse.h:62-64)

```typescript
const YSPI = 3.14159265;

function sin16(a: number): number {
  return Math.sin(a * YSPI / 32768.0);
}

function cos16(a: number): number {
  return Math.cos(a * YSPI / 32768.0);
}

function tan16(a: number): number {
  return Math.tan(a * YSPI / 32768.0);
}
```

### Inverse Trig (icalc.c:88-128)

```typescript
// Returns angle in 0x10000 units
function asin16(s: number): number {
  return Math.asin(s) * 32768.0 / YSPI;
}

function acos16(s: number): number {
  return Math.acos(s) * 32768.0 / YSPI;
}

function atan16(s: number): number {
  return Math.atan(s) * 32768.0 / YSPI;
}
```

## Vector Operations

### Set/Add/Sub/Mul/Div (impulse.h:959-992)

All operate on `Vec3` in-place. `dst` can alias `src`.

```typescript
function setPoint(dst: Vec3, x: number, y: number, z: number): void
function addPoint(dst: Vec3, a: Vec3, b: Vec3): void  // dst = a + b
function subPoint(dst: Vec3, a: Vec3, b: Vec3): void  // dst = a - b
function mulPoint(dst: Vec3, src: Vec3, m: number): void  // dst = src * m
function divPoint(dst: Vec3, src: Vec3, d: number): void  // dst = src / d
```

### Dot/Cross/Length/Normalize (icalc.c:275-345)

```typescript
function innerPoint(a: Vec3, b: Vec3): number
  // a.x*b.x + a.y*b.y + a.z*b.z

function outerProduct(ou: Vec3, v1: Vec3, v2: Vec3): void
  // Cross product: ou = v1 × v2
  // ou.x = v1.y*v2.z - v1.z*v2.y
  // ou.y = v1.z*v2.x - v1.x*v2.z
  // ou.z = v1.x*v2.y - v1.y*v2.x

function length2(x: number, y: number): number
  // sqrt(x*x + y*y)

function length3(x: number, y: number, z: number): number
  // length2(x, length2(y, z))

function lengthPoint3(p: Vec3): number
  // length3(p.x, p.y, p.z)

function normalize(dst: Vec3, src: Vec3): void
  // dst = src / |src|  (if |src| >= YSEPS=0.0001)
```

### Average Normal Vector (icalc.c:285-336)

Computes polygon normal from vertices by finding the sharpest edge pair.

```typescript
function averageNormalVector(nom: Vec3, np: number, p: Vec3[]): boolean
  // Find 3 consecutive vertices forming sharpest angle
  // Return cross product of their edge vectors, normalized
  // Returns false if polygon is degenerate
```

## Rotation

### MakeTrigonomy (impulse.h:125-131)

```typescript
function makeTrigonomy(att: Attitude): TrigCache {
  return {
    sinh: sin16(att.h), cosh: cos16(att.h),
    sinp: sin16(att.p), cosp: cos16(att.p),
    sinb: sin16(att.b), cosb: cos16(att.b),
  };
}
```

### BiRotLtoG (impulse.h:1077-1091)

Local-to-global rotation using Euler angles. Order: **bank → pitch → heading**.

```
temp.x   = cosb * src.x - sinb * src.y
temp.y   = sinb * src.x + cosb * src.y

temp.z   = cosp * src.z - sinp * temp.y
dst.y    = sinp * src.z + cosp * temp.y

dst.x    = cosh * temp.x - sinh * temp.z
dst.z    = sinh * temp.x + cosh * temp.z
```

This is a YXZ Euler rotation (heading around Y, pitch around X, bank around Z).

### BiRotGtoL (impulse.h:1093-1107)

Global-to-local (inverse of LtoG). Order: **heading → pitch → bank**.

```
temp.x   =  cosh * src.x + sinh * src.z
temp.z   = -sinh * src.x + cosh * src.z

dst.z    =  cosp * temp.z + sinp * src.y
temp.y   = -sinp * temp.z + cosp * src.y

dst.x    =  cosb * temp.x + sinb * temp.y
dst.y    = -sinb * temp.x + cosb * temp.y
```

### BiRotFastLtoG / BiRotFastGtoL (impulse.h:1109-1133)

Same as above but takes pre-computed `TrigCache` instead of `Attitude`.

```typescript
function rotLtoG(dst: Vec3, src: Vec3, t: TrigCache): void
function rotGtoL(dst: Vec3, src: Vec3, t: TrigCache): void
function rotFastLtoG(dst: Vec3, src: Vec3, t: TrigCache): void  // same as rotLtoG with pre-computed trig
function rotFastGtoL(dst: Vec3, src: Vec3, t: TrigCache): void
```

## Coordinate Conversion

### BiConvLtoG / BiConvGtoL (impulse.h:1167-1177)

```typescript
function convLtoG(dst: Vec3, src: Vec3, axs: Axis): void
  // dst = rotate(src by axs.t) + axs.p

function convGtoL(dst: Vec3, src: Vec3, axs: Axis): void
  // dst = rotate(src - axs.p by inverse axs.t)

function pntAngToAxis(dst: Axis, src: PosAtt): void
  // dst.p = src.p, dst.a = src.a, dst.t = makeTrigonomy(src.a)
```

## Projection

### BiProject (impulse.h:1135-1139)

```typescript
function project(dst: ScreenPoint, src: Vec3, prj: Projection): void {
  dst.x = prj.cx + (src.x * prj.magx / src.z);
  dst.y = prj.cy - (src.y * prj.magy / src.z);
}
```

### BiGetStdProjection (from original, not in icalc.c)

Standard projection setup matching original 640x480:

```typescript
function getStdProjection(width: number, height: number): Projection {
  return {
    lx: width,
    ly: height,
    cx: width / 2,
    cy: height / 2,
    magx: width / 2,   // original: 640/2 = 320
    magy: height / 2,  // original: 480/2 = 240
    nearz: 0.5,
    farz: 16000.0,
  };
}
```

**FlyBy applies 2x magnification** (FLYBY.C:479-481):
```typescript
prj.magx *= 2.0;  // So effective magx = width (640 for original)
prj.magy *= 2.0;  // So effective magy = height (480 for original)
```

## Vector to Angle

### BiVectorToHeadPitch (icalc.c:432-460)

Converts a direction vector to heading and pitch angles.

```typescript
function vectorToHeadPitch(an: Attitude, eye: Vec3): void {
  if (Math.abs(eye.x) <= YSEPS && Math.abs(eye.z) <= YSEPS) {
    // Vertical: straight up or down
    an.h = 0;
    an.p = eye.y >= 0 ? 0x4000 : -0x4000;
    an.b = 0;
  } else {
    // Heading from xz-plane direction
    // v2.x = eye.z, v2.y = -eye.x
    an.h = biAngle2(eye.z, -eye.x);
    // Pitch from vertical component
    let hor: number;
    if (Math.abs(eye.z) > Math.abs(eye.x)) {
      hor = eye.z / cos16(an.h);
    } else {
      hor = -eye.x / sin16(an.h);
    }
    an.p = biAngle2(hor, eye.y);
    an.b = 0;
  }
}
```

### BiAngle2 (icalc.c:799-841)

Converts 2D vector to 16-bit angle (-0x8000 to +0x8000).

```typescript
function biAngle2(x: number, y: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax < YSEPS && ay < YSEPS) return 0;
  if (ax >= ay) {
    const a = atan16(y / ax);
    if (x > 0) return a;
    return (y > 0) ? (0x8000 - a) : (-0x8000 - a);
  } else {
    const a = atan16(x / ay);
    if (y > 0) return (0x4000 - a);
    return (-0x4000 + a);
  }
}
```

## BiPitchUp (icalc.c:494-510)

Composes a pitch rotation onto an existing attitude. Used by flight maneuvers.

```typescript
function pitchUp(dst: Attitude, src: Attitude, pit: number, yaw: number): void {
  // Build local eye/up vectors for pitch rotation
  let tmp = { x: 0, y: cos16(pit) };
  rot2(tmp, tmp, yaw);
  const eye: Vec3 = { x: tmp.x, y: sin16(pit), z: tmp.y };

  tmp = { x: 0, y: -sin16(pit) };
  rot2(tmp, tmp, yaw);
  const up: Vec3 = { x: tmp.x, y: cos16(pit), z: tmp.y };

  // Rotate to global frame
  rotLtoG(eye, eye, src);
  rotLtoG(up, up, src);

  // Convert back to angles
  vectorToAngle(dst, eye, up);
}
```

## BiRot2 (icalc.c:777-786)

2D rotation.

```typescript
function rot2(dst: Vec2, src: Vec2, ang: number): void {
  const s = sin16(ang);
  const c = cos16(ang);
  dst.x = c * src.x - s * src.y;
  dst.y = s * src.x + c * src.y;
}
```

## Near-Plane Clipping

### BiNearClipPolyg (icalc.c:225-273)

Sutherland-Hodgman polygon clipping against near plane z=nearz.

```typescript
function nearClipPolyg(p: Vec3[], nearz: number): Vec3[] {
  const out: Vec3[] = [];
  const np = p.length;
  for (let i = 0; i < np - 1; i++) {
    if (p[i].z > nearz) {
      out.push(p[i]);
      if (p[i+1].z <= nearz) {
        // Edge crosses near plane: interpolate
        const t = (nearz - p[i].z) / (p[i+1].z - p[i].z);
        out.push({
          x: p[i].x + (p[i+1].x - p[i].x) * t,
          y: p[i].y + (p[i+1].y - p[i].y) * t,
          z: nearz,
        });
      }
    } else if (p[i+1].z > nearz) {
      const t = (nearz - p[i].z) / (p[i+1].z - p[i].z);
      out.push({
        x: p[i].x + (p[i+1].x - p[i].x) * t,
        y: p[i].y + (p[i+1].y - p[i].y) * t,
        z: nearz,
      });
    }
  }
  // Close polygon (last-to-first edge)
  if (p[np-1].z > nearz) {
    out.push(p[np-1]);
    if (p[0].z <= nearz) {
      const t = (nearz - p[np-1].z) / (p[0].z - p[np-1].z);
      out.push({
        x: p[np-1].x + (p[0].x - p[np-1].x) * t,
        y: p[np-1].y + (p[0].y - p[np-1].y) * t,
        z: nearz,
      });
    }
  } else if (p[0].z > nearz) {
    const t = (nearz - p[np-1].z) / (p[0].z - p[np-1].z);
    out.push({
      x: p[np-1].x + (p[0].x - p[np-1].x) * t,
      y: p[np-1].y + (p[0].y - p[np-1].y) * t,
      z: nearz,
    });
  }
  return out;
}
```

## Utilities

```typescript
const YSEPS = 0.0001;

function biAbs(a: number): number { return Math.abs(a); }
function biLarger(a: number, b: number): number { return a > b ? a : b; }
function biSmaller(a: number, b: number): number { return a < b ? a : b; }
```
