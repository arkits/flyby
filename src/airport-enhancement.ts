import type {
  Color,
  Field,
  FieldPc2,
  FieldSrf,
  MapVariant,
  Pc2,
  Pc2Object,
  PosAtt,
  SrfModel,
  SrfPolygon,
  SrfVertex,
  Terrain,
  Vec2,
  Vec3,
} from "./types";
import { colorFromRGB, vec3 } from "./math";
import { enhanceDowntownField } from "./downtown-enhancement";
import { enhanceSanFranciscoField } from "./san-francisco-enhancement";

const FAR_LOD = 10000000;

interface AirportPalette {
  sky?: Color;
  ground?: Color;
  grass: Color;
  dryGrass: Color;
  soil: Color;
  asphalt: Color;
  apron: Color;
  taxiway: Color;
  buildingWall: Color;
  buildingRoof: Color;
  buildingWallDark: Color;
  buildingRoofDark: Color;
  buildingWallLight: Color;
  buildingRoofLight: Color;
  runwayPaintWhite: Color;
  markingWhite: Color;
  markingYellow: Color;
  lightBlue?: Color;
  lightAmber?: Color;
  lightWhite?: Color;
  lightGreen?: Color;
  lightRed?: Color;
  distantWarm?: Color;
  distantCool?: Color;
}

const AIRPORT_IMPROVED: AirportPalette = {
  sky: colorFromRGB(112, 164, 220),
  ground: colorFromRGB(108, 122, 78),
  grass: colorFromRGB(94, 124, 70),
  dryGrass: colorFromRGB(156, 144, 88),
  soil: colorFromRGB(122, 94, 60),
  asphalt: colorFromRGB(74, 76, 80),
  apron: colorFromRGB(104, 100, 94),
  taxiway: colorFromRGB(116, 112, 96),
  buildingWall: colorFromRGB(176, 170, 154),
  buildingRoof: colorFromRGB(126, 120, 112),
  buildingWallDark: colorFromRGB(136, 142, 150),
  buildingRoofDark: colorFromRGB(100, 108, 120),
  buildingWallLight: colorFromRGB(196, 188, 174),
  buildingRoofLight: colorFromRGB(158, 146, 132),
  runwayPaintWhite: colorFromRGB(240, 240, 236),
  markingWhite: colorFromRGB(240, 240, 236),
  markingYellow: colorFromRGB(232, 194, 82),
};

const AIRPORT_NIGHT: AirportPalette = {
  sky: colorFromRGB(20, 34, 74),
  ground: colorFromRGB(30, 36, 32),
  grass: colorFromRGB(48, 62, 48),
  dryGrass: colorFromRGB(66, 68, 56),
  soil: colorFromRGB(48, 42, 34),
  asphalt: colorFromRGB(38, 42, 50),
  apron: colorFromRGB(48, 52, 60),
  taxiway: colorFromRGB(78, 72, 54),
  buildingWall: colorFromRGB(92, 100, 114),
  buildingRoof: colorFromRGB(58, 64, 76),
  buildingWallDark: colorFromRGB(68, 76, 90),
  buildingRoofDark: colorFromRGB(42, 48, 58),
  buildingWallLight: colorFromRGB(118, 126, 138),
  buildingRoofLight: colorFromRGB(82, 90, 102),
  runwayPaintWhite: colorFromRGB(118, 126, 140),
  markingWhite: colorFromRGB(156, 164, 176),
  markingYellow: colorFromRGB(228, 178, 68),
  lightBlue: colorFromRGB(112, 182, 255),
  lightAmber: colorFromRGB(255, 198, 92),
  lightWhite: colorFromRGB(248, 248, 255),
  lightGreen: colorFromRGB(72, 255, 168),
  lightRed: colorFromRGB(255, 92, 76),
  distantWarm: colorFromRGB(255, 214, 146),
  distantCool: colorFromRGB(162, 210, 255),
};

const AIRPORT_IMPROVED_TAG = "__browser_airport_improved_augmented__";
const AIRPORT_NIGHT_TAG = "__browser_airport_night_augmented__";

const IDENTITY_POS: PosAtt = {
  p: vec3(0, 0, 0),
  a: { h: 0, p: 0, b: 0 },
};

interface BuildingSpec {
  name: string;
  pos: PosAtt;
  model: SrfModel;
}

interface AirportEnhancementOptions {
  includeNightLights: boolean;
  showcaseDensity: boolean;
}

interface RoadMarkingSpec {
  offsetX: number;
  width: number;
  color: Color;
  dashLength: number;
  gapLength: number;
  inset?: number;
}

interface RoadStyle {
  shoulderColor: Color;
  asphaltColor: Color;
  shoulderWidth: number;
  medianColor?: Color;
  medianWidth?: number;
  medianInset?: number;
  markings: RoadMarkingSpec[];
}

export function resolveFieldFileForMap(defaultFieldFile: string, mapVariant: MapVariant): string {
  switch (mapVariant) {
    case "downtown":
    case "san-francisco":
      return "downtown.fld";
    default:
      return defaultFieldFile;
  }
}

export function enhanceFieldForMap(field: Field, fieldFile: string, mapVariant: MapVariant): Field {
  if (mapVariant === "san-francisco") {
    return enhanceSanFranciscoField(field);
  }

  if (mapVariant === "downtown" || fieldFile.toLowerCase().endsWith("downtown.fld")) {
    return enhanceDowntownField(field);
  }

  if (!fieldFile.toLowerCase().endsWith("airport.fld")) {
    return field;
  }

  if (mapVariant === "airport") {
    return field;
  }

  if (mapVariant === "airport-improved") {
    return enhanceAirportField(field, AIRPORT_IMPROVED, AIRPORT_IMPROVED_TAG, {
      includeNightLights: false,
      showcaseDensity: true,
    });
  }

  if (mapVariant === "airport-night") {
    return enhanceAirportField(field, AIRPORT_NIGHT, AIRPORT_NIGHT_TAG, {
      includeNightLights: true,
      showcaseDensity: false,
    });
  }
  return field;
}

