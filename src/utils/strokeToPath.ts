/**
 * Outline all stroked paths in the SVG by sampling the path centerline
 * and generating offset outline paths using browser SVG APIs.
 */
export async function outlineStrokes(svgEl: SVGSVGElement): Promise<void> {
  const viewBox = svgEl.getAttribute("viewBox");

  const selector = "path,rect,circle,ellipse,line,polyline,polygon";
  const elements = Array.from(svgEl.querySelectorAll(selector)) as SVGElement[];

  const stroked = elements.filter((el) => {
    const stroke = el.getAttribute("stroke") || el.style.stroke || "";
    const sw = parseFloat(el.getAttribute("stroke-width") || el.style.strokeWidth || "0");
    return stroke && stroke !== "none" && sw > 0;
  });

  if (stroked.length === 0) return;

  for (const el of stroked) {
    try {
      outlineElement(el, svgEl);
    } catch (err) {
      console.warn("Failed to outline stroke:", err);
      fallbackConvert(el);
    }
  }

  if (viewBox) svgEl.setAttribute("viewBox", viewBox);
}

type Pt = { x: number; y: number };

/**
 * Convert a single stroked element to filled outline path(s).
 */
function outlineElement(el: SVGElement, svgRoot: SVGSVGElement): void {
  const strokeColor = el.getAttribute("stroke") || el.style.stroke || "#000";
  const strokeWidth = parseFloat(
    el.getAttribute("stroke-width") || el.style.strokeWidth || "1",
  );
  const fillVal = el.getAttribute("fill") || el.style.fill || "";
  const hasFill = fillVal && fillVal !== "none" && fillVal !== "transparent";
  const cap = el.getAttribute("stroke-linecap") || "butt";
  const dashArray = el.getAttribute("stroke-dasharray") || "";
  const dashOffset = parseFloat(el.getAttribute("stroke-dashoffset") || "0");

  // Prepare a <path> in the DOM for length/point queries
  const { pathEl, tempPath } = ensurePathEl(el, svgRoot);

  const totalLength = pathEl.getTotalLength();
  if (totalLength === 0) {
    if (tempPath) pathEl.remove();
    fallbackConvert(el);
    return;
  }

  const halfW = strokeWidth / 2;

  // Collect transform from original element
  const transform = el.getAttribute("transform") || (tempPath ? null : null);

  // Parse dash pattern
  const dashes = parseDashArray(dashArray);
  const isDashed = dashes.length > 0;

  // Get visible segments (dash intervals or entire path)
  const segments = isDashed
    ? getDashSegments(totalLength, dashes, dashOffset)
    : [{ start: 0, end: totalLength }];

  // Detect if the overall path is closed (only matters for non-dashed)
  const dAttr = pathEl.getAttribute("d") || "";
  const isClosed = !isDashed && /[Zz]\s*$/.test(dAttr.trim());

  // Generate outline for each segment
  const outlineParts: string[] = [];
  for (const seg of segments) {
    const { left, right } = sampleSegment(pathEl, seg.start, seg.end, halfW);
    if (left.length < 2) continue;

    if (isClosed) {
      outlineParts.push(buildClosedOutline(left, right));
    } else {
      outlineParts.push(buildOpenOutline(left, right, cap, halfW, pathEl, seg.start, seg.end));
    }
  }

  if (outlineParts.length === 0) {
    if (tempPath) pathEl.remove();
    fallbackConvert(el);
    return;
  }

  // Create outline path element
  const outlineD = outlineParts.join(" ");
  const outlinePath = svgRoot.ownerDocument.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  outlinePath.setAttribute("d", outlineD);
  outlinePath.setAttribute("fill", strokeColor);

  const opacity = el.getAttribute("opacity");
  if (opacity) outlinePath.setAttribute("opacity", opacity);
  const strokeOpacity = el.getAttribute("stroke-opacity");
  if (strokeOpacity) outlinePath.setAttribute("fill-opacity", strokeOpacity);

  if (!tempPath && transform) {
    outlinePath.setAttribute("transform", transform);
  }

  el.parentNode?.insertBefore(outlinePath, el.nextSibling);
  if (tempPath) pathEl.remove();

  if (hasFill) {
    removeStrokeAttrs(el);
  } else {
    el.remove();
  }
}

