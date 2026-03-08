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

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20;
const ZOOM_STEP = 0.1;

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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lassoRef = useRef<SVGPolylineElement | null>(null);
  const [lassoPoints, setLassoPoints] = useState<string>("");
  const [isDrawing, setIsDrawing] = useState(false);
  const pointsRef = useRef<{ x: number; y: number }[]>([]);

  // Zoom & pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });
  const spaceDownRef = useRef(false);

  // Reset zoom/pan when SVG changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [revision]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Wheel zoom (pinch on trackpad)
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handler = (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey) {
        // Pinch-to-zoom on trackpad (or Ctrl+wheel on mouse)
        const delta = -e.deltaY * 0.01;
        setZoom((prev) => {
          const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * (1 + delta)));
          const rect = wrapper.getBoundingClientRect();
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          const scale = next / prev;
          setPan((p) => ({
            x: cx - scale * (cx - p.x),
            y: cy - scale * (cy - p.y),
          }));
          return next;
        });
      } else {
        // Two-finger scroll on trackpad / regular wheel = pan
        setPan((p) => ({
          x: p.x - e.deltaX,
          y: p.y - e.deltaY,
        }));
      }
    };

    wrapper.addEventListener("wheel", handler, { passive: false });
    return () => wrapper.removeEventListener("wheel", handler);
  }, []);

  // Space key for pan mode
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        spaceDownRef.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDownRef.current = false;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isPanningRef.current) return;
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

  // Store pan in a ref so event listeners always see the latest value
  const panRef = useRef(pan);
  panRef.current = pan;

  // Pan via middle-button or space+left on the wrapper (outer div)
  const handleWrapperMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && spaceDownRef.current)) {
        e.preventDefault();
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY };
        panOriginRef.current = { ...panRef.current };
      }
    },
    [],
  );

  // Attach mousemove/mouseup for panning on window so dragging outside works
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({
        x: panOriginRef.current.x + dx,
        y: panOriginRef.current.y + dy,
      });
    };
    const handleWindowMouseUp = () => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
      }
    };
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, []);

  // Lasso handlers on the inner container
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Skip if panning
      if (isPanningRef.current || spaceDownRef.current || e.button === 1) return;
      if (mode !== "lasso" || e.button !== 0) return;
      setIsDrawing(true);
      pointsRef.current = [
        { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY },
      ];
      setLassoPoints(
        `${e.nativeEvent.offsetX},${e.nativeEvent.offsetY}`,
      );
    },
    [mode],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanningRef.current) return;
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
    if (isPanningRef.current) return;

    if (!isDrawing) return;
    setIsDrawing(false);

    const svg = svgElRef.current;
    if (!svg || pointsRef.current.length < 3) {
      setLassoPoints("");
      return;
    }

    const pts = pointsRef.current;
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));

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

      if (
        relRight >= minX &&
        relX <= maxX &&
        relBottom >= minY &&
        relY <= maxY
      ) {
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
    svg.style.display = "block";
    svg.style.width = "auto";
    svg.style.height = "auto";
    svg.style.maxWidth = "100%";
    svg.style.maxHeight = "100%";
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }, [svgElRef, revision]);

  const zoomPercent = Math.round(zoom * 100);
  const cursorStyle = spaceDownRef.current || isPanningRef.current
    ? "grab"
    : mode === "lasso"
      ? "crosshair"
      : "default";

  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-full bg-white rounded-lg overflow-hidden"
      style={{ cursor: cursorStyle }}
      onMouseDown={handleWrapperMouseDown}
    >
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
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "center center",
        }}
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
      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white/90 border border-gray-200 rounded px-1.5 py-1 text-[11px] text-gray-600 shadow-sm">
        <button
          onClick={() =>
            setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))
          }
          className="px-1 hover:text-gray-900"
          title="ズームアウト"
        >
          -
        </button>
        <button
          onClick={resetView}
          className="px-1 min-w-[3.5em] text-center hover:text-gray-900"
          title="フィットに戻す"
        >
          {zoomPercent}%
        </button>
        <button
          onClick={() =>
            setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))
          }
          className="px-1 hover:text-gray-900"
          title="ズームイン"
        >
          +
        </button>
      </div>
    </div>
  );
}
