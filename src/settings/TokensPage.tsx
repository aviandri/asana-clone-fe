import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { differenceInCalendarDays, format, isSameYear } from 'date-fns';
import { useState, type FormEvent, type ReactNode } from 'react';
import { configApi, tokensApi } from '@/api/endpoints';
import { qk } from '@/api/queryKeys';
import type { ApiTokenInfo, CreatedToken, CreateTokenInput, TokenScope } from '@/api/types';
import { CopyButton } from '@/components/CopyButton';
import { KeyIcon } from '@/components/icons';
import { Modal } from '@/components/Modal';
import { ErrorState, PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/Spinner';
import { timeAgo } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { showToast } from '@/lib/toast';
import { claudeCodeCommands, mcpUrl, SCOPE_LABEL } from './tokens';

const EXPIRY: { value: CreateTokenInput['expiresInDays']; label: string }[] = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
  { value: null, label: 'No expiry' },
];

const day = (iso: string) => {
  const d = new Date(iso);
  return isSameYear(d, new Date()) ? format(d, 'MMM d') : format(d, 'MMM d, yyyy');
};

function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-gray-200 p-5">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="flex-1 font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** A value to copy, in a read-only field (selectable by hand too). */
function CopyField({ value, label, mono = true }: { value: string; label: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        aria-label={label}
        value={value}
        className={clsx('input min-w-0 flex-1 bg-gray-50', mono && 'font-mono text-xs')}
        onFocus={(e) => e.currentTarget.select()}
      />
      <CopyButton text={value} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}

function Snippet({ code, label }: { code: string; label: string }) {
  return (
    <div className="flex items-start gap-2">
      <pre aria-label={label} className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-gray-900 px-3 py-2 font-mono text-xs text-gray-100">
        {code}
      </pre>
      <CopyButton text={code} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}

function ConnectSection({ url }: { url: string }) {
  return (
    <Section title="Connect Claude">
      <p className="mb-3 text-sm text-gray-600">
        Use Mekari Project from Claude: look up your work, and create and update tasks, comments and projects. Claude acts as
        you, with your permissions, and can never delete anything.
      </p>
      <label className="label" htmlFor="mcp-url">
        MCP server URL
      </label>
      <div className="flex items-center gap-2">
        <input id="mcp-url" readOnly value={url} className="input min-w-0 flex-1 bg-gray-50 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <CopyButton text={url} label="Copy MCP server URL" />
      </div>
      <ul className="mt-4 space-y-2 text-sm text-gray-700">
        <li>
          <span className="font-medium">claude.ai</span> (web, desktop and mobile): Settings → Connectors → <em>Add custom connector</em>, and
          paste the URL. You’ll sign in and approve it here; no token needed.
        </li>
        <li>
          <span className="font-medium">Claude Code</span> and other API clients: create a token below, then run the command it shows.
        </li>
      </ul>
    </Section>
  );
}

function expiryText(t: ApiTokenInfo) {
  if (!t.expiresAt) return { text: 'Never expires', soon: false };
  const days = differenceInCalendarDays(new Date(t.expiresAt), new Date());
  if (days <= 7) return { text: days <= 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'}`, soon: true };
  return { text: `Expires ${day(t.expiresAt)}`, soon: false };
}

function TokenRow({ token, onRevoke }: { token: ApiTokenInfo; onRevoke: () => void }) {
  const app = token.source === 'OAUTH';
  const expiry = expiryText(token);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-gray-900">{token.name}</span>
          <span className={clsx('rounded px-1.5 py-0.5 text-xs font-medium', app ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-700')}>
            {app ? 'Connected app' : 'Personal token'}
          </span>
          <span className="rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-600">{SCOPE_LABEL[token.scope]}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-gray-500">
          <span className="font-mono">{token.prefix}…</span>
          <span aria-hidden>·</span>
          <span>{app ? 'Connected' : 'Created'} {day(token.createdAt)}</span>
          <span aria-hidden>·</span>
          <span>{token.lastUsedAt ? `Last used ${timeAgo(token.lastUsedAt)}` : 'Never used'}</span>
          <span aria-hidden>·</span>
          <span className={clsx(expiry.soon && 'font-medium text-amber-700')}>{expiry.text}</span>
        </div>
      </div>
      <button type="button" className="btn-secondary text-red-700 hover:bg-red-50" aria-label={`Revoke ${token.name}`} onClick={onRevoke}>
        Revoke
      </button>
    </li>
  );
}

function RevokeDialog({ token, onClose }: { token: ApiTokenInfo; onClose: () => void }) {
  const qc = useQueryClient();
  const app = token.source === 'OAUTH';
  const revoke = useMutation({
    mutationFn: () => tokensApi.revoke(token.id),
    onSuccess: () => {
      showToast(app ? `${token.name} disconnected` : `${token.name} revoked`, 'info');
      onClose();
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.tokens }),
    meta: { quiet: true },
  });
  return (
    <Modal open onClose={onClose} title={app ? `Disconnect ${token.name}?` : `Revoke ${token.name}?`}>
      <div className="space-y-4 px-5 pb-5 pt-3">
        <p className="text-sm text-gray-600">
          {app
            ? `${token.name} loses access to your account right away. You can connect it again later.`
            : 'Anything using this token stops working right away. This can’t be undone.'}
        </p>
        {revoke.isError && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage(revoke.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-danger" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
            {app ? 'Disconnect' : 'Revoke'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CreateForm({ onCreated, onCancel }: { onCreated: (c: CreatedToken) => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<TokenScope>('WRITE');
  const [expiry, setExpiry] = useState<CreateTokenInput['expiresInDays']>(90);
  const create = useMutation({
    mutationFn: tokensApi.create,
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: qk.tokens });
      onCreated(c);
    },
    meta: { quiet: true },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate({ name: name.trim(), scope, expiresInDays: expiry });
  };
  return (
    <form onSubmit={submit} className="space-y-4 px-5 pb-5 pt-3">
      <div>
        <label htmlFor="token-name" className="label">
          Name
        </label>
        <input
          id="token-name"
          className="input"
          value={name}
          maxLength={60}
          required
          placeholder="e.g. Claude Code on my laptop"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <fieldset>
        <legend className="label">Access</legend>
        <div className="space-y-2">
          {(
            [
              ['READ', 'Look up your projects, tasks, goals, reports and inbox.'],
              ['WRITE', 'Also create and update tasks, comments, projects, sections and goal updates. Never delete.'],
            ] as const
          ).map(([value, hint]) => (
            <label key={value} className="flex items-start gap-3 rounded-lg border border-gray-200 p-3">
              <input
                type="radio"
                name="token-scope"
                className="mt-0.5 h-4 w-4 border-gray-300 text-primary-500 focus:ring-primary-500"
                checked={scope === value}
                onChange={() => setScope(value)}
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">{SCOPE_LABEL[value]}</span>
                <span className="block text-xs text-gray-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="token-expiry" className="label">
          Expires after
        </label>
        <select
          id="token-expiry"
          className="input"
          value={expiry === null ? 'never' : String(expiry)}
          onChange={(e) => setExpiry(e.target.value === 'never' ? null : (Number(e.target.value) as 30 | 90 | 365))}
        >
          {EXPIRY.map((o) => (
            <option key={o.label} value={o.value === null ? 'never' : String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {create.isError && (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage(create.error, 'Couldn’t create the token.')}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={!name.trim() || create.isPending}>
          Create token
        </button>
      </div>
    </form>
  );
}

/** Shown once: the server never returns the plaintext again. */
function CreatedView({ created, url, onDone }: { created: CreatedToken; url: string; onDone: () => void }) {
  const cmd = claudeCodeCommands(url, created.token);
  return (
    <div className="space-y-4 px-5 pb-5 pt-3">
      <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Copy this token now. You won’t be able to see it again. Treat it like a password.
      </p>
      <CopyField value={created.token} label="Token" />
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-900">Add it to Claude Code</h3>
        <Snippet code={cmd.inline} label="Claude Code command" />
        <p className="text-xs text-gray-500">
          Or keep the token out of your shell history: put it in <code className="font-mono">MEKARI_PROJECT_TOKEN</code> (for example from
          your password manager), then run:
        </p>
        <Snippet code={cmd.env} label="Claude Code command using an environment variable" />
      </div>
      <p className="text-xs text-gray-500">
        For claude.ai you don’t need a token: add a custom connector with <span className="font-mono">{url}</span>.
      </p>
      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

function CreateTokenDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const [created, setCreated] = useState<CreatedToken | null>(null);
  return (
    <Modal open onClose={onClose} title={created ? 'Token created' : 'Create token'} width="lg">
      {created ? <CreatedView created={created} url={url} onDone={onClose} /> : <CreateForm onCreated={setCreated} onCancel={onClose} />}
    </Modal>
  );
}

/** Settings → API tokens & connected apps (SPEC §14). */
export function TokensPage() {
  const config = useQuery({ queryKey: qk.config, queryFn: configApi.get, staleTime: Infinity });
  const tokens = useQuery({ queryKey: qk.tokens, queryFn: tokensApi.list });
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiTokenInfo | null>(null);
  const enabled = config.data?.mcpEnabled === true;
  const url = config.data ? mcpUrl(config.data.appUrl) : '';
  const list = tokens.data?.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="API tokens & connected apps" icon={<KeyIcon className="h-5 w-5 text-gray-500" />} />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {config.isPending ? (
            <Spinner />
          ) : config.isError ? (
            <ErrorState error={config.error} />
          ) : enabled ? (
            <ConnectSection url={url} />
          ) : (
            <p role="status" className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
              Connecting Claude isn’t enabled on this server. Ask your administrator to turn it on.
            </p>
          )}
          <Section
            title="Tokens and apps"
            actions={
              enabled && (
                <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                  Create token
                </button>
              )
            }
          >
            {tokens.isPending ? (
              <Spinner />
            ) : tokens.isError ? (
              <ErrorState error={tokens.error} />
            ) : list.length === 0 ? (
              <p className="text-sm text-gray-500">No tokens or connected apps yet.</p>
            ) : (
              <ul aria-label="Tokens and apps" className="divide-y divide-gray-100">
                {list.map((t) => (
                  <TokenRow key={t.id} token={t} onRevoke={() => setRevoking(t)} />
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
      {creating && <CreateTokenDialog url={url} onClose={() => setCreating(false)} />}
      {revoking && <RevokeDialog token={revoking} onClose={() => setRevoking(null)} />}
    </div>
  );
}