function enhanceAirportField(
  field: Field,
  palette: AirportPalette,
  tag: string,
  options: AirportEnhancementOptions
): Field {
  if (field.srf.some((obj) => obj.tag === tag) || field.pc2.some((obj) => obj.fn === tag)) {
    return field;
  }

  const baseSrf = options.showcaseDensity
    ? field.srf.filter((obj) => !isOriginalImprovedHangar(obj))
    : field.srf;
  const basePc2 = options.includeNightLights
    ? retintAirportNightRunwayPaint(field.pc2, palette)
    : field.pc2;
  const pc2Entries = createAirportOverlayEntries(palette, tag, options);
  const srfEntries = createAirportBuildingEntries(field, palette, tag, options);

  return {
    ...field,
    sky: palette.sky ?? field.sky,
    gnd: palette.ground ?? field.gnd,
    ter: field.ter.map((entry) => ({
      ...entry,
      ter: flattenAirportTerrain(entry.ter, palette),
    })),
    pc2: [...basePc2, ...pc2Entries],
    srf: [...baseSrf, ...srfEntries],
  };
}

function isOriginalImprovedHangar(obj: FieldSrf): boolean {
  return obj.fn.toLowerCase() === "hanger.srf";
}

function createAirportOverlayEntries(
  palette: AirportPalette,
  tag: string,
  options: AirportEnhancementOptions
): FieldPc2[] {
  const objects: Pc2Object[] = [
    createRectangleObject(palette.dryGrass, -162, 118, 320, 430, 0),
    createRectangleObject(palette.dryGrass, 302, -148, 196, 250, 16384),
    createRectangleObject(palette.dryGrass, 324, 26, 166, 172, 16384),
    createRectangleObject(palette.soil, -8, -82, 88, 52, 16384),
    createRectangleObject(palette.soil, 274, -206, 72, 48, 16384),
    createRectangleObject(palette.apron, -170, 148, 180, 390, 0),
    createRectangleObject(palette.apron, -38, -102, 150, 72, 16384),
    createRectangleObject(palette.apron, 284, -148, 132, 84, 16384),
    createRectangleObject(palette.apron, 322, 12, 118, 86, 16384),
    createRectangleObject(palette.grass, -108, 148, 64, 108, 0),
    createRectangleObject(palette.grass, -230, 148, 62, 94, 0),
    createRectangleObject(palette.grass, 324, 92, 46, 62, 0),
    createRectangleObject(palette.grass, 324, -66, 42, 54, 0),
    createRectangleObject(palette.taxiway, 18, 22, 24, 2000, 0),
    createRectangleObject(palette.taxiway, -54, 66, 126, 18, 16384),
    createRectangleObject(palette.taxiway, -52, 184, 142, 18, 16384),
    createRectangleObject(palette.taxiway, -46, -56, 118, 18, 16384),
    ...createRunwayObjects(324, 42, 0, 24, 960, palette),
    ...createRunwayObjects(360, -246, -9624, 20, 720, palette),
    createPolylineObject(palette.markingYellow, [
      { x: -84, y: -92 },
      { x: -48, y: -92 },
      { x: -18, y: -32 },
      { x: 18, y: 22 },
      { x: 18, y: 320 },
    ]),
    createPolylineObject(palette.markingYellow, [
      { x: 212, y: -150 },
      { x: 244, y: -132 },
      { x: 296, y: -100 },
      { x: 324, y: -12 },
      { x: 324, y: 98 },
    ]),
  ];

  if (options.showcaseDensity) {
    objects.push(
      createRectangleObject(palette.apron, -142, -26, 174, 126, 16384),
      createRectangleObject(palette.apron, -204, 244, 124, 92, 0),
      createRectangleObject(palette.apron, 332, -214, 104, 98, 16384),
      createRectangleObject(palette.apron, 404, -164, 84, 74, 16384),
      createRectangleObject(palette.taxiway, -28, 22, 18, 2200, 0),
      createRectangleObject(palette.taxiway, 64, 18, 18, 1800, 0),
      createRectangleObject(palette.taxiway, -124, 88, 82, 14, 16384),
      createRectangleObject(palette.taxiway, -126, 212, 94, 14, 16384),
      createRectangleObject(palette.taxiway, 248, -114, 86, 14, 16384),
      createRectangleObject(palette.taxiway, 338, -42, 74, 14, 16384),
      createRectangleObject(palette.grass, -224, 246, 48, 68, 0),
      createRectangleObject(palette.grass, 404, -214, 44, 58, 0),
      createRectangleObject(palette.dryGrass, 160, -242, 136, 58, 16384),
      createRectangleObject(palette.dryGrass, -286, 92, 42, 610, 0),
      createRectangleObject(palette.soil, 70, -214, 76, 42, 16384),
      createRectangleObject(palette.soil, -214, 312, 70, 36, 16384),
      createPolylineObject(palette.markingYellow, [
        { x: -132, y: 248 },
        { x: -96, y: 208 },
        { x: -26, y: 146 },
        { x: 18, y: 74 },
      ]),
      createPolylineObject(palette.markingYellow, [
        { x: 364, y: -212 },
        { x: 332, y: -158 },
        { x: 324, y: -98 },
        { x: 324, y: -42 },
      ]),
      ...createParkingPadObjects(-220, 18, 3, 54, 58, 74, palette.apron, palette.markingWhite),
      ...createParkingPadObjects(-188, 218, 2, 52, 58, 72, palette.apron, palette.markingWhite),
      ...createParkingPadObjects(332, -210, 2, 56, 56, 68, palette.apron, palette.markingWhite)
    );
  }

  objects.push(...createAirportRoadObjects(palette, options));

  if (options.includeNightLights) {
    objects.push(
      ...createRunwayEdgeLightObjects(92.81, 19.89, 0, 60, 3000, 96, palette.lightAmber!),
      ...createRunwayEdgeLightObjects(199.58, -97.85, -9624, 60, 3000, 96, palette.lightAmber!),
      ...createRunwayThresholdLightObjects(
        92.81,
        19.89,
        0,
        56,
        1490,
        palette.lightGreen!,
        palette.lightRed!
      ),
      ...createRunwayThresholdLightObjects(
        199.58,
        -97.85,
        -9624,
        56,
        1490,
        palette.lightGreen!,
        palette.lightRed!
      ),
      ...createRunwayCenterlineLightObjects(92.81, 19.89, 0, 3000, 182, palette.lightWhite!),
      ...createRunwayCenterlineLightObjects(199.58, -97.85, -9624, 3000, 182, palette.lightWhite!),
      ...createTaxiwayLightObjects(
        [
          [
            { x: -84, y: -92 },
            { x: -48, y: -92 },
            { x: -18, y: -32 },
            { x: 18, y: 22 },
            { x: 18, y: 320 },
          ],
          [
            { x: 212, y: -150 },
            { x: 244, y: -132 },
            { x: 296, y: -100 },
            { x: 324, y: -12 },
            { x: 324, y: 98 },
          ],
        ],
        48,
        palette.lightBlue!
      ),
      ...createApproachLightBarObjects(-62, -108, palette.lightAmber!),
      ...createApronBeaconObjects(
        palette.lightAmber!,
        palette.lightWhite!,
        palette.lightBlue!,
        palette.lightRed!
      ),
      ...createDistantLightFieldObjects(
        palette.distantWarm!,
        palette.distantCool!,
        palette.lightRed!,
        palette.lightWhite!
      )
    );
  }

  return [
    {
      pos: IDENTITY_POS,
      pc2: createPc2(objects),
      fn: tag,
      lodDist: FAR_LOD,
    },
  ];
}

