import { useState } from 'react';
import { ApiError } from '@/api/client';
import { errorMessage } from '@/lib/errors';
import { linkUrlProblem } from './fileTypes';

function serverProblem(err: unknown): string {
  if (err instanceof ApiError && err.code === 'VALIDATION') {
    const detail = (err.details as { path?: string[]; message?: string }[] | undefined)?.find((d) => d.path?.[0] === 'url');
    return detail?.message ?? err.message;
  }
  return errorMessage(err, 'Couldn’t add the link.');
}

/** URL + optional title. `onSubmit` resolves once the link exists (the server fetches its preview). */
export function LinkForm({
  onSubmit,
  onCancel,
  label = 'Add link',
}: {
  onSubmit: (input: { url: string; title?: string }) => Promise<unknown>;
  onCancel: () => void;
  label?: string;
}) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const p = linkUrlProblem(url);
    if (p) return setProblem(p);
    setProblem(null);
    setPending(true);
    try {
      await onSubmit({ url: url.trim(), ...(title.trim() && { title: title.trim() }) });
    } catch (err) {
      setProblem(serverProblem(err));
      setPending(false);
    }
  };

  return (
    <form
      noValidate
      aria-label={label}
      className="space-y-2 rounded-lg border border-gray-200 bg-white p-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <input
        autoFocus
        type="url"
        inputMode="url"
        aria-label="Link URL"
        placeholder="https://"
        className="input py-1 text-sm"
        value={url}
        aria-invalid={!!problem}
        onChange={(e) => setUrl(e.target.value)}
      />
      <input
        aria-label="Link title (optional)"
        placeholder="Title (optional)"
        className="input py-1 text-sm"
        value={title}
        maxLength={300}
        onChange={(e) => setTitle(e.target.value)}
      />
      {problem && (
        <p role="alert" className="text-xs text-red-600">
          {problem}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost py-1 text-xs" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary py-1 text-xs" disabled={pending}>
          {pending ? 'Adding…' : 'Add link'}
        </button>
      </div>
    </form>
  );
}
