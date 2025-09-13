import React, { useState } from 'react';

interface TrendChartProps {
  title: string;
  data: number[];
  color: string;
  unit?: string;
}

const TrendChart: React.FC<TrendChartProps> = ({ title, data, color, unit = '' }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const maxValue = Math.max(...data);
  const minValue = Math.min(...data);
  const range = maxValue - minValue || 1;
  const weeks = ['W-4', 'W-3', 'W-2', 'W-1', 'Current'];

  // Calculate y-axis ticks
  const yAxisTicks = 5;
  const yAxisValues = Array.from({ length: yAxisTicks }, (_, i) => {
    return minValue + (range * i) / (yAxisTicks - 1);
  });
  
  const points = data.map((value, index) => {
    const x = 40 + (index / (data.length - 1)) * 240;
    const y = 120 - ((value - minValue) / range) * 80;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="bg-[#232424] rounded-xl p-6 shadow-lg">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      <div className="relative h-32">
        <svg width="320" height="120" className="absolute inset-0" role="img" aria-label={`Line chart showing ${title}`}>
          {/* Y-axis */}
          <line x1="40" y1="20" x2="40" y2="100" stroke="#374151" strokeWidth="1" />
          
          {/* Y-axis labels */}
          {yAxisValues.map((value, index) => {
            const y = 100 - (index / (yAxisTicks - 1)) * 80;
            return (
              <g key={index}>
                <line x1="35" y1={y} x2="40" y2={y} stroke="#374151" strokeWidth="1" />
                <text x="30" y={y + 3} fill="#9CA3AF" fontSize="10" textAnchor="end">
                  {Math.round(value * 10) / 10}{unit}
                </text>
              </g>
            );
          })}
          
          {/* Grid lines */}
          {yAxisValues.map((_, index) => {
            const y = 100 - (index / (yAxisTicks - 1)) * 80;
            return (
              <line key={index} x1="40" y1={y} x2="280" y2={y} stroke="#374151" strokeWidth="0.5" opacity="0.3" />
            );
          })}
          
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            points={points}
            className="drop-shadow-sm"
          />
          {data.map((value, index) => {
            const x = 40 + (index / (data.length - 1)) * 240;
            const y = 120 - ((value - minValue) / range) * 80;
            const isCurrentWeek = index === data.length - 1;
            return (
              <circle
                key={index}
                cx={x}
                cy={y}
                r="4"
                fill={color}
                className={`cursor-pointer transition-all duration-300 hover:r-6 hover:drop-shadow-lg hover:drop-shadow-[${color}]/50 hover:outline hover:outline-2 hover:outline-[${color}]/30 ${isCurrentWeek ? 'opacity-50' : ''}`}
                strokeDasharray={isCurrentWeek ? '2,2' : 'none'}
                stroke={isCurrentWeek ? color : 'none'}
                strokeWidth={isCurrentWeek ? '2' : '0'}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            );
          })}
        </svg>
        {hoveredIndex !== null && (
          <div 
            className="absolute bg-black/95 text-white text-xs px-4 py-3 rounded-xl whitespace-nowrap pointer-events-none z-10 shadow-2xl border border-gray-500 tooltip-enter"
            style={{
              left: `${40 + (hoveredIndex / (data.length - 1)) * 240}px`,
              top: `${120 - ((data[hoveredIndex] - minValue) / range) * 80 - 35}px`,
              transform: 'translateX(-50%)'
            }}
          >
            <div className="font-bold text-sm mb-1">{weeks[hoveredIndex]}</div>
            <div className="text-[#4FBDBA] font-medium">{data[hoveredIndex]}{unit}</div>
          </div>
        )}
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-2 ml-10">
        {weeks.map((week, index) => (
          <span key={index} className={index === weeks.length - 1 ? 'opacity-50' : ''}>{week}</span>
        ))}
      </div>
    </div>
  );
};

export default TrendChart;
