import { Star, GitFork, MessageSquare } from 'lucide-react';
import { Icon } from '../atoms/Icon';
import { Text } from '../atoms/Text';

interface ProjectMetaBlockProps {
  stars?: number;
  forks?: number;
  comments?: number;
  size?: 'sm' | 'md';
}

export function ProjectMetaBlock({
  stars,
  forks,
  comments,
  size = 'sm',
}: ProjectMetaBlockProps) {
  const iconSize = size === 'sm' ? 'xs' : 'sm';
  const textVariant = size === 'sm' ? 'meta' : 'small';
  const gap = size === 'sm' ? 'gap-4' : 'gap-5';

  return (
    <div className={`flex items-center ${gap}`}>
      {stars !== undefined && (
        <div className="flex items-center gap-1.5">
          <Icon icon={<Star strokeWidth={1.5} />} size={iconSize} color="tertiary" />
          <Text variant={textVariant} color="tertiary">{stars}</Text>
        </div>
      )}
      {forks !== undefined && (
        <div className="flex items-center gap-1.5">
          <Icon icon={<GitFork strokeWidth={1.5} />} size={iconSize} color="tertiary" />
          <Text variant={textVariant} color="tertiary">{forks}</Text>
        </div>
      )}
      {comments !== undefined && (
        <div className="flex items-center gap-1.5">
          <Icon icon={<MessageSquare strokeWidth={1.5} />} size={iconSize} color="tertiary" />
          <Text variant={textVariant} color="tertiary">{comments}</Text>
        </div>
      )}
    </div>
  );
}
