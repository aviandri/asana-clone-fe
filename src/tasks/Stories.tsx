import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Fragment, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { tasksApi } from '@/api/endpoints';
import { useProject, useUsers } from '@/api/hooks';
import { qk } from '@/api/queryKeys';
import type { ActivityStory, CommentStory, Story, TaskDetail, UserSummary } from '@/api/types';
import { useCurrentUser } from '@/auth/useAuth';
import { Avatar } from '@/components/Avatar';
import { Spinner } from '@/components/Spinner';
import { formatDue, timeAgo } from '@/lib/dates';
import { activeMentionQuery, mentionMarkup, tokenizeBody } from '@/lib/mentions';
import { PRIORITY_LABEL } from '@/lib/priority';
import { useCommentMutations } from './useCommentMutations';

/**
 * Renders a comment body safely: text, @mention chips and http(s) links — never raw HTML.
 * Chip labels come from the users list by id (the name in the body is author-controlled and could
 * be spoofed, e.g. `@[CEO](<bob's id>)`); the body name is only a fallback for unknown users.
 */
export function CommentBody({ body }: { body: string }) {
  const tokens = useMemo(() => tokenizeBody(body), [body]);
  const users = useUsers();
  const nameFor = (userId: string, fallback: string) => users.data?.find((u) => u.id === userId)?.name ?? fallback;
  return (
    <p className="whitespace-pre-wrap break-words text-sm text-gray-800">
      {tokens.map((t, i) => (
        <Fragment key={i}>
          {t.kind === 'text' && t.text}
          {t.kind === 'mention' && (
            <span className="rounded bg-primary-50 px-0.5 font-medium text-primary-700" data-user-id={t.userId}>
              @{nameFor(t.userId, t.name)}
            </span>
          )}
          {t.kind === 'link' && (
            <a href={t.href} target="_blank" rel="noopener noreferrer nofollow" className="text-primary-600 underline">
              {t.href}
            </a>
          )}
        </Fragment>
      ))}
    </p>
  );
}

function useActivityText() {
  const users = useUsers();
  const name = (id: string | null | undefined) => users.data?.find((u) => u.id === id)?.name ?? 'someone';
  return (s: ActivityStory, sectionName: (id: string | null) => string) => {
    const d = s.data ?? {};
    switch (s.type) {
      case 'CREATED':
        return 'created this task';
      case 'COMPLETED':
        return 'marked this task complete';
      case 'REOPENED':
        return 'marked this task incomplete';
      case 'ASSIGNED':
        return `assigned this task to ${name(d.assigneeId)}`;
      case 'UNASSIGNED':
        return 'unassigned this task';
      case 'DUE_DATE_CHANGED':
        return d.to ? `changed the due date to ${formatDue(d.to)}` : 'removed the due date';
      case 'MOVED_SECTION':
        return `moved this task from ${sectionName(d.fromSectionId)} to ${sectionName(d.toSectionId)}`;
      case 'RENAMED':
        return `changed the name to “${d.to ?? ''}”`;
      case 'PRIORITY_CHANGED':
        return d.to && d.to !== 'NONE'
          ? `changed the priority to ${PRIORITY_LABEL[d.to as keyof typeof PRIORITY_LABEL] ?? d.to}`
          : 'cleared the priority';
      case 'DESCRIPTION_CHANGED':
        return 'changed the description';
      default:
        return String(s.type).toLowerCase().replace(/_/g, ' ');
    }
  };
}

function CommentItem({ story, task }: { story: CommentStory; task: TaskDetail }) {
  const me = useCurrentUser();
  const { edit, remove } = useCommentMutations(task);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(story.body);
  const mine = story.author.id === me.id;
  const canDelete = mine || me.role === 'ADMIN';
  return (
    <li className="group flex gap-3 py-2">
      <Avatar user={story.author} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{story.author.name}</span>
          <time dateTime={story.createdAt} title={new Date(story.createdAt).toLocaleString()} className="text-xs text-gray-500">
            {timeAgo(story.createdAt)}
          </time>
          {story.editedAt && <span className="text-xs text-gray-500">(edited)</span>}
          <span className="flex-1" />
          {mine && !editing && (
            <button type="button" className="text-xs text-gray-500 opacity-0 hover:underline focus:opacity-100 group-hover:opacity-100" onClick={() => { setDraft(story.body); setEditing(true); }}>
              Edit
            </button>
          )}
          {canDelete && !editing && (
            <button
              type="button"
              className="text-xs text-red-600 opacity-0 hover:underline focus:opacity-100 group-hover:opacity-100"
              onClick={() => window.confirm('Delete this comment?') && remove.mutate(story.id)}
            >
              Delete
            </button>
          )}
        </div>
        {editing ? (
          <div className="mt-1">
            <textarea
              autoFocus
              aria-label="Edit comment"
              className="input min-h-[4rem]"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setEditing(false);
                }
              }}
            />
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                className="btn-primary py-1 text-xs"
                disabled={!draft.trim()}
                onClick={() => edit.mutate({ id: story.id, body: draft.trim() }, { onSuccess: () => setEditing(false) })}
              >
                Save
              </button>
              <button type="button" className="btn-ghost py-1 text-xs" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <CommentBody body={story.body} />
        )}
      </div>
    </li>
  );
}

/**
 * Comment box with @mention autocomplete. The textarea shows "@Name"; picked mentions are
 * remembered and converted to the API's `@[Name](userId)` syntax on submit.
 */
