import { useCallback, useState } from "react";

export type SelectionMode = "click" | "lasso";

const HIGHLIGHT_ATTR = "data-svg-editor-selected";

function addHighlight(el: SVGElement) {
  el.setAttribute(HIGHLIGHT_ATTR, "true");
  el.style.outline = "2px solid #3b82f6";
  el.style.outlineOffset = "1px";
}

function removeHighlight(el: SVGElement) {
  el.removeAttribute(HIGHLIGHT_ATTR);
  el.style.outline = "";
  el.style.outlineOffset = "";
}

export function useSelection(
  svgElRef: React.RefObject<SVGSVGElement | null>,
) {
  const [selected, setSelected] = useState<Set<SVGElement>>(new Set());
  const [mode, setMode] = useState<SelectionMode>("click");

  const clearSelection = useCallback(() => {
    setSelected((prev) => {
      for (const el of prev) removeHighlight(el);
      return new Set();
    });
  }, []);

  const select = useCallback(
    (el: SVGElement, additive: boolean) => {
      setSelected((prev) => {
        const next = new Set(additive ? prev : []);
        if (!additive) {
          for (const p of prev) removeHighlight(p);
        }
        if (next.has(el)) {
          next.delete(el);
          removeHighlight(el);
        } else {
          next.add(el);
          addHighlight(el);
        }
        return next;
      });
    },
    [],
  );

  const selectAll = useCallback(
    (elements: SVGElement[]) => {
      setSelected((prev) => {
        for (const el of prev) removeHighlight(el);
        const next = new Set(elements);
        for (const el of next) addHighlight(el);
        return next;
      });
    },
    [],
  );

  const selectSameFill = useCallback(() => {
    const svg = svgElRef.current;
    if (!svg) return;

    setSelected((prev) => {
      const fills = new Set<string>();
      for (const el of prev) {
        const fill = el.getAttribute("fill") || "";
        if (fill && fill !== "none") fills.add(fill.toLowerCase());
      }

      const selector = "path,rect,circle,ellipse,line,polyline,polygon";
      const allEls = svg.querySelectorAll(selector);
      const next = new Set<SVGElement>(prev);

      for (const el of allEls) {
        const fill = (el.getAttribute("fill") || "").toLowerCase();
        if (fills.has(fill)) {
          next.add(el as SVGElement);
          addHighlight(el as SVGElement);
        }
      }

      return next;
    });
  }, [svgElRef]);

  return {
    selected,
    mode,
    setMode,
    select,
    selectAll,
    selectSameFill,
    clearSelection,
  };
}