function createAirportBuildingEntries(
  field: Field,
  palette: AirportPalette,
  tag: string,
  options: AirportEnhancementOptions
): FieldSrf[] {
  const hanger = field.srf.find((obj) => obj.fn.toLowerCase() === "hanger.srf")?.srf ?? null;

  const specs: BuildingSpec[] = [
    {
      name: "terminal-main",
      pos: { p: vec3(142, 0, -108), a: { h: 16384, p: 0, b: 0 } },
      model: createBoxModel(118, 34, 22, palette.buildingWallLight, palette.buildingRoofLight),
    },
    {
      name: "terminal-west",
      pos: { p: vec3(58, 0, -92), a: { h: 16384, p: 0, b: 0 } },
      model: createBoxModel(42, 24, 16, palette.buildingWall, palette.buildingRoof),
    },
    {
      name: "terminal-east",
      pos: { p: vec3(234, 0, -64), a: { h: 16384, p: 0, b: 0 } },
      model: createBoxModel(70, 22, 18, palette.buildingWall, palette.buildingRoof),
    },
    {
      name: "cargo-warehouse",
      pos: { p: vec3(274, 0, -154), a: { h: 16384, p: 0, b: 0 } },
      model: createBoxModel(86, 30, 18, palette.buildingWallDark, palette.buildingRoofDark),
    },
    {
      name: "cargo-office",
      pos: { p: vec3(322, 0, -112), a: { h: 16384, p: 0, b: 0 } },
      model: createBoxModel(34, 24, 14, palette.buildingWall, palette.buildingRoof),
    },
    {
      name: "remote-hangar-1",
      pos: { p: vec3(324, 0, -12), a: { h: 16384, p: 0, b: 0 } },
      model: createBoxModel(54, 42, 20, palette.buildingWallDark, palette.buildingRoofDark),
    },
    {
      name: "remote-hangar-2",
      pos: { p: vec3(324, 0, 64), a: { h: 16384, p: 0, b: 0 } },
      model: createBoxModel(54, 42, 20, palette.buildingWallDark, palette.buildingRoofDark),
    },
    {
      name: "fuel-depot",
      pos: { p: vec3(252, 0, -214), a: { h: 0, p: 0, b: 0 } },
      model: createBoxModel(34, 28, 14, palette.buildingWall, palette.buildingRoof),
    },
  ];

  if (options.showcaseDensity) {
    const showcaseHangar = createBoxModel(
      62,
      58,
      24,
      palette.buildingWallDark,
      palette.buildingRoofLight
    );
    specs.push(
      {
        name: "west-hangar-a",
        pos: { p: vec3(-246, 0, 28), a: { h: 49152, p: 0, b: 0 } },
        model: showcaseHangar,
      },
      {
        name: "west-hangar-b",
        pos: { p: vec3(-246, 0, 118), a: { h: 49152, p: 0, b: 0 } },
        model: showcaseHangar,
      },
      {
        name: "west-hangar-c",
        pos: { p: vec3(-246, 0, 206), a: { h: 49152, p: 0, b: 0 } },
        model: showcaseHangar,
      },
      {
        name: "west-hangar-d",
        pos: { p: vec3(-246, 0, 296), a: { h: 49152, p: 0, b: 0 } },
        model: showcaseHangar,
      }
    );
  } else if (hanger !== null) {
    specs.push(
      {
        name: "west-hangar-a",
        pos: { p: vec3(-246, 0, 28), a: { h: 49152, p: 0, b: 0 } },
        model: hanger,
      },
      {
        name: "west-hangar-b",
        pos: { p: vec3(-246, 0, 118), a: { h: 49152, p: 0, b: 0 } },
        model: hanger,
      },
      {
        name: "west-hangar-c",
        pos: { p: vec3(-246, 0, 206), a: { h: 49152, p: 0, b: 0 } },
        model: hanger,
      },
      {
        name: "west-hangar-d",
        pos: { p: vec3(-246, 0, 296), a: { h: 49152, p: 0, b: 0 } },
        model: hanger,
      }
    );
  }

  if (options.includeNightLights) {
    const lightPole = createLightPoleModel(
      28,
      palette.lightAmber!,
      colorFromRGB(72, 76, 84),
      colorFromRGB(32, 36, 44)
    );
    specs.push(
      {
        name: "light-pole-west-1",
        pos: { p: vec3(-172, 0, -122), a: { h: 0, p: 0, b: 0 } },
        model: lightPole,
      },
      {
        name: "light-pole-west-2",
        pos: { p: vec3(-172, 0, -36), a: { h: 0, p: 0, b: 0 } },
        model: lightPole,
      },
      {
        name: "light-pole-west-3",
        pos: { p: vec3(-170, 0, 52), a: { h: 0, p: 0, b: 0 } },
        model: lightPole,
      },
      {
        name: "light-pole-west-4",
        pos: { p: vec3(-168, 0, 140), a: { h: 0, p: 0, b: 0 } },
        model: lightPole,
      },
      {
        name: "light-pole-west-5",
        pos: { p: vec3(-166, 0, 226), a: { h: 0, p: 0, b: 0 } },
        model: lightPole,
      },
      {
        name: "light-pole-east-1",
        pos: { p: vec3(286, 0, -172), a: { h: 0, p: 0, b: 0 } },
        model: lightPole,
      },
      {
        name: "light-pole-east-2",
        pos: { p: vec3(318, 0, -88), a: { h: 0, p: 0, b: 0 } },
        model: lightPole,
      },
      {
        name: "light-pole-east-3",
        pos: { p: vec3(336, 0, -6), a: { h: 0, p: 0, b: 0 } },
        model: lightPole,
      },
      {
        name: "light-pole-east-4",
        pos: { p: vec3(338, 0, 76), a: { h: 0, p: 0, b: 0 } },
        model: lightPole,
      },
      {
        name: "light-pole-terminal",
        pos: { p: vec3(-28, 0, -136), a: { h: 0, p: 0, b: 0 } },
        model: lightPole,
      }
    );
  }

  if (options.showcaseDensity || tag === AIRPORT_IMPROVED_TAG) {
    specs.push(
      {
        name: "terminal-concourse",
        pos: { p: vec3(70, 0, -150), a: { h: 16384, p: 0, b: 0 } },
        model: createBoxModel(82, 18, 14, palette.buildingWallLight, palette.buildingRoofLight),
      },
      {
        name: "service-garage",
        pos: { p: vec3(-206, 0, 242), a: { h: 0, p: 0, b: 0 } },
        model: createBoxModel(54, 28, 14, palette.buildingWallDark, palette.buildingRoofDark),
      },
      {
        name: "east-maintenance",
        pos: { p: vec3(392, 0, -198), a: { h: 16384, p: 0, b: 0 } },
        model: createBoxModel(46, 34, 16, palette.buildingWallDark, palette.buildingRoofDark),
      },
      {
        name: "east-shed",
        pos: { p: vec3(398, 0, -78), a: { h: 16384, p: 0, b: 0 } },
        model: createBoxModel(32, 24, 12, palette.buildingWall, palette.buildingRoof),
      }
    );
  }

  return specs.map((spec, index) => ({
    pos: spec.pos,
    srf: spec.model,
    fn: `${tag}:${spec.name}`,
    id: 1000 + index,
    tag,
    lodDist: FAR_LOD,
  }));
}

