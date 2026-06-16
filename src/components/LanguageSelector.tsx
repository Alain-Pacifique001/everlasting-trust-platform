import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { cn } from '@/lib/utils';

const languages = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'sw', label: 'Kiswahili', flag: '🇹🇿' },
  { code: 'rw', label: 'Kinyarwanda', flag: '🇷🇼' },
];

const LanguageSelector = ({ collapsed = false }: { collapsed?: boolean }) => {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const currentLang = languages.find((l) => l.code === i18n.language) || languages[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200',
          'hover:bg-accent text-muted-foreground hover:text-foreground',
          collapsed && 'justify-center px-2'
        )}
      >
        <Languages className="w-5 h-5 shrink-0" />
        {!collapsed && (
          <span className="text-sm font-medium">
            {currentLang.flag} {currentLang.label}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'absolute z-50 mt-1 w-48 rounded-lg border border-border bg-popover shadow-lg py-1',
              collapsed ? 'left-full ml-2 bottom-0' : 'bottom-full mb-1 left-0'
            )}
          >
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  i18n.changeLanguage(lang.code);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  'hover:bg-accent',
                  i18n.language === lang.code
                    ? 'text-primary font-semibold bg-accent/50'
                    : 'text-popover-foreground'
                )}
              >
                <span className="text-lg">{lang.flag}</span>
                <span>{lang.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default LanguageSelector;
