import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { expect, test, uniq } from '../fixtures';

type Attachment = { id: string; name: string | null; mimeType: string | null; hasThumbnail: boolean; contentPath: string | null };

/** A w×h truecolour PNG encoded with plain zlib, so the test needs no image library. */
function makePng(w: number, h: number): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) row.set([Math.floor((x * 255) / w), 37, 127], 1 + x * 3);
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('attaches files to a task, previews, downloads and deletes them (SPEC §13)', async ({ authedPage: page, api }) => {
  const project = await api.createProject(uniq('E2E attachments'));
  const task = await api.createTask({ title: uniq('Has files'), projectId: project.id });
  const attachments = async () =>
    ((await (await page.request.get(`/api/v1/tasks/${task.id}`)).json()) as { attachments: Attachment[] }).attachments;
  const png = makePng(320, 200);

  await page.goto(`/projects/${project.id}/list?task=${task.id}`);
  const panel = page.getByRole('dialog', { name: task.title });
  const section = panel.getByRole('region', { name: 'Attachments' });
  await expect(section).toBeVisible();

  // Attach file → the hidden picker; two files at once.
  await section.getByLabel('Choose files to attach').setInputFiles([
    { name: 'mockup.png', mimeType: 'image/png', buffer: png },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('release notes\n') },
  ]);
  await expect(section.getByRole('heading', { name: /Attachments\s*2/ })).toBeVisible();
  await expect.poll(async () => (await attachments()).map((a) => a.name).sort()).toEqual(['mockup.png', 'notes.txt']);

  // The PNG tile shows the server thumbnail, and it actually decodes.
  const tile = section.getByRole('button', { name: /^Attachment, mockup\.png/ });
  const thumb = tile.locator('img');
  await expect(thumb).toHaveAttribute('src', /\/api\/v1\/attachments\/[^/]+\/thumbnail/);
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);

  // Preview: the viewer shows the full image; Download points at ?download=1 and serves the same bytes.
  await tile.click();
  const viewer = page.getByRole('dialog', { name: 'mockup.png' });
  await expect(viewer).toBeVisible();
  const full = viewer.locator('img').first();
  await expect.poll(() => full.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(320);
  const href = await viewer.getByRole('link', { name: 'Download' }).getAttribute('href');
  expect(href).toMatch(/\/content\?download=1$/);
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-disposition']).toMatch(/^attachment;/);
  expect(Buffer.from(await res.body()).equals(png)).toBe(true);

  // Delete from the viewer (confirm dialog), the tile and the row go.
  page.once('dialog', (d) => void d.accept());
  await viewer.getByRole('button', { name: 'Delete' }).click();
  await expect(viewer).toBeHidden();
  await expect(tile).toBeHidden();
  await expect.poll(async () => (await attachments()).map((a) => a.name)).toEqual(['notes.txt']);
  await expect(section.getByRole('heading', { name: /Attachments\s*1/ })).toBeVisible();

  // Over 100 MB is refused before any upload (SPEC §13 A1), with a message.
  const dir = mkdtempSync(join(tmpdir(), 'e2e-attach-'));
  try {
    const big = join(dir, 'too-big.bin');
    writeFileSync(big, Buffer.alloc(104_857_601));
    await section.getByLabel('Choose files to attach').setInputFiles(big);
    await expect(section.getByRole('alert')).toContainText('larger than 100 MB');
    expect((await attachments()).map((a) => a.name)).toEqual(['notes.txt']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  await api.deleteProject(project.id);
});
