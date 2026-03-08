import { useCallback, useEffect, useRef, useState } from "react";
import { DropZone } from "./components/DropZone";
import { Preview } from "./components/Preview";
import { InspectPanel } from "./components/InspectPanel";
import { CleanupPanel } from "./components/CleanupPanel";
import { EditPanel } from "./components/EditPanel";
import { useSvgDocument } from "./hooks/useSvgDocument";
import { useInspect } from "./hooks/useInspect";
import { useSelection } from "./hooks/useSelection";
import { useUndoStack } from "./hooks/useUndoStack";
import { detectSmallPaths } from "./utils/smallPathDetector";
import { exportSvg } from "./utils/svgExport";

function App() {
  const {
    containerRef,
    svgElRef,
    fileName,
    loaded,
    revision,
    error,
    originalSize,
    loadSvg,
    notifyChange,
  } = useSvgDocument();

  const inspect = useInspect(svgElRef, revision, originalSize);

  const {
    selected,
    mode,
    setMode,
    select,
    selectAll,
    selectSameFill,
    clearSelection,
  } = useSelection(svgElRef);

  const { push, undo, canUndo, remaining } = useUndoStack(notifyChange);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [smallThreshold] = useState(5);
  const [smallPaths, setSmallPaths] = useState<SVGGraphicsElement[]>([]);

  // Detect small paths when revision changes
  useEffect(() => {
    const svg = svgElRef.current;
    if (!svg) {
      setSmallPaths([]);
      return;
    }
    const timer = setTimeout(() => {
      setSmallPaths(detectSmallPaths(svg, smallThreshold));
    }, 350);
    return () => clearTimeout(timer);
  }, [svgElRef, revision, smallThreshold]);

  const handleColorChange = useCallback(
    (color: string) => {
      if (selected.size === 0) return;
      const elements = Array.from(selected);
      const previousFills = elements.map(
        (el) => el.getAttribute("fill") || "",
      );
      push({ type: "colorChange", elements, previousFills });
      for (const el of elements) {
        el.setAttribute("fill", color);
      }
      notifyChange();
    },
    [selected, push, notifyChange],
  );

  const handleDelete = useCallback(() => {
    if (selected.size === 0) return;
    const entries = Array.from(selected).map((el) => ({
      element: el,
      parent: el.parentNode!,
      nextSibling: el.nextSibling,
    }));
    push({ type: "delete", entries });
    for (const el of selected) {
      el.remove();
    }
    clearSelection();
    notifyChange();
  }, [selected, push, clearSelection, notifyChange]);

  const handleDeleteSmallPaths = useCallback(() => {
    if (smallPaths.length === 0) return;
    if (!confirm(`${smallPaths.length}個のパスを削除します。よろしいですか？`))
      return;
    const entries = smallPaths.map((el) => ({
      element: el as SVGElement,
      parent: el.parentNode!,
      nextSibling: el.nextSibling,
    }));
    push({ type: "deleteSmallPaths", entries });
    for (const el of smallPaths) {
      el.remove();
    }
    clearSelection();
    notifyChange();
  }, [smallPaths, push, clearSelection, notifyChange]);

  const handleHighlightSmallPaths = useCallback(() => {
    selectAll(smallPaths as unknown as SVGElement[]);
  }, [smallPaths, selectAll]);

  const handleFlatten = useCallback(() => {
    const svg = svgElRef.current;
    if (!svg) return;

    // Flatten: move all shapes to root, applying transforms
    const groups = svg.querySelectorAll("g");
    // Process from deepest to shallowest
    const groupArray = Array.from(groups).reverse();

    for (const g of groupArray) {
      const children = Array.from(g.children);
      for (const child of children) {
        if (child instanceof SVGGraphicsElement) {
          try {
            const ctm = child.getCTM();
            const svgCTM = svg.getCTM();
            if (ctm && svgCTM) {
              // Get transform relative to SVG root
              const rootInverse = svgCTM.inverse();
              const localToRoot = rootInverse.multiply(ctm);

              // Apply transform attribute
              const t = localToRoot;
              child.setAttribute(
                "transform",
                `matrix(${t.a} ${t.b} ${t.c} ${t.d} ${t.e} ${t.f})`,
              );
            }
          } catch {
            // getCTM may fail
          }

          // Preserve fill-rule from parent/root
          const rootStyle = svg.getAttribute("style") || "";
          if (rootStyle.includes("evenodd")) {
            (child as SVGElement).style.fillRule = "evenodd";
            (child as SVGElement).style.clipRule = "evenodd";
          }
        }
        // Move to SVG root
        svg.appendChild(child);
      }
      // Remove empty group
      g.remove();
    }

    notifyChange();
  }, [svgElRef, notifyChange]);

  const handleOutlineStrokes = useCallback(async () => {
    const svg = svgElRef.current;
    if (!svg) return;

    // Use paper.js for stroke outlining
    try {
      const paper = await import("paper");
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      paper.default.setup(canvas);

      const svgString = new XMLSerializer().serializeToString(svg);
      const imported = paper.default.project.importSVG(svgString);

      // Process all items with strokes
      const items = imported.getItems({ recursive: true });
      for (const item of items) {
        if (
          item instanceof paper.default.Path &&
          item.strokeWidth > 0 &&
          item.strokeColor
        ) {
          const strokeColor = item.strokeColor.toCSS(true);
          const hasFill =
            item.fillColor !== null &&
            item.fillColor !== undefined;

          // Create outline by expanding the stroke
          const strokePath = item.clone();
          strokePath.strokeWidth = 0;
          strokePath.fillColor = new paper.default.Color(strokeColor);

          if (!hasFill) {
            item.remove();
          } else {
            item.strokeWidth = 0;
            item.strokeColor = null;
          }
        }
      }

      // Export back
      const exportedSvg = paper.default.project.exportSVG({
        asString: true,
      }) as string;

      const parser = new DOMParser();
      const doc = parser.parseFromString(exportedSvg, "image/svg+xml");
      const newSvg = doc.querySelector("svg");

      if (newSvg) {
        // Preserve original viewBox and dimensions
        const vb = svg.getAttribute("viewBox");
        const w = svg.getAttribute("width");
        const h = svg.getAttribute("height");

        const container = containerRef.current;
        if (container) {
          container.innerHTML = "";
          const importedNode = document.importNode(
            newSvg,
            true,
          ) as SVGSVGElement;
          if (vb) importedNode.setAttribute("viewBox", vb);
          if (w) importedNode.setAttribute("width", w);
          if (h) importedNode.setAttribute("height", h);
          container.appendChild(importedNode);
          svgElRef.current = importedNode;
        }
      }

      paper.default.project.clear();
      notifyChange();
    } catch (err) {
      console.error("Stroke outline failed:", err);
      alert(
        "ストロークのアウトライン化に失敗しました。コンソールを確認してください。",
      );
    }
  }, [svgElRef, containerRef, notifyChange]);

  const handleExport = useCallback(() => {
    const svg = svgElRef.current;
    if (!svg) return;
    exportSvg(svg, fileName);
  }, [svgElRef, fileName]);

  // Delete key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
          return;
        handleDelete();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleDelete]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
        <h1 className="text-sm font-semibold">SVG入稿チェックツール</h1>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".svg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) loadSvg(file);
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
          >
            ファイルを開く
          </button>
          <button
            onClick={handleExport}
            disabled={!loaded}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            エクスポート
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {loaded && inspect && (
          <aside className="w-64 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-3 space-y-6">
            <InspectPanel
              result={inspect}
              smallPathCount={smallPaths.length}
              onSelectColor={selectAll}
              onHighlightSmallPaths={handleHighlightSmallPaths}
              onDeleteSmallPaths={handleDeleteSmallPaths}
            />
            <CleanupPanel
              strokeCount={inspect.strokeCount}
              onFlatten={handleFlatten}
              onOutlineStrokes={handleOutlineStrokes}
            />
            <EditPanel
              mode={mode}
              onSetMode={setMode}
              selectedCount={selected.size}
              colors={inspect.colors}
              onColorChange={handleColorChange}
              onSelectSameFill={selectSameFill}
              onDelete={handleDelete}
              canUndo={canUndo}
              undoRemaining={remaining}
              onUndo={undo}
            />
          </aside>
        )}

        {/* Preview area */}
        <main className="flex-1 p-4 overflow-hidden">
          {error && (
            <div className="mb-2 px-3 py-2 bg-red-50 text-red-700 text-xs rounded border border-red-200">
              {error}
            </div>
          )}

          {!loaded ? (
            <div className="h-full">
              <DropZone onFile={loadSvg} />
            </div>
          ) : (
            <Preview
              containerRef={containerRef}
              svgElRef={svgElRef}
              revision={revision}
              mode={mode}
              onClickElement={select}
              onLassoSelect={selectAll}
              onClearSelection={clearSelection}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