// ─── Dash pattern handling ───────────────────────────────────────────

function parseDashArray(raw: string): number[] {
  if (!raw || raw === "none") return [];
  const vals = raw.split(/[\s,]+/).map(Number).filter((n) => !isNaN(n) && n >= 0);
  if (vals.length === 0) return [];
  // SVG spec: if odd number, repeat to make even
  if (vals.length % 2 !== 0) return [...vals, ...vals];
  return vals;
}

/** Return visible (drawn) segments along the path based on dash pattern. */
function getDashSegments(
  totalLength: number,
  dashes: number[],
  offset: number,
): { start: number; end: number }[] {
  const segments: { start: number; end: number }[] = [];
  let pos = -offset;
  let dashIndex = 0;
  let drawing = true; // dashes alternate: draw, gap, draw, gap, ...

  // Advance past negative offset
  while (pos < 0) {
    const dashLen = dashes[dashIndex % dashes.length];
    if (pos + dashLen > 0) break;
    pos += dashLen;
    drawing = !drawing;
    dashIndex++;
  }

  const maxIter = Math.ceil(totalLength / Math.max(...dashes)) * dashes.length + dashes.length;
  let iter = 0;
  while (pos < totalLength && iter < maxIter) {
    const dashLen = dashes[dashIndex % dashes.length];
    const segStart = Math.max(0, pos);
    const segEnd = Math.min(totalLength, pos + dashLen);

    if (drawing && segEnd > segStart) {
      segments.push({ start: segStart, end: segEnd });
    }

    pos += dashLen;
    drawing = !drawing;
    dashIndex++;
    iter++;
  }

  return segments;
}

// ─── Path sampling ───────────────────────────────────────────────────

function sampleSegment(
  pathEl: SVGPathElement,
  startLen: number,
  endLen: number,
  halfW: number,
): { left: Pt[]; right: Pt[] } {
  const segLength = endLen - startLen;
  const step = Math.max(0.5, Math.min(halfW / 2, 2));
  const numSamples = Math.max(Math.ceil(segLength / step), 2);

  const left: Pt[] = [];
  const right: Pt[] = [];

  const total = pathEl.getTotalLength();

  for (let i = 0; i <= numSamples; i++) {
    const len = startLen + (i / numSamples) * segLength;
    const pt = pathEl.getPointAtLength(len);

    // Use forward-only or backward-only difference at endpoints
    // to avoid clamped getPointAtLength returning the same point
    const eps = Math.min(1, segLength / 4);
    let p0: DOMPoint, p1: DOMPoint;
    if (len <= startLen + eps) {
      // Near start: forward difference
      p0 = pt;
      p1 = pathEl.getPointAtLength(Math.min(total, len + eps));
    } else if (len >= endLen - eps) {
      // Near end: backward difference
      p0 = pathEl.getPointAtLength(Math.max(0, len - eps));
      p1 = pt;
    } else {
      // Interior: central difference
      p0 = pathEl.getPointAtLength(len - eps);
      p1 = pathEl.getPointAtLength(len + eps);
    }

    let tx = p1.x - p0.x;
    let ty = p1.y - p0.y;
    const tLen = Math.sqrt(tx * tx + ty * ty);
    if (tLen === 0) continue;
    tx /= tLen;
    ty /= tLen;

    const nx = -ty;
    const ny = tx;

    left.push({ x: pt.x + nx * halfW, y: pt.y + ny * halfW });
    right.push({ x: pt.x - nx * halfW, y: pt.y - ny * halfW });
  }

  return { left, right };
}

