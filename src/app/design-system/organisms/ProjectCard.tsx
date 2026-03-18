import { Text } from '../atoms/Text';
import { Tag } from '../atoms/Tag';
import { ProjectMetaBlock } from '../molecules/ProjectMetaBlock';

interface ProjectCardProps {
  title: string;
  description: string;
  author: string;
  stars?: number;
  forks?: number;
  comments?: number;
  tags?: string[];
  onClick?: () => void;
  padding?: 'comfortable' | 'spacious';
}

export function ProjectCard({
  title,
  description,
  author,
  stars,
  forks,
  comments,
  tags,
  onClick,
  padding = 'spacious',
}: ProjectCardProps) {
  const paddingStyles = {
    comfortable: 'p-10',
    spacious: 'p-12',
  };

  return (
    <div
      onClick={onClick}
      className={`
        bg-white
        rounded-2xl
        transition-all
        duration-150
        ${paddingStyles[padding]}
        ${onClick ? 'cursor-pointer' : ''}
      `}
      style={{
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.06)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.03)';
        }
      }}
    >
      {/* Title */}
      <div className="mb-4">
        <Text variant="subsection" color="primary">{title}</Text>
      </div>

      {/* Description */}
      <div className="mb-8">
        <Text variant="body" color="secondary">{description}</Text>
      </div>

      {/* Tags */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-8">
          {tags.map((tag) => (
            <Tag key={tag} label={tag} size="sm" variant="subtle" />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <Text variant="small" color="tertiary">{author}</Text>
        <ProjectMetaBlock stars={stars} forks={forks} comments={comments} />
      </div>
    </div>
  );
}
