import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useCurrentUser } from '@/auth/useAuth';
import { AppIcon, MekariLockup } from '@/components/brand/Brand';
import { MenuIcon, SearchIcon } from '@/components/icons';
import { Toaster } from '@/components/Toaster';
import { SearchPalette } from '@/search/SearchPalette';
import { TaskPanel } from '@/tasks/TaskPanel';
import { useTaskPanel } from '@/tasks/useTaskPanel';
import { DUR, EASE_OUT, exit, panelSpring } from '@/motion/tokens';
import { useWorkspaceHotkeys } from '@/workspace/useWorkspace';
import { WorkspaceRail } from '@/workspace/WorkspaceRail';
import { useNoFileNavigation } from '@/attachments/useFileDrop';

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
      <Link
        to="/"
        aria-label="Mekari Project home"
        className="hidden shrink-0 items-center gap-2 rounded-md px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring md:flex"
      >
        <AppIcon className="h-6 w-6" />
        <MekariLockup variant="dark" className="hidden lg:inline-flex" />
      </Link>
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
      <span className="hidden w-6 md:block lg:w-[190px]" aria-hidden />
    </header>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { taskId } = useTaskPanel();
  const section = location.pathname.split('/')[1] || 'home';
  const [searchOpen, setSearchOpen] = useState(false);
  const me = useCurrentUser();
  // Everything below the rail belongs to one workspace: remount (fresh queries) on switch.
  const wsKey = me.currentWorkspace?.id ?? 'none';
  const showRail = me.workspaces.length >= 2;
  const workspaceHotkey = useWorkspaceHotkeys();
  // A file dropped anywhere but an attachment target does nothing (instead of the browser opening it).
  useNoFileNavigation();
  const prevWs = useRef(wsKey);
  const justSwitched = prevWs.current !== wsKey;
  useEffect(() => {
    prevWs.current = wsKey;
  }, [wsKey]);

  // Global shortcuts (work even while typing elsewhere): Cmd/Ctrl+K search, Cmd/Ctrl+1…9 workspaces.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      } else {
        workspaceHotkey(e);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [workspaceHotkey]);

  // Close the mobile drawer on navigation.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-sidebar">
      <TopBar onMenu={() => setMobileOpen(true)} onSearch={() => setSearchOpen(true)} />
      <div className="flex min-h-0 flex-1">
        {/* Desktop rail + sidebar */}
        <div className="hidden shrink-0 md:flex">
          {showRail && <WorkspaceRail />}
          <m.div key={wsKey} className="w-60" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: DUR.slow, ease: EASE_OUT } }}>
            <Sidebar />
          </m.div>
        </div>
        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <div className="relative flex h-full">
              {showRail && <WorkspaceRail />}
              <div className="w-64">
                <Sidebar key={wsKey} />
              </div>
            </div>
          </div>
        )}
        {/* Content sits on a light card inset into the dark frame, like Slack. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white md:rounded-tl-lg">
          <div className="relative flex min-h-0 flex-1">
            {/* 120ms fade between sections (not between a project's views — no remount); a slower
                fade-and-settle on workspace switch. Reduced motion keeps only the opacity fade. */}
            <m.main
              key={`${wsKey}:${section}`}
              className="min-w-0 flex-1 overflow-hidden"
              initial={justSwitched ? { opacity: 0, scale: 0.995 } : { opacity: 0 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: justSwitched ? DUR.slow : DUR.fast, ease: EASE_OUT } }}
            >
              <Outlet />
            </m.main>
            <AnimatePresence>
              {taskId && (
                <m.aside
                  key="task-panel"
                  initial={{ x: 48, opacity: 0 }}
                  animate={{ x: 0, opacity: 1, transition: panelSpring }}
                  exit={{ x: 32, opacity: 0, transition: exit }}
                  className="absolute inset-y-0 right-0 z-20 w-full border-l border-gray-200 bg-white shadow-xl sm:w-[32rem] lg:static lg:w-[36rem] lg:shrink-0 lg:shadow-none"
                >
                  <TaskPanel key={taskId} taskId={taskId} />
                </m.aside>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <Toaster />
    </div>
  );
}
