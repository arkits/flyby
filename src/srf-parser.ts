// FLYBY2 — SRF 3D Model Parser
// Ported from imodel.c (BiLoadSrfMainLoop)

import type { SrfModel, SrfVertex, SrfPolygon, Vec3, Color } from './types';
import { BI_ON, BI_OFF, YSEPS, BiOrgP } from './types';
import {
  vec3, normalize, averageNormalVector,
  innerPoint, colorFromSRF15, twist3, BITWIST_RIGHT,
} from './math';

export async function loadSrf(url: string): Promise<SrfModel> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  const text = await resp.text();
  return parseSrfText(text);
}

export function parseSrfText(text: string): SrfModel {
  const lines = text.split(/\r?\n/);
  let lineIdx = 0;

  function nextLine(): string | null {
    while (lineIdx < lines.length) {
      const l = lines[lineIdx++].trim();
      if (l.length > 0 && l[0] !== '#') return l;
    }
    return null;
  }

  function tokenize(line: string): string[] {
    return line.split(/\s+/);
  }

  // Read header
  const header = nextLine();
  if (!header || header.toUpperCase() !== 'SURF') {
    throw new Error('Invalid SRF: missing Surf header');
  }

  // Parse vertices
  const rawVerts: { pos: Vec3; smoothFlag: number }[] = [];

  // Parse faces
  const polygons: SrfPolygon[] = [];

  let line: string | null;
  while ((line = nextLine()) !== null) {
    const tok = tokenize(line);
    const cmd = tok[0].toUpperCase();

    if (cmd === 'V') {
      // Vertex: V x y z [R]
      const x = parseFloat(tok[1]);
      const y = parseFloat(tok[2]);
      const z = parseFloat(tok[3]);
      const smooth = (tok.length >= 5 && tok[4].toUpperCase() === 'R') ? BI_ON : BI_OFF;
      rawVerts.push({ pos: vec3(x, y, z), smoothFlag: smooth });
    } else if (cmd === 'F') {
      // Face block
      let col: Color = { r: 0, g: 0, b: 0 };
      let nom: Vec3 = vec3(0, 0, 0);
      let cen: Vec3 = vec3(0, 0, 0);
      let bfr = BI_OFF;
      let bri = BI_OFF;
      const vtxIds: number[] = [];

      let fline: string | null;
      while ((fline = nextLine()) !== null) {
        const ftok = tokenize(fline);
        const fcmd = ftok[0].toUpperCase();

        if (fcmd === 'C') {
          // Color: C col15
          col = colorFromSRF15(parseInt(ftok[1]));
        } else if (fcmd === 'N') {
          // Normal: N cx cy cz nx ny nz
          cen = vec3(parseFloat(ftok[1]), parseFloat(ftok[2]), parseFloat(ftok[3]));
          nom = vec3(parseFloat(ftok[4]), parseFloat(ftok[5]), parseFloat(ftok[6]));
          if (Math.abs(nom.x) > YSEPS || Math.abs(nom.y) > YSEPS || Math.abs(nom.z) > YSEPS) {
            normalize(nom, nom);
            bfr = BI_ON;
          }
        } else if (fcmd === 'V') {
          // Vertex indices: V id id id ...
          for (let i = 1; i < ftok.length; i++) {
            vtxIds.push(parseInt(ftok[i]));
          }
        } else if (fcmd === 'B') {
          // Bright (unlit)
          bri = BI_ON;
        } else if (fcmd === 'E') {
          // End face
          // Remove duplicate last vertex if same as first
          let nVt = vtxIds.length;
          if (nVt > 1 && vtxIds[0] === vtxIds[nVt - 1]) {
            nVt--;
          }
          polygons.push({
            backFaceRemove: bfr,
            color: col,
            normal: nom,
            center: cen,
            vertexIds: vtxIds.slice(0, nVt),
            bright: bri,
            nVt,
          });
          break;
        }
      }
    } else if (cmd === 'END') {
      break;
    }
  }

  // Build vertex array
  const nv = rawVerts.length;
  const vertices: SrfVertex[] = rawVerts.map(rv => ({
    pos: rv.pos,
    normal: { ...BiOrgP },
    smoothFlag: rv.smoothFlag,
  }));

  // Post-processing
  computeFaceNormals(polygons, vertices);
  computeVertexNormals(polygons, vertices);
  constrainTwist(polygons, vertices);

  // Build bounding box
  const bbox = buildBoundingBox(vertices);

  return { bbox, nv, vertices, np: polygons.length, polygons };
}

function computeFaceNormals(polygons: SrfPolygon[], vertices: SrfVertex[]): void {
  for (const plg of polygons) {
    if (plg.backFaceRemove === BI_OFF) {
      const tmp: Vec3[] = plg.vertexIds.map(id => vertices[id].pos);
      const nom = vec3(0, 0, 0);
      if (averageNormalVector(nom, tmp.length, tmp)) {
        normalize(nom, nom);
        plg.normal = nom;
      }
    }
  }
}

function computeVertexNormals(polygons: SrfPolygon[], vertices: SrfVertex[]): void {
  for (let i = 0; i < vertices.length; i++) {
    const nom = vec3(0, 0, 0);
    const lst: Vec3[] = [];
    let n = 0;

    for (const plg of polygons) {
      if (plg.bright !== BI_ON &&
          plg.backFaceRemove === BI_ON &&
          plg.vertexIds.includes(i)) {
        const pNom = { ...plg.normal };
        let found = false;
        for (let j = 0; j < n; j++) {
          if (innerPoint(lst[j], pNom) < 0.0) {
            found = true;
            break;
          }
        }
        if (!found) {
          lst.push(pNom);
          n++;
        }
      }
    }

    if (n > 0) {
      for (const ln of lst) {
        nom.x += ln.x; nom.y += ln.y; nom.z += ln.z;
      }
      normalize(nom, nom);
    }
    vertices[i].normal = nom;
  }
}

function constrainTwist(polygons: SrfPolygon[], vertices: SrfVertex[]): void {
  for (const plg of polygons) {
    if (plg.backFaceRemove !== BI_ON) continue;
    const tmp: Vec3[] = plg.vertexIds.map(id => vertices[id].pos);
    if (twist3(plg.nVt, tmp, plg.normal) === BITWIST_RIGHT) {
      // Reverse winding
      plg.vertexIds.reverse();
    }
  }
}

function buildBoundingBox(vertices: SrfVertex[]): Vec3[] {
  if (vertices.length === 0) return [];
  let min = { ...vertices[0].pos };
  let max = { ...vertices[0].pos };
  for (let i = 1; i < vertices.length; i++) {
    const v = vertices[i].pos;
    if (v.x < min.x) min.x = v.x;
    if (v.y < min.y) min.y = v.y;
    if (v.z < min.z) min.z = v.z;
    if (v.x > max.x) max.x = v.x;
    if (v.y > max.y) max.y = v.y;
    if (v.z > max.z) max.z = v.z;
  }
  return [
    vec3(min.x, min.y, min.z), vec3(max.x, min.y, min.z),
    vec3(min.x, max.y, min.z), vec3(max.x, max.y, min.z),
    vec3(min.x, min.y, max.z), vec3(max.x, min.y, max.z),
    vec3(min.x, max.y, max.z), vec3(max.x, max.y, max.z),
  ];
}
