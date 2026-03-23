import type {
  Color,
  Field,
  FieldPc2,
  FieldSrf,
  Pc2Object,
  SrfModel,
  SrfPolygon,
  SrfVertex,
  Vec2,
  Vec3,
} from "./types";
import { colorFromRGB, vec3 } from "./math";
import type { RoadStyle } from "./scene-models";
import {
  createBoxModel,
  createCrosswalkObject,
  createPc2,
  createRectangleObject,
  createRoadSegmentObjects,
  createWindowedBoxModel,
} from "./scene-models";

const SAN_FRANCISCO_TAG = "__browser_san_francisco_augmented__";
const FAR_LOD = 10000000;
const SF_DIRECTOR_CORRIDORS: Rect[] = [
  rectFromCenter(110, -360, 280, 980),
  rectFromCenter(40, -1030, 180, 320),
];

type Rect = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

type ModelBuilder = {
  vertices: SrfVertex[];
  polygons: SrfPolygon[];
};

type LandmarkSpec = {
  name: string;
  pos: FieldSrf["pos"];
  model: SrfModel;
};

type DistrictGrid = {
  xLines: number[];
  zLines: number[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  majorXs?: number[];
  majorZs?: number[];
};

export function enhanceSanFranciscoField(field: Field): Field {
  if (
    field.srf.some((obj) => obj.tag === SAN_FRANCISCO_TAG) ||
    field.pc2.some((obj) => obj.fn === SAN_FRANCISCO_TAG)
  ) {
    return field;
  }

  return {
    ...field,
    sky: colorFromRGB(118, 146, 188),
    gnd: colorFromRGB(86, 90, 94),
    pc2: [...field.pc2, ...createSanFranciscoOverlayEntries()],
    srf: [...field.srf, ...createSanFranciscoBuildingEntries()],
  };
}

function createSanFranciscoOverlayEntries(): FieldPc2[] {
  const asphalt = colorFromRGB(74, 79, 84);
  const arterial = colorFromRGB(84, 89, 95);
  const lane = colorFromRGB(228, 212, 148);
  const edge = colorFromRGB(236, 236, 232);
  const crosswalk = colorFromRGB(226, 228, 232);
  const concrete = colorFromRGB(150, 146, 138);
  const concreteLight = colorFromRGB(170, 166, 156);
  const warehouse = colorFromRGB(136, 124, 112);
  const pier = colorFromRGB(118, 96, 82);
  const park = colorFromRGB(94, 124, 92);
  const parkLight = colorFromRGB(114, 144, 104);
  const dryHill = colorFromRGB(144, 138, 116);
  const bayWater = colorFromRGB(68, 112, 156);
  const deepWater = colorFromRGB(48, 88, 134);
  const bridgeOrange = colorFromRGB(194, 92, 62);

  const objects: Pc2Object[] = [];

  const avenueStyle: RoadStyle = {
    shoulderColor: arterial,
    asphaltColor: arterial,
    shoulderWidth: 0,
    markings: [
      { offsetX: -16, width: 1.2, color: edge, dashLength: 0, gapLength: 0, inset: 10 },
      { offsetX: 16, width: 1.2, color: edge, dashLength: 0, gapLength: 0, inset: 10 },
      { offsetX: -1.2, width: 0.7, color: lane, dashLength: 0, gapLength: 0, inset: 14 },
      { offsetX: 1.2, width: 0.7, color: lane, dashLength: 0, gapLength: 0, inset: 14 },
    ],
  };
  const streetStyle: RoadStyle = {
    shoulderColor: asphalt,
    asphaltColor: asphalt,
    shoulderWidth: 0,
    markings: [
      { offsetX: 0, width: 0.8, color: lane, dashLength: 16, gapLength: 15, inset: 10 },
      { offsetX: -10, width: 0.8, color: edge, dashLength: 0, gapLength: 0, inset: 8 },
      { offsetX: 10, width: 0.8, color: edge, dashLength: 0, gapLength: 0, inset: 8 },
    ],
  };

  const openWater = [
    { x: -1800, y: -1400 },
    { x: 1800, y: -1400 },
    { x: 1800, y: 1400 },
    { x: -1800, y: 1400 },
  ];
  const peninsula = [
    { x: -780, y: -920 },
    { x: -440, y: -980 },
    { x: 60, y: -920 },
    { x: 360, y: -860 },
    { x: 520, y: -700 },
    { x: 600, y: -420 },
    { x: 610, y: 220 },
    { x: 540, y: 640 },
    { x: 420, y: 920 },
    { x: -120, y: 960 },
    { x: -460, y: 860 },
    { x: -620, y: 620 },
    { x: -700, y: 240 },
    { x: -730, y: -140 },
    { x: -760, y: -560 },
  ];
  const bay = [
    { x: 520, y: -980 },
    { x: 1040, y: -980 },
    { x: 1080, y: 980 },
    { x: 380, y: 980 },
    { x: 420, y: 840 },
    { x: 520, y: 520 },
    { x: 600, y: 220 },
    { x: 600, y: -420 },
    { x: 520, y: -700 },
  ];
  const goldenGateStrait = [
    { x: -1120, y: -980 },
    { x: -760, y: -980 },
    { x: -620, y: -820 },
    { x: -600, y: -620 },
    { x: -740, y: -520 },
    { x: -980, y: -520 },
    { x: -1120, y: -620 },
  ];
  const downtownPad = [
    { x: -40, y: -760 },
    { x: 420, y: -760 },
    { x: 520, y: -640 },
    { x: 520, y: 160 },
    { x: 380, y: 260 },
    { x: -60, y: 260 },
    { x: -140, y: 120 },
    { x: -120, y: -580 },
  ];
  const somaPad = [
    { x: -260, y: -120 },
    { x: 340, y: -120 },
    { x: 420, y: 140 },
    { x: 360, y: 640 },
    { x: -60, y: 760 },
    { x: -300, y: 700 },
    { x: -420, y: 360 },
    { x: -360, y: 60 },
  ];
  const northBeachPad = [
    { x: -140, y: -760 },
    { x: 240, y: -760 },
    { x: 380, y: -620 },
    { x: 340, y: -320 },
    { x: 160, y: -220 },
    { x: -100, y: -260 },
    { x: -220, y: -460 },
    { x: -220, y: -680 },
  ];
  const westernNeighborhood = [
    { x: -700, y: -260 },
    { x: -320, y: -260 },
    { x: -180, y: 40 },
    { x: -120, y: 720 },
    { x: -380, y: 820 },
    { x: -620, y: 680 },
    { x: -740, y: 260 },
  ];

  objects.push(
    createPolygonObject(deepWater, openWater),
    createPolygonObject(bayWater, bay),
    createPolygonObject(deepWater, goldenGateStrait),
    createPolygonObject(concreteLight, peninsula),
    createPolygonObject(concrete, downtownPad),
    createPolygonObject(concrete, somaPad),
    createPolygonObject(concreteLight, northBeachPad),
    createPolygonObject(concreteLight, westernNeighborhood),
    createPolygonObject(warehouse, [
      { x: 340, y: -620 },
      { x: 520, y: -620 },
      { x: 560, y: -420 },
      { x: 500, y: -240 },
      { x: 320, y: -240 },
      { x: 260, y: -420 },
    ]),
    createPolygonObject(park, [
      { x: -640, y: 140 },
      { x: -260, y: 140 },
      { x: -220, y: 420 },
      { x: -620, y: 420 },
    ]),
    createPolygonObject(parkLight, [
      { x: -700, y: -760 },
      { x: -520, y: -760 },
      { x: -420, y: -580 },
      { x: -560, y: -460 },
      { x: -720, y: -520 },
    ]),
    createPolygonObject(parkLight, [
      { x: -220, y: 360 },
      { x: 10, y: 320 },
      { x: 80, y: 520 },
      { x: -80, y: 700 },
      { x: -260, y: 620 },
    ]),
    createPolygonObject(dryHill, [
      { x: -360, y: -240 },
      { x: -80, y: -220 },
      { x: -20, y: 120 },
      { x: -200, y: 220 },
      { x: -360, y: 80 },
    ]),
    createPolygonObject(dryHill, [
      { x: -160, y: -520 },
      { x: 120, y: -520 },
      { x: 160, y: -300 },
      { x: 0, y: -220 },
      { x: -200, y: -300 },
    ]),
    createRectangleObject(concreteLight, 500, -250, 90, 680, 0),
    createRectangleObject(bridgeOrange, -820, -760, 560, 30, 0),
    createRectangleObject(concreteLight, 200, -110, 180, 160, 0),
    createRectangleObject(concreteLight, 120, -360, 150, 150, 0),
    createRectangleObject(concreteLight, 60, -520, 110, 90, 0),
    createRectangleObject(concreteLight, 500, -250, 110, 110, 0)
  );

  for (const z of [-520, -400, -280, -160, -40, 80]) {
    objects.push(
      createRectangleObject(concreteLight, 590, z, 110, 42, 0),
      createRectangleObject(pier, 670, z, 150, 30, 0)
    );
  }

  const grids: DistrictGrid[] = [
    {
      xLines: [-40, 80, 200, 320, 440, 560],
      zLines: [-660, -540, -420, -300, -180, -60, 60, 180],
      minX: -80,
      maxX: 600,
      minZ: -740,
      maxZ: 220,
      majorXs: [560],
      majorZs: [-180],
    },
    {
      xLines: [-280, -160, -40, 80, 200, 320],
      zLines: [40, 180, 320, 460, 600],
      minX: -340,
      maxX: 360,
      minZ: 0,
      maxZ: 660,
      majorXs: [80],
      majorZs: [320],
    },
    {
      xLines: [-220, -100, 20, 140, 260],
      zLines: [-700, -580, -460, -340, -220],
      minX: -260,
      maxX: 300,
      minZ: -760,
      maxZ: -180,
      majorXs: [260],
    },
    {
      xLines: [-620, -500, -380, -260, -140],
      zLines: [-120, 20, 160, 300, 440, 580],
      minX: -680,
      maxX: -120,
      minZ: -180,
      maxZ: 660,
      majorZs: [300],
    },
  ];

  for (const grid of grids) {
    addRoadGrid(objects, grid, avenueStyle, streetStyle, crosswalk);
  }

  objects.push(
    ...createRoadSegmentObjects(40, -80, 34, 1180, 5300, avenueStyle),
    ...createRoadSegmentObjects(520, -240, 34, 1040, 0, avenueStyle),
    ...createRoadSegmentObjects(-640, -700, 32, 420, 4700, avenueStyle),
    ...createRoadSegmentObjects(-760, -760, 32, 320, 0, avenueStyle)
  );

  const neighborhoodBlocks = [
    rectFromCenter(-520, 520, 140, 110),
    rectFromCenter(-400, 520, 140, 110),
    rectFromCenter(-280, 520, 120, 110),
    rectFromCenter(-520, 380, 130, 100),
    rectFromCenter(-380, 380, 130, 100),
    rectFromCenter(-260, 380, 110, 100),
    rectFromCenter(-540, 220, 140, 110),
    rectFromCenter(-400, 220, 140, 110),
    rectFromCenter(-260, 220, 120, 110),
  ];
  for (const block of neighborhoodBlocks) {
    objects.push(
      createRectangleObject(
        concrete,
        rectCenterX(block),
        rectCenterZ(block),
        rectWidth(block) * 0.86,
        rectDepth(block) * 0.86,
        0
      )
    );
  }

  return [
    {
      pos: { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } },
      pc2: createPc2(objects),
      fn: SAN_FRANCISCO_TAG,
      lodDist: FAR_LOD,
    },
  ];
}

