import { useCallback, useEffect, useRef, useState } from "react";

const MAX_UNDO = 30;

type DeletedEntry = {
  element: SVGElement;
  parent: Node;
  nextSibling: Node | null;
};

export type UndoEntry =
  | { type: "colorChange"; elements: SVGElement[]; previousFills: string[] }
  | { type: "delete"; entries: DeletedEntry[] }
  | { type: "deleteSmallPaths"; entries: DeletedEntry[] };

export function useUndoStack(onRestore: () => void) {
  const stackRef = useRef<UndoEntry[]>([]);
  const [remaining, setRemaining] = useState(0);

  const push = useCallback((entry: UndoEntry) => {
    stackRef.current.push(entry);
    if (stackRef.current.length > MAX_UNDO) {
      stackRef.current.shift();
    }
    setRemaining(stackRef.current.length);
  }, []);

  const undo = useCallback(() => {
    const entry = stackRef.current.pop();
    if (!entry) return;

    switch (entry.type) {
      case "colorChange":
        for (let i = 0; i < entry.elements.length; i++) {
          entry.elements[i].setAttribute("fill", entry.previousFills[i]);
        }
        break;
      case "delete":
      case "deleteSmallPaths":
        for (const { element, parent, nextSibling } of entry.entries) {
          parent.insertBefore(element, nextSibling);
        }
        break;
    }

    setRemaining(stackRef.current.length);
    onRestore();
  }, [onRestore]);

  const canUndo = remaining > 0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo]);

  return { push, undo, canUndo, remaining };
}
