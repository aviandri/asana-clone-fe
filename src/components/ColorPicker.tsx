import clsx from 'clsx';
import { PROJECT_COLORS } from '@/lib/colors';

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
      {PROJECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value.toLowerCase() === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={clsx('h-6 w-6 rounded-md ring-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500', value.toLowerCase() === c && 'ring-2 ring-gray-900')}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}