function createSanFranciscoBuildingEntries(): FieldSrf[] {
  const specs: LandmarkSpec[] = [];
  const glassA = colorFromRGB(126, 174, 212);
  const glassB = colorFromRGB(112, 160, 188);
  const stone = colorFromRGB(170, 164, 154);

  addFinancialDistrictBuildings(specs, glassA, glassB);
  addWaterfrontBuildings(specs, glassB);
  addSomaBuildings(specs, glassA);
  addWesternNeighborhoodBuildings(specs, stone);

  specs.push(
    {
      name: "salesforce-tower",
      pos: { p: vec3(200, 0, -120), a: { h: 0, p: 0, b: 0 } },
      model: createSalesforceTowerModel(),
    },
    {
      name: "transamerica-pyramid",
      pos: { p: vec3(120, 0, -360), a: { h: 0, p: 0, b: 0 } },
      model: createTransamericaPyramidModel(),
    },
    {
      name: "golden-gate-bridge",
      pos: { p: vec3(-820, 0, -760), a: { h: 0, p: 0, b: 0 } },
      model: createGoldenGateBridgeModel(),
    },
    {
      name: "coit-tower",
      pos: { p: vec3(60, 0, -520), a: { h: 0, p: 0, b: 0 } },
      model: createCoitTowerModel(),
    },
    {
      name: "ferry-building",
      pos: { p: vec3(500, 0, -250), a: { h: 0, p: 0, b: 0 } },
      model: createFerryBuildingModel(),
    }
  );

  return specs.map((spec, index) => ({
    pos: spec.pos,
    srf: spec.model,
    fn: `${SAN_FRANCISCO_TAG}:${spec.name}`,
    id: 3000 + index,
    tag: SAN_FRANCISCO_TAG,
    lodDist: FAR_LOD,
  }));
}