function flattenAirportTerrain(terrain: Terrain, palette: AirportPalette): Terrain {
  return {
    ...terrain,
    side: [0, 0, 0, 0],
    sdCol: [palette.soil, palette.soil, palette.soil, palette.soil],
    blocks: terrain.blocks.map((block) => ({
      ...block,
      y: 0,
      vis: [0, 0],
      col: [palette.dryGrass, palette.grass],
    })),
  };
}

function retintAirportNightRunwayPaint(entries: FieldPc2[], palette: AirportPalette): FieldPc2[] {
  return entries.map((entry) => {
    if (entry.fn.toLowerCase() !== "runway.pc2") {
      return entry;
    }

    let changed = false;
    const objects = entry.pc2.objects.map((obj) => {
      if (!isBrightNeutralOverlay(obj.color)) {
        return obj;
      }
      changed = true;
      return {
        ...obj,
        color: palette.runwayPaintWhite,
      };
    });

    if (!changed) {
      return entry;
    }

    return {
      ...entry,
      pc2: {
        ...entry.pc2,
        objects,
      },
    };
  });
}

function isBrightNeutralOverlay(color: Color): boolean {
  const maxChannel = Math.max(color.r, color.g, color.b);
  const minChannel = Math.min(color.r, color.g, color.b);
  return maxChannel >= 0.94 && maxChannel - minChannel <= 0.05;
}

function createRunwayObjects(
  centerX: number,
  centerY: number,
  heading: number,
  width: number,
  length: number,
  palette: AirportPalette
): Pc2Object[] {
  const objects: Pc2Object[] = [];
  objects.push(createRectangleObject(palette.asphalt, centerX, centerY, width, length, heading));

  const dashCount = Math.max(4, Math.floor(length / 180));
  const dashLength = 54;
  const step = (length - 220) / dashCount;
  for (let i = 0; i < dashCount; i++) {
    const offset = length * 0.5 - 160 - step * i;
    const dash = rotatePoint({ x: 0, y: offset }, heading);
    objects.push(
      createRectangleObject(
        palette.runwayPaintWhite,
        centerX + dash.x,
        centerY + dash.y,
        4,
        dashLength,
        heading
      )
    );
  }

  for (const end of [-1, 1]) {
    const thresholdY = end * (length * 0.5 - 40);
    for (const offsetX of [-width * 0.28, 0, width * 0.28]) {
      const marker = rotatePoint({ x: offsetX, y: thresholdY }, heading);
      objects.push(
        createRectangleObject(
          palette.runwayPaintWhite,
          centerX + marker.x,
          centerY + marker.y,
          5,
          34,
          heading
        )
      );
    }
  }

  return objects;
}

