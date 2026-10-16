import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { tasksApi } from '@/api/endpoints';
import { useProjects } from '@/api/hooks';
import { qk } from '@/api/queryKeys';
import { useCurrentUser } from '@/auth/useAuth';
import { Spinner } from '@/components/Spinner';
import { formatDue, dueTone } from '@/lib/dates';

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function HomePage() {
  const user = useCurrentUser();
  const now = new Date();
  const myTasks = useQuery({
    queryKey: qk.myTasks,
    queryFn: () => tasksApi.mine({ completed: false }).then((r) => r.data),
  });
  const projects = useProjects();

  const upcoming = [...(myTasks.data ?? [])]
    .filter((t) => !t.completed)
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    .slice(0, 8);

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-center text-sm text-gray-500">{format(now, 'EEEE, MMMM d')}</p>
        <h1 className="mt-1 text-center text-3xl font-normal text-gray-900">
          {greeting(now)}, {user.name.split(' ')[0]}
        </h1>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">My tasks</h2>
              <Link to="/my-tasks" className="text-sm text-blue-600 hover:underline">
                View all
              </Link>
            </div>
            {myTasks.isLoading ? (
              <Spinner />
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-gray-500">You’re all caught up. 🎉</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {upcoming.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/my-tasks?task=${t.id}`}
                      className="flex items-center gap-3 rounded px-1 py-2 text-sm hover:bg-gray-50"
                    >
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      {t.project && (
                        <span className="hidden max-w-[10rem] truncate rounded px-1.5 py-0.5 text-xs text-gray-600 sm:inline" style={{ backgroundColor: `${t.project.color}22` }}>
                          {t.project.name}
                        </span>
                      )}
                      {t.dueDate && (
                        <span className={`shrink-0 text-xs ${dueTone(t.dueDate, t.completed)}`}>{formatDue(t.dueDate)}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 font-semibold">Projects</h2>
            {projects.isLoading ? (
              <Spinner />
            ) : (projects.data ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">No projects yet.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {(projects.data ?? []).map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/projects/${p.id}`}
                      className="flex items-center gap-3 rounded-lg border border-transparent p-2 hover:border-gray-200 hover:bg-gray-50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg font-semibold text-white" style={{ backgroundColor: p.color }}>
                        {p.name[0]?.toUpperCase()}
                      </span>
                      <span className="truncate text-sm font-medium">{p.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