function addFinancialDistrictBuildings(specs: LandmarkSpec[], glassA: Color, glassB: Color): void {
  const xs = [20, 140, 260, 380, 500];
  const zs = [-600, -480, -360, -240, -120, 0, 120];

  for (let xi = 0; xi < xs.length; xi++) {
    for (let zi = 0; zi < zs.length; zi++) {
      const x = xs[xi];
      const z = zs[zi];
      if (Math.abs(x - 200) < 90 && Math.abs(z + 120) < 120) continue;
      if (Math.abs(x - 120) < 80 && Math.abs(z + 360) < 120) continue;
      if (pointInAnyRect(x, z, SF_DIRECTOR_CORRIDORS)) continue;

      const density = skylineInfluence(x, z, 180, -180, 520);
      const height = 54 + density * 150 + ((xi * 17 + zi * 9) % 20);
      const width = 34 + ((xi * 13 + zi * 7) % 24);
      const depth = 30 + ((xi * 11 + zi * 5) % 20);
      const heading = (xi + zi) % 2 === 0 ? 0 : 16384;
      const glass = (xi + zi) % 2 === 0 ? glassA : glassB;
      const wall = (xi + zi) % 3 === 0 ? colorFromRGB(86, 98, 110) : colorFromRGB(112, 118, 126);
      const roof = colorFromRGB(68, 74, 82);

      specs.push({
        name: `fd-main-${xi}-${zi}`,
        pos: { p: vec3(x, 0, z), a: { h: heading, p: 0, b: 0 } },
        model: createWindowedBoxModel(
          width,
          depth,
          height,
          wall,
          roof,
          glass,
          Math.max(4, Math.min(16, Math.floor(height / 18))),
          4.2,
          3.0,
          2.6
        ),
      });

      if (density > 0.28) {
        specs.push({
          name: `fd-podium-${xi}-${zi}`,
          pos: { p: vec3(x + 26, 0, z + 18), a: { h: heading, p: 0, b: 0 } },
          model: createWindowedBoxModel(
            Math.max(22, width - 12),
            Math.max(20, depth - 8),
            18 + density * 28,
            colorFromRGB(148, 146, 140),
            colorFromRGB(102, 100, 96),
            glassA,
            3,
            4.2,
            2.8,
            2.5
          ),
        });
      }
    }
  }
}

