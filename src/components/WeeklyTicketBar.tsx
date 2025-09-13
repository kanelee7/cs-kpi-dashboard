import React, { useState } from 'react';

interface WeeklyTicketBarProps {
  inValue: number;
  resolvedValue: number;
  maxValue: number;
  isCurrentWeek: boolean;
  weekLabel: string;
  index: number;
}

const WeeklyTicketBar: React.FC<WeeklyTicketBarProps> = ({
  inValue, resolvedValue, maxValue, isCurrentWeek, weekLabel, index
}) => {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  return (
    <div 
      className="relative flex-1 flex flex-col items-center space-y-1"
      onMouseEnter={() => setHoveredBar(index)}
      onMouseLeave={() => setHoveredBar(null)}
    >
      {hoveredBar === index && (
        <div className="absolute -top-12 bg-black/95 text-white text-xs px-4 py-3 rounded-xl whitespace-nowrap z-10 shadow-2xl border border-gray-500 tooltip-enter">
          <div className="font-semibold">Week {weekLabel}</div>
          <div className="text-[#4FBDBA]">In: {inValue}</div>
          <div className="text-[#F3C969]">Resolved: {resolvedValue}</div>
        </div>
      )}
      <div className="w-full flex space-x-2 max-w-12">
        <div
          className={`flex-1 bg-[#4FBDBA] rounded-t transition-all duration-300 hover:bg-[#4FBDBA]/80 hover:shadow-lg hover:shadow-[#4FBDBA]/30 hover:outline hover:outline-2 hover:outline-[#4FBDBA]/50 ${isCurrentWeek ? 'opacity-50' : ''}`}
          style={{ 
            height: `${(inValue / maxValue) * 120}px`,
            ...(isCurrentWeek && { 
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)',
              backgroundSize: '8px 8px'
            })
          }}
        />
        <div
          className={`flex-1 bg-[#F3C969] rounded-t transition-all duration-300 hover:bg-[#F3C969]/80 hover:shadow-lg hover:shadow-[#F3C969]/30 hover:outline hover:outline-2 hover:outline-[#F3C969]/50 ${isCurrentWeek ? 'opacity-50' : ''}`}
          style={{ 
            height: `${(resolvedValue / maxValue) * 120}px`,
            ...(isCurrentWeek && { 
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)',
              backgroundSize: '8px 8px'
            })
          }}
        />
      </div>
      <span className={`text-xs text-gray-500 ${isCurrentWeek ? 'opacity-50' : ''}`}>
        {weekLabel}
      </span>
    </div>
  );
};

export default WeeklyTicketBar;
