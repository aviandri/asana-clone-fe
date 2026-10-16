import { Outlet, type RouteObject } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthProvider';
import { RedirectIfAuthed, RequireAdmin, RequireAuth } from '@/auth/guards';
import { AppShell } from '@/layout/AppShell';
import { AcceptInvitePage } from '@/pages/AcceptInvitePage';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { MyTasksPage } from '@/pages/MyTasksPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { ProjectPage } from '@/projects/ProjectPage';

export const routes: RouteObject[] = [
  {
    element: (
      <AuthProvider>
        <Outlet />
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
          { path: 'inbox', element: <PlaceholderPage title="Inbox" /> },
          { path: 'teams', element: <PlaceholderPage title="Teams" /> },
          { path: 'teams/:teamId', element: <PlaceholderPage title="Team" /> },
          { path: 'projects/:projectId/:view?', element: <ProjectPage /> },
          {
            path: 'admin',
            element: (
              <RequireAdmin>
                <PlaceholderPage title="Admin" />
              </RequireAdmin>
            ),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