function addWaterfrontBuildings(specs: LandmarkSpec[], glassB: Color): void {
  const waterfront = [
    { x: 300, z: -620, w: 110, d: 54, h: 18 },
    { x: 420, z: -620, w: 120, d: 54, h: 18 },
    { x: 360, z: -500, w: 80, d: 46, h: 28 },
    { x: 430, z: -420, w: 70, d: 48, h: 44 },
    { x: 470, z: -120, w: 56, d: 56, h: 86 },
  ];

  for (let i = 0; i < waterfront.length; i++) {
    const building = waterfront[i];
    if (pointInAnyRect(building.x, building.z, SF_DIRECTOR_CORRIDORS)) continue;
    specs.push({
      name: `waterfront-${i}`,
      pos: { p: vec3(building.x, 0, building.z), a: { h: i % 2 === 0 ? 0 : 16384, p: 0, b: 0 } },
      model: createWindowedBoxModel(
        building.w,
        building.d,
        building.h,
        i < 2 ? colorFromRGB(148, 134, 118) : colorFromRGB(112, 118, 126),
        colorFromRGB(82, 86, 90),
        glassB,
        Math.max(2, Math.floor(building.h / 16)),
        4.2,
        2.8,
        2.5
      ),
    });
  }
}

function addSomaBuildings(specs: LandmarkSpec[], glassA: Color): void {
  const xs = [-220, -100, 20, 140, 260];
  const zs = [110, 250, 390, 530];

  for (let xi = 0; xi < xs.length; xi++) {
    for (let zi = 0; zi < zs.length; zi++) {
      const x = xs[xi];
      const z = zs[zi];
      if (x > 100 && z < 260) continue;
      if (pointInAnyRect(x, z, SF_DIRECTOR_CORRIDORS)) continue;
      const height = 28 + skylineInfluence(x, z, 120, 80, 520) * 72 + ((xi * 7 + zi * 13) % 16);
      specs.push({
        name: `soma-${xi}-${zi}`,
        pos: { p: vec3(x, 0, z), a: { h: (xi + zi) % 2 === 0 ? 0 : 16384, p: 0, b: 0 } },
        model: createWindowedBoxModel(
          38 + ((xi + zi) % 3) * 8,
          34 + ((xi * 3 + zi) % 3) * 8,
          height,
          colorFromRGB(132, 132, 128),
          colorFromRGB(92, 92, 88),
          glassA,
          Math.max(3, Math.floor(height / 18)),
          4.0,
          2.8,
          2.5
        ),
      });
    }
  }
}

function addWesternNeighborhoodBuildings(specs: LandmarkSpec[], stone: Color): void {
  const xs = [-560, -440, -320, -200];
  const zs = [-50, 90, 230, 370, 510];

  for (let xi = 0; xi < xs.length; xi++) {
    for (let zi = 0; zi < zs.length; zi++) {
      const x = xs[xi];
      const z = zs[zi];
      const lowRise =
        zi % 2 === 0
          ? createBoxModel(42, 28, 14 + (zi % 3) * 3, stone, colorFromRGB(128, 104, 90))
          : createWindowedBoxModel(
              46,
              30,
              18 + ((xi + zi) % 3) * 5,
              colorFromRGB(150, 142, 132),
              colorFromRGB(108, 96, 88),
              colorFromRGB(180, 194, 206),
              3,
              4.0,
              2.8,
              2.4
            );
      specs.push({
        name: `west-${xi}-${zi}`,
        pos: { p: vec3(x, 0, z), a: { h: xi % 2 === 0 ? 0 : 16384, p: 0, b: 0 } },
        model: lowRise,
      });
    }
  }
}

