import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

const ThemeToggle = ({ collapsed = false }: { collapsed?: boolean }) => {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200',
        'hover:bg-accent text-muted-foreground hover:text-foreground w-full',
        collapsed && 'justify-center px-2'
      )}
    >
      <Sun className="w-5 h-5 shrink-0 dark:hidden" />
      <Moon className="w-5 h-5 shrink-0 hidden dark:block" />
      {!collapsed && (
        <span className="text-sm font-medium dark:hidden">Light Mode</span>
      )}
      {!collapsed && (
        <span className="text-sm font-medium hidden dark:block">Dark Mode</span>
      )}
    </button>
  );
};

export default ThemeToggle;
