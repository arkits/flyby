import * as THREE from 'three';

interface Face {
  color: number;
  normal: THREE.Vector3;
  vertices: number[];
  bright: boolean;
}

interface ParsedSRF {
  vertices: THREE.Vector3[];
  faces: Face[];
}

/**
 * Convert 15-bit packed color to RGB.
 * Original format is GRB555: (g << 10) | (r << 5) | b, each component 0-31
 * From imodel.c:
 *   col.g = ((col15>>10)&31)*255/31;
 *   col.r = ((col15>> 5)&31)*255/31;
 *   col.b = ((col15    )&31)*255/31;
 */
function colorToRGB(colorCode: number): THREE.Color {
  // GRB555 format - Green is in the high bits, not Red!
  const g = ((colorCode >> 10) & 31) / 31;
  const r = ((colorCode >> 5) & 31) / 31;
  const b = (colorCode & 31) / 31;
  
  return new THREE.Color(r, g, b);
}

/**
 * Parse an SRF file content into vertices and faces
 * Handles two formats:
 * - F16 style: V idx1 idx2 idx3 idx4 (all indices on one line)
 * - MIG21 style: V idx1 \n V idx2 \n V idx3 (each index on separate line)
 */
function parseSRF(content: string): ParsedSRF {
  const lines = content.split('\n').map(l => l.trim());
  const vertices: THREE.Vector3[] = [];
  const faces: Face[] = [];
  
  let inFace = false;
  let currentFace: Partial<Face> = {};
  let faceVertices: number[] = [];
  
  for (const line of lines) {
    if (!line || line === 'Surf') continue;
    if (line === 'E' && !inFace) continue;
    
    const parts = line.split(/\s+/);
    const cmd = parts[0];
    
    if (cmd === 'V' && !inFace) {
      // Vertex definition: V x y z [R]
      const x = parseFloat(parts[1]);
      const y = parseFloat(parts[2]);
      const z = parseFloat(parts[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        vertices.push(new THREE.Vector3(x, y, z));
      }
    } else if (cmd === 'F') {
      // Start face
      inFace = true;
      currentFace = { bright: false };
      faceVertices = [];
    } else if (cmd === 'E' && inFace) {
      // End face
      if (faceVertices.length >= 3) {
        currentFace.vertices = faceVertices;
        faces.push(currentFace as Face);
      }
      inFace = false;
      currentFace = {};
      faceVertices = [];
    } else if (cmd === 'C' && inFace) {
      // Color
      currentFace.color = parseInt(parts[1]);
    } else if (cmd === 'N' && inFace) {
      // Normal: N cx cy cz nx ny nz
      const nx = parseFloat(parts[4]);
      const ny = parseFloat(parts[5]);
      const nz = parseFloat(parts[6]);
      currentFace.normal = new THREE.Vector3(nx, ny, nz).normalize();
    } else if (cmd === 'V' && inFace) {
      // Vertex indices for face - can be:
      // - Multiple indices on one line: V 2 4 17 18
      // - Single index per line: V 2
      const indices = parts.slice(1).map(v => parseInt(v)).filter(v => !isNaN(v));
      faceVertices.push(...indices);
    } else if (cmd === 'BRI' && inFace) {
      // Bright/emissive flag
      currentFace.bright = true;
    }
    // Skip BAS lines (attachment points)
  }
  
  return { vertices, faces };
}

/**
 * Triangulate an n-gon using fan triangulation
 */
function triangulate(indices: number[]): number[][] {
  const triangles: number[][] = [];
  for (let i = 1; i < indices.length - 1; i++) {
    triangles.push([indices[0], indices[i], indices[i + 1]]);
  }
  return triangles;
}

/**
 * Create a Three.js BufferGeometry from SRF content
 */
export function createGeometryFromSRF(content: string): THREE.BufferGeometry {
  const { vertices, faces } = parseSRF(content);
  
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  
  let skippedFaces = 0;
  
  for (const face of faces) {
    const color = colorToRGB(face.color ?? 31);
    const normal = face.normal ?? new THREE.Vector3(0, 1, 0);
    
    // Validate face has valid vertices
    if (!face.vertices || face.vertices.length < 3) {
      skippedFaces++;
      continue;
    }
    
    // Check for invalid vertex indices
    const validIndices = face.vertices.every(idx => idx >= 0 && idx < vertices.length);
    if (!validIndices) {
      skippedFaces++;
      continue;
    }
    
    // For BRI (bright) faces, boost the color
    let finalColor = color;
    if (face.bright) {
      finalColor = new THREE.Color(
        Math.min(1, color.r * 1.5 + 0.2),
        Math.min(1, color.g * 1.5 + 0.2),
        Math.min(1, color.b * 1.5 + 0.2)
      );
    }
    
    // Triangulate the face
    const triangles = triangulate(face.vertices);
    
    for (const tri of triangles) {
      for (const idx of tri) {
        const v = vertices[idx];
        if (!v || isNaN(v.x) || isNaN(v.y) || isNaN(v.z)) {
          continue;
        }
        positions.push(v.x, v.y, v.z);
        normals.push(normal.x, normal.y, normal.z);
        colors.push(finalColor.r, finalColor.g, finalColor.b);
      }
    }
  }
  
  if (skippedFaces > 0) {
    console.warn(`Skipped ${skippedFaces} invalid faces`);
  }
  
  if (positions.length === 0) {
    console.error('No valid geometry created from SRF file');
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
    return geometry;
  }
  
  console.log(`Created geometry with ${positions.length / 3} vertices from ${faces.length} faces`);
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  
  return geometry;
}

/**
 * Load and parse an SRF file from a URL
 */
export async function loadSRF(url: string): Promise<THREE.BufferGeometry> {
  const response = await fetch(url);
  const content = await response.text();
  return createGeometryFromSRF(content);
}

/**
 * Available aircraft models
 */
export const AIRCRAFT_MODELS = [
  'F16.SRF',
  'F18.SRF', 
  'F15.SRF',
  'F14SPRD.SRF',
  'SU27.SRF',
  'MIG21.SRF',
];
