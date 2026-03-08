import { useEffect, useState } from "react";

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
  const [outlineMessage, setOutlineMessage] = useState<string | null>(null);

  // Auto-dismiss message after 10 seconds
  useEffect(() => {
    if (!outlineMessage) return;
    const timer = setTimeout(() => setOutlineMessage(null), 10000);
    return () => clearTimeout(timer);
  }, [outlineMessage]);

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
    setOutlineMessage(null);
    try {
      await onOutlineStrokes();
      setOutlineMessage(
        "アウトライン化が完了しました。複雑なパスや破線は変換精度が落ちる場合があります。プレビューで目視確認してください。",
      );
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
        {outlineMessage && (
          <div className="px-3 py-2 bg-amber-50 text-amber-800 text-[11px] rounded border border-amber-200 leading-relaxed">
            {outlineMessage}
            <button
              onClick={() => setOutlineMessage(null)}
              className="ml-1 text-amber-500 hover:text-amber-700"
              aria-label="閉じる"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
