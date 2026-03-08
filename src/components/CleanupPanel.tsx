import { useState } from "react";

type Props = {
  strokeCount: number;
  onFlatten: () => void;
  onOutlineStrokes: () => void;
};

export function CleanupPanel({
  strokeCount,
  onFlatten,
  onOutlineStrokes,
}: Props) {
  const [processing, setProcessing] = useState(false);

  const handleFlatten = () => {
    const hasEvenOdd =
      "この操作はUndoできません。\nfill-rule:evenodd が含まれる場合、重なり箇所の見た目が変わる可能性があります。\n\n実行しますか？";
    if (!confirm(hasEvenOdd)) return;
    onFlatten();
  };

  const handleOutline = async () => {
    if (
      !confirm(
        "ストロークのアウトライン化を実行します。\nこの操作はUndoできません。\n\n実行しますか？",
      )
    )
      return;
    setProcessing(true);
    try {
      await onOutlineStrokes();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Cleanup
      </h3>
      <div className="space-y-2">
        <button
          onClick={handleFlatten}
          className="w-full text-left text-xs px-3 py-2 border border-gray-300 rounded hover:bg-gray-50"
        >
          レイヤーを統合
        </button>
        <button
          onClick={handleOutline}
          disabled={strokeCount === 0 || processing}
          className="w-full text-left text-xs px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {processing ? "処理中..." : "ストロークのアウトライン化"}
          {strokeCount > 0 && !processing && (
            <span className="ml-1 text-gray-400">({strokeCount}件)</span>
          )}
        </button>
      </div>
    </div>
  );
}
