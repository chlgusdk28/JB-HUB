import { Text } from '../atoms/Text';

interface UserInfoBlockProps {
  name: string;
  avatarUrl?: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function UserInfoBlock({
  name,
  avatarUrl,
  subtitle,
  size = 'md',
}: UserInfoBlockProps) {
  const avatarSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  };

  const nameVariants = {
    sm: 'small' as const,
    md: 'body' as const,
    lg: 'large' as const,
  };

  return (
    <div className="flex items-center gap-3">
      {/* Avatar */}
      <div className={`${avatarSizes[size]} bg-gray-200 rounded-full flex-shrink-0`}>
        {avatarUrl && (
          <img src={avatarUrl} alt={name} className="w-full h-full rounded-full object-cover" />
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-0.5">
        <Text variant={nameVariants[size]} color="primary">
          {name}
        </Text>
        {subtitle && (
          <Text variant="meta" color="tertiary">
            {subtitle}
          </Text>
        )}
      </div>
    </div>
  );
}
