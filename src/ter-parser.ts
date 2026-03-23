// FLYBY2 — Terrain Mesh Parser
// Ported from iterrain.c

import type { Terrain, TerrainBlock, Color } from "./types";
import { colorFromRGB } from "./math";

export async function loadTer(url: string): Promise<Terrain> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  const text = await resp.text();
  return parseTerText(text);
}

export function parseTerText(text: string): Terrain {
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
  if (!header || header.toUpperCase() !== "TERRMESH") {
    throw new Error("Invalid TER: missing TerrMesh header");
  }

  let botCol: Color = { r: 1, g: 1, b: 1 };
  let rigCol: Color = { r: 1, g: 1, b: 1 };
  let lefCol: Color = { r: 1, g: 1, b: 1 };
  let topCol: Color = { r: 1, g: 1, b: 1 };
  const side = [0, 0, 0, 0];
  let nx = 0,
    nz = 0;
  let xWid = 0,
    zWid = 0;
  const blocks: TerrainBlock[] = [];

  let line: string | null;
  while ((line = nextLine()) !== null) {
    const tok = line.split(/\s+/);
    const cmd = tok[0].toUpperCase();

    if (cmd === "BOT") {
      botCol = colorFromRGB(parseInt(tok[1]), parseInt(tok[2]), parseInt(tok[3]));
      side[0] = 1;
    } else if (cmd === "RIG") {
      rigCol = colorFromRGB(parseInt(tok[1]), parseInt(tok[2]), parseInt(tok[3]));
      side[1] = 1;
    } else if (cmd === "LEF") {
      lefCol = colorFromRGB(parseInt(tok[1]), parseInt(tok[2]), parseInt(tok[3]));
      side[2] = 1;
    } else if (cmd === "TOP") {
      topCol = colorFromRGB(parseInt(tok[1]), parseInt(tok[2]), parseInt(tok[3]));
      side[3] = 1;
    } else if (cmd === "NBL") {
      nx = parseInt(tok[1]);
      nz = parseInt(tok[2]);
    } else if (cmd === "TMS") {
      xWid = parseFloat(tok[1]);
      zWid = parseFloat(tok[2]);
    } else if (cmd === "BLO") {
      const y = parseFloat(tok[1]);
      let lup = 0;
      const col: Color[] = [colorFromRGB(0, 0, 0), colorFromRGB(0, 0, 0)];
      const vis: number[] = [0, 0];

      if (tok.length >= 3) {
        lup = tok[2].toUpperCase() === "L" ? 1 : 0;
      }
      if (tok.length >= 11) {
        vis[0] = tok[3].toUpperCase() === "ON" ? 1 : 0;
        col[0] = colorFromRGB(parseInt(tok[4]), parseInt(tok[5]), parseInt(tok[6]));
        vis[1] = tok[7].toUpperCase() === "ON" ? 1 : 0;
        col[1] = colorFromRGB(parseInt(tok[8]), parseInt(tok[9]), parseInt(tok[10]));
      }

      blocks.push({ y, lup, col, vis });
    } else if (cmd === "END") {
      break;
    }
  }

  return {
    xSiz: nx,
    zSiz: nz,
    xWid,
    zWid,
    blocks,
    side,
    // Match iterrain.c edge order: 0=BOT, 1=RIG, 2=TOP, 3=LEF.
    sdCol: [botCol, rigCol, topCol, lefCol],
  };
}
