import type { TokenScope } from '@/api/types';

export const SCOPE_LABEL: Record<TokenScope, string> = { READ: 'Read only', WRITE: 'Read & write' };

/** The MCP endpoint, from `GET /config`'s appUrl (SPEC §14 M1). */
export const mcpUrl = (appUrl: string) => `${appUrl.replace(/\/+$/, '')}/mcp`;

/** The Claude Code commands: the token inline, or read from an env var (keeps it out of shell history). */
export function claudeCodeCommands(url: string, token: string) {
  const add = `claude mcp add --transport http mekari-project ${url}`;
  return {
    inline: `${add} --header "Authorization: Bearer ${token}"`,
    env: `${add} --header "Authorization: Bearer $MEKARI_PROJECT_TOKEN"`,
  };
}
