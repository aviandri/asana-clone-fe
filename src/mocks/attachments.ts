// Mock implementation of the attachment endpoints (SPEC §13), enough for the UI: uploads (task-level
// and drafts), get, delete, activity and counts. No real storage: a file's bytes stay in the browser.
import { uid, type AttachmentRow, type MockDb, type TaskRow, type UserRow } from './db';
import {
  HttpError,
  assertCanEditTask,
  forbidden,
  notFound,
  nowIso,
  roleIn,
  serializeAttachment,
  visibleTask,
  type Handler,
} from './shared';

export const MOCK_MAX_UPLOAD_BYTES = 104_857_600;

const SNIFFABLE = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/heic', 'image/tiff',
  'application/pdf', 'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm', 'application/zip',
]);
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'json', 'log']);

/** Stands in for the server's magic-byte sniffing: trusted types only, text by extension, else binary. */
function sniff(file: File): string {
  if (SNIFFABLE.has(file.type)) return file.type;
  const ext = /\.([A-Za-z0-9]+)$/.exec(file.name)?.[1]?.toLowerCase() ?? '';
  return TEXT_EXTENSIONS.has(ext) ? 'text/plain' : 'application/octet-stream';
}

const BIDI = new Set([0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f, 0x061c]);

/** The server's filename rules, in short: basename, no control or bidi characters, never empty. */
function sanitizeName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const clean = [...base].filter((c) => {
    const code = c.codePointAt(0)!;
    return code >= 0x20 && code !== 0x7f && !BIDI.has(code);
  });
  return clean.join('').replace(/\s+/g, ' ').trim() || 'file';
}

function table(db: MockDb) {
  db.attachments ??= [];
  return db.attachments;
}

function activity(db: MockDb, taskId: string, actorId: string, type: string, data: unknown) {
  db.activities.push({ id: uid(db, 'actv'), taskId, actorId, type, data, createdAt: nowIso() });
}

/** ID-addressed: visible iff the caller can see the task; drafts only to their uploader; else 404. */
function visibleAttachment(db: MockDb, id: string, me: UserRow): { a: AttachmentRow; t: TaskRow } {
  const a = table(db).find((x) => x.id === id);
  if (!a || (a.draft && a.uploaderId !== me.id)) throw notFound();
  return { a, t: visibleTask(db, a.taskId, me) };
}

function canDelete(db: MockDb, a: AttachmentRow, t: TaskRow, me: UserRow) {
  if (a.uploaderId === me.id || roleIn(db, t.workspaceId, me.id) === 'ADMIN') return true;
  if (!t.projectId) return t.creatorId === me.id;
  return db.projectMembers.some((m) => m.projectId === t.projectId && m.userId === me.id && m.role === 'OWNER');
}

function touch(t: TaskRow) {
  t.updatedAt = nowIso();
}

export const attachmentRoutes: [string, string, Handler][] = [
  [
    'POST',
    '/tasks/:id/attachments',
    ({ db, me, params, query, body }) => {
      const t = visibleTask(db, params.id, me!);
      const draft = query.get('draft') === 'true';
      // Comment drafts need only comment access (everyone who can see the task); task-level needs edit.
      if (!draft) assertCanEditTask(db, t, me!);
      const file = (body as { file?: File } | undefined)?.file;
      if (!(file instanceof Blob)) throw new HttpError(400, 'VALIDATION', 'file is required', [{ path: ['file'], message: 'Required' }]);
      if (file.size > MOCK_MAX_UPLOAD_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The file is larger than 100 MB.');
      const canBlob = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
      const row: AttachmentRow = {
        id: uid(db, 'atch'),
        workspaceId: t.workspaceId,
        taskId: t.id,
        commentId: null,
        uploaderId: me!.id,
        kind: 'FILE',
        draft,
        createdAt: nowIso(),
        name: sanitizeName(file.name),
        mimeType: sniff(file),
        size: file.size,
        width: null,
        height: null,
        contentUrl: canBlob ? URL.createObjectURL(file) : null,
        url: null,
        title: null,
        description: null,
        siteName: null,
        provider: null,
        previewStatus: null,
      };
      table(db).push(row);
      if (!draft) {
        activity(db, t.id, me!.id, 'ATTACHMENT_ADDED', { attachmentId: row.id, kind: row.kind, name: row.name });
        touch(t);
      }
      return { status: 201, body: serializeAttachment(db, row) };
    },
  ],
  ['GET', '/attachments/:id', ({ db, me, params }) => serializeAttachment(db, visibleAttachment(db, params.id, me!).a)],
  [
    'DELETE',
    '/attachments/:id',
    ({ db, me, params }) => {
      const { a, t } = visibleAttachment(db, params.id, me!);
      if (!canDelete(db, a, t, me!)) throw forbidden();
      db.attachments = table(db).filter((x) => x.id !== a.id);
      if (!a.draft && !a.commentId) {
        activity(db, t.id, me!.id, 'ATTACHMENT_REMOVED', { kind: a.kind, name: a.kind === 'LINK' ? (a.title ?? a.url) : a.name });
        touch(t);
      }
      return { status: 204 };
    },
  ],
];
