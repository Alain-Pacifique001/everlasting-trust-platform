import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface FinanceStatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: LucideIcon;
  index?: number;
}

const FinanceStatCard = ({ title, value, change, changeType = 'neutral', icon: Icon, index = 0 }: FinanceStatCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="rounded-xl border border-border bg-card p-6 shadow-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="p-2 rounded-lg bg-accent">
          <Icon className="w-5 h-5 text-accent-foreground" />
        </div>
      </div>
      <p className="text-2xl font-bold text-card-foreground">{value}</p>
      {change && (
        <p
          className={`text-xs mt-2 ${
            changeType === 'positive' ? 'text-emerald-500' : changeType === 'negative' ? 'text-red-500' : 'text-muted-foreground'
          }`}
        >
          {change}
        </p>
      )}
    </motion.div>
  );
};

export default FinanceStatCard;
