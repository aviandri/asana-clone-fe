import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useNotifications, useProjects, useTeams } from '@/api/hooks';
import type { Project, Team } from '@/api/types';
import { useAuth, useCurrentUser } from '@/auth/useAuth';
import { Avatar } from '@/components/Avatar';
import { NewProjectDialog } from '@/projects/NewProjectDialog';
import { CreateWorkspaceDialog } from '@/workspace/CreateWorkspaceDialog';
import { WorkspaceSwitcher } from '@/workspace/WorkspaceSwitcher';
import { ProfileDialog } from './ProfileDialog';
import {
  BellIcon,
  ChartIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  HomeIcon,
  LogoutIcon,
  PlusIcon,
  SettingsIcon,
  TargetIcon,
} from '@/components/icons';

// Dark, Slack-like shell. Colours are sidebar tokens (index.css); every pairing is ≥ 4.5:1 for
// text. The active item is also marked by a left accent bar so state isn't conveyed by colour alone.
const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring';
const itemBase = clsx(
  'relative flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors duration-150',
  "before:absolute before:-left-2 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-r before:bg-white before:opacity-0 before:transition-opacity before:content-['']",
  focusRing,
);
const itemState = (active: boolean) =>
  active ? 'bg-sidebar-active font-medium text-white before:opacity-100' : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white';

function NavItem({ to, icon, children, end }: { to: string; icon: ReactNode; children: ReactNode; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => clsx(itemBase, itemState(isActive))}>
      {({ isActive }) => (
        <>
          <span className={clsx('shrink-0', isActive ? 'text-white' : 'text-sidebar-muted')}>{icon}</span>
          <span className="min-w-0 flex-1 truncate">{children}</span>
        </>
      )}
    </NavLink>
  );
}

function ProjectLink({ project: p }: { project: Project }) {
  return (
    <li>
      <NavLink to={`/projects/${p.id}`} className={({ isActive }) => clsx(itemBase, 'gap-2 py-1', itemState(isActive))}>
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-white/20" style={{ backgroundColor: p.color }} />
        <span className="truncate">{p.name}</span>
      </NavLink>
    </li>
  );
}

function TeamGroup({ team, projects }: { team: Pick<Team, 'id' | 'name'>; projects: Project[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div className="group flex items-center rounded-md pr-1 text-sm text-sidebar-text hover:bg-sidebar-hover">
        <button
          className={clsx('flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1.5 text-left', focusRing)}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDownIcon className="h-3.5 w-3.5 text-sidebar-muted" /> : <ChevronRightIcon className="h-3.5 w-3.5 text-sidebar-muted" />}
          <span className="truncate font-medium">{team.name}</span>
        </button>
        <Link
          to={`/teams/${team.id}`}
          className={clsx('rounded px-1.5 text-xs text-sidebar-muted opacity-0 hover:text-white focus:opacity-100 group-hover:opacity-100', focusRing)}
          aria-label={`Open team ${team.name}`}
        >
          ⋯
        </Link>
      </div>
      {open && (
        <ul className="ml-3 space-y-0.5">
          {projects.length === 0 && <li className="px-3 py-1 text-xs text-sidebar-muted">No projects yet</li>}
          {projects.map((p) => (
            <ProjectLink key={p.id} project={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Inbox count; pops when new items arrive after the first load (not on load, not when the count
 * drops). The class is removed on animationend, so the element is never remounted.
 */
function UnreadBadge({ count }: { count: number | undefined }) {
  const prev = useRef<number | undefined>(count);
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    if (prev.current !== undefined && count !== undefined && count > prev.current) setPopping(true);
    prev.current = count;
  }, [count]);
  if (!count) return null;
  return (
    <span
      onAnimationEnd={() => setPopping(false)}
      className={clsx(
        'ml-2 inline-block min-w-[1.25rem] rounded-full bg-badge px-1.5 text-center text-[11px] font-semibold leading-5 text-white',
        popping && 'animate-pop motion-reduce:animate-none',
      )}
      aria-label={`${count} unread`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function Sidebar() {
  const user = useCurrentUser();
  // Guests (SPEC §12) see only their projects: no teams, goals or project creation.
  const isGuest = user.role === 'GUEST';
  const { logout } = useAuth();
  const teams = useTeams();
  const projects = useProjects();
  const notifications = useNotifications();
  const unread = notifications.data?.unreadCount;
  const [newProject, setNewProject] = useState(false);
  const [profile, setProfile] = useState(false);
  const [creatingWs, setCreatingWs] = useState(false);

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
      <WorkspaceSwitcher />

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
            <UnreadBadge count={unread} />
          </span>
        </NavItem>
        {!isGuest && (
          <NavItem to="/goals" icon={<TargetIcon />}>
            Goals
          </NavItem>
        )}
        <NavItem to="/reporting" icon={<ChartIcon />}>
          Reporting
        </NavItem>
        {user.role === 'ADMIN' && (
          <NavItem to="/workspace/settings" icon={<SettingsIcon />}>
            Workspace settings
          </NavItem>
        )}
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {isGuest ? (
          <>
            <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-sidebar-muted">Projects</div>
            <ul className="space-y-0.5">
              {(projects.data ?? []).map((p) => (
                <ProjectLink key={p.id} project={p} />
              ))}
              {projects.data?.length === 0 && <li className="px-3 py-1 text-xs text-sidebar-muted">No projects shared with you yet</li>}
            </ul>
            <p className="mx-1 mt-4 rounded-md bg-white/5 px-3 py-2 text-xs leading-relaxed text-sidebar-muted">
              {`You're a guest in ${user.currentWorkspace?.name}.`} You can see the projects you’ve been added to.
            </p>
          </>
        ) : (
          <>
            <div className="mb-1 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
              <span className="flex-1">Teams</span>
              <Link to="/teams" className={clsx('rounded normal-case tracking-normal hover:text-white', focusRing)}>
                Browse
              </Link>
              <button
                type="button"
                aria-label="New project"
                title="New project"
                className={clsx('rounded p-0.5 hover:bg-sidebar-hover hover:text-white', focusRing)}
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
          </>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-white/10 px-3 py-3">
        <button
          type="button"
          aria-label="My profile"
          className={clsx('flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left hover:bg-sidebar-hover', focusRing)}
          onClick={() => setProfile(true)}
        >
          <Avatar user={user} size="md" className="ring-2 ring-white/20" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-white">{user.name}</span>
            <span className="block truncate text-xs text-sidebar-muted">{user.email}</span>
          </span>
        </button>
        <button
          className={clsx('rounded p-1.5 text-sidebar-muted hover:bg-sidebar-hover hover:text-white', focusRing)}
          onClick={() => void logout()}
          aria-label="Log out"
          title="Log out"
        >
          <LogoutIcon />
        </button>
      </div>
      {newProject && <NewProjectDialog open onClose={() => setNewProject(false)} />}
      {profile && <ProfileDialog onClose={() => setProfile(false)} onCreateWorkspace={() => setCreatingWs(true)} />}
      <CreateWorkspaceDialog open={creatingWs} onClose={() => setCreatingWs(false)} />
    </nav>
  );
}
