import { ApiError, apiUrl, failure, requestHeaders, withQuery } from './client';

export type UploadProgress = (fraction: number) => void;
export type UploadOpts = { draft?: boolean; onProgress?: UploadProgress; signal?: AbortSignal };

/** What a transport hands back: the status and the raw body. Aborting rejects with an AbortError. */
export type UploadResponse = { status: number; text: string };
export type UploadTransport = (
  url: string,
  file: File,
  opts: { headers: Record<string, string>; onProgress?: UploadProgress; signal?: AbortSignal },
) => Promise<UploadResponse>;

/**
 * XMLHttpRequest, not fetch: fetch has no upload progress. The body is a one-part multipart form
 * (`file`) that the browser streams from disk.
 */
const xhrTransport: UploadTransport = (url, file, { headers, onProgress, signal }) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Upload cancelled', 'AbortError'));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new ApiError(0, 'INTERNAL', 'Network error — is the server running?'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    const form = new FormData();
    form.append('file', file, file.name);
    xhr.send(form);
  });

let transport: UploadTransport = xhrTransport;

const BODILESS: Record<number, { code: ApiError['code']; message: string }> = {
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'This file is larger than 100 MB.' },
  429: { code: 'RATE_LIMITED', message: 'Too many uploads. Try again in a few minutes.' },
  507: { code: 'INSUFFICIENT_STORAGE', message: 'The server is out of storage space. Try again later.' },
};

/** Swap the upload transport (the mock backend and tests). */
export function setUploadTransport(t: UploadTransport | null) {
  transport = t ?? xhrTransport;
}

/** POSTs one file as multipart; resolves with the parsed JSON, throws ApiError (or AbortError). */
export async function uploadFile<T>(path: string, file: File, opts: UploadOpts = {}): Promise<T> {
  // A3: drafts are marked in the query, so the server decides permission before the body streams.
  const target = opts.draft ? withQuery(path, 'draft', 'true') : path;
  const res = await transport(apiUrl(target), file, {
    headers: requestHeaders(),
    onProgress: opts.onProgress,
    signal: opts.signal,
  });
  let json: unknown = undefined;
  try {
    json = res.text ? JSON.parse(res.text) : undefined;
  } catch {
    json = undefined;
  }
  if (res.status < 200 || res.status >= 300) {
    // A proxy's own error page carries no error body: still say what the status means, not
    // "Request failed".
    if (!(json as { error?: unknown } | undefined)?.error) {
      const known = BODILESS[res.status];
      if (known) throw new ApiError(res.status, known.code, known.message);
    }
    throw failure(path, res.status, json);
  }
  return json as T;
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';
