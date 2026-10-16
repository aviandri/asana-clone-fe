import clsx from 'clsx';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useNotifications, useProjects, useTeams } from '@/api/hooks';
import type { Project, Team } from '@/api/types';
import { useAuth, useCurrentUser } from '@/auth/useAuth';
import { Avatar } from '@/components/Avatar';
import { Logo } from '@/components/Logo';
import { NewProjectDialog } from '@/projects/NewProjectDialog';
import { ProfileDialog } from './ProfileDialog';
import {
  BellIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  HomeIcon,
  LogoutIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
} from '@/components/icons';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function NavItem({ to, icon, children, end }: { to: string; icon: ReactNode; children: ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors',
          isActive ? 'bg-sidebar-active text-white' : 'text-sidebar-text hover:bg-sidebar-hover',
        )
      }
    >
      <span className="text-gray-400">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </NavLink>
  );
}

function TeamGroup({ team, projects }: { team: Pick<Team, 'id' | 'name'>; projects: Project[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div className="group flex items-center rounded-md pr-1 text-sm text-sidebar-text hover:bg-sidebar-hover">
        <button
          className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1.5 text-left"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
          <span className="truncate font-medium">{team.name}</span>
        </button>
        <Link
          to={`/teams/${team.id}`}
          className="rounded px-1.5 text-xs text-gray-400 opacity-0 hover:text-white focus:opacity-100 group-hover:opacity-100"
          aria-label={`Open team ${team.name}`}
        >
          ⋯
        </Link>
      </div>
      {open && (
        <ul className="ml-3 space-y-0.5">
          {projects.length === 0 && <li className="px-3 py-1 text-xs text-gray-500">No projects yet</li>}
          {projects.map((p) => (
            <li key={p.id}>
              <NavLink
                to={`/projects/${p.id}`}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-2 rounded-md px-3 py-1 text-sm',
                    isActive ? 'bg-sidebar-active text-white' : 'text-sidebar-text hover:bg-sidebar-hover',
                  )
                }
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: p.color }} />
                <span className="truncate">{p.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const teams = useTeams();
  const projects = useProjects();
  const notifications = useNotifications();
  const unread = notifications.data?.unreadCount ?? 0;
  const [newProject, setNewProject] = useState(false);
  const [profile, setProfile] = useState(false);

  const groups = useMemo(() => {
    const byTeam = new Map<string, Project[]>();
    for (const p of projects.data ?? []) {
      byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);
    }
    // Teams with visible projects, plus empty teams the user can see.
    return (teams.data ?? [])
      .map((t) => ({ team: t, projects: byTeam.get(t.id) ?? [] }))
      .sort((a, b) => a.team.name.localeCompare(b.team.name));
  }, [teams.data, projects.data]);

  return (
    <nav aria-label="Main" className="flex h-full flex-col bg-sidebar text-sidebar-text">
      <div className="flex items-center gap-2 px-4 py-4">
        <Logo className="h-6 w-6" />
        <span className="font-semibold text-white">Asana Clone</span>
      </div>

      <div className="px-2 pb-3">
        <button
          type="button"
          onClick={onSearch}
          className="flex w-full items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/15"
        >
          <SearchIcon className="h-4 w-4" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border border-white/20 px-1 text-[10px] text-gray-400">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
      </div>

      <div className="space-y-0.5 px-2">
        <NavItem to="/" end icon={<HomeIcon />}>
          Home
        </NavItem>
        <NavItem to="/my-tasks" icon={<CheckCircleIcon />}>
          My tasks
        </NavItem>
        <NavItem to="/inbox" icon={<BellIcon />}>
          <span className="flex items-center justify-between">
            Inbox
            {unread > 0 && (
              <span
                className="ml-2 rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white"
                aria-label={`${unread} unread`}
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </span>
        </NavItem>
        {user.role === 'ADMIN' && (
          <NavItem to="/admin" icon={<ShieldIcon />}>
            Admin
          </NavItem>
        )}
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-2">
        <div className="mb-1 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <span className="flex-1">Teams</span>
          <Link to="/teams" className="normal-case tracking-normal hover:text-white">
            Browse
          </Link>
          <button
            type="button"
            aria-label="New project"
            title="New project"
            className="rounded p-0.5 hover:bg-sidebar-hover hover:text-white"
            onClick={() => setNewProject(true)}
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-1">
          {groups.map((g) => (
            <TeamGroup key={g.team.id} team={g.team} projects={g.projects} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-white/10 px-3 py-3">
        <button
          type="button"
          aria-label="My profile"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left hover:bg-sidebar-hover"
          onClick={() => setProfile(true)}
        >
          <Avatar user={user} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-white">{user.name}</span>
            <span className="block truncate text-xs text-gray-400">{user.email}</span>
          </span>
        </button>
        <button
          className="rounded p-1.5 text-gray-400 hover:bg-sidebar-hover hover:text-white"
          onClick={() => void logout()}
          aria-label="Log out"
          title="Log out"
        >
          <LogoutIcon />
        </button>
      </div>
      {newProject && <NewProjectDialog open onClose={() => setNewProject(false)} />}
      {profile && <ProfileDialog onClose={() => setProfile(false)} />}
    </nav>
  );
}
