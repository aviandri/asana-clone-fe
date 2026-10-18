// The current workspace is per tab (SPEC §12): module state, seeded from localStorage so a new tab
// opens where you last were. Every API request sends it as `X-Workspace-Id`.
export const WORKSPACE_STORAGE_KEY = 'mekari-project:workspace';

function readStored(): string | null {
  try {
    return localStorage.getItem(WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

let current: string | null = readStored();

export function getWorkspaceId(): string | null {
  return current;
}

/** Set this tab's workspace (and remember it for new tabs). `null` clears it. */
export function setWorkspaceId(id: string | null) {
  current = id;
  try {
    if (id) localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
    else localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  } catch {
    // storage blocked: the tab still works, new tabs fall back to the server's last workspace
  }
}

/** Re-read localStorage (tests, and after logout). */
export function resetWorkspaceId() {
  current = readStored();
}
