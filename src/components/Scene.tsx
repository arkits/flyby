import { useMemo } from 'react';
import * as THREE from 'three';

interface SceneProps {
  showSky?: boolean;
  showGround?: boolean;
}

/**
 * Ground grid matching the original FLYBY2
 * Blue lines every 1000 units, from -20000 to 20000
 */
export function GroundGrid() {
  const gridGeometry = useMemo(() => {
    const positions: number[] = [];
    const step = 1000;
    const extent = 20000;
    
    // Create grid lines
    for (let x = -extent; x <= extent; x += step) {
      // Lines along Z axis
      positions.push(x, 0, -extent);
      positions.push(x, 0, extent);
    }
    
    for (let z = -extent; z <= extent; z += step) {
      // Lines along X axis
      positions.push(-extent, 0, z);
      positions.push(extent, 0, z);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }, []);

  return (
    <lineSegments geometry={gridGeometry}>
      <lineBasicMaterial color="#0044aa" opacity={0.6} transparent />
    </lineSegments>
  );
}

/**
 * Ground plane for depth reference
 */
export function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
      <planeGeometry args={[50000, 50000]} />
      <meshStandardMaterial 
        color="#1a3d1a" 
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
}

/**
 * Sky gradient dome
 */
export function Sky() {
  const skyGeometry = useMemo(() => {
    return new THREE.SphereGeometry(25000, 32, 16);
  }, []);

  const skyMaterial = useMemo(() => {
    // Create gradient shader material
    return new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color('#1a4a8f') },
        bottomColor: { value: new THREE.Color('#87ceeb') },
        offset: { value: 0 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
    });
  }, []);

  return <mesh geometry={skyGeometry} material={skyMaterial} />;
}

/**
 * Scene lighting matching original FLYBY2
 * Light positioned above camera
 */
export function SceneLighting() {
  return (
    <>
      {/* Main directional light from above */}
      <directionalLight
        position={[0, 1000, 0]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={3000}
        shadow-camera-left={-500}
        shadow-camera-right={500}
        shadow-camera-top={500}
        shadow-camera-bottom={-500}
      />
      
      {/* Ambient light for fill */}
      <ambientLight intensity={0.4} />
      
      {/* Hemisphere light for sky/ground color */}
      <hemisphereLight
        color="#87ceeb"
        groundColor="#1a3d1a"
        intensity={0.3}
      />
    </>
  );
}

/**
 * Basic building component
 */
function Building({ 
  position, 
  size, 
  color = '#555566' 
}: { 
  position: [number, number, number]; 
  size: [number, number, number];
  color?: string;
}) {
  // Position y is at half height (Three.js boxes are centered)
  const adjustedPosition: [number, number, number] = [
    position[0], 
    position[1] + size[1] / 2, 
    position[2]
  ];
  
  return (
    <mesh position={adjustedPosition} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.8} metalness={0.2} />
    </mesh>
  );
}

/**
 * Single runway with markings
 */