function createRunwayEdgeLightObjects(
  centerX: number,
  centerY: number,
  heading: number,
  width: number,
  length: number,
  spacing: number,
  color: Color
): Pc2Object[] {
  const objects: Pc2Object[] = [];
  const halfLength = length * 0.5;
  const offsets = [-width * 0.5, width * 0.5];
  for (const offsetX of offsets) {
    for (let y = -halfLength + 84; y <= halfLength - 84; y += spacing) {
      const light = rotatePoint({ x: offsetX, y }, heading);
      objects.push(
        ...createLightGlowStack(centerX + light.x, centerY + light.y, heading, color, 1)
      );
    }
  }
  return objects;
}

function createRunwayCenterlineLightObjects(
  centerX: number,
  centerY: number,
  heading: number,
  length: number,
  spacing: number,
  color: Color
): Pc2Object[] {
  const objects: Pc2Object[] = [];
  const halfLength = length * 0.5;
  for (let y = -halfLength + 180; y <= halfLength - 180; y += spacing) {
    const light = rotatePoint({ x: 0, y }, heading);
    objects.push(
      ...createLightGlowStack(centerX + light.x, centerY + light.y, heading, color, 0.72)
    );
  }
  return objects;
}

function createRunwayThresholdLightObjects(
  centerX: number,
  centerY: number,
  heading: number,
  width: number,
  endOffset: number,
  thresholdColor: Color,
  endColor: Color
): Pc2Object[] {
  const objects: Pc2Object[] = [];
  const thresholdOffsets = createThresholdOffsets(width);
  for (const end of [-1, 1]) {
    const thresholdYLocal = end * (endOffset - 18);
    const endBarYLocal = end * (endOffset + 22);
    for (const offsetX of thresholdOffsets) {
      const thresholdLight = rotatePoint({ x: offsetX, y: thresholdYLocal }, heading);
      objects.push(
        ...createLightGlowStack(
          centerX + thresholdLight.x,
          centerY + thresholdLight.y,
          heading,
          thresholdColor,
          1.18
        )
      );

      const endLight = rotatePoint({ x: offsetX, y: endBarYLocal }, heading);
      objects.push(
        ...createLightGlowStack(centerX + endLight.x, centerY + endLight.y, heading, endColor, 0.92)
      );
    }
  }
  return objects;
}

function createApproachLightBarObjects(
  centerX: number,
  centerY: number,
  amber: Color
): Pc2Object[] {
  const points = [-28, -10, 8, 26];
  return points.flatMap((offsetX) =>
    createLightGlowStack(centerX + offsetX, centerY, 0, amber, 1.25)
  );
}

function createApronBeaconObjects(
  amber: Color,
  white: Color,
  blue: Color,
  red: Color
): Pc2Object[] {
  const points = [
    { x: -150, y: -104, color: amber, scale: 1.05 },
    { x: -148, y: -28, color: amber, scale: 1.05 },
    { x: -146, y: 48, color: amber, scale: 1.05 },
    { x: -146, y: 126, color: amber, scale: 1.05 },
    { x: -144, y: 204, color: amber, scale: 1.05 },
    { x: 286, y: -150, color: white, scale: 1.0 },
    { x: 318, y: -112, color: white, scale: 1.0 },
    { x: 326, y: -12, color: white, scale: 1.0 },
    { x: 326, y: 66, color: white, scale: 1.0 },
    { x: -88, y: -118, color: blue, scale: 0.75 },
    { x: 232, y: -196, color: red, scale: 0.82 },
  ];
  return points.flatMap((point) =>
    createLightGlowStack(point.x, point.y, 0, point.color, point.scale)
  );
}

function createTaxiwayLightObjects(paths: Vec2[][], spacing: number, color: Color): Pc2Object[] {
  return paths.flatMap((path) => createPolylineLightObjects(path, spacing, color, 0.72));
}

function createPolylineLightObjects(
  vertices: Vec2[],
  spacing: number,
  color: Color,
  scale: number
): Pc2Object[] {
  const objects: Pc2Object[] = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const from = vertices[i];
    const to = vertices[i + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length <= 1) {
      continue;
    }
    const steps = Math.max(1, Math.floor(length / spacing));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = from.x + dx * t;
      const y = from.y + dy * t;
      objects.push(...createLightGlowStack(x, y, 0, color, scale));
    }
  }
  return objects;
}

function createDistantLightFieldObjects(
  warm: Color,
  cool: Color,
  red: Color,
  white: Color
): Pc2Object[] {
  const objects: Pc2Object[] = [];
  const rows = [
    { baseY: 1410, count: 26, startX: -360, stepX: 30, drift: 18, scale: 0.52 },
    { baseY: 1560, count: 30, startX: -420, stepX: 28, drift: -12, scale: 0.48 },
    { baseY: 1715, count: 34, startX: -520, stepX: 32, drift: 9, scale: 0.42 },
  ];

  for (const row of rows) {
    for (let i = 0; i < row.count; i++) {
      const wave = Math.sin(i * 1.73) * row.drift;
      const x = row.startX + i * row.stepX + wave;
      const y = row.baseY + Math.cos(i * 0.57) * 20;
      const paletteIndex = i % 9;
      const color =
        paletteIndex === 0 ? white : paletteIndex === 3 ? cool : paletteIndex === 6 ? red : warm;
      const scale = row.scale * (paletteIndex === 0 ? 1.18 : 1);
      objects.push(...createLightGlowStack(x, y, 0, color, scale));
    }
  }

  return objects;
}

function createThresholdOffsets(width: number): number[] {
  const lightsPerSide = 4;
  const usableWidth = width * 0.82;
  const step = usableWidth / (lightsPerSide * 2 - 1);
  const offsets: number[] = [];
  for (let i = 0; i < lightsPerSide * 2; i++) {
    offsets.push(-usableWidth * 0.5 + i * step);
  }
  return offsets;
}

function createLightGlowStack(
  centerX: number,
  centerY: number,
  heading: number,
  color: Color,
  scale: number
): Pc2Object[] {
  const haloColor = mixColor(color, colorFromRGB(255, 248, 236), 0.28);
  return [
    createRectangleObject(
      scaleColor(haloColor, 0.72),
      centerX,
      centerY,
      10 * scale,
      10 * scale,
      heading
    ),
    createRectangleObject(
      scaleColor(color, 0.96),
      centerX,
      centerY,
      5.4 * scale,
      5.4 * scale,
      heading
    ),
    createRectangleObject(
      scaleColor(color, 1),
      centerX,
      centerY,
      2.4 * scale,
      2.4 * scale,
      heading
    ),
  ];
}

