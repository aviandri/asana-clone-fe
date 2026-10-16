// Tiny global toast store (no dependency). Used for mutation errors after an optimistic rollback.
export type Toast = { id: number; message: string; tone: 'error' | 'info' };
type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(toasts));

export function showToast(message: string, tone: Toast['tone'] = 'error', ttlMs = 5000) {
  const t = { id: nextId++, message, tone };
  toasts = [...toasts.filter((x) => x.message !== message), t].slice(-3);
  emit();
  setTimeout(() => dismissToast(t.id), ttlMs);
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
