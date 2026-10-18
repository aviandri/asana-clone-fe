// Tiny global toast store (no dependency). Errors after optimistic rollbacks, info, and
// actionable toasts (e.g. "Undo" after completing a task).
export type ToastAction = { label: string; onClick: () => void };
export type Toast = { id: number; message: string; tone: 'error' | 'info'; action?: ToastAction };
type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(toasts));

export function showToast(message: string, tone: Toast['tone'] = 'error', opts: { action?: ToastAction; ttlMs?: number } = {}) {
  const t: Toast = { id: nextId++, message, tone, action: opts.action };
  toasts = [...toasts.filter((x) => x.message !== message), t].slice(-3);
  emit();
  setTimeout(() => dismissToast(t.id), opts.ttlMs ?? (opts.action ? 6000 : 5000));
  return t.id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(l: Listener) {
  listeners.add(l);
  l(toasts);
  return () => {
    listeners.delete(l);
  };
}