function createParkingPadObjects(
  centerX: number,
  centerY: number,
  count: number,
  spacing: number,
  padWidth: number,
  padLength: number,
  padColor: Color,
  lineColor: Color
): Pc2Object[] {
  const objects: Pc2Object[] = [];
  const start = -((count - 1) * spacing * 0.5);
  for (let i = 0; i < count; i++) {
    const offset = start + i * spacing;
    const x = centerX;
    const y = centerY + offset;
    objects.push(
      createRectangleObject(padColor, x, y, padWidth, padLength, 16384),
      createRectangleObject(lineColor, x, y - padLength * 0.5 + 8, padWidth - 8, 2, 16384),
      createRectangleObject(lineColor, x, y + padLength * 0.5 - 8, padWidth - 8, 2, 16384)
    );
  }
  return objects;
}

function createAirportRoadObjects(
  palette: AirportPalette,
  options: AirportEnhancementOptions
): Pc2Object[] {
  const mainRoadStyle: RoadStyle = {
    shoulderColor: palette.soil,
    asphaltColor: palette.asphalt,
    shoulderWidth: 2.5,
    markings: [
      {
        offsetX: 0,
        width: 1.2,
        color: palette.markingYellow,
        dashLength: 18,
        gapLength: 16,
        inset: 12,
      },
      {
        offsetX: -6.1,
        width: 0.9,
        color: palette.markingWhite,
        dashLength: 0,
        gapLength: 0,
        inset: 10,
      },
      {
        offsetX: 6.1,
        width: 0.9,
        color: palette.markingWhite,
        dashLength: 0,
        gapLength: 0,
        inset: 10,
      },
    ],
  };
  const serviceRoadStyle: RoadStyle = {
    shoulderColor: palette.soil,
    asphaltColor: palette.asphalt,
    shoulderWidth: 1.6,
    markings: [
      {
        offsetX: 0,
        width: 0.9,
        color: palette.markingYellow,
        dashLength: 12,
        gapLength: 16,
        inset: 9,
      },
      {
        offsetX: -4.5,
        width: 0.55,
        color: palette.markingWhite,
        dashLength: 0,
        gapLength: 0,
        inset: 8,
      },
      {
        offsetX: 4.5,
        width: 0.55,
        color: palette.markingWhite,
        dashLength: 0,
        gapLength: 0,
        inset: 8,
      },
    ],
  };
  const apronRoadStyle: RoadStyle = {
    shoulderColor: palette.apron,
    asphaltColor: palette.asphalt,
    shoulderWidth: 1.2,
    markings: [
      {
        offsetX: 0,
        width: 0.9,
        color: palette.markingYellow,
        dashLength: 14,
        gapLength: 18,
        inset: 10,
      },
      {
        offsetX: -4.4,
        width: 0.5,
        color: palette.markingWhite,
        dashLength: 0,
        gapLength: 0,
        inset: 8,
      },
      {
        offsetX: 4.4,
        width: 0.5,
        color: palette.markingWhite,
        dashLength: 0,
        gapLength: 0,
        inset: 8,
      },
    ],
  };

  const segments = [
    // West-side perimeter and gate roads stay clear of the active runway pair.
    { centerX: -304, centerY: 112, width: 13, length: 724, heading: 0, style: mainRoadStyle },
    { centerX: -172, centerY: 326, width: 13, length: 272, heading: 16384, style: mainRoadStyle },
    { centerX: -126, centerY: -214, width: 13, length: 300, heading: 16384, style: mainRoadStyle },
    // Frontage road along the west apron and hangar row.
    { centerX: -88, centerY: 144, width: 10, length: 378, heading: 0, style: apronRoadStyle },
    // Hangar and support spurs.
    { centerX: -196, centerY: 28, width: 9, length: 72, heading: 16384, style: serviceRoadStyle },
    { centerX: -196, centerY: 118, width: 9, length: 72, heading: 16384, style: serviceRoadStyle },
    { centerX: -196, centerY: 206, width: 9, length: 72, heading: 16384, style: serviceRoadStyle },
    { centerX: -196, centerY: 296, width: 9, length: 72, heading: 16384, style: serviceRoadStyle },
    { centerX: -176, centerY: 244, width: 9, length: 78, heading: 16384, style: serviceRoadStyle },
    // South ramp access remains on the apron side instead of cutting through the runway complex.
    { centerX: -52, centerY: -108, width: 10, length: 184, heading: 0, style: apronRoadStyle },
    { centerX: 6, centerY: -168, width: 10, length: 128, heading: 16384, style: apronRoadStyle },
    // East-side logistics road sits outside the runway shoulder with short maintenance spurs.
    { centerX: 438, centerY: -72, width: 13, length: 342, heading: 0, style: mainRoadStyle },
    { centerX: 404, centerY: 82, width: 9, length: 96, heading: 16384, style: serviceRoadStyle },
    { centerX: 412, centerY: -86, width: 9, length: 116, heading: 16384, style: serviceRoadStyle },
    { centerX: 414, centerY: -190, width: 9, length: 146, heading: 16384, style: serviceRoadStyle },
  ];

  if (options.showcaseDensity) {
    segments.push(
      { centerX: -236, centerY: 166, width: 9, length: 286, heading: 0, style: serviceRoadStyle },
      {
        centerX: -156,
        centerY: 286,
        width: 9,
        length: 112,
        heading: 16384,
        style: serviceRoadStyle,
      },
      {
        centerX: 104,
        centerY: -214,
        width: 9,
        length: 162,
        heading: 16384,
        style: serviceRoadStyle,
      },
      { centerX: 468, centerY: -132, width: 9, length: 154, heading: 0, style: serviceRoadStyle },
      {
        centerX: 404,
        centerY: -252,
        width: 9,
        length: 176,
        heading: 16384,
        style: serviceRoadStyle,
      }
    );
  }

  return segments.flatMap((segment) =>
    createRoadSegmentObjects(
      segment.centerX,
      segment.centerY,
      segment.width,
      segment.length,
      segment.heading,
      segment.style
    )
  );
}

