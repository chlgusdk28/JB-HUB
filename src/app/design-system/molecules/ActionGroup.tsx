import { Star, GitFork, Download } from 'lucide-react';
import { Button } from '../atoms/Button';

interface ActionGroupProps {
  onStar?: () => void;
  onFork?: () => void;
  onDownload?: () => void;
  starred?: boolean;
  forked?: boolean;
  size?: 'sm' | 'md';
}

export function ActionGroup({
  onStar,
  onFork,
  onDownload,
  starred = false,
  forked = false,
  size = 'md',
}: ActionGroupProps) {
  return (
    <div className="flex gap-3">
      {onStar && (
        <Button
          size={size}
          emphasis={starred ? 'high' : 'medium'}
          icon={<Star className="w-4 h-4" strokeWidth={1.5} />}
          onClick={onStar}
        >
          Star
        </Button>
      )}
      {onFork && (
        <Button
          size={size}
          emphasis={forked ? 'high' : 'medium'}
          icon={<GitFork className="w-4 h-4" strokeWidth={1.5} />}
          onClick={onFork}
        >
          Fork
        </Button>
      )}
      {onDownload && (
        <Button
          size={size}
          emphasis="medium"
          icon={<Download className="w-4 h-4" strokeWidth={1.5} />}
          onClick={onDownload}
        >
          Download
        </Button>
      )}
    </div>
  );
}
