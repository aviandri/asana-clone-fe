import { lazy, Suspense } from 'react';
import { Navigate, Outlet, type RouteObject } from 'react-router-dom';
import { GoalDetailPage } from '@/goals/GoalDetailPage';
import { GoalsPage } from '@/goals/GoalsPage';
import { AuthProvider } from '@/auth/AuthProvider';
import { NotForGuests, RedirectIfAuthed, RequireAdmin, RequireAuth, RequireWorkspace } from '@/auth/guards';
import { FullPageSpinner } from '@/components/Spinner';
import { AppShell } from '@/layout/AppShell';
import { MotionRoot } from '@/motion/MotionRoot';
import { AcceptInvitePage } from '@/pages/AcceptInvitePage';
import { HomePage } from '@/pages/HomePage';
import { InboxPage } from '@/pages/InboxPage';
import { LoginPage } from '@/pages/LoginPage';
import { MyTasksPage } from '@/pages/MyTasksPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProjectPage } from '@/projects/ProjectPage';
import { TeamPage } from '@/teams/TeamPage';
import { TeamsPage } from '@/teams/TeamsPage';
import { OnboardingPage } from '@/workspace/OnboardingPage';
import { WorkspaceSettingsPage } from '@/workspace/settings/WorkspaceSettingsPage';

// Charts (Recharts) load only when reporting is opened.
const ReportingPage = lazy(() => import('@/reporting/ReportingPage'));

export const routes: RouteObject[] = [
  {
    element: (
      <AuthProvider>
        <MotionRoot>
          <Outlet />
        </MotionRoot>
      </AuthProvider>
    ),
    children: [
      {
        path: '/login',
        element: (
          <RedirectIfAuthed>
            <LoginPage />
          </RedirectIfAuthed>
        ),
      },
      { path: '/invite/:token', element: <AcceptInvitePage /> },
      {
        element: (
          <RequireAuth>
            <RequireWorkspace fallback={<OnboardingPage />}>
              <AppShell />
            </RequireWorkspace>
          </RequireAuth>
        ),
        children: [
          { index: true, element: <HomePage /> },
          { path: 'my-tasks', element: <MyTasksPage /> },
          { path: 'inbox', element: <InboxPage /> },
          { path: 'goals', element: <NotForGuests what="Goals"><GoalsPage /></NotForGuests> },
          {
            path: 'reporting',
            element: (
              <Suspense fallback={<FullPageSpinner />}>
                <ReportingPage />
              </Suspense>
            ),
          },
          { path: 'goals/:goalId', element: <NotForGuests what="Goals"><GoalDetailPage /></NotForGuests> },
          { path: 'teams', element: <NotForGuests what="Teams"><TeamsPage /></NotForGuests> },
          { path: 'teams/:teamId', element: <NotForGuests what="Teams"><TeamPage /></NotForGuests> },
          { path: 'projects/:projectId/:view?', element: <ProjectPage /> },
          {
            path: 'workspace/settings',
            element: (
              <RequireAdmin>
                <WorkspaceSettingsPage />
              </RequireAdmin>
            ),
          },
          // Pre-v1.2 URL.
          { path: 'admin', element: <Navigate to="/workspace/settings" replace /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