function createPc2(objects: Pc2Object[]): Pc2 {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const object of objects) {
    for (const vertex of object.vertices) {
      minX = Math.min(minX, vertex.x);
      minY = Math.min(minY, vertex.y);
      maxX = Math.max(maxX, vertex.x);
      maxY = Math.max(maxY, vertex.y);
    }
  }

  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
    objects,
  };
}

function averagePoint2(vertices: Vec2[]): Vec2 {
  if (vertices.length === 0) {
    return { x: 0, y: 0 };
  }
  let sumX = 0;
  let sumY = 0;
  for (const vertex of vertices) {
    sumX += vertex.x;
    sumY += vertex.y;
  }
  return { x: sumX / vertices.length, y: sumY / vertices.length };
}

function createRectangleObject(
  color: Color,
  centerX: number,
  centerY: number,
  width: number,
  length: number,
  heading: number
): Pc2Object {
  const vertices = [
    rotatePoint({ x: -width * 0.5, y: length * 0.5 }, heading),
    rotatePoint({ x: -width * 0.5, y: -length * 0.5 }, heading),
    rotatePoint({ x: width * 0.5, y: -length * 0.5 }, heading),
    rotatePoint({ x: width * 0.5, y: length * 0.5 }, heading),
  ].map((point) => ({ x: centerX + point.x, y: centerY + point.y }));

  return {
    type: "PLG",
    color,
    visiDist: FAR_LOD,
    vertices,
    center: { x: centerX, y: centerY },
  };
}

function createOffsetRectangleObject(
  color: Color,
  centerX: number,
  centerY: number,
  width: number,
  length: number,
  heading: number,
  offsetX: number,
  offsetY: number
): Pc2Object {
  const offset = rotatePoint({ x: offsetX, y: offsetY }, heading);
  return createRectangleObject(
    color,
    centerX + offset.x,
    centerY + offset.y,
    width,
    length,
    heading
  );
}

function createPolylineObject(color: Color, vertices: Vec2[]): Pc2Object {
  return {
    type: "PLL",
    color,
    visiDist: FAR_LOD,
    vertices,
    center: averagePoint2(vertices),
  };
}

function rotatePoint(point: Vec2, heading: number): Vec2 {
  const radians = (heading * Math.PI) / 32768.0;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return {
    x: c * point.x - s * point.y,
    y: s * point.x + c * point.y,
  };
}

function createRoadSegmentObjects(
  centerX: number,
  centerY: number,
  width: number,
  length: number,
  heading: number,
  style: RoadStyle
): Pc2Object[] {
  const objects: Pc2Object[] = [];
  if (style.shoulderWidth > 0) {
    objects.push(
      createRectangleObject(
        style.shoulderColor,
        centerX,
        centerY,
        width + style.shoulderWidth * 2,
        length,
        heading
      )
    );
  }
  objects.push(createRectangleObject(style.asphaltColor, centerX, centerY, width, length, heading));

  if (style.medianColor && style.medianWidth && style.medianWidth > 0) {
    const medianInset = style.medianInset ?? 18;
    objects.push(
      createRectangleObject(
        style.medianColor,
        centerX,
        centerY,
        style.medianWidth,
        Math.max(16, length - medianInset * 2),
        heading
      )
    );
  }

  for (const marking of style.markings) {
    const inset = marking.inset ?? 10;
    if (marking.gapLength <= 0 || marking.dashLength <= 0) {
      objects.push(
        createOffsetRectangleObject(
          marking.color,
          centerX,
          centerY,
          marking.width,
          Math.max(8, length - inset * 2),
          heading,
          marking.offsetX,
          0
        )
      );
      continue;
    }

    const step = marking.dashLength + marking.gapLength;
    const half = Math.max(0, length * 0.5 - inset - marking.dashLength * 0.5);
    for (let y = -half; y <= half + 0.001; y += step) {
      objects.push(
        createOffsetRectangleObject(
          marking.color,
          centerX,
          centerY,
          marking.width,
          marking.dashLength,
          heading,
          marking.offsetX,
          y
        )
      );
    }
  }

  return objects;
}

function createBoxModel(
  width: number,
  depth: number,
  height: number,
  wallColor: Color,
  roofColor: Color
): SrfModel {
  const hx = width * 0.5;
  const hz = depth * 0.5;
  const vertices: SrfVertex[] = [
    createVertex(-hx, 0, -hz),
    createVertex(hx, 0, -hz),
    createVertex(hx, height, -hz),
    createVertex(-hx, height, -hz),
    createVertex(-hx, 0, hz),
    createVertex(hx, 0, hz),
    createVertex(hx, height, hz),
    createVertex(-hx, height, hz),
  ];

  const polygons: SrfPolygon[] = [
    createPolygon([0, 1, 2, 3], vec3(0, 0, -1), vec3(0, height * 0.5, -hz), wallColor),
    createPolygon([4, 5, 6, 7], vec3(0, 0, 1), vec3(0, height * 0.5, hz), wallColor),
    createPolygon([1, 2, 6, 5], vec3(1, 0, 0), vec3(hx, height * 0.5, 0), wallColor),
    createPolygon([3, 0, 4, 7], vec3(-1, 0, 0), vec3(-hx, height * 0.5, 0), wallColor),
    createPolygon([2, 3, 7, 6], vec3(0, 1, 0), vec3(0, height, 0), roofColor),
  ];

  return {
    bbox: buildBoundingBox(vertices.map((vertex) => vertex.pos)),
    nv: vertices.length,
    vertices,
    np: polygons.length,
    polygons,
  };
}

