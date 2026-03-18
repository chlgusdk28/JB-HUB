import { File, Folder, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface FileNode {
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

interface QuietFileTreeProps {
  files: FileNode[];
  onFileClick?: (fileName: string) => void;
}

function FileTreeItem({ 
  node, 
  level = 0,
  onFileClick 
}: { 
  node: FileNode; 
  level?: number;
  onFileClick?: (fileName: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(level === 0);

  const handleClick = () => {
    if (node.type === 'folder') {
      setIsOpen(!isOpen);
    } else {
      onFileClick?.(node.name);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-2 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        style={{ paddingLeft: `${level * 16}px` }}
      >
        {node.type === 'folder' && (
          <ChevronRight
            className={`w-3 h-3 text-gray-400 transition-transform ${
              isOpen ? 'rotate-90' : ''
            }`}
          />
        )}
        {node.type === 'folder' ? (
          <Folder className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
        ) : (
          <File className="w-4 h-4 text-gray-400" strokeWidth={1.5} />
        )}
        <span>{node.name}</span>
      </button>
      {node.type === 'folder' && isOpen && node.children && (
        <div>
          {node.children.map((child, index) => (
            <FileTreeItem
              key={index}
              node={child}
              level={level + 1}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function QuietFileTree({ files, onFileClick }: QuietFileTreeProps) {
  return (
    <div 
      className="bg-white rounded-3xl p-10 transition-all duration-300 ease-out"
      style={{
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03), 0 2px 4px rgba(0, 0, 0, 0.02), 0 8px 16px rgba(0, 0, 0, 0.01)',
      }}
    >
      <div className="space-y-0.5">
        {files.map((file, index) => (
          <FileTreeItem key={index} node={file} onFileClick={onFileClick} />
        ))}
      </div>
    </div>
  );
}