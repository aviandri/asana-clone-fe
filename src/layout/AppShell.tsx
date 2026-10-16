import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MenuIcon } from '@/components/icons';
import { TaskPanel } from '@/tasks/TaskPanel';
import { useTaskPanel } from '@/tasks/useTaskPanel';

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { taskId } = useTaskPanel();

  // Close the mobile drawer on navigation.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="flex h-full overflow-hidden">
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
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center border-b border-gray-200 px-2 py-1 md:hidden">
          <button className="btn-ghost p-2" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <MenuIcon />
          </button>
        </div>
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
  );
}
