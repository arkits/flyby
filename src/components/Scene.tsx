import { useMemo } from 'react';
import * as THREE from 'three';

export type SkyboxMode = 'none' | 'day' | 'night';

interface SceneProps {
  skybox?: SkyboxMode;
  showGround?: boolean;
  buildingDensity?: number;
}

// Offset for runway and airport buildings to keep them visible from camera
// Camera is positioned 40-80 units from center, so offset runway further away
const AIRPORT_OFFSET: [number, number, number] = [400, 0, 400];

/**
 * Ground grid matching the original FLYBY2
 * Blue lines every 1000 units, from -20000 to 20000
 * With subtle neon glow effect
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

  // Glow layer material - brighter blue with lower opacity for subtle glow
  const glowMaterial = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: '#00aaff',
      opacity: 0.25,
      transparent: true,
    });
  }, []);

  // Main grid lines material - original blue with enhanced emissive feel
  const mainMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        baseColor: { value: new THREE.Color('#0044aa') },
        glowColor: { value: new THREE.Color('#00aaff') },
        opacity: { value: 0.6 },
      },
      vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        uniform vec3 glowColor;
        uniform float opacity;
        
        void main() {
          // Mix base color with glow color for subtle neon effect
          vec3 finalColor = mix(baseColor, glowColor, 0.3);
          gl_FragColor = vec4(finalColor, opacity);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
  }, []);

  return (
    <group>
      {/* Glow layer - rendered first for depth */}
      <lineSegments geometry={gridGeometry} material={glowMaterial} />
      {/* Main grid lines - rendered on top */}
      <lineSegments geometry={gridGeometry} material={mainMaterial} />
    </group>
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

// Sky color presets
const SKY_PRESETS = {
  day: {
    topColor: '#1a4a8f',
    bottomColor: '#87ceeb',
    fogColor: '#87ceeb',
  },
  night: {
    topColor: '#1a1a3a',
    bottomColor: '#2a2a4a',
    fogColor: '#1a1a2a',
  },
};

/**
 * Sky gradient dome with day/night modes
 */
export function Sky({ mode = 'day' }: { mode?: 'day' | 'night' }) {
  const preset = SKY_PRESETS[mode];
  
  const skyGeometry = useMemo(() => {
    return new THREE.SphereGeometry(25000, 32, 16);
  }, []);

  const skyMaterial = useMemo(() => {
    // Create gradient shader material
    return new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(preset.topColor) },
        bottomColor: { value: new THREE.Color(preset.bottomColor) },
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
  }, [preset.topColor, preset.bottomColor]);

  return (
    <>
      <mesh geometry={skyGeometry} material={skyMaterial} />
      {/* Stars for night mode */}
      {mode === 'night' && <Stars />}
    </>
  );
}

/**
 * Starfield for night sky
 */
