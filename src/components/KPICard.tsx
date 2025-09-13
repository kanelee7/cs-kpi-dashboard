import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
  isCompact?: boolean;
  sparklineData?: number[];
}

const Sparkline: React.FC<{ data: number[]; trend: 'up' | 'down' | 'neutral' }> = ({ data, trend }) => {
  const maxValue = Math.max(...data);
  const minValue = Math.min(...data);
  const range = maxValue - minValue || 1;

  const trendColors = {
    up: '#4FBDBA',
    down: '#F47C7C',
    neutral: '#F3C969'
  };

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 60;
    const y = 20 - ((value - minValue) / range) * 16;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width="60" height="20" className="opacity-70">
      <polyline
        fill="none"
        stroke={trendColors[trend]}
        strokeWidth="1.5"
        points={points}
      />
      {data.map((value, index) => {
        const x = (index / (data.length - 1)) * 60;
        const y = 20 - ((value - minValue) / range) * 16;
        return (
          <circle
            key={index}
            cx={x}
            cy={y}
            r="1.5"
            fill={trendColors[trend]}
          />
        );
      })}
    </svg>
  );
};

const KPICard: React.FC<KPICardProps> = ({ title, value, change, trend, icon, isCompact = false, sparklineData = [] }) => {
  const trendColors = {
    up: 'text-[#4FBDBA]',
    down: 'text-[#F47C7C]',
    neutral: 'text-[#F3C969]'
  };

  const trendBgColors = {
    up: 'bg-[#4FBDBA]/10',
    down: 'bg-[#F47C7C]/10',
    neutral: 'bg-[#F3C969]/10'
  };

  return (
    <div 
      className={`bg-[#232424] rounded-xl p-4 shadow-lg hover:shadow-xl hover:shadow-black/20 transition-all duration-300 hover:scale-[1.02] focus-within:ring-2 focus-within:ring-[#4FBDBA] focus-within:ring-opacity-50 focus:outline-none ${isCompact ? 'flex-1 min-w-0' : ''}`}
      tabIndex={0}
      role="article"
      aria-label={`${title}: ${value}, ${change}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          // Focus management for keyboard users
        }
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-gray-400 flex-shrink-0" aria-hidden="true">
          {icon}
        </div>
        {isCompact && sparklineData.length > 0 && (
          <Sparkline data={sparklineData} trend={trend} />
        )}
      </div>
      <div className={`${isCompact ? 'text-2xl' : 'text-3xl'} font-bold text-white mb-1`}>
        {value}
      </div>
      <div className="text-gray-400 text-sm font-medium mb-2">
        {title}
      </div>
      <div className={`px-2 py-1 rounded-full text-xs font-medium inline-flex items-center ${trendBgColors[trend]} ${trendColors[trend]}`}>
        {trend === 'up' && <TrendingUp className="w-3 h-3 mr-1" aria-hidden="true" />}
        {trend === 'down' && <TrendingDown className="w-3 h-3 mr-1" aria-hidden="true" />}
        <span className="sr-only">{trend === 'up' ? 'increasing' : trend === 'down' ? 'decreasing' : 'stable'}</span>
        {change}
      </div>
    </div>
  );
};

export default KPICard;
