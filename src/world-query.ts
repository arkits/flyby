import type { Axis, Field, FieldSrf, PosAtt, Vec3 } from "./types";
import { getFieldElevation } from "./field-runtime";
import { convLtoG, makeTrigonomy, rotFastLtoG, vec3, vectorToAngle } from "./math";

interface StaticObstacle {
  id: string;
  min: Vec3;
  max: Vec3;
}

export interface GroundSample {
  hit: boolean;
  height: number;
  normal: Vec3;
}

export interface RaycastHit {
  hit: boolean;
  point: Vec3;
  normal: Vec3;
  distance: number;
  kind: "terrain" | "obstacle";
  id: string;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

function subVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  };
}

function lengthVec3(value: Vec3): number {
  return Math.hypot(value.x, value.y, value.z);
}

function normalizeVec3(value: Vec3): Vec3 {
  const length = lengthVec3(value);
  if (length <= 1e-6) {
    return { x: 0, y: 1, z: 0 };
  }
  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
  };
}

function angleToVectors(att: PosAtt["a"]): { eye: Vec3; up: Vec3 } {
  const eye = vec3(0, 0, 1);
  const up = vec3(0, 1, 0);
  const trig = makeTrigonomy(att);
  rotFastLtoG(eye, eye, trig);
  rotFastLtoG(up, up, trig);
  return { eye, up };
}

function composePosAtt(local: PosAtt, parent: PosAtt): PosAtt {
  const parentAxis: Axis = { p: { ...parent.p }, a: { ...parent.a }, t: makeTrigonomy(parent.a) };
  const { eye, up } = angleToVectors(local.a);
  const worldEye = vec3(0, 0, 0);
  const worldUp = vec3(0, 0, 0);
  rotFastLtoG(worldEye, eye, parentAxis.t);
  rotFastLtoG(worldUp, up, parentAxis.t);

  const out: PosAtt = {
    p: vec3(0, 0, 0),
    a: { h: 0, p: 0, b: 0 },
  };
  convLtoG(out.p, local.p, parentAxis);
  vectorToAngle(out.a, worldEye, worldUp);
  return out;
}

function buildObstacleId(path: string, fsrf: FieldSrf, index: number): string {
  const tag = fsrf.tag ? `:${fsrf.tag}` : "";
  return `${path}srf#${index}${tag}`;
}

function pushObstacle(obstacles: StaticObstacle[], id: string, bbox: Vec3[], pos: PosAtt): void {
  if (bbox.length === 0) return;
  const axis: Axis = { p: { ...pos.p }, a: { ...pos.a }, t: makeTrigonomy(pos.a) };
  const min = vec3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = vec3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  for (const corner of bbox) {
    const world = vec3(0, 0, 0);
    convLtoG(world, corner, axis);
    min.x = Math.min(min.x, world.x);
    min.y = Math.min(min.y, world.y);
    min.z = Math.min(min.z, world.z);
    max.x = Math.max(max.x, world.x);
    max.y = Math.max(max.y, world.y);
    max.z = Math.max(max.z, world.z);
  }
  obstacles.push({ id, min, max });
}

function flattenObstacles(
  field: Field,
  fieldPos: PosAtt,
  obstacles: StaticObstacle[],
  path: string
): void {
  field.srf.forEach((fsrf, index) => {
    const objectPos = composePosAtt(fsrf.pos, fieldPos);
    pushObstacle(obstacles, buildObstacleId(path, fsrf, index), fsrf.srf.bbox, objectPos);
  });

  field.fld.forEach((child, index) => {
    const childPos = composePosAtt(child.pos, fieldPos);
    flattenObstacles(child.fld, childPos, obstacles, `${path}fld#${index}/`);
  });
}

