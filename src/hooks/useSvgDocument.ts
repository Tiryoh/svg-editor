import { useCallback, useEffect, useRef, useState } from "react";

export function useSvgDocument() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgElRef = useRef<SVGSVGElement | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [originalSize, setOriginalSize] = useState<{
    width: number;
    height: number;
    viewBox: string;
  } | null>(null);

  // Parsed SVG element waiting to be mounted
  const pendingSvgRef = useRef<SVGSVGElement | null>(null);

  const notifyChange = useCallback(() => {
    setRevision((r) => r + 1);
  }, []);

  // Mount pending SVG into container when containerRef becomes available
  useEffect(() => {
    const container = containerRef.current;
    const pending = pendingSvgRef.current;
    if (!container || !pending) return;

    container.innerHTML = "";
    container.appendChild(pending);
    svgElRef.current = pending;
    pendingSvgRef.current = null;
    notifyChange();
  }, [loaded, notifyChange]);

  const loadSvg = useCallback(
    async (file: File) => {
      setError(null);

      if (!file.name.toLowerCase().endsWith(".svg")) {
        setError("SVGファイルのみ対応しています");
        return;
      }

      try {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "image/svg+xml");

        const parseError = doc.querySelector("parsererror");
        if (parseError) {
          setError("SVGファイルの解析に失敗しました");
          return;
        }

        const svg = doc.querySelector("svg");
        if (!svg) {
          setError("有効なSVG要素が見つかりません");
          return;
        }

        // Save original dimensions before modifying
        const origW = parseFloat(svg.getAttribute("width") || "0");
        const origH = parseFloat(svg.getAttribute("height") || "0");
        const origVB = svg.getAttribute("viewBox") || "";
        setOriginalSize({ width: origW, height: origH, viewBox: origVB });

        const imported = document.importNode(svg, true) as SVGSVGElement;

        // Ensure viewBox exists for proper scaling
        if (!imported.getAttribute("viewBox")) {
          const w = origW || 300;
          const h = origH || 150;
          imported.setAttribute("viewBox", `0 0 ${w} ${h}`);
        }

        // Remove fixed width/height so CSS can control sizing
        imported.removeAttribute("width");
        imported.removeAttribute("height");

        // Try to mount immediately if container exists
        const container = containerRef.current;
        if (container) {
          container.innerHTML = "";
          container.appendChild(imported);
          svgElRef.current = imported;
          pendingSvgRef.current = null;
        } else {
          // Container not yet mounted — defer until useEffect
          pendingSvgRef.current = imported;
        }

        setFileName(file.name);
        setLoaded(true);
        setRevision(0);
        // Trigger inspect after mount
        setTimeout(() => notifyChange(), 0);
      } catch {
        setError("ファイルの読み込みに失敗しました");
      }
    },
    [notifyChange],
  );

  return {
    containerRef,
    svgElRef,
    fileName,
    loaded,
    revision,
    error,
    originalSize,
    loadSvg,
    notifyChange,
  };
}
