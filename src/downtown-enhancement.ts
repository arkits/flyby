import type { Field, FieldPc2, FieldSrf, Pc2Object } from "./types";
import { colorFromRGB, vec3 } from "./math";
import type { BuildingSpec, RoadStyle } from "./scene-models";
import {
  buildMidpoints,
  createBoxModel,
  createCrosswalkObject,
  createPc2,
  createRectangleObject,
  createRoadSegmentObjects,
  createWindowedBoxModel,
} from "./scene-models";

const DOWNTOWN_TAG = "__browser_downtown_augmented__";

const LOT_XS = [-900, -640, -380, -140, 140, 380, 640, 900];
const LOT_ZS = [-900, -640, -380, -140, 140, 380, 640, 900];

const WATER_RECT = {
  minX: -1070,
  maxX: -850,
  minZ: -1195,
  maxZ: -45,
};

const FLIGHT_CORRIDOR = {
  minX: -170,
  maxX: 170,
  minZ: -1080,
  maxZ: 960,
};

const CENTRAL_CLEAR_RADIUS = 250;

export function enhanceDowntownField(field: Field): Field {
  if (
    field.srf.some((obj) => obj.tag === DOWNTOWN_TAG) ||
    field.pc2.some((obj) => obj.fn === DOWNTOWN_TAG)
  ) {
    return field;
  }

  return {
    ...field,
    sky: colorFromRGB(106, 142, 188),
    gnd: colorFromRGB(60, 62, 66),
    pc2: [...field.pc2, ...createDowntownOverlayEntries()],
    srf: [...field.srf, ...createDowntownBuildingEntries()],
  };
}

function overlapsRect(
  x: number,
  z: number,
  width: number,
  depth: number,
  rect: { minX: number; maxX: number; minZ: number; maxZ: number },
  padding = 0
): boolean {
  const halfW = width * 0.5 + padding;
  const halfD = depth * 0.5 + padding;

  return (
    x - halfW < rect.maxX && x + halfW > rect.minX && z - halfD < rect.maxZ && z + halfD > rect.minZ
  );
}

function inFlightCorridor(
  x: number,
  z: number,
  width: number,
  depth: number,
  padding = 0
): boolean {
  return overlapsRect(x, z, width, depth, FLIGHT_CORRIDOR, padding);
}

function inWater(x: number, z: number, width: number, depth: number, padding = 0): boolean {
  return overlapsRect(x, z, width, depth, WATER_RECT, padding);
}

function inCentralAirspace(x: number, z: number): boolean {
  return Math.hypot(x, z) < CENTRAL_CLEAR_RADIUS;
}

function addWindowedBuilding(
  specs: BuildingSpec[],
  name: string,
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  wall: ReturnType<typeof colorFromRGB>,
  roof: ReturnType<typeof colorFromRGB>,
  glass: ReturnType<typeof colorFromRGB>,
  hdg = 0,
  windowRows = 6,
  windowWidth = 5,
  windowHeight = 3.5,
  gapHeight = 3
): void {
  specs.push({
    name,
    pos: { p: vec3(x, 0, z), a: { h: hdg, p: 0, b: 0 } },
    model: createWindowedBoxModel(
      width,
      depth,
      height,
      wall,
      roof,
      glass,
      windowRows,
      windowWidth,
      windowHeight,
      gapHeight
    ),
  });
}

function addBoxBuilding(
  specs: BuildingSpec[],
  name: string,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  wall: ReturnType<typeof colorFromRGB>,
  roof: ReturnType<typeof colorFromRGB>,
  hdg = 0
): void {
  specs.push({
    name,
    pos: { p: vec3(x, y, z), a: { h: hdg, p: 0, b: 0 } },
    model: createBoxModel(width, depth, height, wall, roof),
  });
}

