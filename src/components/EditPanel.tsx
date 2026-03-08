import { useCallback, useRef } from "react";
import type { SelectionMode } from "../hooks/useSelection";
import type { ColorInfo } from "../hooks/useInspect";

type Props = {
  mode: SelectionMode;
  onSetMode: (mode: SelectionMode) => void;
  selectedCount: number;
  colors: ColorInfo[];
  onColorChange: (color: string) => void;
  onSelectSameFill: () => void;
  onDelete: () => void;
  canUndo: boolean;
  undoRemaining: number;
  onUndo: () => void;
};

export function EditPanel({
  mode,
  onSetMode,
  selectedCount,
  colors,
  onColorChange,
  onSelectSameFill,
  onDelete,
  canUndo,
  undoRemaining,
  onUndo,
}: Props) {
  const onColorChangeRef = useRef(onColorChange);
  onColorChangeRef.current = onColorChange;

  const colorCallbackRef = useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    const handler = (e: Event) => {
      onColorChangeRef.current((e.target as HTMLInputElement).value);
    };
    el.addEventListener("input", handler);
  }, []);

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Edit
      </h3>

      {/* Selection mode */}
      <div className="flex gap-2 text-xs">
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="radio"
            name="selectionMode"
            checked={mode === "click"}
            onChange={() => onSetMode("click")}
            className="w-3 h-3"
          />
          クリック選択
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="radio"
            name="selectionMode"
            checked={mode === "lasso"}
            onChange={() => onSetMode("lasso")}
            className="w-3 h-3"
          />
          なげなわ選択
        </label>
      </div>

      {/* Selection info */}
      <div className="text-xs text-gray-600">
        選択中: <span className="font-medium">{selectedCount}</span> パス
      </div>

      {/* Color change */}
      {selectedCount > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">色変更:</label>
            <input
              ref={colorCallbackRef}
              type="color"
              className="w-6 h-6 cursor-pointer border border-gray-300 rounded"
            />
          </div>

          {/* Preset colors from inspect */}
          {colors.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {colors.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => onColorChange(c.hex)}
                  title={c.hex}
                  className="w-5 h-5 rounded border border-gray-300 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          )}

          <div className="flex gap-1">
            <button
              onClick={onSelectSameFill}
              className="text-[11px] px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
            >
              同じ塗りを選択
            </button>
            <button
              onClick={onDelete}
              className="text-[11px] px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50"
            >
              削除
            </button>
          </div>
        </div>
      )}

      {/* Undo */}
      <div className="pt-2 border-t border-gray-200">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="text-xs text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
        >
          Ctrl+Z で元に戻す
        </button>
        <p className="text-[10px] text-gray-400 mt-0.5">
          残り {undoRemaining} ステップ
        </p>
      </div>
    </div>
  );
}
