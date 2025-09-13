import React, { useState } from 'react';

interface CompactChartProps {
  title: string;
  inData: number[];
  resolvedData: number[];
}

const CompactChart: React.FC<CompactChartProps> = ({ title, inData, resolvedData }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const maxValue = Math.max(...inData, ...resolvedData);
  const weeks = ['W-4', 'W-3', 'W-2', 'W-1'];
  
  // Remove current week data for compact view (only show last 4 weeks)
  const compactInData = inData.slice(0, 4);
  const compactResolvedData = resolvedData.slice(0, 4);

  return (
    <div className="bg-[#232424] rounded-xl p-4 shadow-lg mt-4">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      <div className="h-32 flex items-end space-x-4" role="img" aria-label={`Bar chart showing ${title}`}>
        {compactInData.map((inValue, index) => {
          const resolvedValue = compactResolvedData[index];
          return (
            <div
              key={index}
              className="relative flex-1 flex flex-col items-center space-y-1"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              tabIndex={0}
              role="button"
              aria-label={`Week ${weeks[index]}: ${inValue} tickets in, ${resolvedValue} resolved`}
            >
              {hoveredIndex === index && (
                <div className="absolute -top-20 bg-gradient-to-br from-gray-900 to-gray-800 text-white text-xs px-5 py-4 rounded-2xl whitespace-nowrap z-20 shadow-2xl border border-gray-600/50 backdrop-blur-sm tooltip-enter">
                  <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gradient-to-br from-gray-900 to-gray-800 rotate-45 border-r border-b border-gray-600/50"></div>
                  <div className="font-bold text-sm mb-2 text-center">Week {weeks[index]}</div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between min-w-[140px]">
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-[#4FBDBA] rounded-full mr-2"></div>
                        <span className="text-gray-300">In:</span>
                      </div>
                      <span className="text-[#4FBDBA] font-bold text-sm">{inValue}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-[#F3C969] rounded-full mr-2"></div>
                        <span className="text-gray-300">Resolved:</span>
                      </div>
                      <span className="text-[#F3C969] font-bold text-sm">{resolvedValue}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="w-full flex space-x-2 justify-center">
                <div
                  className="bg-[#4FBDBA] rounded-t transition-all duration-300 hover:bg-[#4FBDBA]/80 hover:shadow-lg hover:shadow-[#4FBDBA]/30 hover:outline hover:outline-2 hover:outline-[#4FBDBA]/50"
                  style={{ 
                    height: `${(inValue / maxValue) * 80}px`,
                    width: '35%' // 더 얇게 조정
                  }}
                />
                <div
                  className="bg-[#F3C969] rounded-t transition-all duration-300 hover:bg-[#F3C969]/80 hover:shadow-lg hover:shadow-[#F3C969]/30 hover:outline hover:outline-2 hover:outline-[#F3C969]/50"
                  style={{ 
                    height: `${(resolvedValue / maxValue) * 80}px`,
                    width: '35%' // 더 얇게 조정
                  }}
                />
              </div>
              <span className="text-xs text-gray-500">
                {weeks[index]}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-center space-x-4 mt-3 text-xs">
        <div className="flex items-center">
          <div className="w-3 h-3 bg-[#4FBDBA] rounded mr-2"></div>
          <span className="text-gray-400">Tickets In</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-[#F3C969] rounded mr-2"></div>
          <span className="text-gray-400">Resolved</span>
        </div>
      </div>
    </div>
  );
};

export default CompactChart;