function Stars() {
  const starsGeometry = useMemo(() => {
    const positions: number[] = [];
    const count = 6000;
    
    for (let i = 0; i < count; i++) {
      // Distribute stars on a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 20000 + Math.random() * 4000;
      
      // Show stars in upper hemisphere (expanded coverage)
      if (phi < Math.PI * 0.7) {
        positions.push(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.sin(theta)
        );
      }
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }, []);

  return (
    <points geometry={starsGeometry}>
      <pointsMaterial
        color="#ffffff"
        size={22}
        sizeAttenuation
        transparent
        opacity={1.0}
      />
    </points>
  );
}

/** Get fog color for skybox mode */
function getSkyboxFogColor(mode: SkyboxMode): string {
  if (mode === 'none') return '#333333';
  return SKY_PRESETS[mode].fogColor;
}

/**
 * Scene lighting matching original FLYBY2
 * Light positioned above camera, adjusts for day/night
 */
export function SceneLighting({ skybox = 'day' }: { skybox?: SkyboxMode }) {
  const isNight = skybox === 'night';
  
  return (
    <>
      {/* Main directional light from above */}
      <directionalLight
        position={[0, 1000, 0]}
        intensity={isNight ? 0.6 : 1.2}
        color={isNight ? '#88aaff' : '#ffffff'}
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
      <ambientLight intensity={isNight ? 0.35 : 0.4} color={isNight ? '#556688' : '#ffffff'} />

      {/* Hemisphere light for sky/ground color */}
      <hemisphereLight
        color={isNight ? '#2a2a4a' : '#87ceeb'}
        groundColor={isNight ? '#1a1a2a' : '#1a3d1a'}
        intensity={isNight ? 0.4 : 0.3}
      />

      {/* Additional rim light for night mode to help aircraft visibility */}
      {isNight && (
        <directionalLight
          position={[-500, 200, 500]}
          intensity={0.3}
          color="#88aaff"
        />
      )}
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
          position={[0, 0.15, -length / 2 + 30 + i * 40]}
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
              position={[side * (6 + i * 4), 0.15, end * (length / 2 - 20)]}
            >
              <planeGeometry args={[2.5, 25]} />
              <meshStandardMaterial color="#ffffff" roughness={0.9} />
            </mesh>
          ))
        ))
      ))}

      {/* Edge lines */}
      {[-width / 2 + 2, width / 2 - 2].map((x) => (
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
 * Multiple runways layout - offset from center to be visible from camera
 */
export function Runway() {
  return (
    <group position={AIRPORT_OFFSET}>
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
 * Airport buildings spread around the runway (offset from center)
 */
export function AirportBuildings({ density = 4000 }: { density?: number }) {
  const buildings = useMemo<BuildingDef[]>(() => {
    // Scale factor for existing buildings
    const scale = 0.5;
    
    // Airport offset for collision detection
    const [offsetX, , offsetZ] = AIRPORT_OFFSET;

    // Move static buildings away from runways (positions relative to runway center)
    const originalBuildings: BuildingDef[] = [
      // === MAIN TERMINAL AREA (East side) - Moved further East ===
      // Main terminal building
      { position: [400 + offsetX, 0, 0 + offsetZ], size: [100, 35, 200], color: '#556677' },
      // Terminal extension
      { position: [430 + offsetX, 0, -150 + offsetZ], size: [60, 25, 80], color: '#556677' },
      { position: [430 + offsetX, 0, 150 + offsetZ], size: [60, 25, 80], color: '#556677' },

      // === CONTROL TOWER (Central-East) - Moved East ===
      { position: [300 + offsetX, 0, -80 + offsetZ], size: [20, 80, 20], color: '#667788' },
      { position: [300 + offsetX, 80, -80 + offsetZ], size: [28, 15, 28], color: '#88aacc' }, // Glass top

      // === HANGARS (West side) - Moved further West ===
      { position: [-450 + offsetX, 0, -120 + offsetZ], size: [90, 50, 70], color: '#445566' },
      { position: [-450 + offsetX, 0, 0 + offsetZ], size: [90, 50, 70], color: '#445566' },
      { position: [-450 + offsetX, 0, 120 + offsetZ], size: [90, 50, 70], color: '#445566' },

      // === CARGO AREA (South) - Moved South ===
      { position: [50 + offsetX, 0, 550 + offsetZ], size: [120, 30, 60], color: '#505560' },
      { position: [-50 + offsetX, 0, 580 + offsetZ], size: [80, 25, 50], color: '#505560' },
      { position: [80 + offsetX, 0, 620 + offsetZ], size: [60, 20, 40], color: '#505560' },

      // === FUEL DEPOT (North-West) - Moved further out ===
      { position: [-500 + offsetX, 0, -500 + offsetZ], size: [40, 15, 40], color: '#666655' },
      { position: [-550 + offsetX, 0, -480 + offsetZ], size: [30, 12, 30], color: '#666655' },
      { position: [-520 + offsetX, 0, -550 + offsetZ], size: [35, 18, 35], color: '#666655' },

      // === MAINTENANCE (North) - Moved North ===
      { position: [0 + offsetX, 0, -580 + offsetZ], size: [100, 40, 60], color: '#556066' },
      { position: [-80 + offsetX, 0, -550 + offsetZ], size: [50, 30, 50], color: '#556066' },
      { position: [100 + offsetX, 0, -560 + offsetZ], size: [60, 35, 45], color: '#556066' },
    ];

    // Scale existing buildings
    const scaledExisting = originalBuildings.map(b => ({
      ...b,
      size: [b.size[0] * scale, b.size[1] * scale, b.size[2] * scale] as Vec3
    }));

    // Generate new scattered buildings
    const generated: BuildingDef[] = [];
    const count = density;
    const spread = 15000;

    // Helper to check collision with runways (accounting for airport offset)
    const isCollidingWithRunway = (x: number, z: number, w: number, d: number) => {
      const buffer = 50; // Extra space around runways
      
      // Convert to runway-local coordinates
      const localX = x - offsetX;
      const localZ = z - offsetZ;

      // 1. Main Runway (N-S): x=0, z=[-350, 350], width=55
      // Bounds: x: [-27.5, 27.5], z: [-350, 350]
      if (
        localX + w / 2 > -28 - buffer && localX - w / 2 < 28 + buffer &&
        localZ + d / 2 > -350 - buffer && localZ - d / 2 < 350 + buffer
      ) return true;

      // 2. Cross Runway (E-W): z=0, x=[-250, 250], width=45
      // Bounds: x: [-250, 250], z: [-22.5, 22.5]
      if (
        localX + w / 2 > -250 - buffer && localX - w / 2 < 250 + buffer &&
        localZ + d / 2 > -23 - buffer && localZ - d / 2 < 23 + buffer
      ) return true;

      // 3. Diagonal Runway: center=[-200, -200], length=400, width=40, angle=45deg
      // Simple bounding box for diagonal area: x: [-400, 0], z: [-400, 0]
      // More precise check could be done, but a box is safer for now
      if (
        localX + w / 2 > -450 && localX - w / 2 < 50 &&
        localZ + d / 2 > -450 && localZ - d / 2 < 50
      ) {
        // Exclude the diagonal strip specifically? 
        // For simplicity, just exclude this quadrant near the center
        return true;
      }

      return false;
    };

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * spread * 2;
      const z = (Math.random() - 0.5) * spread * 2;

      const width = 10 + Math.random() * 30;
      const depth = 10 + Math.random() * 30;
      const height = 10 + Math.random() * 80;

      if (isCollidingWithRunway(x, z, width, depth)) continue;

      // Random grey color
      const shade = 60 + Math.floor(Math.random() * 60);
      const hex = '#' + shade.toString(16).padStart(2, '0').repeat(3);

      generated.push({
        position: [x, 0, z],
        size: [width, height, depth],
        color: hex
      });
    }

    return [...scaledExisting, ...generated];
  }, [density]);

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
export function SceneEnvironment({ skybox = 'day', showGround = true, buildingDensity = 4000 }: SceneProps) {
  const fogColor = getSkyboxFogColor(skybox);
  
  return (
    <>
      {skybox !== 'none' && <Sky mode={skybox} />}
      {showGround && <Ground />}
      <GroundGrid />
      <SceneLighting skybox={skybox} />
      <Runway />
      <AirportBuildings density={buildingDensity} />
      <fog attach="fog" args={[fogColor, 1000, 15000]} />
    </>
  );
}
