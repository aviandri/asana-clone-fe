import { requestBlob } from '@/api/client';
import { reportsApi } from '@/api/endpoints';
import { errorMessage } from '@/lib/errors';
import { showToast } from '@/lib/toast';

/**
 * "Export CSV": a real link to the BE's attachment endpoint, so the browser does a native,
 * cookie-authenticated download. In mock mode there's no server, so we build the file in-page.
 */
export function ExportCsvLink({ projectId }: { projectId: string }) {
  const href = reportsApi.projectCsvUrl(projectId);
  return (
    <a
      href={href}
      download
      className="btn-secondary py-1"
      onClick={async (e) => {
        if (import.meta.env.VITE_MOCK !== 'true') return;
        e.preventDefault();
        try {
          const { blob, filename } = await requestBlob(`/projects/${projectId}/tasks.csv`);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename ?? 'tasks.csv';
          a.click();
          URL.revokeObjectURL(url);
        } catch (err) {
          showToast(errorMessage(err, 'Export failed'));
        }
      }}
    >
      Export CSV
    </a>
  );
}
