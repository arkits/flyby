import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface ChaseCameraProps {
  targetPosition: THREE.Vector3;
  altitude?: number;
}

/**
 * Chase camera that follows and looks at the aircraft
 * Matches the original FLYBY2 camera behavior
 */
export function ChaseCamera({ targetPosition, altitude = 120 }: ChaseCameraProps) {
  const { camera } = useThree();
  const cameraPositionRef = useRef<THREE.Vector3>(new THREE.Vector3(0, altitude + 50, 200));
  const lookAtRef = useRef<THREE.Vector3>(new THREE.Vector3(0, altitude, 0));

  // Initialize camera position
  useEffect(() => {
    // Random camera position around the action
    const angle = Math.random() * Math.PI * 2;
    const distance = 50 + Math.random() * 150;
    
    cameraPositionRef.current.set(
      -distance * Math.sin(angle),
      altitude + (Math.random() * 50 - 25),
      distance * Math.cos(angle)
    );
    
    camera.position.copy(cameraPositionRef.current);
    camera.lookAt(targetPosition);
  }, [camera, altitude, targetPosition]);

  useFrame(() => {
    // Smoothly look at the aircraft
    lookAtRef.current.lerp(targetPosition, 0.1);
    camera.lookAt(lookAtRef.current);
  });

  return null;
}

/**
 * Fixed position camera that tracks aircraft
 * More authentic to original FLYBY2 behavior
 */
export function FixedTrackingCamera({ targetPosition, altitude = 120 }: ChaseCameraProps) {
  const { camera } = useThree();
  const initializedRef = useRef(false);
  const cameraPos = useRef(new THREE.Vector3());

  useEffect(() => {
    if (!initializedRef.current) {
      // Set initial camera position at random location around center
      const angle = Math.random() * Math.PI * 2;
      const distance = 50 + Math.random() * 150;
      
      cameraPos.current.set(
        -distance * Math.sin(angle),
        altitude + (Math.random() * 50 - 25),
        distance * Math.cos(angle)
      );
      
      camera.position.copy(cameraPos.current);
      
      // Set FOV to match original's 2x magnification
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = 35; // Narrower FOV = more zoom
        camera.updateProjectionMatrix();
      }
      
      initializedRef.current = true;
    }
  }, [camera, altitude]);

  useFrame(() => {
    // Calculate direction to target
    const direction = new THREE.Vector3();
    direction.subVectors(targetPosition, cameraPos.current);
    
    // Convert to heading/pitch angles (like original BiVectorToHeadPitch)
    const heading = Math.atan2(-direction.x, direction.z);
    const horizontalDist = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
    const pitch = Math.atan2(direction.y, horizontalDist);
    
    // Apply rotation
    camera.rotation.set(pitch, heading, 0, 'YXZ');
  });

  return null;
}