// ─── Outline builders ────────────────────────────────────────────────

function buildClosedOutline(left: Pt[], right: Pt[]): string {
  const parts: string[] = [];
  parts.push(`M${r(left[0].x)} ${r(left[0].y)}`);
  for (let i = 1; i < left.length; i++) {
    parts.push(`L${r(left[i].x)} ${r(left[i].y)}`);
  }
  parts.push("Z");
  parts.push(`M${r(right[0].x)} ${r(right[0].y)}`);
  for (let i = right.length - 1; i >= 0; i--) {
    parts.push(`L${r(right[i].x)} ${r(right[i].y)}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/** Compute tangent at a given length along the path */
function tangentAt(pathEl: SVGPathElement, len: number): Pt {
  const total = pathEl.getTotalLength();
  const eps = Math.min(1, total / 10);
  let p0: DOMPoint, p1: DOMPoint;
  if (len < eps) {
    p0 = pathEl.getPointAtLength(0);
    p1 = pathEl.getPointAtLength(eps);
  } else if (len > total - eps) {
    p0 = pathEl.getPointAtLength(total - eps);
    p1 = pathEl.getPointAtLength(total);
  } else {
    p0 = pathEl.getPointAtLength(len - eps / 2);
    p1 = pathEl.getPointAtLength(len + eps / 2);
  }
  let tx = p1.x - p0.x;
  let ty = p1.y - p0.y;
  const tl = Math.sqrt(tx * tx + ty * ty) || 1;
  return { x: tx / tl, y: ty / tl };
}

function buildOpenOutline(
  left: Pt[],
  right: Pt[],
  cap: string,
  halfW: number,
  pathEl: SVGPathElement,
  startLen: number,
  endLen: number,
): string {
  const parts: string[] = [];

  // Compute exact cap endpoints from path geometry (not from sampled points)
  const endPt = pathEl.getPointAtLength(endLen);
  const endTan = tangentAt(pathEl, endLen);
  const endNx = -endTan.y, endNy = endTan.x;
  const endLeft: Pt = { x: endPt.x + endNx * halfW, y: endPt.y + endNy * halfW };
  const endRight: Pt = { x: endPt.x - endNx * halfW, y: endPt.y - endNy * halfW };

  const startPt = pathEl.getPointAtLength(startLen);
  const startTan = tangentAt(pathEl, startLen);
  const startNx = -startTan.y, startNy = startTan.x;
  const startLeft: Pt = { x: startPt.x + startNx * halfW, y: startPt.y + startNy * halfW };
  const startRight: Pt = { x: startPt.x - startNx * halfW, y: startPt.y - startNy * halfW };

  // Forward along left side: start from exact start-left, through sampled points, to exact end-left
  parts.push(`M${r(startLeft.x)} ${r(startLeft.y)}`);
  for (let i = 1; i < left.length - 1; i++) {
    parts.push(`L${r(left[i].x)} ${r(left[i].y)}`);
  }
  parts.push(`L${r(endLeft.x)} ${r(endLeft.y)}`);

  // End cap — sweep direction 0 (counter-clockwise) because left/right sides
  // are defined by normal=(−ty, tx) which puts "left" on the positive-normal side.
  // The outline goes: left side forward → end cap → right side backward.
  // At the end: left is at +normal, right is at −normal.
  // CCW arc from +normal to −normal bulges outward (away from path center).
  if (cap === "round") {
    parts.push(`A${r(halfW)} ${r(halfW)} 0 0 0 ${r(endRight.x)} ${r(endRight.y)}`);
  } else if (cap === "square") {
    parts.push(`L${r(endLeft.x + endTan.x * halfW)} ${r(endLeft.y + endTan.y * halfW)}`);
    parts.push(`L${r(endRight.x + endTan.x * halfW)} ${r(endRight.y + endTan.y * halfW)}`);
    parts.push(`L${r(endRight.x)} ${r(endRight.y)}`);
  }

  // Backward along right side: from exact end-right, through sampled points reversed, to exact start-right
  for (let i = right.length - 2; i >= 1; i--) {
    parts.push(`L${r(right[i].x)} ${r(right[i].y)}`);
  }
  parts.push(`L${r(startRight.x)} ${r(startRight.y)}`);

  // Start cap — same CCW logic
  if (cap === "round") {
    parts.push(`A${r(halfW)} ${r(halfW)} 0 0 0 ${r(startLeft.x)} ${r(startLeft.y)}`);
  } else if (cap === "square") {
    parts.push(`L${r(startRight.x - startTan.x * halfW)} ${r(startRight.y - startTan.y * halfW)}`);
    parts.push(`L${r(startLeft.x - startTan.x * halfW)} ${r(startLeft.y - startTan.y * halfW)}`);
    parts.push(`L${r(startLeft.x)} ${r(startLeft.y)}`);
  }

  parts.push("Z");
  return parts.join(" ");
}

// ─── Helpers ─────────────────────────────────────────────────────────

function r(v: number): number {
  return Math.round(v * 100) / 100;
}

function ensurePathEl(
  el: SVGElement,
  svgRoot: SVGSVGElement,
): { pathEl: SVGPathElement; tempPath: boolean } {
  if (el instanceof SVGPathElement) {
    return { pathEl: el, tempPath: false };
  }
  const d = shapeToD(el);
  if (!d) throw new Error("Cannot convert shape to path");
  const pathEl = svgRoot.ownerDocument.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  pathEl.setAttribute("d", d);
  const t = el.getAttribute("transform");
  if (t) pathEl.setAttribute("transform", t);
  svgRoot.appendChild(pathEl);
  return { pathEl, tempPath: true };
}

function shapeToD(el: SVGElement): string | null {
  const tag = el.tagName.toLowerCase();
  const a = (name: string) => parseFloat(el.getAttribute(name) || "0");

  switch (tag) {
    case "rect": {
      const x = a("x"), y = a("y"), w = a("width"), h = a("height");
      return `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`;
    }
    case "circle": {
      const cx = a("cx"), cy = a("cy"), cr = a("r");
      return `M${cx - cr} ${cy}A${cr} ${cr} 0 1 1 ${cx + cr} ${cy}A${cr} ${cr} 0 1 1 ${cx - cr} ${cy}Z`;
    }
    case "ellipse": {
      const cx = a("cx"), cy = a("cy"), rx = a("rx"), ry = a("ry");
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}Z`;
    }
    case "line":
      return `M${a("x1")} ${a("y1")}L${a("x2")} ${a("y2")}`;
    case "polyline":
    case "polygon": {
      const pts = el.getAttribute("points")?.trim();
      if (!pts) return null;
      const nums = pts.split(/[\s,]+/).map(Number);
      if (nums.length < 4) return null;
      const segs = [`M${nums[0]} ${nums[1]}`];
      for (let i = 2; i < nums.length; i += 2) segs.push(`L${nums[i]} ${nums[i + 1]}`);
      if (tag === "polygon") segs.push("Z");
      return segs.join(" ");
    }
    default:
      return null;
  }
}

function removeStrokeAttrs(el: SVGElement): void {
  for (const attr of [
    "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
    "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit", "stroke-opacity",
  ]) {
    el.removeAttribute(attr);
  }
  el.style.stroke = "";
  el.style.strokeWidth = "";
}

function fallbackConvert(el: SVGElement): void {
  const strokeColor = el.getAttribute("stroke") || el.style.stroke;
  const fillVal = el.getAttribute("fill") || el.style.fill || "";
  const hasFill = fillVal && fillVal !== "none" && fillVal !== "transparent";
  if (!hasFill && strokeColor) {
    el.setAttribute("fill", strokeColor);
  }
  removeStrokeAttrs(el);
}
