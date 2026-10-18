import { lazy, Suspense } from 'react';
import { Outlet, type RouteObject } from 'react-router-dom';
import { AdminPage } from '@/admin/AdminPage';
import { GoalDetailPage } from '@/goals/GoalDetailPage';
import { GoalsPage } from '@/goals/GoalsPage';
import { AuthProvider } from '@/auth/AuthProvider';
import { RedirectIfAuthed, RequireAdmin, RequireAuth } from '@/auth/guards';
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
            <AppShell />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <HomePage /> },
          { path: 'my-tasks', element: <MyTasksPage /> },
          { path: 'inbox', element: <InboxPage /> },
          { path: 'goals', element: <GoalsPage /> },
          {
            path: 'reporting',
            element: (
              <Suspense fallback={<FullPageSpinner />}>
                <ReportingPage />
              </Suspense>
            ),
          },
          { path: 'goals/:goalId', element: <GoalDetailPage /> },
          { path: 'teams', element: <TeamsPage /> },
          { path: 'teams/:teamId', element: <TeamPage /> },
          { path: 'projects/:projectId/:view?', element: <ProjectPage /> },
          {
            path: 'admin',
            element: (
              <RequireAdmin>
                <AdminPage />
              </RequireAdmin>
            ),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
