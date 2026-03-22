import type {
  Color, Field, FieldPc2, FieldSrf, MapVariant, Pc2, Pc2Object, PosAtt, SrfModel, SrfPolygon, SrfVertex, Terrain, Vec2, Vec3,
} from './types';
import { colorFromRGB, vec3 } from './math';

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
  markingWhite: Color;
  markingYellow: Color;
  lightBlue?: Color;
  lightAmber?: Color;
  lightWhite?: Color;
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
  markingWhite: colorFromRGB(204, 214, 224),
  markingYellow: colorFromRGB(228, 178, 68),
  lightBlue: colorFromRGB(112, 182, 255),
  lightAmber: colorFromRGB(255, 198, 92),
  lightWhite: colorFromRGB(248, 248, 255),
};

const DOWNTOWN_TAG = '__browser_downtown_augmented__';
const AIRPORT_IMPROVED_TAG = '__browser_airport_improved_augmented__';
const AIRPORT_NIGHT_TAG = '__browser_airport_night_augmented__';

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

export function resolveFieldFileForMap(defaultFieldFile: string, mapVariant: MapVariant): string {
  switch (mapVariant) {
    case 'downtown':
      return 'downtown.fld';
    default:
      return defaultFieldFile;
  }
}

export function enhanceFieldForMap(field: Field, fieldFile: string, mapVariant: MapVariant): Field {
  if (mapVariant === 'downtown' || fieldFile.toLowerCase().endsWith('downtown.fld')) {
    return enhanceDowntownField(field);
  }

  if (!fieldFile.toLowerCase().endsWith('airport.fld')) {
    return field;
  }

  if (mapVariant === 'airport') {
    return field;
  }

  if (mapVariant === 'airport-improved') {
    return enhanceAirportField(field, AIRPORT_IMPROVED, AIRPORT_IMPROVED_TAG, {
      includeNightLights: false,
      showcaseDensity: true,
    });
  }

  if (mapVariant === 'airport-night') {
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
  options: AirportEnhancementOptions,
): Field {
  if (field.srf.some(obj => obj.tag === tag) || field.pc2.some(obj => obj.fn === tag)) {
    return field;
  }

  const baseSrf = options.showcaseDensity
    ? field.srf.filter(obj => !isOriginalImprovedHangar(obj))
    : field.srf;
  const pc2Entries = createAirportOverlayEntries(palette, tag, options);
  const srfEntries = createAirportBuildingEntries(field, palette, tag, options);

  return {
    ...field,
    sky: palette.sky ?? field.sky,
    gnd: palette.ground ?? field.gnd,
    ter: field.ter.map(entry => ({
      ...entry,
      ter: flattenAirportTerrain(entry.ter),
    })),
    pc2: [...field.pc2, ...pc2Entries],
    srf: [...baseSrf, ...srfEntries],
  };
}

function isOriginalImprovedHangar(obj: FieldSrf): boolean {
  return obj.fn.toLowerCase() === 'hanger.srf';
}

function enhanceDowntownField(field: Field): Field {
  if (field.srf.some(obj => obj.tag === DOWNTOWN_TAG) || field.pc2.some(obj => obj.fn === DOWNTOWN_TAG)) {
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

function createAirportOverlayEntries(
  palette: AirportPalette,
  tag: string,
  options: AirportEnhancementOptions,
): FieldPc2[] {
  const objects: Pc2Object[] = [
    createRectangleObject(palette.dryGrass, -162, 118, 320, 430, 0),
    createRectangleObject(palette.dryGrass, 302, -148, 196, 250, 16384),
    createRectangleObject(palette.dryGrass, 324, 26, 166, 172, 16384),
    createRectangleObject(palette.soil, -8, -82, 88, 52, 16384),
    createRectangleObject(palette.soil, 274, -206, 72, 48, 16384),
    createRectangleObject(palette.asphalt, -315, 86, 14, 650, 0),
    createRectangleObject(palette.asphalt, -150, 330, 350, 14, 16384),
    createRectangleObject(palette.asphalt, -80, -162, 520, 14, 16384),
    createRectangleObject(palette.asphalt, -26, -92, 154, 12, 16384),
    createRectangleObject(palette.asphalt, 52, -142, 288, 12, 16384),
    createRectangleObject(palette.asphalt, 205, -58, 250, 12, -6200),
    createRectangleObject(palette.asphalt, 324, -118, 188, 12, 16384),
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
      createRectangleObject(palette.asphalt, -238, 12, 16, 308, 0),
      createRectangleObject(palette.asphalt, -60, 252, 286, 12, 16384),
      createRectangleObject(palette.asphalt, 118, -214, 334, 12, 16384),
      createRectangleObject(palette.asphalt, 372, -78, 18, 204, 0),
      createRectangleObject(palette.asphalt, 246, -262, 148, 12, 16384),
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
      ...createParkingPadObjects(332, -210, 2, 56, 56, 68, palette.apron, palette.markingWhite),
    );
  }

  if (options.includeNightLights) {
    objects.push(
      ...createRunwayLightObjects(92.81, 19.89, 0, 60, 3000, 120, palette.lightBlue!),
      ...createRunwayLightObjects(199.58, -97.85, -9624, 60, 3000, 120, palette.lightBlue!),
      ...createRunwayEndLightObjects(92.81, 19.89, 0, 54, 1485, palette.lightAmber!, palette.lightWhite!),
      ...createRunwayEndLightObjects(199.58, -97.85, -9624, 54, 1485, palette.lightAmber!, palette.lightWhite!),
      ...createApronBeaconObjects(palette.lightAmber!, palette.lightWhite!),
    );
  }

  return [{
    pos: IDENTITY_POS,
    pc2: createPc2(objects),
    fn: tag,
    lodDist: FAR_LOD,
  }];
}

function createAirportBuildingEntries(
  field: Field,
  palette: AirportPalette,
  tag: string,
  options: AirportEnhancementOptions,
): FieldSrf[] {
  const hanger = field.srf.find(obj => obj.fn.toLowerCase() === 'hanger.srf')?.srf ?? null;

  const specs: BuildingSpec[] = [
    {
      name: 'terminal-main',
      pos: { p: vec3(142, 0, -108), a: { h: 16384, p: 0, b: 0 } },
      model: createBoxModel(118, 34, 22, palette.buildingWallLight, palette.buildingRoofLight),
    },
    {
      name: 'terminal-west',
      pos: { p: vec3(58, 0, -92), a: { h: 16384, p: 0, b: 0 } },
      model: createBoxModel(42, 24, 16, palette.buildingWall, palette.buildingRoof),
    },
    {
      name: 'terminal-east',
      pos: { p: vec3(234, 0, -64), a: { h: 16384, p: 0, b: 0 } },
      model: createBoxModel(70, 22, 18, palette.buildingWall, palette.buildingRoof),
    },
    {
      name: 'cargo-warehouse',
      pos: { p: vec3(274, 0, -154), a: { h: 16384, p: 0, b: 0 } },
      model: createBoxModel(86, 30, 18, palette.buildingWallDark, palette.buildingRoofDark),
    },
    {
      name: 'cargo-office',
      pos: { p: vec3(322, 0, -112), a: { h: 16384, p: 0, b: 0 } },
      model: createBoxModel(34, 24, 14, palette.buildingWall, palette.buildingRoof),
    },
    {
      name: 'remote-hangar-1',
      pos: { p: vec3(324, 0, -12), a: { h: 16384, p: 0, b: 0 } },
      model: createBoxModel(54, 42, 20, palette.buildingWallDark, palette.buildingRoofDark),
    },
    {
      name: 'remote-hangar-2',
      pos: { p: vec3(324, 0, 64), a: { h: 16384, p: 0, b: 0 } },
      model: createBoxModel(54, 42, 20, palette.buildingWallDark, palette.buildingRoofDark),
    },
    {
      name: 'fuel-depot',
      pos: { p: vec3(252, 0, -214), a: { h: 0, p: 0, b: 0 } },
      model: createBoxModel(34, 28, 14, palette.buildingWall, palette.buildingRoof),
    },
  ];

  if (options.showcaseDensity) {
    const showcaseHangar = createBoxModel(62, 58, 24, palette.buildingWallDark, palette.buildingRoofLight);
    specs.push(
      { name: 'west-hangar-a', pos: { p: vec3(-246, 0, 28), a: { h: 49152, p: 0, b: 0 } }, model: showcaseHangar },
      { name: 'west-hangar-b', pos: { p: vec3(-246, 0, 118), a: { h: 49152, p: 0, b: 0 } }, model: showcaseHangar },
      { name: 'west-hangar-c', pos: { p: vec3(-246, 0, 206), a: { h: 49152, p: 0, b: 0 } }, model: showcaseHangar },
      { name: 'west-hangar-d', pos: { p: vec3(-246, 0, 296), a: { h: 49152, p: 0, b: 0 } }, model: showcaseHangar },
    );
  } else if (hanger !== null) {
      specs.push(
        { name: 'west-hangar-a', pos: { p: vec3(-246, 0, 28), a: { h: 49152, p: 0, b: 0 } }, model: hanger },
        { name: 'west-hangar-b', pos: { p: vec3(-246, 0, 118), a: { h: 49152, p: 0, b: 0 } }, model: hanger },
        { name: 'west-hangar-c', pos: { p: vec3(-246, 0, 206), a: { h: 49152, p: 0, b: 0 } }, model: hanger },
        { name: 'west-hangar-d', pos: { p: vec3(-246, 0, 296), a: { h: 49152, p: 0, b: 0 } }, model: hanger },
      );
  }

  if (options.includeNightLights) {
    const lightPole = createLightPoleModel(28, palette.lightWhite!, colorFromRGB(72, 76, 84));
    specs.push(
      { name: 'light-pole-west-1', pos: { p: vec3(-172, 0, -122), a: { h: 0, p: 0, b: 0 } }, model: lightPole },
      { name: 'light-pole-west-2', pos: { p: vec3(-172, 0, -36), a: { h: 0, p: 0, b: 0 } }, model: lightPole },
      { name: 'light-pole-west-3', pos: { p: vec3(-170, 0, 52), a: { h: 0, p: 0, b: 0 } }, model: lightPole },
      { name: 'light-pole-west-4', pos: { p: vec3(-168, 0, 140), a: { h: 0, p: 0, b: 0 } }, model: lightPole },
      { name: 'light-pole-west-5', pos: { p: vec3(-166, 0, 226), a: { h: 0, p: 0, b: 0 } }, model: lightPole },
      { name: 'light-pole-east-1', pos: { p: vec3(286, 0, -172), a: { h: 0, p: 0, b: 0 } }, model: lightPole },
      { name: 'light-pole-east-2', pos: { p: vec3(318, 0, -88), a: { h: 0, p: 0, b: 0 } }, model: lightPole },
      { name: 'light-pole-east-3', pos: { p: vec3(336, 0, -6), a: { h: 0, p: 0, b: 0 } }, model: lightPole },
      { name: 'light-pole-east-4', pos: { p: vec3(338, 0, 76), a: { h: 0, p: 0, b: 0 } }, model: lightPole },
      { name: 'light-pole-terminal', pos: { p: vec3(-28, 0, -136), a: { h: 0, p: 0, b: 0 } }, model: lightPole },
    );
  }

  if (options.showcaseDensity || tag === AIRPORT_IMPROVED_TAG) {
    specs.push(
      {
        name: 'terminal-concourse',
        pos: { p: vec3(70, 0, -150), a: { h: 16384, p: 0, b: 0 } },
        model: createBoxModel(82, 18, 14, palette.buildingWallLight, palette.buildingRoofLight),
      },
      {
        name: 'service-garage',
        pos: { p: vec3(-206, 0, 242), a: { h: 0, p: 0, b: 0 } },
        model: createBoxModel(54, 28, 14, palette.buildingWallDark, palette.buildingRoofDark),
      },
      {
        name: 'east-maintenance',
        pos: { p: vec3(392, 0, -198), a: { h: 16384, p: 0, b: 0 } },
        model: createBoxModel(46, 34, 16, palette.buildingWallDark, palette.buildingRoofDark),
      },
      {
        name: 'east-shed',
        pos: { p: vec3(398, 0, -78), a: { h: 16384, p: 0, b: 0 } },
        model: createBoxModel(32, 24, 12, palette.buildingWall, palette.buildingRoof),
      },
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

function createDowntownOverlayEntries(): FieldPc2[] {
  const asphalt = colorFromRGB(56, 60, 66);
  const avenue = colorFromRGB(64, 68, 74);
  const plaza = colorFromRGB(118, 122, 126);
  const park = colorFromRGB(62, 92, 68);
  const lane = colorFromRGB(224, 206, 132);
  const crosswalk = colorFromRGB(214, 216, 220);
  const water = colorFromRGB(56, 92, 138);

  const objects: Pc2Object[] = [];
  const roadXs = [-720, -480, -240, 0, 240, 480, 720];
  const roadZs = [-720, -480, -240, 0, 240, 480, 720];

  for (const x of roadXs) {
    const width = x === 0 ? 42 : 26;
    objects.push(createRectangleObject(x === 0 ? avenue : asphalt, x, 0, width, 2100, 0));
    objects.push(createPolylineObject(lane, [{ x, y: -980 }, { x, y: 980 }]));
  }

  for (const z of roadZs) {
    const width = z === 0 ? 42 : 26;
    objects.push(createRectangleObject(z === 0 ? avenue : asphalt, 0, z, 2100, width, 16384));
    objects.push(createPolylineObject(lane, [{ x: -980, y: z }, { x: 980, y: z }]));
  }

  objects.push(
    createRectangleObject(plaza, 0, 0, 190, 190, 0),
    createRectangleObject(plaza, 390, -390, 120, 150, 0),
    createRectangleObject(park, -420, 390, 190, 210, 0),
    createRectangleObject(park, 450, 450, 170, 170, 0),
    createRectangleObject(water, -960, -620, 220, 1150, 0),
  );

  for (const x of [-720, -480, -240, 0, 240, 480, 720]) {
    for (const z of [-720, -480, -240, 0, 240, 480, 720]) {
      if (Math.abs(x) < 80 && Math.abs(z) < 80) {
        continue;
      }
      objects.push(createCrosswalkObject(x, z, crosswalk));
    }
  }

  return [{
    pos: IDENTITY_POS,
    pc2: createPc2(objects),
    fn: DOWNTOWN_TAG,
    lodDist: FAR_LOD,
  }];
}

function flattenAirportTerrain(terrain: Terrain): Terrain {
  return {
    ...terrain,
    blocks: terrain.blocks.map(block => ({
      ...block,
      y: 0,
    })),
  };
}

function createDowntownBuildingEntries(): FieldSrf[] {
  const specs: BuildingSpec[] = [];
  const xs = [-810, -570, -330, -90, 150, 390, 630, 870];
  const zs = [-810, -570, -330, -90, 150, 390, 630, 870];

  for (let ix = 0; ix < xs.length; ix++) {
    for (let iz = 0; iz < zs.length; iz++) {
      const x = xs[ix];
      const z = zs[iz];
      if (Math.abs(x) < 120 && Math.abs(z) < 120) {
        continue;
      }
      if (x < -860) {
        continue;
      }

      const dist = Math.sqrt(x * x + z * z);
      const centrality = Math.max(0, 1 - dist / 1300);
      const width = 56 + ((ix * 17 + iz * 11) % 34);
      const depth = 48 + ((ix * 13 + iz * 19) % 30);
      const height = 30 + centrality * 180 + ((ix * 29 + iz * 23) % 46);
      const heading = ((ix + iz) % 3 === 0) ? 16384 : 0;
      const wall = (ix + iz) % 2 === 0
        ? colorFromRGB(98, 108, 122)
        : colorFromRGB(118, 120, 128);
      const roof = (ix + iz) % 2 === 0
        ? colorFromRGB(70, 78, 90)
        : colorFromRGB(86, 88, 96);

      specs.push({
        name: `tower-${ix}-${iz}`,
        pos: { p: vec3(x, 0, z), a: { h: heading, p: 0, b: 0 } },
        model: createBoxModel(width, depth, height, wall, roof),
      });

      if ((ix + iz) % 2 === 0 && centrality > 0.2) {
        specs.push({
          name: `podium-${ix}-${iz}`,
          pos: { p: vec3(x + 34, 0, z - 28), a: { h: 0, p: 0, b: 0 } },
          model: createBoxModel(42, 32, 18 + centrality * 16, colorFromRGB(134, 128, 122), colorFromRGB(92, 88, 84)),
        });
      }
    }
  }

  specs.push(
    {
      name: 'city-hall',
      pos: { p: vec3(0, 0, 0), a: { h: 0, p: 0, b: 0 } },
      model: createBoxModel(120, 90, 42, colorFromRGB(176, 170, 160), colorFromRGB(128, 122, 114)),
    },
    {
      name: 'spire-north',
      pos: { p: vec3(180, 0, -180), a: { h: 0, p: 0, b: 0 } },
      model: createBoxModel(62, 62, 240, colorFromRGB(96, 106, 122), colorFromRGB(66, 72, 84)),
    },
    {
      name: 'spire-west',
      pos: { p: vec3(-180, 0, 180), a: { h: 0, p: 0, b: 0 } },
      model: createBoxModel(70, 58, 220, colorFromRGB(110, 118, 130), colorFromRGB(74, 80, 92)),
    },
    {
      name: 'stadium',
      pos: { p: vec3(-520, 0, -460), a: { h: 0, p: 0, b: 0 } },
      model: createBoxModel(180, 120, 32, colorFromRGB(122, 126, 132), colorFromRGB(84, 88, 94)),
    },
  );

  return specs.map((spec, index) => ({
    pos: spec.pos,
    srf: spec.model,
    fn: `${DOWNTOWN_TAG}:${spec.name}`,
    id: 2000 + index,
    tag: DOWNTOWN_TAG,
    lodDist: FAR_LOD,
  }));
}

function createRunwayObjects(
  centerX: number,
  centerY: number,
  heading: number,
  width: number,
  length: number,
  palette: AirportPalette,
): Pc2Object[] {
  const objects: Pc2Object[] = [];
  objects.push(createRectangleObject(palette.asphalt, centerX, centerY, width, length, heading));

  const dashCount = Math.max(4, Math.floor(length / 180));
  const dashLength = 54;
  const step = (length - 220) / dashCount;
  for (let i = 0; i < dashCount; i++) {
    const offset = (length * 0.5) - 160 - step * i;
    const dash = rotatePoint({ x: 0, y: offset }, heading);
    objects.push(createRectangleObject(
      palette.markingWhite,
      centerX + dash.x,
      centerY + dash.y,
      4,
      dashLength,
      heading,
    ));
  }

  for (const end of [-1, 1]) {
    const thresholdY = end * ((length * 0.5) - 40);
    for (const offsetX of [-width * 0.28, 0, width * 0.28]) {
      const marker = rotatePoint({ x: offsetX, y: thresholdY }, heading);
      objects.push(createRectangleObject(
        palette.markingWhite,
        centerX + marker.x,
        centerY + marker.y,
        5,
        34,
        heading,
      ));
    }
  }

  return objects;
}

function createRunwayLightObjects(
  centerX: number,
  centerY: number,
  heading: number,
  width: number,
  length: number,
  spacing: number,
  color: Color,
): Pc2Object[] {
  const objects: Pc2Object[] = [];
  const halfLength = length * 0.5;
  const offsets = [-width * 0.5, 0, width * 0.5];
  for (const offsetX of offsets) {
    for (let y = -halfLength; y <= halfLength; y += spacing) {
      const light = rotatePoint({ x: offsetX, y }, heading);
      objects.push(createRectangleObject(color, centerX + light.x, centerY + light.y, offsetX === 0 ? 4 : 7, offsetX === 0 ? 4 : 7, heading));
    }
  }
  return objects;
}

function createRunwayEndLightObjects(
  centerX: number,
  centerY: number,
  heading: number,
  width: number,
  endOffset: number,
  edgeColor: Color,
  centerColor: Color,
): Pc2Object[] {
  const objects: Pc2Object[] = [];
  for (const end of [-1, 1]) {
    const centerYLocal = end * endOffset;
    for (const offsetX of [-width * 0.35, -width * 0.1, width * 0.1, width * 0.35]) {
      const light = rotatePoint({ x: offsetX, y: centerYLocal }, heading);
      const color = Math.abs(offsetX) < width * 0.2 ? centerColor : edgeColor;
      objects.push(createRectangleObject(color, centerX + light.x, centerY + light.y, 7, 7, heading));
    }
  }
  return objects;
}

function createApronBeaconObjects(amber: Color, white: Color): Pc2Object[] {
  const points = [
    { x: -150, y: -104, color: amber },
    { x: -148, y: -28, color: amber },
    { x: -146, y: 48, color: amber },
    { x: -146, y: 126, color: amber },
    { x: -144, y: 204, color: amber },
    { x: 286, y: -150, color: white },
    { x: 318, y: -112, color: white },
    { x: 326, y: -12, color: white },
    { x: 326, y: 66, color: white },
  ];
  return points.map(point => createRectangleObject(point.color, point.x, point.y, 8, 8, 0));
}

function createParkingPadObjects(
  centerX: number,
  centerY: number,
  count: number,
  spacing: number,
  padWidth: number,
  padLength: number,
  padColor: Color,
  lineColor: Color,
): Pc2Object[] {
  const objects: Pc2Object[] = [];
  const start = -((count - 1) * spacing * 0.5);
  for (let i = 0; i < count; i++) {
    const offset = start + (i * spacing);
    const x = centerX;
    const y = centerY + offset;
    objects.push(
      createRectangleObject(padColor, x, y, padWidth, padLength, 16384),
      createRectangleObject(lineColor, x, y - (padLength * 0.5) + 8, padWidth - 8, 2, 16384),
      createRectangleObject(lineColor, x, y + (padLength * 0.5) - 8, padWidth - 8, 2, 16384),
    );
  }
  return objects;
}

function createCrosswalkObject(centerX: number, centerY: number, color: Color): Pc2Object {
  const objects = [
    createRectangleObject(color, centerX - 16, centerY, 6, 22, 0),
    createRectangleObject(color, centerX - 6, centerY, 6, 22, 0),
    createRectangleObject(color, centerX + 6, centerY, 6, 22, 0),
    createRectangleObject(color, centerX + 16, centerY, 6, 22, 0),
  ];
  return mergePc2Objects(objects, color);
}

function mergePc2Objects(objects: Pc2Object[], color: Color): Pc2Object {
  const vertices: Vec2[] = [];
  for (const object of objects) {
    vertices.push(...object.vertices);
  }
  return {
    type: 'PST',
    color,
    visiDist: FAR_LOD,
    vertices,
    center: averagePoint2(vertices),
  };
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
  heading: number,
): Pc2Object {
  const vertices = [
    rotatePoint({ x: -width * 0.5, y: length * 0.5 }, heading),
    rotatePoint({ x: -width * 0.5, y: -length * 0.5 }, heading),
    rotatePoint({ x: width * 0.5, y: -length * 0.5 }, heading),
    rotatePoint({ x: width * 0.5, y: length * 0.5 }, heading),
  ].map(point => ({ x: centerX + point.x, y: centerY + point.y }));

  return {
    type: 'PLG',
    color,
    visiDist: FAR_LOD,
    vertices,
    center: { x: centerX, y: centerY },
  };
}

function createPolylineObject(color: Color, vertices: Vec2[]): Pc2Object {
  return {
    type: 'PLL',
    color,
    visiDist: FAR_LOD,
    vertices,
    center: averagePoint2(vertices),
  };
}

function rotatePoint(point: Vec2, heading: number): Vec2 {
  const radians = heading * Math.PI / 32768.0;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return {
    x: c * point.x - s * point.y,
    y: s * point.x + c * point.y,
  };
}

function createBoxModel(
  width: number,
  depth: number,
  height: number,
  wallColor: Color,
  roofColor: Color,
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
    bbox: buildBoundingBox(vertices.map(vertex => vertex.pos)),
    nv: vertices.length,
    vertices,
    np: polygons.length,
    polygons,
  };
}

function createLightPoleModel(height: number, lampColor: Color, poleColor: Color): SrfModel {
  const poleHalf = 0.9;
  const lampHalf = 2.2;
  const lampBase = height - 3;
  const vertices: SrfVertex[] = [
    createVertex(-poleHalf, 0, -poleHalf),
    createVertex(poleHalf, 0, -poleHalf),
    createVertex(poleHalf, height, -poleHalf),
    createVertex(-poleHalf, height, -poleHalf),
    createVertex(-poleHalf, 0, poleHalf),
    createVertex(poleHalf, 0, poleHalf),
    createVertex(poleHalf, height, poleHalf),
    createVertex(-poleHalf, height, poleHalf),
    createVertex(-lampHalf, lampBase, -lampHalf),
    createVertex(lampHalf, lampBase, -lampHalf),
    createVertex(lampHalf, height + 1.2, -lampHalf),
    createVertex(-lampHalf, height + 1.2, -lampHalf),
    createVertex(-lampHalf, lampBase, lampHalf),
    createVertex(lampHalf, lampBase, lampHalf),
    createVertex(lampHalf, height + 1.2, lampHalf),
    createVertex(-lampHalf, height + 1.2, lampHalf),
  ];

  const polygons: SrfPolygon[] = [
    createPolygon([0, 1, 2, 3], vec3(0, 0, -1), vec3(0, height * 0.5, -poleHalf), poleColor),
    createPolygon([4, 5, 6, 7], vec3(0, 0, 1), vec3(0, height * 0.5, poleHalf), poleColor),
    createPolygon([1, 5, 6, 2], vec3(1, 0, 0), vec3(poleHalf, height * 0.5, 0), poleColor),
    createPolygon([0, 3, 7, 4], vec3(-1, 0, 0), vec3(-poleHalf, height * 0.5, 0), poleColor),
    createPolygon([8, 9, 10, 11], vec3(0, 0, -1), vec3(0, height - 1.4, -lampHalf), lampColor, 2),
    createPolygon([12, 13, 14, 15], vec3(0, 0, 1), vec3(0, height - 1.4, lampHalf), lampColor, 2),
    createPolygon([9, 13, 14, 10], vec3(1, 0, 0), vec3(lampHalf, height - 1.4, 0), lampColor, 2),
    createPolygon([8, 11, 15, 12], vec3(-1, 0, 0), vec3(-lampHalf, height - 1.4, 0), lampColor, 2),
    createPolygon([11, 10, 14, 15], vec3(0, 1, 0), vec3(0, height + 1.2, 0), lampColor, 2),
  ];

  return {
    bbox: buildBoundingBox(vertices.map(vertex => vertex.pos)),
    nv: vertices.length,
    vertices,
    np: polygons.length,
    polygons,
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

function createPolygon(vertexIds: number[], normal: Vec3, center: Vec3, color: Color, bright = 0): SrfPolygon {
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
