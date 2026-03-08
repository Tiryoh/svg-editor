import { useEffect, useState } from "react";
import { parseColor, rgbToCmyk, type RGB, type CMYK } from "../utils/colorUtils";

export type ColorInfo = {
  hex: string;
  rgb: RGB;
  cmyk: CMYK;
  count: number;
  elements: SVGElement[];
};

export type InspectResult = {
  width: number;
  height: number;
  widthMm: number;
  heightMm: number;
  viewBox: string;
  totalPaths: number;
  colors: ColorInfo[];
  smallPathCount: number;
  strokeCount: number;
};

const SHAPE_SELECTOR =
  "path,rect,circle,ellipse,line,polyline,polygon";

const PX_TO_MM = 0.2646;

function collectColors(svgEl: SVGSVGElement): ColorInfo[] {
  const colorMap = new Map<string, { rgb: RGB; elements: SVGElement[] }>();
  const elements = svgEl.querySelectorAll(SHAPE_SELECTOR);

  for (const el of elements) {
    const attrs: string[] = [];

    // Check fill
    const fill =
      (el as SVGElement).getAttribute("fill") ||
      (el as HTMLElement).style?.fill ||
      "";
    if (fill) attrs.push(fill);

    // Check stroke
    const stroke =
      (el as SVGElement).getAttribute("stroke") ||
      (el as HTMLElement).style?.stroke ||
      "";
    if (stroke) attrs.push(stroke);

    // If no explicit fill/stroke, try computed style
    if (attrs.length === 0) {
      try {
        const computed = getComputedStyle(el as Element);
        if (computed.fill) attrs.push(computed.fill);
        if (computed.stroke && computed.stroke !== "none")
          attrs.push(computed.stroke);
      } catch {
        // not in DOM
      }
    }

    for (const raw of attrs) {
      const parsed = parseColor(raw);
      if (!parsed) continue;
      const key = parsed.hex;
      if (!colorMap.has(key)) {
        colorMap.set(key, { rgb: parsed.rgb, elements: [] });
      }
      colorMap.get(key)!.elements.push(el as SVGElement);
    }
  }

  return Array.from(colorMap.entries()).map(([hex, { rgb, elements }]) => ({
    hex,
    rgb,
    cmyk: rgbToCmyk(rgb.r, rgb.g, rgb.b),
    count: elements.length,
    elements,
  }));
}

function countStrokes(svgEl: SVGSVGElement): number {
  const elements = svgEl.querySelectorAll(SHAPE_SELECTOR);
  let count = 0;
  for (const el of elements) {
    const stroke =
      (el as SVGElement).getAttribute("stroke") ||
      (el as HTMLElement).style?.stroke ||
      "";
    if (stroke && stroke !== "none" && stroke !== "transparent") {
      count++;
    }
  }
  return count;
}

export function useInspect(
  svgElRef: React.RefObject<SVGSVGElement | null>,
  revision: number,
  originalSize: { width: number; height: number; viewBox: string } | null,
): InspectResult | null {
  const [result, setResult] = useState<InspectResult | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const svg = svgElRef.current;
      if (!svg) {
        setResult(null);
        return;
      }

      // Use original dimensions (before we removed width/height for CSS fitting)
      const vb = originalSize?.viewBox || svg.getAttribute("viewBox") || "";
      let w = originalSize?.width || 0;
      let h = originalSize?.height || 0;

      // Fallback: parse from viewBox
      if ((!w || !h) && vb) {
        const parts = vb.split(/[\s,]+/).map(Number);
        if (parts.length === 4) {
          w = w || parts[2];
          h = h || parts[3];
        }
      }

      const totalPaths = svg.querySelectorAll(SHAPE_SELECTOR).length;
      const colors = collectColors(svg);
      const strokeCount = countStrokes(svg);

      setResult({
        width: w,
        height: h,
        widthMm: Math.round(w * PX_TO_MM * 10) / 10,
        heightMm: Math.round(h * PX_TO_MM * 10) / 10,
        viewBox: vb,
        totalPaths,
        colors,
        smallPathCount: 0,
        strokeCount,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [svgElRef, revision, originalSize]);

  return result;
}
