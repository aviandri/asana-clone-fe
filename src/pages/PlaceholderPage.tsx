import { EmptyState, PageHeader } from '@/components/PageHeader';

/** Temporary stand-in for routes whose UI lands in a later PR. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col">
      <PageHeader title={title} />
      <EmptyState title="Coming soon">This page is under construction.</EmptyState>
    </div>
  );
}