function createSalesforceTowerModel(): SrfModel {
  const builder = createModelBuilder();
  const glass = colorFromRGB(122, 168, 210);
  const glassLight = colorFromRGB(164, 198, 220);
  const roof = colorFromRGB(78, 92, 108);

  addBox(builder, 0, 0, 0, 146, 114, 24, colorFromRGB(146, 148, 152), colorFromRGB(108, 110, 114));
  addBox(builder, -40, 0, 24, 70, 48, 16, colorFromRGB(152, 152, 154), colorFromRGB(112, 112, 116));
  addBox(builder, 36, 0, -20, 76, 52, 16, colorFromRGB(152, 152, 154), colorFromRGB(112, 112, 116));

  const base = superellipseFootprint(88, 68, 3.2, 14);
  const midA = superellipseFootprint(80, 62, 3.2, 14);
  const midB = superellipseFootprint(72, 54, 3.2, 14);
  const upper = superellipseFootprint(62, 46, 3.0, 14);
  const crown = superellipseFootprint(52, 38, 2.8, 14);

  addTaperedExtrusion(builder, base, midA, 24, 136, glass, roof);
  addTaperedExtrusion(builder, midA, midB, 136, 244, glass, roof);
  addTaperedExtrusion(builder, midB, upper, 244, 330, glassLight, roof);
  addTaperedExtrusion(builder, upper, crown, 330, 372, glassLight, roof);
  addTaperedExtrusion(
    builder,
    crown,
    superellipseFootprint(26, 20, 2.4, 14),
    372,
    394,
    colorFromRGB(184, 208, 220),
    roof
  );

  return finalizeModel(builder);
}

function createTransamericaPyramidModel(): SrfModel {
  const builder = createModelBuilder();
  const wall = colorFromRGB(214, 212, 202);
  const roof = colorFromRGB(160, 156, 146);
  const wingWall = colorFromRGB(178, 172, 162);

  addBox(builder, 0, 0, 0, 132, 44, 18, wingWall, colorFromRGB(128, 122, 112));
  addBox(builder, 0, 0, 0, 56, 118, 18, wingWall, colorFromRGB(128, 122, 112));
  addTaperedExtrusion(builder, squareFootprint(82), squareFootprint(34), 18, 174, wall, roof);
  addTaperedExtrusion(builder, squareFootprint(34), squareFootprint(8), 174, 248, wall, roof);
  addBox(builder, 0, 248, 0, 6, 6, 78, colorFromRGB(196, 194, 188), colorFromRGB(156, 154, 148));

  return finalizeModel(builder);
}

function createGoldenGateBridgeModel(): SrfModel {
  const builder = createModelBuilder();
  const orange = colorFromRGB(194, 92, 62);
  const orangeDark = colorFromRGB(146, 58, 40);
  const steel = colorFromRGB(122, 76, 62);
  const deckY = 28;
  const deckLength = 760;
  const towerX = 220;
  const towerHeight = 320;
  const cableZ = 24;

  addBox(builder, 0, deckY, 0, deckLength, 34, 10, orange, orangeDark);
  addBox(builder, 0, deckY - 16, 0, deckLength, 20, 16, steel, steel);
  addBox(builder, -390, 0, 0, 80, 62, 30, colorFromRGB(110, 102, 94), colorFromRGB(86, 80, 72));
  addBox(builder, 390, 0, 0, 80, 62, 30, colorFromRGB(110, 102, 94), colorFromRGB(86, 80, 72));

  for (const sign of [-1, 1]) {
    addBridgeTower(builder, sign * towerX, towerHeight, orange, orangeDark);
  }

  const cablePoints = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const x = -400 + t * 800;
    let y: number;
    if (x < -towerX) {
      const local = (x + 400) / (400 - towerX);
      y = mix(46, towerHeight + 6, local);
    } else if (x > towerX) {
      const local = (x - towerX) / (400 - towerX);
      y = mix(towerHeight + 6, 46, local);
    } else {
      const arch = 1 - Math.pow(x / towerX, 2);
      y = towerHeight - 12 + arch * 18;
    }
    cablePoints.push({ x, y });
  }

  addCableRibbon(builder, cablePoints, cableZ, orange, 2.0);
  addCableRibbon(builder, cablePoints, -cableZ, orange, 2.0);

  for (let x = -360; x <= 360; x += 28) {
    const cableY = sampleCableHeight(cablePoints, x);
    addVerticalRibbon(builder, x, deckY + 10, cableY, cableZ, 1.2, orange);
    addVerticalRibbon(builder, x, deckY + 10, cableY, -cableZ, 1.2, orange);
  }

  for (let x = -330; x <= 330; x += 46) {
    addBox(builder, x, deckY - 26, 0, 12, 16, 18, steel, steel);
  }

  return finalizeModel(builder);
}

