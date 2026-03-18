interface QuietCodeBlockProps {
  code: string;
  language?: string;
}

export function QuietCodeBlock({ code, language = 'text' }: QuietCodeBlockProps) {
  return (
    <div 
      className="bg-white rounded-3xl p-12 overflow-x-auto transition-all duration-300 ease-out"
      style={{
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03), 0 2px 4px rgba(0, 0, 0, 0.02), 0 8px 16px rgba(0, 0, 0, 0.01)',
      }}
    >
      {language && (
        <div className="text-xs text-gray-400 mb-6">{language}</div>
      )}
      <pre className="text-sm text-gray-700 font-mono leading-relaxed">
        {code}
      </pre>
    </div>
  );
}