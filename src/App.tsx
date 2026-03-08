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
import { flattenLayers } from "./utils/flatten";
import { outlineStrokes } from "./utils/strokeToPath";

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

    flattenLayers(svg);
    clearSelection();
    notifyChange();
  }, [svgElRef, clearSelection, notifyChange]);

  const handleOutlineStrokes = useCallback(async () => {
    const svg = svgElRef.current;
    if (!svg) return;

    try {
      await outlineStrokes(svg);
      clearSelection();
      notifyChange();
    } catch (err) {
      console.error("Stroke outline failed:", err);
      alert(
        "ストロークのアウトライン化に失敗しました。コンソールを確認してください。",
      );
    }
  }, [svgElRef, clearSelection, notifyChange]);

  const handleExport = useCallback(() => {
    const svg = svgElRef.current;
    if (!svg) return;
    exportSvg(svg, fileName);
  }, [svgElRef, fileName]);

  const handlePreviewInTab = useCallback(() => {
    const svg = svgElRef.current;
    if (!svg) return;
    const svgString = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }, [svgElRef]);

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
            onClick={handlePreviewInTab}
            disabled={!loaded}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            別タブで確認
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
