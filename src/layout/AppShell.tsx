import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AppIcon } from '@/components/brand/Brand';
import { MenuIcon, SearchIcon } from '@/components/icons';
import { Toaster } from '@/components/Toaster';
import { SearchPalette } from '@/search/SearchPalette';
import { TaskPanel } from '@/tasks/TaskPanel';
import { useTaskPanel } from '@/tasks/useTaskPanel';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Slack-style top bar: full width, darker purple, centred ⌘K search. */
function TopBar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 bg-sidebar-top px-2 md:px-3">
      <button
        className="rounded p-2 text-sidebar-text outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sidebar-ring md:hidden"
        aria-label="Open navigation"
        onClick={onMenu}
      >
        <MenuIcon />
      </button>
      <AppIcon className="hidden h-6 w-6 md:block" />
      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={onSearch}
          className="flex h-7 w-full max-w-xl items-center gap-2 rounded-md bg-white/15 px-3 text-sm text-sidebar-text outline-none transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">Search Mekari Project</span>
          <kbd className="rounded border border-white/25 px-1 font-sans text-[10px] text-sidebar-muted">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
      </div>
      <span className="hidden w-6 md:block" aria-hidden />
    </header>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { taskId } = useTaskPanel();
  const [searchOpen, setSearchOpen] = useState(false);

  // Global search: Cmd/Ctrl+K (works even while typing elsewhere).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Close the mobile drawer on navigation.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-sidebar">
      <TopBar onMenu={() => setMobileOpen(true)} onSearch={() => setSearchOpen(true)} />
      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <div className="hidden w-60 shrink-0 md:block">
          <Sidebar />
        </div>
        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <div className="relative h-full w-64">
              <Sidebar />
            </div>
          </div>
        )}
        {/* Content sits on a light card inset into the dark frame, like Slack. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white md:rounded-tl-lg">
          <div className="relative flex min-h-0 flex-1">
            <main className="min-w-0 flex-1 overflow-hidden">
              <Outlet />
            </main>
            {taskId && (
              <aside
                key={taskId}
                className="absolute inset-y-0 right-0 z-20 w-full border-l border-gray-200 bg-white shadow-xl sm:w-[32rem] lg:static lg:w-[36rem] lg:shrink-0 lg:shadow-none"
              >
                <TaskPanel taskId={taskId} />
              </aside>
            )}
          </div>
        </div>
      </div>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <Toaster />
    </div>
  );
}
