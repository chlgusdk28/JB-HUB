import { QuietCard } from './QuietCard';

interface QuietProjectCardProps {
  title: string;
  description: string;
  author: string;
  onClick: () => void;
}

export function QuietProjectCard({
  title,
  description,
  author,
  onClick,
}: QuietProjectCardProps) {
  return (
    <QuietCard onClick={onClick} spacing="spacious">
      {/* Title */}
      <h2 className="text-2xl text-gray-900 mb-4 font-medium">
        {title}
      </h2>

      {/* Description */}
      <p className="text-[15px] text-gray-500 leading-relaxed mb-8">
        {description}
      </p>

      {/* Author */}
      <div className="text-sm text-gray-400">
        {author}
      </div>
    </QuietCard>
  );
}
