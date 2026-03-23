import type { Field, FieldPc2, FieldSrf } from "./types";
import { colorFromRGB, vec3 } from "./math";
import type { BuildingSpec, RoadStyle } from "./scene-models";
import {
  createBoxModel,
  createWindowedBoxModel,
  createRectangleObject,
  createRoadSegmentObjects,
  createCrosswalkObject,
  createPc2,
  buildMidpoints,
} from "./scene-models";

const DOWNTOWN_TAG = "__browser_downtown_augmented__";

export function enhanceDowntownField(field: Field): Field {
  if (
    field.srf.some((obj) => obj.tag === DOWNTOWN_TAG) ||
    field.pc2.some((obj) => obj.fn === DOWNTOWN_TAG)
  ) {
    return field;
  }
  return {
    ...field,
    sky: colorFromRGB(86, 126, 178),
    gnd: colorFromRGB(52, 54, 58),
    pc2: [...field.pc2, ...createDowntownOverlayEntries()],
    srf: [...field.srf, ...createDowntownBuildingEntries()],
  };
}

// --- Downtown Ground Overlay ---

function createDowntownOverlayEntries(): FieldPc2[] {
  const asphalt = colorFromRGB(54, 58, 64);
  const avenue = colorFromRGB(62, 66, 72);
  const shoulder = colorFromRGB(110, 112, 114);
  const plaza = colorFromRGB(118, 122, 126);
  const park = colorFromRGB(62, 92, 68);
  const parkLight = colorFromRGB(72, 104, 76);
  const lane = colorFromRGB(224, 206, 132);
  const edge = colorFromRGB(232, 232, 228);
  const crosswalk = colorFromRGB(214, 216, 220);
  const water = colorFromRGB(56, 92, 138);
  const sidewalk = colorFromRGB(136, 132, 126);
  const courtyard = colorFromRGB(108, 106, 100);
  const lot = colorFromRGB(78, 80, 84);
  const brick = colorFromRGB(140, 100, 80);

  const objects = [];
  const blockXs = [-810, -570, -330, -90, 150, 390, 630, 870];
  const blockZs = [-810, -570, -330, -90, 150, 390, 630, 870];
  const roadXs = buildMidpoints(blockXs);
  const roadZs = buildMidpoints(blockZs);

  const avenueStyle: RoadStyle = {
    shoulderColor: shoulder,
    asphaltColor: avenue,
    shoulderWidth: 4,
    medianColor: colorFromRGB(86, 86, 82),
    medianWidth: 5,
    medianInset: 20,
    markings: [
      { offsetX: -14, width: 1.6, color: edge, dashLength: 16, gapLength: 12, inset: 18 },
      { offsetX: 14, width: 1.6, color: edge, dashLength: 16, gapLength: 12, inset: 18 },
      { offsetX: -3.6, width: 1.2, color: lane, dashLength: 0, gapLength: 0, inset: 18 },
      { offsetX: 3.6, width: 1.2, color: lane, dashLength: 0, gapLength: 0, inset: 18 },
      { offsetX: -22, width: 1.4, color: edge, dashLength: 0, gapLength: 0, inset: 14 },
      { offsetX: 22, width: 1.4, color: edge, dashLength: 0, gapLength: 0, inset: 14 },
    ],
  };
  const streetStyle: RoadStyle = {
    shoulderColor: shoulder,
    asphaltColor: asphalt,
    shoulderWidth: 3,
    markings: [
      { offsetX: 0, width: 1.4, color: lane, dashLength: 18, gapLength: 16, inset: 14 },
      { offsetX: -13, width: 1.1, color: edge, dashLength: 0, gapLength: 0, inset: 12 },
      { offsetX: 13, width: 1.1, color: edge, dashLength: 0, gapLength: 0, inset: 12 },
    ],
  };

  // Roads
  for (const x of roadXs) {
    const isAve = Math.abs(x) < 90;
    objects.push(
      ...createRoadSegmentObjects(x, 0, isAve ? 46 : 28, 2140, 0, isAve ? avenueStyle : streetStyle)
    );
  }
  for (const z of roadZs) {
    const isAve = Math.abs(z) < 90;
    objects.push(
      ...createRoadSegmentObjects(
        0,
        z,
        isAve ? 46 : 28,
        2140,
        16384,
        isAve ? avenueStyle : streetStyle
      )
    );
  }

  // Plazas, parks, water
  objects.push(
    createRectangleObject(plaza, 0, 0, 190, 190, 0),
    createRectangleObject(plaza, 390, -390, 120, 150, 0),
    createRectangleObject(park, -420, 390, 190, 210, 0),
    createRectangleObject(park, 450, 450, 170, 170, 0),
    createRectangleObject(water, -960, -620, 220, 1150, 0)
  );

  // Block interiors — sidewalks, courtyards, parking lots, green spaces
  const blockWaterRect = {
    minX: -960 - 110,
    maxX: -960 + 110,
    minZ: -620 - 575,
    maxZ: -620 + 575,
  };
  for (let ix = 0; ix < blockXs.length - 1; ix++) {
    for (let iz = 0; iz < blockZs.length - 1; iz++) {
      const cx = (blockXs[ix] + blockXs[ix + 1]) * 0.5;
      const cz = (blockZs[iz] + blockZs[iz + 1]) * 0.5;
      const bw = Math.abs(blockXs[ix + 1] - blockXs[ix]) - 60;
      const bd = Math.abs(blockZs[iz + 1] - blockZs[iz]) - 60;
      if (bw < 40 || bd < 40) continue;
      if (Math.abs(cx) < 120 && Math.abs(cz) < 120) continue;

      // Calculate block bounds for water check
      const bMinX = cx - bw * 0.5;
      const bMaxX = cx + bw * 0.5;
      const bMinZ = cz - bd * 0.5;
      const bMaxZ = cz + bd * 0.5;

      // Skip blocks that overlap with water area
      if (
        bMinX < blockWaterRect.maxX &&
        bMaxX > blockWaterRect.minX &&
        bMinZ < blockWaterRect.maxZ &&
        bMaxZ > blockWaterRect.minZ
      ) {
        continue;
      }

      const seed = (ix * 7 + iz * 13) % 8;
      if (seed < 2) {
        // Green courtyard with inner garden
        objects.push(createRectangleObject(sidewalk, cx, cz, bw, bd, 0));
        objects.push(createRectangleObject(parkLight, cx, cz, bw * 0.35, bd * 0.35, 0));
      } else if (seed < 4) {
        // Brick courtyard
        objects.push(createRectangleObject(courtyard, cx, cz, bw * 0.9, bd * 0.9, 0));
        objects.push(createRectangleObject(brick, cx + bw * 0.2, cz, bw * 0.15, bd * 0.4, 0));
      } else if (seed < 5) {
        // Parking lot with lines
        objects.push(createRectangleObject(lot, cx, cz, bw * 0.85, bd * 0.85, 0));
        for (let row = 0; row < 3; row++) {
          const ly = cz - bd * 0.3 + row * bd * 0.25;
          objects.push(createRectangleObject(edge, cx, ly, bw * 0.75, 1.2, 0));
        }
      } else {
        // Plain sidewalk
        objects.push(createRectangleObject(sidewalk, cx, cz, bw * 0.6, bd * 0.6, 0));
      }
    }
  }

  // Crosswalks and intersection sidewalks
  for (const x of roadXs) {
    for (const z of roadZs) {
      if (Math.abs(x) < 80 && Math.abs(z) < 80) continue;
      objects.push(createCrosswalkObject(x, z, crosswalk));
      objects.push(createRectangleObject(sidewalk, x, z, 56, 56, 0));
    }
  }

  // Landmark surroundings
  objects.push(
    createRectangleObject(sidewalk, -420, 390, 210, 230, 0),
    createRectangleObject(sidewalk, 450, 450, 190, 190, 0),
    createRectangleObject(parkLight, 0, 0, 36, 36, 0),
    createRectangleObject(courtyard, 390, -390, 140, 170, 0),
    createRectangleObject(sidewalk, -520, -460, 200, 140, 0)
  );

  return [
    {
      pos: { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } },
      pc2: createPc2(objects),
      fn: DOWNTOWN_TAG,
      lodDist: 10000000,
    },
  ];
}

