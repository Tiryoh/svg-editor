import { useCallback, useRef, useState } from "react";

type Props = {
  onFile: (file: File) => void;
};

export function DropZone({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  const prevent = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      prevent(e);
      setDragging(true);
    },
    [prevent],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      prevent(e);
      setDragging(false);
    },
    [prevent],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={prevent}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      className={`flex flex-col items-center justify-center h-full border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
        dragging
          ? "border-blue-500 bg-blue-50"
          : "border-gray-300 hover:border-gray-400"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".svg"
        className="hidden"
        onChange={handleChange}
        onClick={(e) => e.stopPropagation()}
      />
      <p className="text-gray-500 text-sm mb-2">
        SVGファイルをドラッグ＆ドロップ
      </p>
      <p className="text-gray-400 text-xs">またはクリックしてファイルを選択</p>
    </div>
  );
}