function segmentAabbHit(start: Vec3, end: Vec3, obstacle: StaticObstacle): RaycastHit | null {
  const delta = subVec3(end, start);
  let tMin = 0;
  let tMax = 1;
  let normal = vec3(0, 0, 0);

  const axes: Array<keyof Vec3> = ["x", "y", "z"];
  for (const axis of axes) {
    const origin = start[axis];
    const direction = delta[axis];
    const min = obstacle.min[axis];
    const max = obstacle.max[axis];

    if (Math.abs(direction) <= 1e-6) {
      if (origin < min || origin > max) {
        return null;
      }
      continue;
    }

    const inv = 1 / direction;
    let t0 = (min - origin) * inv;
    let t1 = (max - origin) * inv;
    let axisNormal = vec3(0, 0, 0);
    if (axis === "x") axisNormal = vec3(inv >= 0 ? -1 : 1, 0, 0);
    if (axis === "y") axisNormal = vec3(0, inv >= 0 ? -1 : 1, 0);
    if (axis === "z") axisNormal = vec3(0, 0, inv >= 0 ? -1 : 1);

    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
      axisNormal = vec3(-axisNormal.x, -axisNormal.y, -axisNormal.z);
    }

    if (t0 > tMin) {
      tMin = t0;
      normal = axisNormal;
    }
    tMax = Math.min(tMax, t1);
    if (tMin > tMax) {
      return null;
    }
  }

  if (tMin < 0 || tMin > 1) {
    return null;
  }

  const point = lerpVec3(start, end, tMin);
  return {
    hit: true,
    point,
    normal,
    distance: lengthVec3(subVec3(point, start)),
    kind: "obstacle",
    id: obstacle.id,
  };
}

export class WorldQueryService {
  private readonly field: Field;

  private readonly root: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };

  readonly obstacles: StaticObstacle[];

  constructor(field: Field) {
    this.field = field;
    const obstacles: StaticObstacle[] = [];
    flattenObstacles(field, this.root, obstacles, "");
    this.obstacles = obstacles;
  }

  sampleGround(point: Vec3): GroundSample {
    const elevation = getFieldElevation(this.field, this.root, point, 0);
    if (!elevation.inside) {
      return {
        hit: true,
        height: 0,
        normal: { x: 0, y: 1, z: 0 },
      };
    }

    return {
      hit: true,
      height: elevation.elevation,
      normal: normalizeVec3(elevation.upVec),
    };
  }

  raycastSegment(start: Vec3, end: Vec3, steps = 40): RaycastHit | null {
    let nearestObstacle: RaycastHit | null = null;
    for (const obstacle of this.obstacles) {
      const hit = segmentAabbHit(start, end, obstacle);
      if (hit === null) continue;
      if (nearestObstacle === null || hit.distance < nearestObstacle.distance) {
        nearestObstacle = hit;
      }
    }

    const delta = subVec3(end, start);
    const totalDistance = lengthVec3(delta);
    let terrainHit: RaycastHit | null = null;
    let previousOffset = start.y - this.sampleGround(start).height;

    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const point = lerpVec3(start, end, t);
      const sample = this.sampleGround(point);
      const offset = point.y - sample.height;
      if (sample.hit && previousOffset > 0 && offset <= 0) {
        let lo = (step - 1) / steps;
        let hi = t;
        for (let iteration = 0; iteration < 6; iteration++) {
          const mid = (lo + hi) * 0.5;
          const probe = lerpVec3(start, end, mid);
          const probeSample = this.sampleGround(probe);
          const probeOffset = probe.y - probeSample.height;
          if (probeOffset > 0) {
            lo = mid;
          } else {
            hi = mid;
          }
        }
        const hitPoint = lerpVec3(start, end, hi);
        const hitSample = this.sampleGround(hitPoint);
        terrainHit = {
          hit: true,
          point: { x: hitPoint.x, y: hitSample.height, z: hitPoint.z },
          normal: hitSample.normal,
          distance: totalDistance * hi,
          kind: "terrain",
          id: "terrain",
        };
        break;
      }
      previousOffset = offset;
    }

    if (
      terrainHit !== null &&
      (nearestObstacle === null || terrainHit.distance <= nearestObstacle.distance)
    ) {
      return terrainHit;
    }
    return nearestObstacle;
  }

  resolveCameraDistance(target: Vec3, desiredCamera: Vec3, safety = 1.2): number {
    const desired = lengthVec3(subVec3(desiredCamera, target));
    const hit = this.raycastSegment(target, desiredCamera, 32);
    if (hit === null) {
      return desired;
    }
    return Math.max(1.5, Math.min(desired, hit.distance - safety));
  }

  constrainPointAboveGround(point: Vec3, clearance: number): Vec3 {
    const sample = this.sampleGround(point);
    if (!sample.hit) return point;
    return {
      x: point.x,
      y: Math.max(point.y, sample.height + clearance),
      z: point.z,
    };
  }

  fitPointToGround(point: Vec3, clearance: number): Vec3 {
    const sample = this.sampleGround(point);
    if (!sample.hit) return point;
    return {
      x: point.x,
      y: sample.height + clearance,
      z: point.z,
    };
  }
}
