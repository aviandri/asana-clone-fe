import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';
import { notificationsApi } from '@/api/endpoints';
import { useNotifications } from '@/api/hooks';
import { qk } from '@/api/queryKeys';
import type { Notification, NotificationsResponse } from '@/api/types';
import { Avatar } from '@/components/Avatar';
import { EmptyState, ErrorState } from '@/components/PageHeader';
import { ListSkeleton } from '@/components/Skeleton';
import { timeAgo } from '@/lib/dates';
import { useTaskPanel } from '@/tasks/useTaskPanel';
import { enter, exit, staggerDelay } from '@/motion/tokens';

const VERB: Record<Notification['type'], string> = {
  ASSIGNED: 'assigned you to',
  COMMENTED: 'commented on',
  COMPLETED: 'completed',
  MENTIONED: 'mentioned you in',
};

function useMarkRead() {
  const qc = useQueryClient();
  const patch = (fn: (r: NotificationsResponse) => NotificationsResponse) =>
    qc.setQueryData<NotificationsResponse>(qk.notifications, (r) => (r ? fn(r) : r));
  const one = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onMutate: (id) =>
      patch((r) => {
        const target = r.data.find((n) => n.id === id);
        if (!target || target.read) return r;
        return { unreadCount: Math.max(0, r.unreadCount - 1), data: r.data.map((n) => (n.id === id ? { ...n, read: true } : n)) };
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
  const all = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onMutate: () => patch((r) => ({ unreadCount: 0, data: r.data.map((n) => ({ ...n, read: true })) })),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
  return { one, all };
}

export function InboxPage() {
  const notifications = useNotifications();
  const { one, all } = useMarkRead();
  const panel = useTaskPanel();
  const [tab, setTab] = useState<'all' | 'unread'>('all');

  const list = (notifications.data?.data ?? []).filter((n) => tab === 'all' || !n.read);
  const unread = notifications.data?.unreadCount ?? 0;

  const openItem = (n: Notification) => {
    if (!n.read) one.mutate(n.id);
    if (n.task) panel.open(n.task.id);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-200 px-6 pt-4">
        <div className="flex items-center gap-3 pb-3">
          <h1 className="flex-1 text-xl font-semibold text-gray-900">Inbox</h1>
          <button type="button" className="btn-secondary py-1 text-xs" disabled={unread === 0 || all.isPending} onClick={() => all.mutate()}>
            Mark all as read
          </button>
        </div>
        <nav aria-label="Inbox filter" className="flex gap-4">
          {(['all', 'unread'] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
              className={clsx('-mb-px border-b-2 px-1 pb-2 text-sm', tab === t ? 'border-gray-900 font-medium' : 'border-transparent text-gray-500 hover:text-gray-800')}
            >
              {t === 'all' ? 'All' : `Unread${unread ? ` (${unread})` : ''}`}
            </button>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {notifications.isLoading ? (
          <ListSkeleton label="Loading notifications" rows={6} />
        ) : notifications.isError ? (
          <ErrorState error={notifications.error} />
        ) : list.length === 0 ? (
          <EmptyState illustration="inbox" title={tab === 'unread' ? 'No unread notifications' : 'Your inbox is empty'}>
            {tab === 'unread' ? 'You’re all caught up — nice work. ' : 'Nothing here yet. '}
            We’ll let you know when someone assigns you a task, mentions you, or comments on something you follow.
          </EmptyState>
        ) : (
          <ul aria-label="Notifications" className="mx-auto max-w-3xl divide-y divide-gray-100 px-4 py-2">
            <AnimatePresence initial={false}>
            {list.map((n, i) => (
              <m.li
                key={n.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0, transition: { ...enter, delay: staggerDelay(i) } }}
                exit={{ opacity: 0, x: 24, transition: exit }}
                className={clsx('group flex items-start gap-3 rounded-lg px-3 py-3 transition-colors duration-150', !n.read && 'bg-primary-50/60', n.task && panel.taskId === n.task.id && 'ring-1 ring-primary-300')}
              >
                <span className={clsx('mt-2 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary-600')} aria-label={n.read ? undefined : 'Unread'} />
                <Avatar user={n.actor} size="md" />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    disabled={!n.task}
                    className="block w-full text-left text-sm disabled:cursor-default"
                    onClick={() => openItem(n)}
                  >
                    <span className="font-semibold">{n.actor.name}</span> {VERB[n.type]}{' '}
                    {n.task ? <span className="font-medium text-primary-700 group-hover:underline">{n.task.title}</span> : <span className="italic text-gray-500">a deleted task</span>}
                  </button>
                  <time dateTime={n.createdAt} className="text-xs text-gray-500">
                    {timeAgo(n.createdAt)}
                  </time>
                </div>
                {!n.read && (
                  <button type="button" className="shrink-0 rounded px-2 py-1 text-xs text-gray-500 hover:bg-white hover:text-gray-800" onClick={() => one.mutate(n.id)}>
                    Mark as read
                  </button>
                )}
              </m.li>
            ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}