function createCoitTowerModel(): SrfModel {
  const builder = createModelBuilder();
  addBox(builder, 0, 0, 0, 40, 40, 10, colorFromRGB(166, 156, 144), colorFromRGB(126, 116, 108));
  addExtrudedFootprint(
    builder,
    superellipseFootprint(26, 26, 2.6, 10),
    10,
    78,
    colorFromRGB(220, 212, 196),
    colorFromRGB(168, 160, 148)
  );
  return finalizeModel(builder);
}

function createFerryBuildingModel(): SrfModel {
  const builder = createModelBuilder();
  addBox(builder, 0, 0, 0, 150, 48, 18, colorFromRGB(166, 154, 140), colorFromRGB(122, 110, 98));
  addBox(builder, -46, 0, 0, 44, 44, 22, colorFromRGB(178, 166, 152), colorFromRGB(134, 122, 110));
  addBox(builder, 46, 0, 0, 44, 44, 22, colorFromRGB(178, 166, 152), colorFromRGB(134, 122, 110));
  addBox(builder, 0, 18, 0, 36, 28, 72, colorFromRGB(204, 194, 180), colorFromRGB(150, 138, 124));
  addBox(builder, 0, 90, 0, 24, 24, 18, colorFromRGB(154, 108, 86), colorFromRGB(120, 82, 66));
  return finalizeModel(builder);
}

function addBridgeTower(
  builder: ModelBuilder,
  x: number,
  towerHeight: number,
  wallColor: Color,
  roofColor: Color
): void {
  const braceColor = colorFromRGB(160, 70, 48);
  addBox(builder, x, 0, -14, 10, 10, towerHeight, wallColor, roofColor);
  addBox(builder, x, 0, 14, 10, 10, towerHeight, wallColor, roofColor);
  addBox(builder, x, 68, 0, 12, 40, 8, wallColor, roofColor);
  addBox(builder, x, 146, 0, 12, 40, 8, wallColor, roofColor);
  addBox(builder, x, 224, 0, 12, 40, 8, wallColor, roofColor);
  addBox(builder, x, towerHeight - 8, 0, 14, 48, 8, wallColor, roofColor);

  addTwoSidedQuad(
    builder,
    vec3(x, 34, -18),
    vec3(x, 96, 18),
    vec3(x, 102, 18),
    vec3(x, 40, -18),
    braceColor
  );
  addTwoSidedQuad(
    builder,
    vec3(x, 34, 18),
    vec3(x, 96, -18),
    vec3(x, 102, -18),
    vec3(x, 40, 18),
    braceColor
  );
  addTwoSidedQuad(
    builder,
    vec3(x, 114, -18),
    vec3(x, 176, 18),
    vec3(x, 182, 18),
    vec3(x, 120, -18),
    braceColor
  );
  addTwoSidedQuad(
    builder,
    vec3(x, 114, 18),
    vec3(x, 176, -18),
    vec3(x, 182, -18),
    vec3(x, 120, 18),
    braceColor
  );
}

function addCableRibbon(
  builder: ModelBuilder,
  points: Array<{ x: number; y: number }>,
  z: number,
  color: Color,
  halfDepth: number
): void {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    addTwoSidedQuad(
      builder,
      vec3(a.x, a.y, z - halfDepth),
      vec3(b.x, b.y, z - halfDepth),
      vec3(b.x, b.y, z + halfDepth),
      vec3(a.x, a.y, z + halfDepth),
      color
    );
  }
}

function addVerticalRibbon(
  builder: ModelBuilder,
  x: number,
  y0: number,
  y1: number,
  z: number,
  halfWidth: number,
  color: Color
): void {
  addTwoSidedQuad(
    builder,
    vec3(x - halfWidth, y0, z),
    vec3(x + halfWidth, y0, z),
    vec3(x + halfWidth, y1, z),
    vec3(x - halfWidth, y1, z),
    color
  );
}

