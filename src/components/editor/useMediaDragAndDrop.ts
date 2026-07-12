import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { EditorView } from '@codemirror/view';
import type { Translator } from '../../i18n';
import { MEDIA_EXT, buildMediaSnippet } from './mediaSnippet';

interface UseMediaDragAndDropParams {
  containerRef: RefObject<HTMLDivElement | null>;
  viewRef: RefObject<EditorView | null>;
  filePathRef: RefObject<string | null | undefined>;
  onWarnRef: RefObject<((msg: string) => void) | undefined>;
  t: Translator;
}

// Handle OS file drops via Tauri's drag-drop window event.
// The browser File API never exposes paths; this is the only reliable source.
export function useMediaDragAndDrop({ containerRef, viewRef, filePathRef, onWarnRef, t }: UseMediaDragAndDropParams): boolean {
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const dragHasMedia = { current: false };

    const unlisten = getCurrentWindow().onDragDropEvent((evt) => {
      const p = evt.payload;

      if (p.type === 'enter') {
        dragHasMedia.current = p.paths.some((f) => MEDIA_EXT.test(f));
        return;
      }

      if (p.type === 'over') {
        if (!dragHasMedia.current) return;
        const rect = containerRef.current?.getBoundingClientRect();
        const overEditor = !!rect
          && p.position.x >= rect.left && p.position.x <= rect.right
          && p.position.y >= rect.top  && p.position.y <= rect.bottom;
        setDragActive(overEditor);
        return;
      }

      if (p.type === 'leave') {
        setDragActive(false);
        dragHasMedia.current = false;
        return;
      }

      if (p.type === 'drop') {
        setDragActive(false);
        dragHasMedia.current = false;

        const { x, y } = p.position;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;

        const mediaPaths = [...new Set(p.paths.filter((f) => MEDIA_EXT.test(f)))];
        if (!mediaPaths.length) return;

        const view = viewRef.current;
        if (!view) return;

        const pos = view.posAtCoords({ x, y }) ?? view.state.doc.length;
        const docPath = filePathRef.current ?? null;
        if (!docPath) {
          onWarnRef.current?.(t('editor.saveFirstDropMedia'));
          return;
        }

        void (async () => {
          const inserts = await Promise.all(
            mediaPaths.map((abs) => buildMediaSnippet(abs, docPath, (m) => onWarnRef.current?.(m))),
          );

          const validInserts = inserts.filter((s): s is string => s !== null);
          if (!validInserts.length) return;
          const insert = validInserts.join('\n');
          view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + insert.length } });
          view.focus();
        })();
      }
    });

    return () => { unlisten.then((fn) => fn()); };
  }, [containerRef, viewRef, filePathRef, onWarnRef, t]);

  return dragActive;
}