function createLightPoleModel(
  height: number,
  lampColor: Color,
  poleColor: Color,
  hoodColor: Color
): SrfModel {
  const vertices: SrfVertex[] = [];
  const polygons: SrfPolygon[] = [];

  appendBox(vertices, polygons, {
    center: vec3(0, height * 0.5, 0),
    width: 0.8,
    depth: 0.8,
    height,
    wallColor: poleColor,
    roofColor: scaleColor(poleColor, 0.9),
  });
  appendBox(vertices, polygons, {
    center: vec3(0, 1.2, 0),
    width: 2.1,
    depth: 2.1,
    height: 0.7,
    wallColor: scaleColor(poleColor, 0.82),
    roofColor: scaleColor(poleColor, 0.7),
  });
  appendBox(vertices, polygons, {
    center: vec3(0, height - 2.0, 0),
    width: 7.4,
    depth: 0.9,
    height: 0.55,
    wallColor: poleColor,
    roofColor: scaleColor(poleColor, 0.75),
  });

  const lampOffsets = [-2.35, 0, 2.35];
  for (const offsetX of lampOffsets) {
    appendBox(vertices, polygons, {
      center: vec3(offsetX, height - 2.6, 0.15),
      width: 1.05,
      depth: 1.35,
      height: 0.7,
      wallColor: hoodColor,
      roofColor: scaleColor(hoodColor, 0.82),
    });
    appendEmitterPanel(
      vertices,
      polygons,
      vec3(offsetX, height - 2.95, 0.15),
      0.88,
      0.92,
      lampColor
    );
  }

  return {
    bbox: buildBoundingBox(vertices.map((vertex) => vertex.pos)),
    nv: vertices.length,
    vertices,
    np: polygons.length,
    polygons,
  };
}

function appendBox(
  vertices: SrfVertex[],
  polygons: SrfPolygon[],
  spec: {
    center: Vec3;
    width: number;
    depth: number;
    height: number;
    wallColor: Color;
    roofColor: Color;
  }
): void {
  const base = vertices.length;
  const hx = spec.width * 0.5;
  const hz = spec.depth * 0.5;
  const hy = spec.height * 0.5;
  vertices.push(
    createVertex(spec.center.x - hx, spec.center.y - hy, spec.center.z - hz),
    createVertex(spec.center.x + hx, spec.center.y - hy, spec.center.z - hz),
    createVertex(spec.center.x + hx, spec.center.y + hy, spec.center.z - hz),
    createVertex(spec.center.x - hx, spec.center.y + hy, spec.center.z - hz),
    createVertex(spec.center.x - hx, spec.center.y - hy, spec.center.z + hz),
    createVertex(spec.center.x + hx, spec.center.y - hy, spec.center.z + hz),
    createVertex(spec.center.x + hx, spec.center.y + hy, spec.center.z + hz),
    createVertex(spec.center.x - hx, spec.center.y + hy, spec.center.z + hz)
  );

  polygons.push(
    createPolygon(
      [base, base + 1, base + 2, base + 3],
      vec3(0, 0, -1),
      vec3(spec.center.x, spec.center.y, spec.center.z - hz),
      spec.wallColor
    ),
    createPolygon(
      [base + 4, base + 5, base + 6, base + 7],
      vec3(0, 0, 1),
      vec3(spec.center.x, spec.center.y, spec.center.z + hz),
      spec.wallColor
    ),
    createPolygon(
      [base + 1, base + 5, base + 6, base + 2],
      vec3(1, 0, 0),
      vec3(spec.center.x + hx, spec.center.y, spec.center.z),
      spec.wallColor
    ),
    createPolygon(
      [base, base + 3, base + 7, base + 4],
      vec3(-1, 0, 0),
      vec3(spec.center.x - hx, spec.center.y, spec.center.z),
      spec.wallColor
    ),
    createPolygon(
      [base + 3, base + 2, base + 6, base + 7],
      vec3(0, 1, 0),
      vec3(spec.center.x, spec.center.y + hy, spec.center.z),
      spec.roofColor
    )
  );
}

function appendEmitterPanel(
  vertices: SrfVertex[],
  polygons: SrfPolygon[],
  center: Vec3,
  width: number,
  depth: number,
  color: Color
): void {
  const base = vertices.length;
  const hx = width * 0.5;
  const hz = depth * 0.5;
  vertices.push(
    createVertex(center.x - hx, center.y, center.z - hz),
    createVertex(center.x + hx, center.y, center.z - hz),
    createVertex(center.x + hx, center.y, center.z + hz),
    createVertex(center.x - hx, center.y, center.z + hz)
  );
  polygons.push(
    createPolygon([base, base + 1, base + 2, base + 3], vec3(0, -1, 0), center, color, 2)
  );
}

function scaleColor(color: Color, scale: number): Color {
  return {
    r: Math.min(1, color.r * scale),
    g: Math.min(1, color.g * scale),
    b: Math.min(1, color.b * scale),
  };
}

function mixColor(a: Color, b: Color, t: number): Color {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    r: a.r + (b.r - a.r) * clamped,
    g: a.g + (b.g - a.g) * clamped,
    b: a.b + (b.b - a.b) * clamped,
  };
}

function createVertex(x: number, y: number, z: number): SrfVertex {
  const pos = vec3(x, y, z);
  return {
    pos,
    normal: { ...pos },
    smoothFlag: 0,
  };
}

function createPolygon(
  vertexIds: number[],
  normal: Vec3,
  center: Vec3,
  color: Color,
  bright = 0
): SrfPolygon {
  return {
    backFaceRemove: 1,
    color,
    normal,
    center,
    vertexIds,
    bright,
    nVt: vertexIds.length,
  };
}

function buildBoundingBox(points: Vec3[]): Vec3[] {
  let min = { ...points[0] };
  let max = { ...points[0] };

  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    if (point.x < min.x) min.x = point.x;
    if (point.y < min.y) min.y = point.y;
    if (point.z < min.z) min.z = point.z;
    if (point.x > max.x) max.x = point.x;
    if (point.y > max.y) max.y = point.y;
    if (point.z > max.z) max.z = point.z;
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
