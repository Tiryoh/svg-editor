import { useCallback, useEffect, useRef, useState } from "react";
import type { SelectionMode } from "../hooks/useSelection";

const SHAPE_TAGS = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
]);

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  svgElRef: React.RefObject<SVGSVGElement | null>;
  revision: number;
  mode: SelectionMode;
  onClickElement: (el: SVGElement, additive: boolean) => void;
  onLassoSelect: (elements: SVGElement[]) => void;
  onClearSelection: () => void;
};

function findShapeAncestor(el: Element): SVGElement | null {
  let cur: Element | null = el;
  while (cur) {
    if (SHAPE_TAGS.has(cur.tagName.toLowerCase())) {
      return cur as SVGElement;
    }
    cur = cur.parentElement;
  }
  return null;
}

export function Preview({
  containerRef,
  svgElRef,
  revision,
  mode,
  onClickElement,
  onLassoSelect,
  onClearSelection,
}: Props) {
  const lassoRef = useRef<SVGPolylineElement | null>(null);
  const [lassoPoints, setLassoPoints] = useState<string>("");
  const [isDrawing, setIsDrawing] = useState(false);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (mode !== "click") return;
      const target = e.target as Element;
      const shape = findShapeAncestor(target);
      if (shape) {
        onClickElement(shape, e.shiftKey);
      } else {
        onClearSelection();
      }
    },
    [mode, onClickElement, onClearSelection],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (mode !== "lasso") return;
      setIsDrawing(true);
      pointsRef.current = [{ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }];
      setLassoPoints(
        `${e.nativeEvent.offsetX},${e.nativeEvent.offsetY}`,
      );
    },
    [mode],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing) return;
      pointsRef.current.push({
        x: e.nativeEvent.offsetX,
        y: e.nativeEvent.offsetY,
      });
      setLassoPoints(
        pointsRef.current.map((p) => `${p.x},${p.y}`).join(" "),
      );
    },
    [isDrawing],
  );

  const handleMouseUp = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const svg = svgElRef.current;
    if (!svg || pointsRef.current.length < 3) {
      setLassoPoints("");
      return;
    }

    // Compute bounding box of lasso
    const pts = pointsRef.current;
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));

    // Find elements within lasso bounding box
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();

    const selector = Array.from(SHAPE_TAGS).join(",");
    const elements = svg.querySelectorAll(selector);
    const selected: SVGElement[] = [];

    for (const el of elements) {
      const elRect = (el as SVGElement).getBoundingClientRect();
      const relX = elRect.left - containerRect.left;
      const relY = elRect.top - containerRect.top;
      const relRight = relX + elRect.width;
      const relBottom = relY + elRect.height;

      // Check overlap with lasso bbox
      if (relRight >= minX && relX <= maxX && relBottom >= minY && relY <= maxY) {
        selected.push(el as SVGElement);
      }
    }

    onLassoSelect(selected);
    setLassoPoints("");
    pointsRef.current = [];
  }, [isDrawing, svgElRef, containerRef, onLassoSelect]);

  // Fit SVG to container whenever SVG changes
  useEffect(() => {
    const svg = svgElRef.current;
    if (!svg) return;
    // Let the SVG's intrinsic aspect ratio determine size,
    // constrained to not exceed the container in either dimension
    svg.style.display = "block";
    svg.style.width = "auto";
    svg.style.height = "auto";
    svg.style.maxWidth = "100%";
    svg.style.maxHeight = "100%";
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }, [svgElRef, revision]);

  return (
    <div className="relative w-full h-full bg-white rounded-lg overflow-hidden">
      {/* Checkerboard background for transparency */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)",
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
        }}
      />
      <div
        ref={containerRef}
        className="relative w-full h-full flex items-center justify-center p-4"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
      {/* Lasso overlay */}
      {lassoPoints && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          <polyline
            ref={lassoRef}
            points={lassoPoints}
            fill="rgba(59, 130, 246, 0.1)"
            stroke="#3b82f6"
            strokeWidth="1"
            strokeDasharray="4"
          />
        </svg>
      )}
    </div>
  );
}
