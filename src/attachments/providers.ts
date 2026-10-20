/**
 * The §13 link providers, as neutral app-drawn badges (A11: initials + name, no third-party logos;
 * the Mac and Android apps use the same set). Unknown providers get the generic link icon.
 */
export type ProviderBadge = { name: string; initials: string; tone: string };

export const PROVIDER_BADGES: Record<string, ProviderBadge> = {
  google_drive: { name: 'Google Drive', initials: 'Dr', tone: 'bg-green-600' },
  google_docs: { name: 'Google Docs', initials: 'Do', tone: 'bg-sky-600' },
  google_sheets: { name: 'Google Sheets', initials: 'Sh', tone: 'bg-emerald-600' },
  google_slides: { name: 'Google Slides', initials: 'Sl', tone: 'bg-amber-500' },
  dropbox: { name: 'Dropbox', initials: 'Db', tone: 'bg-sky-700' },
  onedrive: { name: 'OneDrive', initials: 'Od', tone: 'bg-sky-500' },
  box: { name: 'Box', initials: 'Bx', tone: 'bg-sky-800' },
  figma: { name: 'Figma', initials: 'Fg', tone: 'bg-violet-600' },
  youtube: { name: 'YouTube', initials: 'Yt', tone: 'bg-red-600' },
  loom: { name: 'Loom', initials: 'Lm', tone: 'bg-indigo-600' },
  github: { name: 'GitHub', initials: 'Gh', tone: 'bg-gray-900' },
  gitlab: { name: 'GitLab', initials: 'Gl', tone: 'bg-orange-600' },
  notion: { name: 'Notion', initials: 'No', tone: 'bg-gray-800' },
  miro: { name: 'Miro', initials: 'Mi', tone: 'bg-yellow-500' },
  jira: { name: 'Jira', initials: 'Ji', tone: 'bg-blue-700' },
  confluence: { name: 'Confluence', initials: 'Cf', tone: 'bg-blue-600' },
  slack: { name: 'Slack', initials: 'Sk', tone: 'bg-fuchsia-700' },
  zoom: { name: 'Zoom', initials: 'Zm', tone: 'bg-blue-500' },
};

export const providerBadge = (provider: string | null | undefined): ProviderBadge | null =>
  (provider && PROVIDER_BADGES[provider]) || null;