function addRoadGrid(
  objects: Pc2Object[],
  grid: DistrictGrid,
  avenueStyle: RoadStyle,
  streetStyle: RoadStyle,
  crosswalkColor: Color
): void {
  for (const x of grid.xLines) {
    const isMajor = (grid.majorXs ?? []).includes(x);
    objects.push(
      ...createRoadSegmentObjects(
        x,
        (grid.minZ + grid.maxZ) * 0.5,
        isMajor ? 34 : 22,
        grid.maxZ - grid.minZ,
        0,
        isMajor ? avenueStyle : streetStyle
      )
    );
  }

  for (const z of grid.zLines) {
    const isMajor = (grid.majorZs ?? []).includes(z);
    objects.push(
      ...createRoadSegmentObjects(
        (grid.minX + grid.maxX) * 0.5,
        z,
        isMajor ? 34 : 22,
        grid.maxX - grid.minX,
        16384,
        isMajor ? avenueStyle : streetStyle
      )
    );
  }

  for (const x of grid.xLines) {
    for (const z of grid.zLines) {
      const majorX = (grid.majorXs ?? []).includes(x);
      const majorZ = (grid.majorZs ?? []).includes(z);
      if (majorX || majorZ) {
        objects.push(createCrosswalkObject(x, z, crosswalkColor));
      }
    }
  }
}

function createModelBuilder(): ModelBuilder {
  return { vertices: [], polygons: [] };
}

function finalizeModel(builder: ModelBuilder): SrfModel {
  const points = builder.vertices.map((vertex) => vertex.pos);
  return {
    bbox: buildBoundingBox(points),
    nv: builder.vertices.length,
    vertices: builder.vertices,
    np: builder.polygons.length,
    polygons: builder.polygons,
  };
}

function addBox(
  builder: ModelBuilder,
  centerX: number,
  baseY: number,
  centerZ: number,
  width: number,
  depth: number,
  height: number,
  wallColor: Color,
  roofColor: Color
): void {
  const hx = width * 0.5;
  const hz = depth * 0.5;
  const y0 = baseY;
  const y1 = baseY + height;
  addQuad(
    builder,
    vec3(centerX - hx, y0, centerZ - hz),
    vec3(centerX - hx, y1, centerZ - hz),
    vec3(centerX + hx, y1, centerZ - hz),
    vec3(centerX + hx, y0, centerZ - hz),
    wallColor
  );
  addQuad(
    builder,
    vec3(centerX - hx, y0, centerZ + hz),
    vec3(centerX + hx, y0, centerZ + hz),
    vec3(centerX + hx, y1, centerZ + hz),
    vec3(centerX - hx, y1, centerZ + hz),
    wallColor
  );
  addQuad(
    builder,
    vec3(centerX + hx, y0, centerZ - hz),
    vec3(centerX + hx, y1, centerZ - hz),
    vec3(centerX + hx, y1, centerZ + hz),
    vec3(centerX + hx, y0, centerZ + hz),
    wallColor
  );
  addQuad(
    builder,
    vec3(centerX - hx, y0, centerZ - hz),
    vec3(centerX - hx, y0, centerZ + hz),
    vec3(centerX - hx, y1, centerZ + hz),
    vec3(centerX - hx, y1, centerZ - hz),
    wallColor
  );
  addQuad(
    builder,
    vec3(centerX - hx, y1, centerZ - hz),
    vec3(centerX - hx, y1, centerZ + hz),
    vec3(centerX + hx, y1, centerZ + hz),
    vec3(centerX + hx, y1, centerZ - hz),
    roofColor
  );
}

function addExtrudedFootprint(
  builder: ModelBuilder,
  footprint: Vec2[],
  baseY: number,
  height: number,
  wallColor: Color,
  roofColor: Color
): void {
  addTaperedExtrusion(builder, footprint, footprint, baseY, baseY + height, wallColor, roofColor);
}

function addTaperedExtrusion(
  builder: ModelBuilder,
  baseFootprint: Vec2[],
  topFootprint: Vec2[],
  baseY: number,
  topY: number,
  wallColor: Color,
  roofColor: Color
): void {
  const base = ensureCounterClockwise(baseFootprint);
  const top = ensureCounterClockwise(topFootprint);
  for (let i = 0; i < base.length; i++) {
    const next = (i + 1) % base.length;
    addQuad(
      builder,
      vec3(base[i].x, baseY, base[i].y),
      vec3(top[i].x, topY, top[i].y),
      vec3(top[next].x, topY, top[next].y),
      vec3(base[next].x, baseY, base[next].y),
      wallColor
    );
  }
  addPolygon(
    builder,
    [...top].reverse().map((point) => vec3(point.x, topY, point.y)),
    roofColor
  );
}

function addQuad(
  builder: ModelBuilder,
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  color: Color,
  bright = 0
): void {
  addPolygon(builder, [p0, p1, p2, p3], color, bright);
}

function addTwoSidedQuad(
  builder: ModelBuilder,
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  color: Color,
  bright = 0
): void {
  addQuad(builder, p0, p1, p2, p3, color, bright);
  addQuad(builder, p3, p2, p1, p0, color, bright);
}

