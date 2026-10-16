import { setFetch } from '@/api/client';
import { createMockFetch } from './backend';
import { createSeedDb, type MockDb } from './db';

const STORAGE_KEY = 'asana-clone:mock-db:v1';

function load(): MockDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch {
    // fall through to a fresh seed
  }
  return createSeedDb();
}

function save(db: MockDb) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // storage full/blocked — mock still works in memory
  }
}

/** Route all API calls to the in-browser mock backend. Data persists in localStorage. */
export function enableMocking() {
  let db = load();
  setFetch(createMockFetch(() => db, { latencyMs: 120, onChange: save }));
  // Handy from devtools: __resetMockDb()
  (window as unknown as { __resetMockDb: () => void }).__resetMockDb = () => {
    db = createSeedDb();
    save(db);
    location.reload();
  };
  console.info('[mock] API is served by the in-browser mock backend. Log in as admin@example.com / password123');
}
