const SHAPE_TAGS = [
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
];

export function detectSmallPaths(
  svgEl: SVGSVGElement,
  threshold: number,
): SVGGraphicsElement[] {
  const results: SVGGraphicsElement[] = [];
  const selector = SHAPE_TAGS.join(",");
  const elements = svgEl.querySelectorAll(selector);

  for (const el of elements) {
    const gEl = el as SVGGraphicsElement;
    try {
      const bbox = gEl.getBBox();
      if (bbox.width <= threshold && bbox.height <= threshold) {
        results.push(gEl);
      }
    } catch {
      // getBBox can throw for elements not in the DOM
    }
  }

  return results;
}
