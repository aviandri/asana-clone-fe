import { fileURLToPath } from 'node:url';

/** Session cookie saved by global-setup.ts (git-ignored). Kept free of @playwright/test imports so the config can load it. */
export const STORAGE_STATE = fileURLToPath(new URL('./.auth/admin.json', import.meta.url));
