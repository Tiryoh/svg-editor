export type RGB = { r: number; g: number; b: number };
export type CMYK = { c: number; m: number; y: number; k: number };

export function hexToRgb(hex: string): RGB | null {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")
  ).toUpperCase();
}

export function rgbToCmyk(r: number, g: number, b: number): CMYK {
  const rp = r / 255;
  const gp = g / 255;
  const bp = b / 255;
  const k = 1 - Math.max(rp, gp, bp);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round(((1 - rp - k) / (1 - k)) * 100),
    m: Math.round(((1 - gp - k) / (1 - k)) * 100),
    y: Math.round(((1 - bp - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  };
}

/**
 * CSS color string (hex, rgb(), named) を正規化して HEX + RGB を返す。
 * none / transparent は null。
 */
export function parseColor(value: string): { hex: string; rgb: RGB } | null {
  const v = value.trim().toLowerCase();
  if (!v || v === "none" || v === "transparent") return null;

  // hex
  if (v.startsWith("#")) {
    let hex = v;
    if (hex.length === 4) {
      hex = "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    const rgb = hexToRgb(hex);
    if (rgb) return { hex: hex.toUpperCase(), rgb };
  }

  // rgb(r, g, b)
  const rgbMatch = v.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    return { hex: rgbToHex(r, g, b), rgb: { r, g, b } };
  }

  // Use a temporary element to resolve named colors and other formats
  const tmp = document.createElement("div");
  tmp.style.color = v;
  document.body.appendChild(tmp);
  const computed = getComputedStyle(tmp).color;
  document.body.removeChild(tmp);

  if (computed) {
    const m = computed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
    if (m) {
      const r = parseInt(m[1]);
      const g = parseInt(m[2]);
      const b = parseInt(m[3]);
      return { hex: rgbToHex(r, g, b), rgb: { r, g, b } };
    }
  }

  return null;
}