function createDowntownOverlayEntries(): FieldPc2[] {
  const objects: Pc2Object[] = [];
  const roadXs = buildMidpoints(LOT_XS);
  const roadZs = buildMidpoints(LOT_ZS);

  const avenue = colorFromRGB(66, 70, 76);
  const street = colorFromRGB(58, 62, 68);
  const broadway = colorFromRGB(74, 76, 82);
  const curb = colorFromRGB(118, 116, 112);
  const sidewalk = colorFromRGB(142, 136, 128);
  const sidewalkDark = colorFromRGB(120, 114, 108);
  const plaza = colorFromRGB(154, 148, 140);
  const plazaDark = colorFromRGB(132, 126, 120);
  const lane = colorFromRGB(232, 206, 120);
  const edge = colorFromRGB(236, 236, 232);
  const busLane = colorFromRGB(122, 46, 40);
  const planter = colorFromRGB(80, 98, 74);
  const planterLight = colorFromRGB(94, 116, 84);
  const crosswalk = colorFromRGB(224, 224, 226);
  const water = colorFromRGB(56, 92, 138);
  const lot = colorFromRGB(86, 88, 92);
  const loading = colorFromRGB(96, 96, 88);
  const taxiStand = colorFromRGB(142, 110, 54);

  const avenueStyle: RoadStyle = {
    shoulderColor: curb,
    asphaltColor: avenue,
    shoulderWidth: 4,
    medianColor: colorFromRGB(86, 88, 82),
    medianWidth: 5,
    medianInset: 24,
    markings: [
      { offsetX: -21, width: 1.5, color: edge, dashLength: 0, gapLength: 0, inset: 14 },
      { offsetX: 21, width: 1.5, color: edge, dashLength: 0, gapLength: 0, inset: 14 },
      { offsetX: -7.5, width: 1.2, color: lane, dashLength: 18, gapLength: 12, inset: 18 },
      { offsetX: 7.5, width: 1.2, color: lane, dashLength: 18, gapLength: 12, inset: 18 },
      { offsetX: -2.6, width: 1.2, color: lane, dashLength: 0, gapLength: 0, inset: 20 },
      { offsetX: 2.6, width: 1.2, color: lane, dashLength: 0, gapLength: 0, inset: 20 },
    ],
  };

  const streetStyle: RoadStyle = {
    shoulderColor: curb,
    asphaltColor: street,
    shoulderWidth: 3,
    markings: [
      { offsetX: -13, width: 1.05, color: edge, dashLength: 0, gapLength: 0, inset: 12 },
      { offsetX: 13, width: 1.05, color: edge, dashLength: 0, gapLength: 0, inset: 12 },
      { offsetX: 0, width: 1.2, color: lane, dashLength: 16, gapLength: 16, inset: 14 },
    ],
  };

  const broadwayStyle: RoadStyle = {
    shoulderColor: curb,
    asphaltColor: broadway,
    shoulderWidth: 4,
    medianColor: plazaDark,
    medianWidth: 4,
    medianInset: 38,
    markings: [
      { offsetX: -16.5, width: 1.2, color: edge, dashLength: 0, gapLength: 0, inset: 28 },
      { offsetX: 16.5, width: 1.2, color: edge, dashLength: 0, gapLength: 0, inset: 28 },
      { offsetX: 0, width: 1.2, color: lane, dashLength: 24, gapLength: 18, inset: 42 },
    ],
  };

  for (const x of roadXs) {
    const isGrandAvenue = Math.abs(x) < 90;
    const width = isGrandAvenue ? 60 : Math.abs(x) < 340 ? 38 : 30;
    objects.push(
      ...createRoadSegmentObjects(x, 0, width, 2260, 0, isGrandAvenue ? avenueStyle : streetStyle)
    );

    if (isGrandAvenue) {
      objects.push(
        createRectangleObject(busLane, x - 15, 0, 5.5, 2180, 0),
        createRectangleObject(busLane, x + 15, 0, 5.5, 2180, 0),
        createRectangleObject(planter, x, -220, 8, 90, 0),
        createRectangleObject(planter, x, 220, 8, 90, 0)
      );
    }
  }

  for (const z of roadZs) {
    const isBroadCrosstown = Math.abs(z) < 90 || Math.abs(z - 260) < 40 || Math.abs(z + 260) < 40;
    const width = isBroadCrosstown ? 42 : 30;
    objects.push(
      ...createRoadSegmentObjects(
        0,
        z,
        width,
        2260,
        16384,
        isBroadCrosstown ? avenueStyle : streetStyle
      )
    );

    if (isBroadCrosstown) {
      objects.push(
        createRectangleObject(busLane, -220, z - 10, 180, 5, 16384),
        createRectangleObject(busLane, 220, z + 10, 180, 5, 16384)
      );
    }
  }

  objects.push(...createRoadSegmentObjects(-40, -30, 42, 2300, 5632, broadwayStyle));

  objects.push(
    createRectangleObject(water, -960, -620, 220, 1150, 0),
    createRectangleObject(plaza, 0, -40, 180, 240, 0),
    createRectangleObject(plaza, -250, -40, 86, 250, 0),
    createRectangleObject(plaza, 250, -20, 86, 230, 0),
    createRectangleObject(plazaDark, -86, 80, 96, 48, 0),
    createRectangleObject(plazaDark, 92, -96, 84, 40, 0),
    createRectangleObject(planterLight, 0, -28, 30, 94, 0),
    createRectangleObject(planter, -248, 48, 22, 72, 0),
    createRectangleObject(planter, 252, -88, 22, 68, 0),
    createRectangleObject(sidewalkDark, -530, 500, 170, 180, 0),
    createRectangleObject(sidewalkDark, 540, 500, 170, 180, 0)
  );

  for (let ix = 0; ix < LOT_XS.length - 1; ix++) {
    for (let iz = 0; iz < LOT_ZS.length - 1; iz++) {
      const cx = (LOT_XS[ix] + LOT_XS[ix + 1]) * 0.5;
      const cz = (LOT_ZS[iz] + LOT_ZS[iz + 1]) * 0.5;
      const width = Math.abs(LOT_XS[ix + 1] - LOT_XS[ix]) - 60;
      const depth = Math.abs(LOT_ZS[iz + 1] - LOT_ZS[iz]) - 60;
      if (width < 50 || depth < 50) continue;
      if (inWater(cx, cz, width, depth)) continue;

      if (inFlightCorridor(cx, cz, width, depth, 18) || inCentralAirspace(cx, cz)) {
        objects.push(createRectangleObject(plaza, cx, cz, width * 0.88, depth * 0.88, 0));
        if (Math.abs(cx) < 360 && Math.abs(cz) < 300) {
          objects.push(createRectangleObject(planterLight, cx, cz, width * 0.22, depth * 0.26, 0));
        }
        continue;
      }

      const seed = (ix * 11 + iz * 17) % 7;
      if (Math.abs(cx) < 460 && Math.abs(cz) < 420) {
        objects.push(
          createRectangleObject(sidewalk, cx, cz, width * 0.92, depth * 0.92, 0),
          createRectangleObject(plazaDark, cx, cz, width * 0.48, depth * 0.22, 0)
        );
      } else if (seed <= 1) {
        objects.push(
          createRectangleObject(sidewalk, cx, cz, width * 0.9, depth * 0.9, 0),
          createRectangleObject(planter, cx, cz, width * 0.34, depth * 0.28, 0)
        );
      } else if (seed <= 3) {
        objects.push(
          createRectangleObject(lot, cx, cz, width * 0.88, depth * 0.88, 0),
          createRectangleObject(edge, cx, cz - depth * 0.22, width * 0.72, 1.1, 0),
          createRectangleObject(edge, cx, cz + depth * 0.02, width * 0.72, 1.1, 0),
          createRectangleObject(edge, cx, cz + depth * 0.26, width * 0.72, 1.1, 0)
        );
      } else if (seed === 4) {
        objects.push(
          createRectangleObject(sidewalkDark, cx, cz, width * 0.84, depth * 0.84, 0),
          createRectangleObject(loading, cx, cz, width * 0.24, depth * 0.5, 0)
        );
      } else {
        objects.push(
          createRectangleObject(sidewalk, cx, cz, width * 0.86, depth * 0.86, 0),
          createRectangleObject(taxiStand, cx + width * 0.2, cz, width * 0.12, depth * 0.42, 0)
        );
      }
    }
  }

  for (const x of roadXs) {
    for (const z of roadZs) {
      if (Math.abs(x) < 88 && Math.abs(z) < 88) continue;
      objects.push(createCrosswalkObject(x, z, crosswalk));
      objects.push(createRectangleObject(sidewalk, x, z, 56, 56, 0));

      if (Math.abs(x) < 320 && Math.abs(z) < 320) {
        objects.push(createRectangleObject(plazaDark, x, z, 18, 18, 0));
      }
    }
  }

  return [
    {
      pos: { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } },
      pc2: createPc2(objects),
      fn: DOWNTOWN_TAG,
      lodDist: 10000000,
    },
  ];
}

