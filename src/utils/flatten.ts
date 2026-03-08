import { parseSVG, makeAbsolute } from "svg-path-parser";
import type { CommandMadeAbsolute } from "svg-path-parser";

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

/** Apply 2D affine transform to a point */
function tp(m: Matrix, x: number, y: number): [number, number] {
  return [
    round(m.a * x + m.c * y + m.e),
    round(m.b * x + m.d * y + m.f),
  ];
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Transform path d-attribute coordinates using matrix */
function transformPathData(d: string, m: Matrix): string {
  const cmds = makeAbsolute(parseSVG(d));
  const parts: string[] = [];

  for (const cmd of cmds) {
    switch (cmd.code) {
      case "M":
      case "L": {
        const [x, y] = tp(m, cmd.x, cmd.y);
        parts.push(`${cmd.code}${x} ${y}`);
        break;
      }
      case "H": {
        // After makeAbsolute, H has x,y — treat as L
        const [x, y] = tp(m, cmd.x, cmd.y);
        parts.push(`L${x} ${y}`);
        break;
      }
      case "V": {
        const [x, y] = tp(m, cmd.x, cmd.y);
        parts.push(`L${x} ${y}`);
        break;
      }
      case "C": {
        const [x1, y1] = tp(m, cmd.x1, cmd.y1);
        const [x2, y2] = tp(m, cmd.x2, cmd.y2);
        const [x, y] = tp(m, cmd.x, cmd.y);
        parts.push(`C${x1} ${y1} ${x2} ${y2} ${x} ${y}`);
        break;
      }
      case "S": {
        const [x2, y2] = tp(m, cmd.x2, cmd.y2);
        const [x, y] = tp(m, cmd.x, cmd.y);
        parts.push(`S${x2} ${y2} ${x} ${y}`);
        break;
      }
      case "Q": {
        const [x1, y1] = tp(m, cmd.x1, cmd.y1);
        const [x, y] = tp(m, cmd.x, cmd.y);
        parts.push(`Q${x1} ${y1} ${x} ${y}`);
        break;
      }
      case "T": {
        const [x, y] = tp(m, cmd.x, cmd.y);
        parts.push(`T${x} ${y}`);
        break;
      }
      case "A": {
        const ac = cmd as CommandMadeAbsolute & {
          rx: number; ry: number; xAxisRotation: number;
          largeArc: boolean; sweep: boolean;
        };
        // For arcs, transform endpoint + adjust radii/rotation for non-uniform scale
        const [x, y] = tp(m, ac.x, ac.y);
        const { rx, ry, xAxisRotation, largeArc, sweep } = transformArc(
          ac.rx, ac.ry, ac.xAxisRotation, ac.largeArc, ac.sweep, m,
        );
        parts.push(
          `A${round(rx)} ${round(ry)} ${round(xAxisRotation)} ${largeArc ? 1 : 0} ${sweep ? 1 : 0} ${x} ${y}`,
        );
        break;
      }
      case "Z": {
        parts.push("Z");
        break;
      }
    }
  }

  return parts.join(" ");
}

/** Approximate arc parameter transform for affine matrix */
function transformArc(
  rx: number, ry: number, rotation: number,
  largeArc: boolean, sweep: boolean, m: Matrix,
): { rx: number; ry: number; xAxisRotation: number; largeArc: boolean; sweep: boolean } {
  // Compute scale factors from the matrix
  const sx = Math.sqrt(m.a * m.a + m.b * m.b);
  const sy = Math.sqrt(m.c * m.c + m.d * m.d);
  // Determinant sign — if negative, the sweep direction flips
  const det = m.a * m.d - m.b * m.c;

  // Rotation induced by the matrix
  const matRotation = Math.atan2(m.b, m.a) * (180 / Math.PI);

  return {
    rx: round(rx * sx),
    ry: round(ry * sy),
    xAxisRotation: round(rotation + matRotation),
    largeArc,
    sweep: det < 0 ? !sweep : sweep,
  };
}

/** Convert basic shapes to <path> equivalent */
function shapeToPathD(el: SVGElement): string | null {
  const tag = el.tagName.toLowerCase();
  const attr = (name: string) => parseFloat(el.getAttribute(name) || "0");

  switch (tag) {
    case "rect": {
      const x = attr("x");
      const y = attr("y");
      const w = attr("width");
      const h = attr("height");
      const rx = Math.min(attr("rx") || attr("ry") || 0, w / 2);
      const ry = Math.min(attr("ry") || attr("rx") || 0, h / 2);
      if (rx === 0 && ry === 0) {
        return `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`;
      }
      // Rounded rect
      return [
        `M${x + rx} ${y}`,
        `L${x + w - rx} ${y}`,
        `A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}`,
        `L${x + w} ${y + h - ry}`,
        `A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}`,
        `L${x + rx} ${y + h}`,
        `A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}`,
        `L${x} ${y + ry}`,
        `A${rx} ${ry} 0 0 1 ${x + rx} ${y}`,
        "Z",
      ].join(" ");
    }
    case "circle": {
      const cx = attr("cx");
      const cy = attr("cy");
      const r = attr("r");
      return [
        `M${cx - r} ${cy}`,
        `A${r} ${r} 0 1 1 ${cx + r} ${cy}`,
        `A${r} ${r} 0 1 1 ${cx - r} ${cy}`,
        "Z",
      ].join(" ");
    }
    case "ellipse": {
      const cx = attr("cx");
      const cy = attr("cy");
      const rx = attr("rx");
      const ry = attr("ry");
      return [
        `M${cx - rx} ${cy}`,
        `A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}`,
        `A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}`,
        "Z",
      ].join(" ");
    }
    case "line": {
      const x1 = attr("x1");
      const y1 = attr("y1");
      const x2 = attr("x2");
      const y2 = attr("y2");
      return `M${x1} ${y1}L${x2} ${y2}`;
    }
    case "polyline":
    case "polygon": {
      const points = el.getAttribute("points")?.trim();
      if (!points) return null;
      const nums = points.split(/[\s,]+/).map(Number);
      if (nums.length < 4) return null;
      const segs = [`M${nums[0]} ${nums[1]}`];
      for (let i = 2; i < nums.length; i += 2) {
        segs.push(`L${nums[i]} ${nums[i + 1]}`);
      }
      if (tag === "polygon") segs.push("Z");
      return segs.join(" ");
    }
    default:
      return null;
  }
}

const SHAPE_TAGS = new Set(["rect", "circle", "ellipse", "line", "polyline", "polygon"]);

/** Copy presentational attributes from source to target */
function copyPresentationAttrs(src: SVGElement, dst: SVGElement) {
  const attrs = [
    "fill", "fill-opacity", "fill-rule",
    "stroke", "stroke-width", "stroke-opacity",
    "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset",
    "opacity", "clip-rule", "style", "class",
  ];
  for (const name of attrs) {
    const val = src.getAttribute(name);
    if (val !== null) dst.setAttribute(name, val);
  }
}

/**
 * Flatten all <g> groups in the SVG, baking transforms into path coordinates.
 * Non-path shapes are converted to <path> elements.
 */
export function flattenLayers(svgEl: SVGSVGElement): void {
  const svgCTM = svgEl.getCTM();
  if (!svgCTM) return;
  const rootInverse = svgCTM.inverse();

  // Detect evenodd from root style
  const rootStyle = svgEl.getAttribute("style") || "";
  const svgComputedStyle = getComputedStyle(svgEl);
  const hasEvenOdd =
    rootStyle.includes("evenodd") ||
    svgComputedStyle.fillRule === "evenodd";

  // Collect all leaf shape/path elements first (before mutating DOM)
  const selector = "path,rect,circle,ellipse,line,polyline,polygon";
  const allElements = Array.from(svgEl.querySelectorAll(selector)) as SVGGraphicsElement[];

  for (const el of allElements) {
    // Get cumulative transform
    let ctm: DOMMatrix | null = null;
    try {
      ctm = el.getCTM();
    } catch {
      continue;
    }
    if (!ctm) continue;

    const localToRoot = rootInverse.multiply(ctm);
    const m: Matrix = {
      a: localToRoot.a, b: localToRoot.b,
      c: localToRoot.c, d: localToRoot.d,
      e: localToRoot.e, f: localToRoot.f,
    };

    // Get path d-attribute
    let d: string | null = null;
    if (el.tagName.toLowerCase() === "path") {
      d = el.getAttribute("d");
    } else if (SHAPE_TAGS.has(el.tagName.toLowerCase())) {
      d = shapeToPathD(el as SVGElement);
    }

    if (!d) continue;

    // Transform path data
    const transformedD = transformPathData(d, m);

    // Create new <path> element (or reuse if already a path)
    const newPath = svgEl.ownerDocument.createElementNS(
      "http://www.w3.org/2000/svg", "path",
    );
    newPath.setAttribute("d", transformedD);
    copyPresentationAttrs(el as SVGElement, newPath);
    newPath.removeAttribute("transform");

    // Bake fill-rule if evenodd at root
    if (hasEvenOdd) {
      newPath.style.fillRule = "evenodd";
      newPath.style.clipRule = "evenodd";
    }

    // Append to SVG root
    svgEl.appendChild(newPath);
  }

  // Remove original elements and all groups
  for (const el of allElements) {
    el.remove();
  }
  const groups = svgEl.querySelectorAll("g");
  for (const g of groups) {
    g.remove();
  }

  // Also remove <defs> with empty content, <use> etc if any remain
  const uses = svgEl.querySelectorAll("use");
  for (const u of uses) {
    u.remove();
  }
}