export function CommentComposer({ task }: { task: TaskDetail }) {
  const me = useCurrentUser();
  const users = useUsers();
  const { add } = useCommentMutations(task);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<UserSummary[]>([]);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [focused, setFocused] = useState(false);
  // Caret position to restore after inserting a mention, applied synchronously after the re-render
  // (a rAF could fire after the user has already typed more and jump the caret back).
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const pos = pendingCaret.current;
    if (pos === null || !ref.current) return;
    pendingCaret.current = null;
    ref.current.focus();
    ref.current.setSelectionRange(pos, pos);
  }, [text]);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return (users.data ?? []).filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().startsWith(q)).slice(0, 6);
  }, [mention, users.data]);

  const updateMention = (value: string, caret: number) => {
    const m = activeMentionQuery(value, caret);
    setMention(m);
    setHighlight(0);
  };

  const insertMention = (u: UserSummary) => {
    if (!mention) return;
    const caret = ref.current?.selectionStart ?? text.length;
    const insert = `@${u.name} `;
    const next = text.slice(0, mention.start) + insert + text.slice(caret);
    setText(next);
    setPicked((p) => (p.some((x) => x.id === u.id) ? p : [...p, u]));
    setMention(null);
    pendingCaret.current = mention.start + insert.length;
  };

  const toApiBody = (value: string) => {
    let out = value.trim();
    // Longest names first so "Al Smith" isn't consumed by "Al".
    for (const u of [...picked].sort((a, b) => b.name.length - a.name.length)) {
      out = out.split(`@${u.name}`).join(mentionMarkup(u));
    }
    return out;
  };

  const submit = () => {
    const body = toApiBody(text);
    if (!body) return;
    add.mutate(body, {
      onSuccess: () => {
        setText('');
        setPicked([]);
      },
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && suggestions.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(suggestions[highlight]);
        return;
      }
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (mention) setMention(null);
      else ref.current?.blur();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const expanded = focused || !!text;
  return (
    <div className="flex gap-3 border-t border-gray-200 bg-gray-50 px-6 py-3">
      <Avatar user={me} size="md" />
      <div className="relative min-w-0 flex-1">
        {mention && suggestions.length > 0 && (
          <ul role="listbox" aria-label="Mention someone" className="absolute bottom-full left-0 z-30 mb-1 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {suggestions.map((u, i) => (
              <li key={u.id} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  className={clsx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm', i === highlight ? 'bg-primary-50' : 'hover:bg-gray-100')}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMention(u)}
                >
                  <Avatar user={u} size="xs" />
                  <span className="truncate">{u.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          ref={ref}
          aria-label="Add a comment"
          placeholder="Add a comment… (type @ to mention, ⌘/Ctrl+Enter to send)"
          rows={expanded ? 3 : 1}
          className="input resize-none bg-white"
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setMention(null);
          }}
          onChange={(e) => {
            setText(e.target.value);
            updateMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
              updateMention(text, e.currentTarget.selectionStart ?? text.length);
            }
          }}
        />
        {expanded && (
          <div className="mt-2 flex items-center justify-end gap-2">
            {add.isError && <span role="alert" className="mr-auto text-xs text-red-600">Couldn’t post comment.</span>}
            <button
              type="button"
              className="btn-primary py-1"
              disabled={!text.trim() || add.isPending}
              onMouseDown={(e) => e.preventDefault()}
              onClick={submit}
            >
              Comment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function StoryFeed({ task }: { task: TaskDetail }) {
  const stories = useQuery({ queryKey: qk.stories(task.id), queryFn: () => tasksApi.stories(task.id).then((r) => r.data) });
  const project = useProject(task.projectId ?? undefined);
  const activityText = useActivityText();
  const [showActivity, setShowActivity] = useState(true);
  const sectionName = (id: string | null) =>
    id ? (project.data?.sections.find((s) => s.id === id)?.name ?? 'a deleted section') : 'no section';

  const items: Story[] = (stories.data ?? []).filter((s) => showActivity || s.kind === 'comment');

  return (
    <section aria-label="Comments and activity" className="mt-8 border-t border-gray-200 pt-4">
      <div className="mb-2 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-gray-700">Activity</h3>
        <div role="group" aria-label="Feed filter" className="flex rounded-md border border-gray-200 text-xs">
          <button type="button" aria-pressed={showActivity} className={clsx('px-2 py-0.5', showActivity && 'bg-gray-100 font-medium')} onClick={() => setShowActivity(true)}>
            All activity
          </button>
          <button type="button" aria-pressed={!showActivity} className={clsx('px-2 py-0.5', !showActivity && 'bg-gray-100 font-medium')} onClick={() => setShowActivity(false)}>
            Comments
          </button>
        </div>
      </div>
      {stories.isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">No comments yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((s) =>
            s.kind === 'comment' ? (
              <CommentItem key={s.id} story={s} task={task} />
            ) : (
              <li key={s.id} className="flex items-center gap-2 py-1.5 text-xs text-gray-500">
                <Avatar user={s.actor} size="xs" />
                <span>
                  <span className="font-medium text-gray-700">{s.actor.name}</span> {activityText(s, sectionName)}
                </span>
                <span aria-hidden>·</span>
                <time dateTime={s.createdAt}>{timeAgo(s.createdAt)}</time>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