// --- Downtown Buildings ---

function createDowntownBuildingEntries(): FieldSrf[] {
  const specs: BuildingSpec[] = [];
  const xs = [-810, -570, -330, -90, 150, 390, 630, 870];
  const zs = [-810, -570, -330, -90, 150, 390, 630, 870];
  const glassBlue = colorFromRGB(120, 165, 210);
  const glassTeal = colorFromRGB(95, 155, 180);
  const glassDark = colorFromRGB(80, 120, 160);

  // Water rectangle bounds (from createRectangleObject(water, -960, -620, 220, 1150, 0))
  const waterRect = {
    minX: -960 - 110,
    maxX: -960 + 110,
    minZ: -620 - 575,
    maxZ: -620 + 575,
  };

  for (let ix = 0; ix < xs.length; ix++) {
    for (let iz = 0; iz < zs.length; iz++) {
      const x = xs[ix];
      const z = zs[iz];
      if (Math.abs(x) < 120 && Math.abs(z) < 120) continue;
      if (x < -860) continue;

      const dist = Math.sqrt(x * x + z * z);
      const cent = Math.max(0, 1 - dist / 1300);
      const w = 56 + ((ix * 17 + iz * 11) % 34);
      const d = 48 + ((ix * 13 + iz * 19) % 30);

      // Calculate building bounds for water check
      const bMinX = x - w * 0.5;
      const bMaxX = x + w * 0.5;
      const bMinZ = z - d * 0.5;
      const bMaxZ = z + d * 0.5;

      // Skip buildings that overlap with water area
      if (
        bMinX < waterRect.maxX &&
        bMaxX > waterRect.minX &&
        bMinZ < waterRect.maxZ &&
        bMaxZ > waterRect.minZ
      ) {
        continue;
      }

      const h = 30 + cent * 180 + ((ix * 29 + iz * 23) % 46);
      const hdg = (ix + iz) % 3 === 0 ? 16384 : 0;
      const wall = (ix + iz) % 2 === 0 ? colorFromRGB(98, 108, 122) : colorFromRGB(118, 120, 128);
      const roof = (ix + iz) % 2 === 0 ? colorFromRGB(70, 78, 90) : colorFromRGB(86, 88, 96);

      const winCount = Math.max(3, Math.min(12, Math.floor(h / 18)));
      const winColor =
        (ix + iz) % 3 === 0 ? glassTeal : (ix + iz) % 3 === 1 ? glassBlue : glassDark;
      const winSize = 4 + ((ix * 7 + iz * 3) % 3);

      specs.push({
        name: `tower-${ix}-${iz}`,
        pos: { p: vec3(x, 0, z), a: { h: hdg, p: 0, b: 0 } },
        model: createWindowedBoxModel(w, d, h, wall, roof, winColor, winCount, winSize, 3.0, 2.5),
      });

      // Podium at base of some towers
      if ((ix + iz) % 2 === 0 && cent > 0.2) {
        specs.push({
          name: `podium-${ix}-${iz}`,
          pos: { p: vec3(x + 34, 0, z - 28), a: { h: 0, p: 0, b: 0 } },
          model: createWindowedBoxModel(
            42,
            32,
            18 + cent * 16,
            colorFromRGB(134, 128, 122),
            colorFromRGB(92, 88, 84),
            glassBlue,
            3,
            5,
            3.5,
            3.0
          ),
        });
      }

      // Annex building adjacent to central towers
      if (cent > 0.35 && (ix + iz) % 3 === 0) {
        specs.push({
          name: `annex-${ix}-${iz}`,
          pos: { p: vec3(x - 42, 0, z + 26), a: { h: hdg, p: 0, b: 0 } },
          model: createWindowedBoxModel(
            28 + ((ix * 11 + iz * 7) % 16),
            24 + ((ix * 9 + iz * 13) % 12),
            14 + cent * 30 + ((ix * 5 + iz * 17) % 18),
            colorFromRGB(106, 114, 124),
            colorFromRGB(82, 88, 96),
            glassTeal,
            4,
            4,
            3.0,
            2.5
          ),
        });
      }

      // Roof mechanical structure on tall buildings
      if (h > 120 && (ix + iz) % 4 === 0) {
        specs.push({
          name: `roof-${ix}-${iz}`,
          pos: { p: vec3(x, h, z), a: { h: hdg, p: 0, b: 0 } },
          model: createBoxModel(
            w * 0.3,
            d * 0.3,
            8,
            colorFromRGB(78, 84, 92),
            colorFromRGB(60, 66, 74)
          ),
        });
      }

      // Antenna on very central tall buildings
      if (cent > 0.6 && (ix + iz) % 5 === 0) {
        specs.push({
          name: `antenna-${ix}-${iz}`,
          pos: { p: vec3(x, h + 8, z), a: { h: 0, p: 0, b: 0 } },
          model: createBoxModel(
            3,
            3,
            20 + cent * 15,
            colorFromRGB(140, 140, 148),
            colorFromRGB(160, 160, 168)
          ),
        });
      }
    }
  }

  // Landmark buildings
  specs.push(
    {
      name: "city-hall",
      pos: { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } },
      model: createWindowedBoxModel(
        120,
        90,
        42,
        colorFromRGB(176, 170, 160),
        colorFromRGB(128, 122, 114),
        glassBlue,
        5,
        8,
        4.0,
        3.5
      ),
    },
    {
      name: "spire-north",
      pos: { p: vec3(180, 0, -180), a: { h: 0, p: 0, b: 0 } },
      model: createWindowedBoxModel(
        62,
        62,
        240,
        colorFromRGB(96, 106, 122),
        colorFromRGB(66, 72, 84),
        glassTeal,
        14,
        5,
        3.0,
        2.0
      ),
    },
    {
      name: "spire-west",
      pos: { p: vec3(-180, 0, 180), a: { h: 0, p: 0, b: 0 } },
      model: createWindowedBoxModel(
        70,
        58,
        220,
        colorFromRGB(110, 118, 130),
        colorFromRGB(74, 80, 92),
        glassDark,
        13,
        5,
        3.0,
        2.0
      ),
    },
    {
      name: "stadium",
      pos: { p: vec3(-520, 0, -460), a: { h: 0, p: 0, b: 0 } },
      model: createBoxModel(180, 120, 32, colorFromRGB(122, 126, 132), colorFromRGB(84, 88, 94)),
    },
    {
      name: "church",
      pos: { p: vec3(-450, 0, 500), a: { h: 16384, p: 0, b: 0 } },
      model: createBoxModel(36, 52, 48, colorFromRGB(168, 162, 152), colorFromRGB(110, 104, 96)),
    },
    {
      name: "church-tower",
      pos: { p: vec3(-450, 48, -26), a: { h: 0, p: 0, b: 0 } },
      model: createBoxModel(16, 16, 30, colorFromRGB(160, 154, 144), colorFromRGB(100, 94, 86)),
    },
    {
      name: "warehouse-1",
      pos: { p: vec3(700, 0, -600), a: { h: 0, p: 0, b: 0 } },
      model: createBoxModel(120, 80, 14, colorFromRGB(130, 126, 118), colorFromRGB(100, 96, 88)),
    },
    {
      name: "warehouse-2",
      pos: { p: vec3(700, 0, -460), a: { h: 0, p: 0, b: 0 } },
      model: createBoxModel(100, 70, 14, colorFromRGB(124, 120, 112), colorFromRGB(94, 90, 82)),
    }
  );

  // Filter out landmarks that overlap with water
  const landmarkWaterRect = {
    minX: -960 - 110,
    maxX: -960 + 110,
    minZ: -620 - 575,
    maxZ: -620 + 575,
  };
  const filteredSpecs = specs.filter((spec) => {
    const x = spec.pos.p.x;
    const z = spec.pos.p.z;

    // Calculate landmark dimensions (approximate average size)
    // This is a simplified check - for precise checking we'd need actual dimensions
    const landmarkSize = 60; // Approximate average landmark size

    // Calculate landmark bounds
    const lMinX = x - landmarkSize * 0.5;
    const lMaxX = x + landmarkSize * 0.5;
    const lMinZ = z - landmarkSize * 0.5;
    const lMaxZ = z + landmarkSize * 0.5;

    // Check if landmark overlaps with water
    if (
      lMaxX > landmarkWaterRect.minX &&
      lMinX < landmarkWaterRect.maxX &&
      lMaxZ > landmarkWaterRect.minZ &&
      lMinZ < landmarkWaterRect.maxZ
    ) {
      return false;
    }
    return true;
  });

  return filteredSpecs.map((spec, index) => ({
    pos: spec.pos,
    srf: spec.model,
    fn: `${DOWNTOWN_TAG}:${spec.name}`,
    id: 2000 + index,
    tag: DOWNTOWN_TAG,
    lodDist: 10000000,
  }));
}
