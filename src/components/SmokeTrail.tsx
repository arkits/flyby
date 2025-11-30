import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface TrailPoint {
  position: THREE.Vector3;
  time: number;
  width: number;
}

interface SmokeTrailProps {
  /** Ref to current position of the aircraft */
  positionRef: React.RefObject<THREE.Vector3>;
  /** Ref to current quaternion of the aircraft */
  quaternionRef: React.RefObject<THREE.Quaternion>;
  /** Ref to whether to emit smoke (during maneuvers) */
  emittingRef: React.RefObject<boolean>;
  /** Trail color */
  color?: string;
  /** Maximum trail length in seconds */
  maxAge?: number;
  /** Initial width of trail */
  initialWidth?: number;
  /** Offset from aircraft center (for wing tip trails) */
  offset?: THREE.Vector3;
}

/**
 * Smoke/vapor trail effect component
 * Creates ribbon-like trails behind the aircraft during maneuvers
 */
export function SmokeTrail({
  positionRef,
  quaternionRef,
  emittingRef,
  color = '#ffffff',
  maxAge = 3,
  initialWidth = 2,
  offset = new THREE.Vector3(0, 0, 0),
}: SmokeTrailProps) {
  const trailRef = useRef<THREE.Mesh>(null);
  const pointsRef = useRef<TrailPoint[]>([]);
  const lastPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  
  // Create geometry for the ribbon trail
  const maxPoints = 200;
  
  const { geometry, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    
    // Pre-allocate buffers for ribbon (2 vertices per point for width)
    const positions = new Float32Array(maxPoints * 2 * 3);
    const colors = new Float32Array(maxPoints * 2 * 4);
    const indices: number[] = [];
    
    // Create triangle strip indices
    for (let i = 0; i < maxPoints - 1; i++) {
      const i0 = i * 2;
      const i1 = i * 2 + 1;
      const i2 = (i + 1) * 2;
      const i3 = (i + 1) * 2 + 1;
      
      indices.push(i0, i1, i2);
      indices.push(i1, i3, i2);
    }
    
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    geo.setIndex(indices);
    
    geometryRef.current = geo;
    
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    
    return { geometry: geo, material: mat };
  }, []);
  
  useFrame((state) => {
    if (!positionRef.current || !quaternionRef.current) return;
    
    const currentTime = state.clock.getElapsedTime();
    const points = pointsRef.current;
    const position = positionRef.current;
    const quaternion = quaternionRef.current;
    const emitting = emittingRef.current ?? false;
    
    // Calculate world position with offset
    const worldOffset = offset.clone().applyQuaternion(quaternion);
    const trailPos = position.clone().add(worldOffset);
    
    // Add new point if emitting and moved enough
    if (emitting) {
      const dist = trailPos.distanceTo(lastPositionRef.current);
      if (dist > 1) { // Minimum distance between points
        points.unshift({
          position: trailPos.clone(),
          time: currentTime,
          width: initialWidth,
        });
        lastPositionRef.current.copy(trailPos);
      }
    }
    
    // Remove old points
    while (points.length > 0 && currentTime - points[points.length - 1].time > maxAge) {
      points.pop();
    }
    
    // Limit points
    while (points.length > maxPoints) {
      points.pop();
    }
    
    // Update geometry
    if (geometryRef.current && points.length >= 2) {
      const posAttr = geometryRef.current.getAttribute('position') as THREE.BufferAttribute;
      const colorAttr = geometryRef.current.getAttribute('color') as THREE.BufferAttribute;
      
      const baseColor = new THREE.Color(color);
      
      for (let i = 0; i < maxPoints; i++) {
        if (i < points.length) {
          const point = points[i];
          const age = currentTime - point.time;
          const ageRatio = age / maxAge;
          
          // Width decreases with age
          const width = initialWidth * (1 - ageRatio * 0.8);
          
          // Get perpendicular direction for ribbon width
          let perpendicular = new THREE.Vector3(0, 1, 0);
          if (i < points.length - 1) {
            const dir = new THREE.Vector3().subVectors(points[i + 1].position, point.position).normalize();
            perpendicular = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
            if (perpendicular.length() < 0.1) {
              perpendicular.set(1, 0, 0);
            }
          }
          
          // Two vertices per point (for ribbon width)
          const p1 = point.position.clone().add(perpendicular.clone().multiplyScalar(width));
          const p2 = point.position.clone().sub(perpendicular.clone().multiplyScalar(width));
          
          posAttr.setXYZ(i * 2, p1.x, p1.y, p1.z);
          posAttr.setXYZ(i * 2 + 1, p2.x, p2.y, p2.z);
          
          // Alpha fades with age
          const alpha = (1 - ageRatio) * 0.6;
          colorAttr.setXYZW(i * 2, baseColor.r, baseColor.g, baseColor.b, alpha);
          colorAttr.setXYZW(i * 2 + 1, baseColor.r, baseColor.g, baseColor.b, alpha);
        } else {
          // Hide unused vertices
          posAttr.setXYZ(i * 2, 0, -10000, 0);
          posAttr.setXYZ(i * 2 + 1, 0, -10000, 0);
          colorAttr.setXYZW(i * 2, 0, 0, 0, 0);
          colorAttr.setXYZW(i * 2 + 1, 0, 0, 0, 0);
        }
      }
      
      posAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
      geometryRef.current.computeBoundingSphere();
    }
  });
  
  return <mesh ref={trailRef} geometry={geometry} material={material} />;
}

/**
 * Wing tip vapor trails (appear during high-G maneuvers)
 */
export function WingVaporTrails({
  positionRef,
  quaternionRef,
  emittingRef,
  wingSpan = 5,
}: {
  positionRef: React.RefObject<THREE.Vector3>;
  quaternionRef: React.RefObject<THREE.Quaternion>;
  emittingRef: React.RefObject<boolean>;
  wingSpan?: number;
}) {
  return (
    <>
      {/* Left wing tip */}
      <SmokeTrail
        positionRef={positionRef}
        quaternionRef={quaternionRef}
        emittingRef={emittingRef}
        color="#ccddff"
        maxAge={1.5}
        initialWidth={1.5}
        offset={new THREE.Vector3(-wingSpan, 0, -2)}
      />
      {/* Right wing tip */}
      <SmokeTrail
        positionRef={positionRef}
        quaternionRef={quaternionRef}
        emittingRef={emittingRef}
        color="#ccddff"
        maxAge={1.5}
        initialWidth={1.5}
        offset={new THREE.Vector3(wingSpan, 0, -2)}
      />
    </>
  );
}

/**
 * Engine exhaust smoke trail
 */
export function ExhaustTrail({
  positionRef,
  quaternionRef,
  emittingRef,
}: {
  positionRef: React.RefObject<THREE.Vector3>;
  quaternionRef: React.RefObject<THREE.Quaternion>;
  emittingRef: React.RefObject<boolean>;
}) {
  return (
    <SmokeTrail
      positionRef={positionRef}
      quaternionRef={quaternionRef}
      emittingRef={emittingRef}
      color="#ffffff"
      maxAge={4}
      initialWidth={3}
      offset={new THREE.Vector3(0, 0, -8)}
    />
  );
}
