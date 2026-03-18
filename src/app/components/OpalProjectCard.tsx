import { Star, GitFork } from 'lucide-react';
import { OpalCard } from './OpalCard';

interface OpalProjectCardProps {
  title: string;
  description: string;
  author: string;
  department: string;
  tags: string[];
  stars: number;
  forks: number;
  onClick: () => void;
}

export function OpalProjectCard({
  title,
  description,
  author,
  tags,
  stars,
  forks,
  onClick,
}: OpalProjectCardProps) {
  return (
    <OpalCard onClick={onClick} padding="large">
      {/* Title */}
      <h3 className="text-2xl font-semibold text-gray-900 mb-4">
        {title}
      </h3>

      {/* Description */}
      <p className="text-[15px] text-gray-600 leading-relaxed mb-8">
        {description}
      </p>

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-8">
        {tags.slice(0, 3).map((tag, index) => (
          <span
            key={index}
            className="px-3 py-1.5 bg-gray-100 text-gray-600 text-[13px] font-medium rounded-lg"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center">
            <span className="text-white text-[13px] font-medium">{author[0]}</span>
          </div>
          <span className="text-[15px] text-gray-600">{author}</span>
        </div>

        <div className="flex items-center gap-6 text-[15px] text-gray-500">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4" />
            <span>{stars}</span>
          </div>
          <div className="flex items-center gap-2">
            <GitFork className="w-4 h-4" />
            <span>{forks}</span>
          </div>
        </div>
      </div>
    </OpalCard>
  );
}
