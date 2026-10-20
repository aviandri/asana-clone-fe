import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';

const carriesFiles = (e: { dataTransfer: DataTransfer | null }) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');

/**
 * React events bubble through portals: a drop or paste on a modal opened from the panel (the
 * attachment viewer) reaches the panel's handlers although it happened outside the panel's DOM.
 */
const fromInside = (e: { currentTarget: EventTarget; target: EventTarget }) =>
  (e.currentTarget as Node).contains(e.target as Node);

/**
 * A drop target for files from the desktop (not dnd-kit's task drags, which carry no files). While
 * files hover over it, `active` is true so the target can highlight; a disabled target ignores them,
 * and [useNoFileNavigation] keeps the browser from opening a file dropped there.
 */
export function useFileDrop(enabled: boolean, onFiles: (files: File[]) => void, opts: { isolate?: boolean } = {}) {
  // An inner target (the composer inside the task panel) keeps its drag events from the outer one,
  // so only one of them highlights, and a drop lands in exactly one.
  const { isolate = false } = opts;
  const [active, setActive] = useState(false);
  // dragenter/leave fire for every child crossed: count them so the highlight doesn't flicker.
  const depth = useRef(0);

  useEffect(() => {
    if (!enabled) {
      depth.current = 0;
      setActive(false);
    }
  }, [enabled]);

  const onDragEnter = useCallback(
    (e: DragEvent) => {
      if (!enabled || !carriesFiles(e) || !fromInside(e)) return;
      e.preventDefault();
      if (isolate) e.stopPropagation();
      depth.current += 1;
      setActive(true);
    },
    [enabled, isolate],
  );
  const onDragOver = useCallback(
    (e: DragEvent) => {
      if (!enabled || !carriesFiles(e) || !fromInside(e)) return;
      e.preventDefault();
      if (isolate) e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    },
    [enabled, isolate],
  );
  const onDragLeave = useCallback(
    (e: DragEvent) => {
      if (!enabled || !carriesFiles(e) || !fromInside(e)) return;
      if (isolate) e.stopPropagation();
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    },
    [enabled, isolate],
  );
  const onDrop = useCallback(
    (e: DragEvent) => {
      if (!fromInside(e)) return;
      depth.current = 0;
      setActive(false);
      if (!enabled || !carriesFiles(e)) return;
      e.preventDefault();
      // Stop here: an inner target (the composer) must not also see the outer one's drop.
      e.stopPropagation();
      const files = [...e.dataTransfer.files];
      if (files.length) onFiles(files);
    },
    [enabled, onFiles],
  );

  return { active, bind: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}

/** Files pasted outside a text field (e.g. a screenshot), or [] for an ordinary text paste. */
export function pastedFiles(e: ClipboardEvent): File[] {
  if (!fromInside(e)) return [];
  const el = e.target as HTMLElement | null;
  const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  if (typing) return [];
  return [...(e.clipboardData?.files ?? [])];
}

/** Every file on the clipboard, wherever the paste happened (the composer takes them in its text box). */
export function pastedClipboardFiles(e: ClipboardEvent): File[] {
  if (!fromInside(e)) return [];
  return [...(e.clipboardData?.files ?? [])];
}

/**
 * Anywhere that isn't a drop target, a dropped file must do nothing: by default the browser would
 * navigate away from the app to open it.
 */
export function useNoFileNavigation() {
  useEffect(() => {
    const onDragOver = (e: globalThis.DragEvent) => {
      if (e.defaultPrevented || !carriesFiles(e)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'none';
    };
    const onDrop = (e: globalThis.DragEvent) => {
      if (carriesFiles(e)) e.preventDefault();
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
}
