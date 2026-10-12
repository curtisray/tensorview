// Color maps for tensor value visualization

// Helper to convert hex to RGB object {r, g, b} normalized [0, 1]
export function hexToRgb(hex) {
  const bigint = parseInt(hex.replace('#', ''), 16);
  return {
    r: ((bigint >> 16) & 255) / 255,
    g: ((bigint >> 8) & 255) / 255,
    b: (bigint & 255) / 255,
  };
}

export function rgbToHex(r, g, b) {
  const toHex = (c) => {
    const hex = Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function interpolateStops(stops, t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    if (t >= s1.pos && t <= s2.pos) {
      const f = (t - s1.pos) / (s2.pos - s1.pos);
      return {
        r: s1.r + f * (s2.r - s1.r),
        g: s1.g + f * (s2.g - s1.g),
        b: s1.b + f * (s2.b - s1.b),
      };
    }
  }
  return stops[stops.length - 1];
}

export const COLORMAPS = {
  viridis: {
    name: 'Viridis (Scientific)',
    stops: [
      { pos: 0.0, r: 0.267, g: 0.004, b: 0.329 }, // #440154
      { pos: 0.25, r: 0.231, g: 0.322, b: 0.545 }, // #3b528b
      { pos: 0.5, r: 0.129, g: 0.569, b: 0.553 }, // #21918c
      { pos: 0.75, r: 0.369, g: 0.788, b: 0.384 }, // #5ec962
      { pos: 1.0, r: 0.992, g: 0.906, b: 0.145 }, // #fde725
    ],
  },
  plasma: {
    name: 'Plasma (Neon)',
    stops: [
      { pos: 0.0, r: 0.051, g: 0.031, b: 0.529 }, // #0d0887
      { pos: 0.25, r: 0.494, g: 0.012, b: 0.659 }, // #7e03a8
      { pos: 0.5, r: 0.796, g: 0.278, b: 0.471 }, // #cb4677
      { pos: 0.75, r: 0.965, g: 0.584, b: 0.275 }, // #f69446
      { pos: 1.0, r: 0.941, g: 0.976, b: 0.129 }, // #f0f921
    ],
  },
  coolwarm: {
    name: 'Coolwarm (Diverging)',
    stops: [
      { pos: 0.0, r: 0.231, g: 0.298, b: 0.753 }, // #3b4cc0
      { pos: 0.5, r: 0.867, g: 0.867, b: 0.867 }, // #dddddd
      { pos: 1.0, r: 0.706, g: 0.016, b: 0.149 }, // #b40426
    ],
  },
  cyberpunk: {
    name: 'Cyberpunk (Glow)',
    stops: [
      { pos: 0.0, r: 0.063, g: 0.094, b: 0.243 }, // #10183e
      { pos: 0.3, r: 0.0, g: 0.85, b: 0.95 }, // Cyan
      { pos: 0.7, r: 0.95, g: 0.1, b: 0.65 }, // Neon Pink
      { pos: 1.0, r: 1.0, g: 0.9, b: 0.2 }, // Electric Yellow
    ],
  },
  emerald: {
    name: 'Emerald Matrix',
    stops: [
      { pos: 0.0, r: 0.02, g: 0.1, b: 0.06 },
      { pos: 0.4, r: 0.06, g: 0.45, b: 0.28 },
      { pos: 0.8, r: 0.2, g: 0.85, b: 0.45 },
      { pos: 1.0, r: 0.7, g: 1.0, b: 0.75 },
    ],
  },
};

/**
 * Get color for normalized value [0, 1]
 */
export function getColorForNorm(val, colormapKey = 'plasma') {
  const cmap = COLORMAPS[colormapKey] || COLORMAPS.plasma;
  return interpolateStops(cmap.stops, val);
}

/**
 * Get Hex string for normalized value [0, 1]
 */
export function getHexColor(val, colormapKey = 'plasma') {
  const rgb = getColorForNorm(val, colormapKey);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/**
 * Given value and min/max range, returns normalized [0, 1]
 */
export function normalizeValue(val, min = -1, max = 1) {
  if (Math.abs(max - min) < 1e-6) return 0.5;
  return Math.max(0, Math.min(1, (val - min) / (max - min)));
}
