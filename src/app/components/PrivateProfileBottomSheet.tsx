import { X, Lock } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { OpalButton } from './opal/OpalButton';

interface PrivateProfileBottomSheetProps {
  userName: string;
  onClose: () => void;
}

export function PrivateProfileBottomSheet({ userName, onClose }: PrivateProfileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black bg-opacity-50"
      onClick={handleBackdropClick}
    >
      <div
        ref={sheetRef}
        className="bg-white rounded-t-3xl w-full max-w-2xl shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes slide-up {
            from {
              transform: translateY(100%);
            }
            to {
              transform: translateY(0);
            }
          }
          .animate-slide-up {
            animation: slide-up 0.3s ease-out;
          }
        `}</style>

        {/* Handle Bar */}
        <div className="flex justify-center pt-4 pb-2">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
              <Lock className="w-10 h-10 text-gray-400" strokeWidth={1.5} />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl text-gray-900 font-semibold text-center mb-3">
            비공개 프로필
          </h2>

          {/* Description */}
          <p className="text-gray-600 text-center mb-8 leading-relaxed">
            <span className="font-semibold text-gray-900">{userName}</span>님은 프로필을 비공개로 설정했습니다.
            <br />
            프로필 정보와 활동 내역을 확인할 수 없습니다.
          </p>

          {/* Button */}
          <div className="flex gap-3">
            <OpalButton
              variant="primary"
              size="lg"
              onClick={onClose}
              className="flex-1"
            >
              확인
            </OpalButton>
          </div>
        </div>

        {/* Bottom Padding */}
        <div className="h-8" />
      </div>
    </div>
  );
}
