// FLYBY2 — Field Scene Parser
// Ported from ifield.c

import type {
  Field,
  FieldSrf,
  FieldPc2,
  FieldTer,
  FieldRgn,
  FieldFld,
  PosAtt,
  Color,
} from "./types";
import { loadSrf } from "./srf-parser";
import { loadPc2 } from "./pc2-parser";
import { loadTer } from "./ter-parser";
import { colorFromRGB, vec3 } from "./math";

interface FieldCaches {
  srf: Map<string, import("./types").SrfModel>;
  pc2: Map<string, import("./types").Pc2>;
  ter: Map<string, import("./types").Terrain>;
  fld: Map<string, Field>;
}

export async function loadField(url: string): Promise<Field> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  const text = await resp.text();

  // Get base path for sub-files
  const lastSlash = url.lastIndexOf("/");
  const basePath = lastSlash >= 0 ? url.substring(0, lastSlash + 1) : "";

  const caches: FieldCaches = {
    srf: new Map(),
    pc2: new Map(),
    ter: new Map(),
    fld: new Map(),
  };
  return parseFieldText(text, basePath, caches);
}

async function parseFieldText(text: string, basePath: string, caches: FieldCaches): Promise<Field> {
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
  if (!header || header.toUpperCase() !== "FIELD") {
    throw new Error("Invalid FLD: missing FIELD header");
  }

  // Defaults
  let sky: Color = colorFromRGB(32, 180, 180);
  let gnd: Color = colorFromRGB(32, 128, 32);

  const srfList: FieldSrf[] = [];
  const terList: FieldTer[] = [];
  const pc2List: FieldPc2[] = [];
  const pltList: FieldPc2[] = [];
  const rgnList: FieldRgn[] = [];
  const fldList: FieldFld[] = [];

  function parsePos(tokens: string[], startIdx: number): PosAtt {
    return {
      p: vec3(
        parseFloat(tokens[startIdx]),
        parseFloat(tokens[startIdx + 1]),
        parseFloat(tokens[startIdx + 2])
      ),
      a: {
        h: parseInt(tokens[startIdx + 3]),
        p: parseInt(tokens[startIdx + 4]),
        b: parseInt(tokens[startIdx + 5]),
      },
    };
  }

  let line: string | null;
  while ((line = nextLine()) !== null) {
    const tok = line.split(/\s+/);
    const cmd = tok[0].toUpperCase();

    if (cmd === "SKY") {
      sky = colorFromRGB(parseInt(tok[1]), parseInt(tok[2]), parseInt(tok[3]));
    } else if (cmd === "GND") {
      gnd = colorFromRGB(parseInt(tok[1]), parseInt(tok[2]), parseInt(tok[3]));
    } else if (cmd === "PC2" || cmd === "PLT") {
      const isPlt = cmd === "PLT";
      let fn = "";
      let pos: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
      let lodDist = 10000000;

      let bline: string | null;
      while ((bline = nextLine()) !== null) {
        const btok = bline.split(/\s+/);
        const bcmd = btok[0].toUpperCase();
        if (bcmd === "FIL") {
          fn = btok[1];
        } else if (bcmd === "POS") {
          pos = parsePos(btok, 1);
        } else if (bcmd === "LOD") {
          lodDist = parseFloat(btok[1]);
        } else if (bcmd === "END") {
          break;
        }
      }

      // Load or reuse PC2
      let pc2;
      if (caches.pc2.has(fn)) {
        pc2 = caches.pc2.get(fn)!;
      } else {
        pc2 = await loadPc2(basePath + fn);
        caches.pc2.set(fn, pc2);
      }

      const entry: FieldPc2 = { pos, pc2, fn, lodDist };
      if (isPlt) pltList.push(entry);
      else pc2List.push(entry);
    } else if (cmd === "SRF") {
      let fn = "";
      let pos: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
      let id = 0;
      let tag = "";
      let lodDist = 10000000;

      let bline: string | null;
      while ((bline = nextLine()) !== null) {
        const btok = bline.split(/\s+/);
        const bcmd = btok[0].toUpperCase();
        if (bcmd === "FIL") fn = btok[1];
        else if (bcmd === "POS") pos = parsePos(btok, 1);
        else if (bcmd === "ID") id = parseInt(btok[1]);
        else if (bcmd === "TAG") tag = btok[1] || "";
        else if (bcmd === "LOD") lodDist = parseFloat(btok[1]);
        else if (bcmd === "END") break;
      }

      let srf;
      if (caches.srf.has(fn)) {
        srf = caches.srf.get(fn)!;
      } else {
        srf = await loadSrf(basePath + fn);
        caches.srf.set(fn, srf);
      }
      srfList.push({ pos, srf, fn, id, tag, lodDist });
    } else if (cmd === "TER") {
      let fn = "";
      let pos: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
      let id = 0;
      let tag = "";
      let lodDist = 10000000;

      let bline: string | null;
      while ((bline = nextLine()) !== null) {
        const btok = bline.split(/\s+/);
        const bcmd = btok[0].toUpperCase();
        if (bcmd === "FIL") fn = btok[1];
        else if (bcmd === "POS") pos = parsePos(btok, 1);
        else if (bcmd === "ID") id = parseInt(btok[1]);
        else if (bcmd === "TAG") tag = btok[1] || "";
        else if (bcmd === "LOD") lodDist = parseFloat(btok[1]);
        else if (bcmd === "END") break;
      }

      let ter;
      if (caches.ter.has(fn)) {
        ter = caches.ter.get(fn)!;
      } else {
        ter = await loadTer(basePath + fn);
        caches.ter.set(fn, ter);
      }
      terList.push({ pos, ter, fn, id, tag, lodDist });
    } else if (cmd === "RGN") {
      let pos: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
      let min = { x: 0, y: 0 };
      let max = { x: 0, y: 0 };
      let id = 0;
      let tag = "";

      let bline: string | null;
      while ((bline = nextLine()) !== null) {
        const btok = bline.split(/\s+/);
        const bcmd = btok[0].toUpperCase();
        if (bcmd === "ARE") {
          min = { x: parseFloat(btok[1]), y: parseFloat(btok[2]) };
          max = { x: parseFloat(btok[3]), y: parseFloat(btok[4]) };
        } else if (bcmd === "POS") {
          pos = parsePos(btok, 1);
        } else if (bcmd === "ID") {
          id = parseInt(btok[1]);
        } else if (bcmd === "TAG") {
          tag = btok[1] || "";
        } else if (bcmd === "END") {
          break;
        }
      }

      rgnList.push({ pos, min, max, id, tag });
    } else if (cmd === "FLD") {
      let fn = "";
      let pos: PosAtt = { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } };
      let lodDist = 10000000;

      let bline: string | null;
      while ((bline = nextLine()) !== null) {
        const btok = bline.split(/\s+/);
        const bcmd = btok[0].toUpperCase();
        if (bcmd === "FIL") {
          fn = btok[1];
        } else if (bcmd === "POS") {
          pos = parsePos(btok, 1);
        } else if (bcmd === "LOD") {
          lodDist = parseFloat(btok[1]);
        } else if (bcmd === "END") {
          break;
        }
      }

      let fld: Field;
      if (caches.fld.has(fn)) {
        fld = caches.fld.get(fn)!;
      } else {
        const url = basePath + fn;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
        const nestedText = await resp.text();
        const slash = url.lastIndexOf("/");
        const nestedBasePath = slash >= 0 ? url.substring(0, slash + 1) : basePath;
        fld = await parseFieldText(nestedText, nestedBasePath, caches);
        caches.fld.set(fn, fld);
      }
      fldList.push({ pos, fld, fn, lodDist });
    } else if (cmd === "ENDF") {
      break;
    }
  }

  return {
    sky,
    gnd,
    srf: srfList,
    ter: terList,
    pc2: pc2List,
    plt: pltList,
    rgn: rgnList,
    fld: fldList,
  };
}
