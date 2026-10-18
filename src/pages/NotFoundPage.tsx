import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/PageHeader';

export function NotFoundPage() {
  return (
    <EmptyState illustration="search" title="Page not found">
      <p>The page you’re looking for doesn’t exist or you don’t have access to it.</p>
      <Link to="/" className="btn-secondary mt-4">
        Back to Home
      </Link>
    </EmptyState>
  );
}