function createDowntownBuildingEntries(): FieldSrf[] {
  const specs: BuildingSpec[] = [];
  const glassBlue = colorFromRGB(122, 176, 226);
  const glassTeal = colorFromRGB(88, 172, 188);
  const glassWarm = colorFromRGB(232, 212, 150);
  const glassDark = colorFromRGB(98, 134, 176);
  const concrete = colorFromRGB(114, 120, 130);
  const concreteDark = colorFromRGB(84, 90, 100);
  const limestone = colorFromRGB(176, 166, 154);
  const limestoneRoof = colorFromRGB(124, 118, 110);
  const graphite = colorFromRGB(72, 78, 90);
  const graphiteRoof = colorFromRGB(52, 58, 70);
  const bronze = colorFromRGB(124, 112, 96);
  const bronzeRoof = colorFromRGB(92, 84, 74);

  for (let ix = 0; ix < LOT_XS.length; ix++) {
    for (let iz = 0; iz < LOT_ZS.length; iz++) {
      const x = LOT_XS[ix];
      const z = LOT_ZS[iz];
      const centralDistrict = Math.abs(x) < 460 && Math.abs(z) < 420;
      if (centralDistrict) continue;

      const width = 62 + ((ix * 17 + iz * 11) % 26);
      const depth = 54 + ((ix * 13 + iz * 19) % 22);
      if (inWater(x, z, width, depth, 14)) continue;
      if (inFlightCorridor(x, z, width, depth, 28)) continue;
      if (inCentralAirspace(x, z)) continue;

      const dist = Math.hypot(x, z);
      const timesSquareShoulder = Math.abs(x) < 620 && Math.abs(x) > 180 && Math.abs(z) < 520;
      let height =
        58 +
        Math.max(0, 1 - dist / 1550) * 128 +
        ((ix * 29 + iz * 23) % 30) +
        (timesSquareShoulder ? 34 : 0);

      if (Math.abs(x) > 760 || Math.abs(z) > 760) height *= 0.72;
      if (Math.abs(z) > 640) height *= 0.84;
      if (x < -760 && z < -120) height *= 0.7;
      height = Math.min(246, height);

      const hdg = (ix + iz) % 3 === 0 ? 16384 : 0;
      const wall = timesSquareShoulder
        ? (ix + iz) % 2 === 0
          ? graphite
          : concreteDark
        : (ix + iz) % 2 === 0
          ? concrete
          : bronze;
      const roof = timesSquareShoulder
        ? (ix + iz) % 2 === 0
          ? graphiteRoof
          : concreteDark
        : (ix + iz) % 2 === 0
          ? concreteDark
          : bronzeRoof;
      const glass =
        (ix + iz) % 4 === 0
          ? glassWarm
          : (ix + iz) % 3 === 0
            ? glassTeal
            : (ix + iz) % 2 === 0
              ? glassBlue
              : glassDark;

      addWindowedBuilding(
        specs,
        `outer-tower-${ix}-${iz}`,
        x,
        z,
        width,
        depth,
        height,
        wall,
        roof,
        glass,
        hdg,
        Math.max(6, Math.round(height / 18)),
        4.5,
        3.6,
        2.8
      );

      if (timesSquareShoulder) {
        addWindowedBuilding(
          specs,
          `outer-podium-${ix}-${iz}`,
          x + (x < 0 ? 36 : -36),
          z + ((ix + iz) % 2 === 0 ? -26 : 28),
          48,
          34,
          28,
          limestone,
          limestoneRoof,
          glassWarm,
          hdg,
          4,
          5,
          3.8,
          2.8
        );
      }

      if (height > 132) {
        addBoxBuilding(
          specs,
          `outer-roof-${ix}-${iz}`,
          x,
          height,
          z,
          width * 0.28,
          depth * 0.26,
          10,
          colorFromRGB(74, 78, 84),
          colorFromRGB(60, 64, 70),
          hdg
        );
      }
    }
  }

  const timesSquareClusters = [
    {
      name: "west-marquee-south",
      x: -290,
      z: -230,
      width: 92,
      depth: 66,
      height: 188,
      wall: graphite,
      roof: graphiteRoof,
      glass: glassTeal,
    },
    {
      name: "west-marquee-mid",
      x: -300,
      z: 20,
      width: 98,
      depth: 70,
      height: 176,
      wall: concreteDark,
      roof: graphiteRoof,
      glass: glassBlue,
    },
    {
      name: "west-marquee-north",
      x: -316,
      z: 278,
      width: 88,
      depth: 62,
      height: 214,
      wall: graphite,
      roof: graphiteRoof,
      glass: glassWarm,
    },
    {
      name: "east-marquee-south",
      x: 292,
      z: -210,
      width: 90,
      depth: 68,
      height: 194,
      wall: graphite,
      roof: graphiteRoof,
      glass: glassBlue,
    },
    {
      name: "east-marquee-mid",
      x: 308,
      z: 34,
      width: 102,
      depth: 72,
      height: 204,
      wall: concreteDark,
      roof: graphiteRoof,
      glass: glassTeal,
    },
    {
      name: "east-marquee-north",
      x: 292,
      z: 286,
      width: 90,
      depth: 62,
      height: 222,
      wall: graphite,
      roof: graphiteRoof,
      glass: glassWarm,
    },
  ] as const;

  const signPalettes = [
    [colorFromRGB(232, 72, 64), colorFromRGB(160, 40, 34)],
    [colorFromRGB(62, 168, 210), colorFromRGB(34, 102, 142)],
    [colorFromRGB(242, 188, 72), colorFromRGB(152, 112, 38)],
  ] as const;

  for (const cluster of timesSquareClusters) {
    addWindowedBuilding(
      specs,
      cluster.name,
      cluster.x,
      cluster.z,
      cluster.width,
      cluster.depth,
      cluster.height,
      cluster.wall,
      cluster.roof,
      cluster.glass,
      0,
      Math.max(10, Math.round(cluster.height / 16)),
      4.6,
      3.8,
      2.6
    );

    addWindowedBuilding(
      specs,
      `${cluster.name}-podium`,
      cluster.x + (cluster.x < 0 ? 42 : -42),
      cluster.z + (cluster.z < 0 ? 12 : -12),
      54,
      42,
      34,
      limestone,
      limestoneRoof,
      glassWarm,
      0,
      5,
      5.5,
      4,
      2.6
    );

    const signX =
      cluster.x < 0 ? cluster.x + cluster.width * 0.5 - 7 : cluster.x - cluster.width * 0.5 + 7;
    const signHeading = 16384;
    const signZOffsets = [-18, 0, 18];
    const signHeights = [14, 18, 12];

    for (let i = 0; i < 3; i++) {
      const [face, frame] =
        signPalettes[(i + Math.abs(Math.round(cluster.z / 10))) % signPalettes.length];
      addBoxBuilding(
        specs,
        `${cluster.name}-sign-${i}`,
        signX,
        18 + i * 22,
        cluster.z + signZOffsets[i],
        28 + i * 4,
        4,
        signHeights[i],
        face,
        frame,
        signHeading
      );
    }

    addBoxBuilding(
      specs,
      `${cluster.name}-crown`,
      cluster.x,
      cluster.height,
      cluster.z,
      cluster.width * 0.24,
      cluster.depth * 0.2,
      10,
      colorFromRGB(82, 84, 92),
      colorFromRGB(60, 62, 70)
    );
  }

  addWindowedBuilding(
    specs,
    "midtown-spire-west",
    -520,
    120,
    72,
    58,
    240,
    concreteDark,
    graphiteRoof,
    glassBlue,
    0,
    12,
    4.5,
    3.7,
    2.4
  );
  addWindowedBuilding(
    specs,
    "midtown-spire-east",
    520,
    -80,
    70,
    56,
    248,
    concreteDark,
    graphiteRoof,
    glassTeal,
    0,
    12,
    4.5,
    3.7,
    2.4
  );
  addWindowedBuilding(
    specs,
    "grand-central-block",
    0,
    520,
    160,
    90,
    46,
    limestone,
    limestoneRoof,
    glassWarm,
    0,
    5,
    7.5,
    4,
    3
  );
  addWindowedBuilding(
    specs,
    "river-warehouse-1",
    720,
    -680,
    124,
    82,
    20,
    bronze,
    bronzeRoof,
    glassWarm,
    0,
    3,
    6.5,
    3.8,
    3.4
  );
  addWindowedBuilding(
    specs,
    "river-warehouse-2",
    760,
    -500,
    110,
    76,
    18,
    bronze,
    bronzeRoof,
    glassWarm,
    0,
    3,
    6.5,
    3.8,
    3.4
  );

  const filteredSpecs = specs.filter((spec) => {
    const bbox = spec.model.bbox;
    const min = bbox[0];
    const max = bbox[7];
    const width = max.x - min.x;
    const depth = max.z - min.z;
    const x = spec.pos.p.x;
    const z = spec.pos.p.z;
    return !inWater(x, z, width, depth, 6);
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
