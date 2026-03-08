import type { InspectResult } from "../hooks/useInspect";

type Props = {
  result: InspectResult;
  smallPathCount: number;
  onSelectColor: (elements: SVGElement[]) => void;
  onHighlightSmallPaths: () => void;
  onDeleteSmallPaths: () => void;
};

export function InspectPanel({
  result,
  smallPathCount,
  onSelectColor,
  onHighlightSmallPaths,
  onDeleteSmallPaths,
}: Props) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Inspect
      </h3>

      {/* Document info */}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">サイズ (px)</span>
          <span>
            {result.width} × {result.height}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">サイズ (mm)</span>
          <span>
            {result.widthMm} × {result.heightMm}
          </span>
        </div>
        {result.viewBox && (
          <div className="flex justify-between">
            <span className="text-gray-500">viewBox</span>
            <span className="truncate ml-2 text-right">{result.viewBox}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-500">総パス数</span>
          <span>
            {result.totalPaths}
            {result.totalPaths > 1000 && (
              <span className="ml-1 px-1 py-0.5 bg-yellow-100 text-yellow-800 rounded text-[10px]">
                注意
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Color palette */}
      <div>
        <h4 className="text-xs font-medium text-gray-600 mb-2">
          色パレット ({result.colors.length}色)
        </h4>
        <div className="space-y-1.5">
          {result.colors.map((c) => (
            <div
              key={c.hex}
              className="flex items-center gap-2 text-[11px] group"
            >
              <span
                className="w-4 h-4 rounded border border-gray-300 flex-shrink-0"
                style={{ backgroundColor: c.hex }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-mono">{c.hex}</div>
                <div className="text-gray-400">
                  C{c.cmyk.c} M{c.cmyk.m} Y{c.cmyk.y} K{c.cmyk.k}
                </div>
              </div>
              <span className="text-gray-400 flex-shrink-0">{c.count}</span>
              <button
                onClick={() => onSelectColor(c.elements)}
                className="text-blue-500 hover:text-blue-700 opacity-0 group-hover:opacity-100 flex-shrink-0"
              >
                全選択
              </button>
            </div>
          ))}
        </div>
        {result.colors.length > 0 && (
          <p className="text-[10px] text-gray-400 mt-1">
            ※ CMYK値は近似値です
          </p>
        )}
      </div>

      {/* Small paths */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">孤立点・小パス</span>
          {smallPathCount > 0 && (
            <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-medium">
              {smallPathCount}件
            </span>
          )}
          {smallPathCount === 0 && (
            <span className="text-[10px] text-gray-400">なし</span>
          )}
        </div>
        {smallPathCount > 0 && (
          <div className="flex gap-1">
            <button
              onClick={onHighlightSmallPaths}
              className="text-[11px] px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
            >
              ハイライト
            </button>
            <button
              onClick={onDeleteSmallPaths}
              className="text-[11px] px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50"
            >
              削除
            </button>
          </div>
        )}
      </div>

      {/* Stroke detection */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">ストローク</span>
          {result.strokeCount > 0 ? (
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium">
              {result.strokeCount}件
            </span>
          ) : (
            <span className="text-[10px] text-gray-400">なし</span>
          )}
        </div>
      </div>
    </div>
  );
}
