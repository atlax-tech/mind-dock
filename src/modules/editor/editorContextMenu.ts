import { EditorView } from '@codemirror/view';

export interface EditorContextMenuAction {
  label: string;
  icon?: string; // lucide icon name
  action: (view: EditorView, selection: { from: number; to: number; text: string }) => void;
  separator?: false;
}

export interface EditorContextMenuSeparator {
  separator: true;
}

export type EditorContextMenuItem = EditorContextMenuAction | EditorContextMenuSeparator;

/**
 * Creates a CM6 extension that shows a custom context menu on right-click.
 * Replaces the browser's default context menu within the editor.
 */
export function editorContextMenu(items: EditorContextMenuItem[]) {
  return EditorView.domEventHandlers({
    contextmenu(event, view) {
      event.preventDefault();

      // Get selection at click position
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return;

      // If there's no selection, or click is outside current selection, select word at click
      let { from, to } = view.state.selection.main;
      if (from === to || pos < from || pos > to) {
        // Select word at click position
        const word = view.state.wordAt(pos);
        if (word) {
          from = word.from;
          to = word.to;
          view.dispatch({ selection: { anchor: from, head: to } });
        } else {
          from = pos;
          to = pos;
        }
      }

      const selectedText = view.state.sliceDoc(from, to);

      // Only show menu if there's selected text
      if (!selectedText.trim()) return;

      // Remove existing menu
      const existing = document.getElementById('editor-context-menu');
      if (existing) existing.remove();

      // Create menu
      const menu = document.createElement('div');
      menu.id = 'editor-context-menu';
      menu.style.cssText = `
        position: fixed;
        left: ${event.clientX}px;
        top: ${event.clientY}px;
        z-index: 99999;
        min-width: 180px;
        background: white;
        border: 1px solid #e6e6dc;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.1);
        padding: 4px;
        font-size: 11px;
        color: #2c2c2a;
      `;

      // Dark mode support
      if (document.documentElement.classList.contains('dark')) {
        menu.style.background = '#212121';
        menu.style.borderColor = '#2f2f2f';
        menu.style.color = '#e3e3e3';
      }

      for (const item of items) {
        if (item.separator) {
          const sep = document.createElement('div');
          sep.style.cssText = 'border-top: 1px solid #e6e6dc; margin: 4px 0;';
          if (document.documentElement.classList.contains('dark')) {
            sep.style.borderColor = '#2f2f2f';
          }
          menu.appendChild(sep);
          continue;
        }

        const btn = document.createElement('button');
        btn.textContent = item.label;
        btn.style.cssText = `
          display: flex; align-items: center; gap: 6px; width: 100%;
          padding: 6px 10px; border: none; background: none; cursor: pointer;
          text-align: left; border-radius: 4px; font-size: 11px;
          color: inherit; font-family: inherit;
        `;

        btn.addEventListener('mouseenter', () => {
          btn.style.background = document.documentElement.classList.contains('dark')
            ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'none';
        });

        btn.addEventListener('click', () => {
          item.action(view, { from, to, text: selectedText });
          menu.remove();
        });

        menu.appendChild(btn);
      }

      document.body.appendChild(menu);

      // Adjust position if menu goes off screen
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${event.clientX - rect.width}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${event.clientY - rect.height}px`;
      }

      // Close on click outside
      const close = (e: MouseEvent) => {
        if (!menu.contains(e.target as Node)) {
          menu.remove();
          document.removeEventListener('click', close);
        }
      };
      setTimeout(() => document.addEventListener('click', close), 0);

      // Close on Escape
      const closeOnEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          menu.remove();
          document.removeEventListener('keydown', closeOnEsc);
        }
      };
      document.addEventListener('keydown', closeOnEsc);
    },
  });
}
