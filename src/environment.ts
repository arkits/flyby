import type { Color, Field, MapEnvironment, MapVariant } from "./types";
import { colorFromRGB } from "./math";

function mixColor(a: Color, b: Color, t: number): Color {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    r: a.r + (b.r - a.r) * clamped,
    g: a.g + (b.g - a.g) * clamped,
    b: a.b + (b.b - a.b) * clamped,
  };
}

function normalizeDirection(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const length = Math.hypot(x, y, z) || 1;
  return {
    x: x / length,
    y: y / length,
    z: z / length,
  };
}

export function resolveMapEnvironment(mapVariant: MapVariant, field: Field): MapEnvironment {
  const fieldSky = field.sky;
  const fieldGround = field.gnd;

  switch (mapVariant) {
    case "airport":
      return {
        key: mapVariant,
        sky: {
          mode: "clear",
          topColor: fieldSky,
          horizonColor: fieldSky,
          bottomColor: fieldSky,
          curve: 1,
          glow: 0,
        },
        cloud: {
          color: fieldSky,
          shadowColor: fieldSky,
          coverage: 0,
          softness: 0.01,
          scale: 0.001,
          bandScale: 1,
          speed: 0,
          density: 0,
          height: 0.2,
        },
        keyLight: {
          direction: normalizeDirection(0.18, 0.94, -0.12),
          color: colorFromRGB(255, 255, 255),
          intensity: 0.72,
          shadowStrength: 0,
        },
        hemisphere: {
          skyColor: fieldSky,
          groundColor: fieldGround,
          intensity: 0.24,
          balance: 0.5,
        },
        fog: {
          color: fieldSky,
          start: 10000,
          end: 10001,
          density: 0,
          heightFalloff: 0,
        },
        ground: {
          primary: fieldGround,
          secondary: fieldGround,
          accent: fieldGround,
          paved: fieldGround,
          detailScale: 0.001,
          breakupScale: 0.001,
          stripScale: 0.001,
          patchScale: 0.001,
          pavementBias: 1,
          shoulderDepth: 0,
        },
        emissive: {
          color: fieldGround,
          strength: 0,
          threshold: 1,
          saturationBoost: 0,
        },
      };
    case "airport-improved":
      return {
        key: mapVariant,
        sky: {
          mode: "clear",
          topColor: mixColor(fieldSky, colorFromRGB(92, 156, 218), 0.82),
          horizonColor: colorFromRGB(188, 214, 222),
          bottomColor: colorFromRGB(228, 214, 182),
          curve: 1.45,
          glow: 0.18,
        },
        cloud: {
          color: colorFromRGB(252, 245, 232),
          shadowColor: colorFromRGB(174, 184, 194),
          coverage: 0.56,
          softness: 0.24,
          scale: 0.0012,
          bandScale: 2.7,
          speed: 0.0015,
          density: 0.9,
          height: 0.34,
        },
        keyLight: {
          direction: normalizeDirection(0.48, 0.82, -0.31),
          color: colorFromRGB(255, 244, 224),
          intensity: 1.18,
          shadowStrength: 0.42,
        },
        hemisphere: {
          skyColor: colorFromRGB(148, 186, 224),
          groundColor: colorFromRGB(132, 116, 82),
          intensity: 0.72,
          balance: 0.64,
        },
        fog: {
          color: colorFromRGB(198, 210, 214),
          start: 2400,
          end: 8800,
          density: 0.8,
          heightFalloff: 0.00042,
        },
        ground: {
          primary: colorFromRGB(94, 118, 66),
          secondary: colorFromRGB(144, 136, 86),
          accent: colorFromRGB(116, 88, 58),
          paved: colorFromRGB(88, 92, 92),
          detailScale: 0.008,
          breakupScale: 0.0018,
          stripScale: 0.007,
          patchScale: 0.017,
          pavementBias: 0.54,
          shoulderDepth: 0.32,
        },
        emissive: {
          color: colorFromRGB(255, 230, 170),
          strength: 0.16,
          threshold: 0.82,
          saturationBoost: 0.12,
        },
      };
    case "airport-night":
      return {
        key: mapVariant,
        sky: {
          mode: "night",
          topColor: mixColor(fieldSky, colorFromRGB(12, 20, 40), 0.84),
          horizonColor: colorFromRGB(34, 54, 92),
          bottomColor: colorFromRGB(16, 18, 24),
          curve: 1.12,
          glow: 0.12,
        },
        cloud: {
          color: colorFromRGB(82, 102, 128),
          shadowColor: colorFromRGB(10, 18, 34),
          coverage: 0.48,
          softness: 0.34,
          scale: 0.00145,
          bandScale: 2.2,
          speed: 0.0009,
          density: 0.62,
          height: 0.3,
        },
        keyLight: {
          direction: normalizeDirection(-0.34, 0.72, 0.42),
          color: colorFromRGB(176, 198, 255),
          intensity: 0.52,
          shadowStrength: 0.26,
        },
        hemisphere: {
          skyColor: colorFromRGB(54, 74, 112),
          groundColor: colorFromRGB(20, 24, 28),
          intensity: 0.42,
          balance: 0.58,
        },
        fog: {
          color: colorFromRGB(28, 38, 56),
          start: 1800,
          end: 7200,
          density: 0.92,
          heightFalloff: 0.00055,
        },
        ground: {
          primary: mixColor(fieldGround, colorFromRGB(40, 44, 42), 0.6),
          secondary: colorFromRGB(58, 62, 58),
          accent: colorFromRGB(32, 38, 42),
          paved: colorFromRGB(42, 46, 52),
          detailScale: 0.007,
          breakupScale: 0.0016,
          stripScale: 0.006,
          patchScale: 0.015,
          pavementBias: 0.68,
          shoulderDepth: 0.22,
        },
        emissive: {
          color: colorFromRGB(198, 222, 255),
          strength: 1.08,
          threshold: 0.56,
          saturationBoost: 0.44,
        },
      };
    case "downtown":
      return {
        key: mapVariant,
        sky: {
          mode: "hazy",
          topColor: mixColor(fieldSky, colorFromRGB(82, 114, 156), 0.78),
          horizonColor: colorFromRGB(188, 196, 202),
          bottomColor: colorFromRGB(160, 166, 168),
          curve: 1.3,
          glow: 0.08,
        },
        cloud: {
          color: colorFromRGB(226, 232, 236),
          shadowColor: colorFromRGB(126, 136, 148),
          coverage: 0.32,
          softness: 0.36,
          scale: 0.001,
          bandScale: 1.8,
          speed: 0.0007,
          density: 0.46,
          height: 0.26,
        },
        keyLight: {
          direction: normalizeDirection(-0.44, 0.79, -0.19),
          color: colorFromRGB(250, 244, 236),
          intensity: 0.96,
          shadowStrength: 0.38,
        },
        hemisphere: {
          skyColor: colorFromRGB(146, 168, 188),
          groundColor: colorFromRGB(78, 82, 88),
          intensity: 0.64,
          balance: 0.6,
        },
        fog: {
          color: colorFromRGB(170, 180, 188),
          start: 1600,
          end: 7000,
          density: 0.98,
          heightFalloff: 0.0003,
        },
        ground: {
          primary: colorFromRGB(68, 72, 78),
          secondary: colorFromRGB(98, 102, 106),
          accent: colorFromRGB(84, 88, 92),
          paved: colorFromRGB(86, 90, 94),
          detailScale: 0.009,
          breakupScale: 0.0022,
          stripScale: 0.009,
          patchScale: 0.02,
          pavementBias: 0.88,
          shoulderDepth: 0.1,
        },
        emissive: {
          color: colorFromRGB(248, 210, 138),
          strength: 0.26,
          threshold: 0.76,
          saturationBoost: 0.18,
        },
      };
    case "san-francisco":
      return {
        key: mapVariant,
        sky: {
          mode: "hazy",
          topColor: colorFromRGB(110, 130, 170),
          horizonColor: colorFromRGB(180, 190, 205),
          bottomColor: colorFromRGB(160, 165, 170),
          curve: 1.1,
          glow: 0.1,
        },
        cloud: {
          color: colorFromRGB(220, 225, 230),
          shadowColor: colorFromRGB(150, 160, 170),
          coverage: 0.65,
          softness: 0.75,
          scale: 0.0008,
          bandScale: 1.5,
          speed: 0.0004,
          density: 0.55,
          height: 0.4,
        },
        keyLight: {
          direction: normalizeDirection(0.5, 0.6, -0.3),
          color: colorFromRGB(255, 245, 220),
          intensity: 0.85,
          shadowStrength: 0.45,
        },
        hemisphere: {
          skyColor: colorFromRGB(150, 170, 190),
          groundColor: colorFromRGB(90, 95, 100),
          intensity: 0.6,
          balance: 0.6,
        },
        fog: {
          color: colorFromRGB(180, 190, 205),
          start: 800,
          end: 4500,
          density: 1.2,
          heightFalloff: 0.0008,
        },
        ground: {
          primary: colorFromRGB(50, 75, 120), // Deeper Bay Blue
          secondary: colorFromRGB(100, 110, 90), // Natural Land Green
          accent: colorFromRGB(170, 75, 55), // Bridge Orange
          paved: colorFromRGB(65, 70, 75),
          detailScale: 0.008,
          breakupScale: 0.002,
          stripScale: 0.008,
          patchScale: 0.018,
          pavementBias: 0.5,
          shoulderDepth: 0.15,
        },
        emissive: {
          color: colorFromRGB(255, 255, 255),
          strength: 0.1,
          threshold: 0.9,
          saturationBoost: 0.2,
        },
      };
    default:
      return {
        key: "airport-improved",
        sky: {
          mode: "clear",
          topColor: mixColor(fieldSky, colorFromRGB(106, 158, 212), 0.72),
          horizonColor: colorFromRGB(176, 204, 214),
          bottomColor: colorFromRGB(212, 206, 172),
          curve: 1.35,
          glow: 0.14,
        },
        cloud: {
          color: colorFromRGB(244, 240, 230),
          shadowColor: colorFromRGB(164, 176, 188),
          coverage: 0.4,
          softness: 0.28,
          scale: 0.0011,
          bandScale: 2.4,
          speed: 0.0011,
          density: 0.68,
          height: 0.32,
        },
        keyLight: {
          direction: normalizeDirection(0.36, 0.85, -0.26),
          color: colorFromRGB(255, 242, 220),
          intensity: 1.04,
          shadowStrength: 0.4,
        },
        hemisphere: {
          skyColor: colorFromRGB(136, 176, 214),
          groundColor: colorFromRGB(124, 112, 78),
          intensity: 0.66,
          balance: 0.62,
        },
        fog: {
          color: colorFromRGB(194, 204, 206),
          start: 2200,
          end: 8200,
          density: 0.74,
          heightFalloff: 0.0004,
        },
        ground: {
          primary: mixColor(fieldGround, colorFromRGB(102, 120, 74), 0.6),
          secondary: colorFromRGB(138, 130, 82),
          accent: colorFromRGB(104, 84, 56),
          paved: colorFromRGB(84, 88, 88),
          detailScale: 0.007,
          breakupScale: 0.0017,
          stripScale: 0.006,
          patchScale: 0.015,
          pavementBias: 0.48,
          shoulderDepth: 0.28,
        },
        emissive: {
          color: colorFromRGB(255, 226, 156),
          strength: 0.12,
          threshold: 0.84,
          saturationBoost: 0.1,
        },
      };
  }
}
