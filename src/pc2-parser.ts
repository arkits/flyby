// FLYBY2 — PC2 (2D Picture) Parser
// Ported from i2dpict.c

import type { Pc2, Pc2Object, Pc2ObjectType, Vec2 } from "./types";
import { colorFromRGB } from "./math";

const VISI_DIST_DEFAULT = 8000000.0;

function averagePoint2(vertices: Vec2[]): Vec2 {
  if (vertices.length === 0) return { x: 0, y: 0 };
  let sumX = 0;
  let sumY = 0;
  for (const v of vertices) {
    sumX += v.x;
    sumY += v.y;
  }
  return { x: sumX / vertices.length, y: sumY / vertices.length };
}

export async function loadPc2(url: string): Promise<Pc2> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  const text = await resp.text();
  return parsePc2Text(text);
}

export function parsePc2Text(text: string): Pc2 {
  const lines = text.split(/\r?\n/);
  let lineIdx = 0;

  function nextLine(): string | null {
    while (lineIdx < lines.length) {
      const l = lines[lineIdx++].trim();
      if (l.length > 0 && l[0] !== "#") return l;
    }
    return null;
  }

  const header = nextLine();
  if (!header || header.toUpperCase() !== "PICT2") {
    throw new Error("Invalid PC2: missing Pict2 header");
  }

  const objects: Pc2Object[] = [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  let line: string | null;
  while ((line = nextLine()) !== null) {
    const tok = line.split(/\s+/);
    const cmd = tok[0].toUpperCase();

    if (cmd === "PST" || cmd === "PLL" || cmd === "LSQ" || cmd === "PLG") {
      const type = cmd as Pc2ObjectType;
      let r = 255,
        g = 255,
        b = 255;
      let visiDist = VISI_DIST_DEFAULT;
      const verts: Vec2[] = [];

      let pline: string | null;
      while ((pline = nextLine()) !== null) {
        const ptok = pline.split(/\s+/);
        const pcmd = ptok[0].toUpperCase();

        if (pcmd === "COL") {
          r = parseInt(ptok[1]);
          g = parseInt(ptok[2]);
          b = parseInt(ptok[3]);
        } else if (pcmd === "DST") {
          visiDist = parseFloat(ptok[1]);
        } else if (pcmd === "VER") {
          const x = parseFloat(ptok[1]);
          const y = parseFloat(ptok[2]);
          verts.push({ x, y });
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        } else if (pcmd === "ENDO") {
          objects.push({
            type,
            color: colorFromRGB(r, g, b),
            visiDist,
            vertices: verts,
            center: averagePoint2(verts),
          });
          break;
        }
      }
    } else if (cmd === "ENDPICT") {
      break;
    }
  }

  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
    objects,
  };
}