function RunwayStrip({ 
  position = [0, 0, 0], 
  rotation = 0,
  length = 600,
  width = 50 
}: { 
  position?: [number, number, number];
  rotation?: number;
  length?: number;
  width?: number;
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Main runway surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} receiveShadow>
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.9} metalness={0} />
      </mesh>
      
      {/* Center line markings */}
      {Array.from({ length: Math.floor(length / 40) }).map((_, i) => (
        <mesh 
          key={`center-${i}`}
          rotation={[-Math.PI / 2, 0, 0]} 
          position={[0, 0.15, -length/2 + 30 + i * 40]}
        >
          <planeGeometry args={[2, 20]} />
          <meshStandardMaterial color="#ffffff" roughness={0.9} />
        </mesh>
      ))}
      
      {/* Threshold markings at both ends */}
      {[-1, 1].map((end) => (
        [-1, 1].map((side) => (
          Array.from({ length: 6 }).map((_, i) => (
            <mesh 
              key={`threshold-${end}-${side}-${i}`}
              rotation={[-Math.PI / 2, 0, 0]} 
              position={[side * (6 + i * 4), 0.15, end * (length/2 - 20)]}
            >
              <planeGeometry args={[2.5, 25]} />
              <meshStandardMaterial color="#ffffff" roughness={0.9} />
            </mesh>
          ))
        ))
      ))}
      
      {/* Edge lines */}
      {[-width/2 + 2, width/2 - 2].map((x) => (
        <mesh 
          key={`edge-${x}`}
          rotation={[-Math.PI / 2, 0, 0]} 
          position={[x, 0.15, 0]}
        >
          <planeGeometry args={[1.5, length - 10]} />
          <meshStandardMaterial color="#ffffff" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Multiple runways layout
 */
export function Runway() {
  return (
    <group>
      {/* Main runway - North-South */}
      <RunwayStrip position={[0, 0, 0]} rotation={0} length={700} width={55} />
      
      {/* Cross runway - East-West */}
      <RunwayStrip position={[0, 0, 0]} rotation={Math.PI / 2} length={500} width={45} />
      
      {/* Diagonal runway */}
      <RunwayStrip position={[-200, 0, -200]} rotation={Math.PI / 4} length={400} width={40} />
      
      {/* Taxiways connecting runways */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[80, 0.08, 100]}>
        <planeGeometry args={[20, 150]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-80, 0.08, -100]}>
        <planeGeometry args={[20, 150]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.9} />
      </mesh>
    </group>
  );
}

type Vec3 = [number, number, number];

interface BuildingDef {
  position: Vec3;
  size: Vec3;
  color: string;
}

/**
 * Airport buildings spread around center
 */
export function AirportBuildings() {
  const buildings = useMemo<BuildingDef[]>(() => [
    // === MAIN TERMINAL AREA (East side) ===
    // Main terminal building
    { position: [150, 0, 0], size: [100, 35, 200], color: '#556677' },
    // Terminal extension
    { position: [180, 0, -150], size: [60, 25, 80], color: '#556677' },
    { position: [180, 0, 150], size: [60, 25, 80], color: '#556677' },
    
    // === CONTROL TOWER (Central-East) ===
    { position: [100, 0, -80], size: [20, 80, 20], color: '#667788' },
    { position: [100, 80, -80], size: [28, 15, 28], color: '#88aacc' }, // Glass top
    
    // === HANGARS (West side) ===
    { position: [-150, 0, -120], size: [90, 50, 70], color: '#445566' },
    { position: [-150, 0, 0], size: [90, 50, 70], color: '#445566' },
    { position: [-150, 0, 120], size: [90, 50, 70], color: '#445566' },
    
    // === CARGO AREA (South) ===
    { position: [50, 0, 250], size: [120, 30, 60], color: '#505560' },
    { position: [-50, 0, 280], size: [80, 25, 50], color: '#505560' },
    { position: [80, 0, 320], size: [60, 20, 40], color: '#505560' },
    
    // === FUEL DEPOT (North-West) ===
    { position: [-200, 0, -200], size: [40, 15, 40], color: '#666655' },
    { position: [-250, 0, -180], size: [30, 12, 30], color: '#666655' },
    { position: [-220, 0, -250], size: [35, 18, 35], color: '#666655' },
    
    // === MAINTENANCE (North) ===
    { position: [0, 0, -280], size: [100, 40, 60], color: '#556066' },
    { position: [-80, 0, -250], size: [50, 30, 50], color: '#556066' },
    { position: [100, 0, -260], size: [60, 35, 45], color: '#556066' },
    
    // === SMALL UTILITY BUILDINGS scattered ===
    { position: [220, 0, 80], size: [25, 15, 25], color: '#556666' },
    { position: [240, 0, -40], size: [20, 12, 20], color: '#556666' },
    { position: [-220, 0, 60], size: [30, 18, 30], color: '#556666' },
    { position: [-200, 0, 180], size: [25, 14, 25], color: '#556666' },
    { position: [60, 0, -180], size: [22, 16, 22], color: '#556666' },
    
    // === DISTANT CITY BUILDINGS (for skyline) ===
    { position: [400, 0, 0], size: [50, 100, 50], color: '#445566' },
    { position: [450, 0, 80], size: [40, 70, 40], color: '#445566' },
    { position: [380, 0, -100], size: [45, 85, 45], color: '#445566' },
    { position: [500, 0, -50], size: [35, 60, 35], color: '#445566' },
    
    { position: [-400, 0, 50], size: [50, 90, 50], color: '#445566' },
    { position: [-450, 0, -60], size: [40, 75, 40], color: '#445566' },
    { position: [-380, 0, 120], size: [45, 65, 45], color: '#445566' },
    
    { position: [100, 0, 450], size: [55, 80, 55], color: '#445566' },
    { position: [-50, 0, 480], size: [40, 95, 40], color: '#445566' },
    { position: [200, 0, 420], size: [35, 55, 35], color: '#445566' },
    
    { position: [50, 0, -450], size: [50, 110, 50], color: '#445566' },
    { position: [-100, 0, -420], size: [45, 70, 45], color: '#445566' },
    { position: [180, 0, -480], size: [40, 85, 40], color: '#445566' },
  ], []);

  return (
    <group>
      {buildings.map((b, i) => (
        <Building key={i} position={b.position} size={b.size} color={b.color} />
      ))}
    </group>
  );
}

/**
 * Complete scene environment with toggleable elements
 */
export function SceneEnvironment({ showSky = true, showGround = true }: SceneProps) {
  return (
    <>
      {showSky && <Sky />}
      {showGround && <Ground />}
      <GroundGrid />
      <SceneLighting />
      <Runway />
      <AirportBuildings />
      {showSky && <fog attach="fog" args={['#87ceeb', 1000, 15000]} />}
    </>
  );
}
