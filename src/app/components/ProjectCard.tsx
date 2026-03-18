import { Star, GitFork, Clock } from 'lucide-react';
import { memo } from 'react';

interface ProjectCardProps {
  title: string;
  description: string;
  author: string;
  department: string;
  tags: string[];
  stars: number;
  forks: number;
  updatedAt: string;
  onClick: () => void;
}

export const ProjectCard = memo(function ProjectCard({
  title,
  description,
  author,
  department,
  tags,
  stars,
  forks,
  updatedAt,
  onClick,
}: ProjectCardProps) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors">
          {title}
        </h3>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 mb-4 line-clamp-2">
        {description}
      </p>

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tags.map((tag, index) => (
          <span
            key={index}
            className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <div className="w-6 h-6 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-medium">{author[0]}</span>
          </div>
          <span className="font-medium text-gray-700">{author}</span>
          <span>·</span>
          <span>{department}</span>
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Star className="w-4 h-4" />
            <span>{stars}</span>
          </div>
          <div className="flex items-center gap-1">
            <GitFork className="w-4 h-4" />
            <span>{forks}</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <Clock className="w-3.5 h-3.5" />
            <span>{updatedAt}</span>
          </div>
        </div>
      </div>
    </div>
  );
});