function addPolygon(builder: ModelBuilder, points: Vec3[], color: Color, bright = 0): void {
  const normal = normalizeVec3(
    cross(subtractVec3(points[1], points[0]), subtractVec3(points[2], points[0]))
  );
  const center = averagePoint(points);
  const start = builder.vertices.length;
  for (const point of points) {
    builder.vertices.push({
      pos: { ...point },
      normal: { ...normal },
      smoothFlag: 0,
    });
  }
  builder.polygons.push({
    backFaceRemove: 1,
    color,
    normal,
    center,
    vertexIds: points.map((_, index) => start + index),
    bright,
    nVt: points.length,
  });
}

function createPolygonObject(color: Color, vertices: Vec2[]): Pc2Object {
  return {
    type: "PLG",
    color,
    visiDist: FAR_LOD,
    vertices,
    center: averagePoint2(vertices),
  };
}

function averagePoint2(points: Vec2[]): Vec2 {
  let sumX = 0;
  let sumY = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
  }
  return { x: sumX / points.length, y: sumY / points.length };
}

function buildBoundingBox(points: Vec3[]): Vec3[] {
  let min = { ...points[0] };
  let max = { ...points[0] };
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    min.x = Math.min(min.x, point.x);
    min.y = Math.min(min.y, point.y);
    min.z = Math.min(min.z, point.z);
    max.x = Math.max(max.x, point.x);
    max.y = Math.max(max.y, point.y);
    max.z = Math.max(max.z, point.z);
  }
  return [
    vec3(min.x, min.y, min.z),
    vec3(max.x, min.y, min.z),
    vec3(min.x, max.y, min.z),
    vec3(max.x, max.y, min.z),
    vec3(min.x, min.y, max.z),
    vec3(max.x, min.y, max.z),
    vec3(min.x, max.y, max.z),
    vec3(max.x, max.y, max.z),
  ];
}

function rectFromCenter(centerX: number, centerZ: number, width: number, depth: number): Rect {
  return {
    minX: centerX - width * 0.5,
    maxX: centerX + width * 0.5,
    minZ: centerZ - depth * 0.5,
    maxZ: centerZ + depth * 0.5,
  };
}

function rectCenterX(rect: Rect): number {
  return (rect.minX + rect.maxX) * 0.5;
}

function rectCenterZ(rect: Rect): number {
  return (rect.minZ + rect.maxZ) * 0.5;
}

function rectWidth(rect: Rect): number {
  return rect.maxX - rect.minX;
}

function rectDepth(rect: Rect): number {
  return rect.maxZ - rect.minZ;
}

function pointInRect(x: number, z: number, rect: Rect): boolean {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

function pointInAnyRect(x: number, z: number, rects: Rect[]): boolean {
  return rects.some((rect) => pointInRect(x, z, rect));
}

function skylineInfluence(
  x: number,
  z: number,
  focusX: number,
  focusZ: number,
  radius: number
): number {
  const dx = x - focusX;
  const dz = z - focusZ;
  return Math.max(0, 1 - Math.sqrt(dx * dx + dz * dz) / radius);
}

function squareFootprint(size: number): Vec2[] {
  const half = size * 0.5;
  return [
    { x: -half, y: -half },
    { x: half, y: -half },
    { x: half, y: half },
    { x: -half, y: half },
  ];
}

function superellipseFootprint(
  width: number,
  depth: number,
  exponent: number,
  segments: number
): Vec2[] {
  const halfW = width * 0.5;
  const halfD = depth * 0.5;
  const points: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const x = Math.sign(cosA) * Math.pow(Math.abs(cosA), 2 / exponent) * halfW;
    const y = Math.sign(sinA) * Math.pow(Math.abs(sinA), 2 / exponent) * halfD;
    points.push({ x, y });
  }
  return ensureCounterClockwise(points);
}

function ensureCounterClockwise(points: Vec2[]): Vec2[] {
  return polygonArea(points) >= 0 ? [...points] : [...points].reverse();
}

function polygonArea(points: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area * 0.5;
}

function subtractVec3(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.x - b.x, a.y - b.y, a.z - b.z);
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function normalizeVec3(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z);
  if (length < 1e-6) {
    return vec3(0, 1, 0);
  }
  return vec3(v.x / length, v.y / length, v.z / length);
}

function averagePoint(points: Vec3[]): Vec3 {
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
    sumZ += point.z;
  }
  return vec3(sumX / points.length, sumY / points.length, sumZ / points.length);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function sampleCableHeight(points: Array<{ x: number; y: number }>, x: number): number {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / Math.max(1e-4, b.x - a.x);
      return mix(a.y, b.y, t);
    }
  }
  return points[points.length - 1].y;
}
