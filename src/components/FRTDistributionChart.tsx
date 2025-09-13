import React, { useState } from 'react';

const FRTDistributionChart: React.FC = () => {
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null);
  
  const weeks = ['W-4', 'W-3', 'W-2', 'W-1', 'Current'];
  const categories = ['0-1h', '1-8h', '8-24h', '>24h', 'No Reply'];
  const colors = ['#4FBDBA', '#F3C969', '#F47C7C', '#8B5CF6', '#6B7280'];
  
  // Sample data: percentage distribution for each week
  const data = [
    [45, 35, 15, 4, 1], // W-4
    [48, 32, 16, 3, 1], // W-3
    [52, 30, 14, 3, 1], // W-2
    [49, 33, 15, 2, 1], // W-1
    [55, 28, 13, 3, 1], // Current
  ];

  return (
    <div className="bg-[#232424] rounded-xl p-6 shadow-lg">
      <h3 className="text-lg font-semibold text-white mb-4">FRT Response Time Distribution</h3>
      <div className="space-y-3">
        {weeks.map((week, weekIndex) => (
          <div
            key={weekIndex}
            className="relative"
            onMouseEnter={() => setHoveredWeek(weekIndex)}
            onMouseLeave={() => setHoveredWeek(null)}
          >
            <div className="flex items-center mb-1">
              <span className={`text-sm text-gray-400 w-12 ${weekIndex === weeks.length - 1 ? 'opacity-50' : ''}`}>{week}</span>
              <div className="flex-1 flex h-6 rounded overflow-hidden">
                {data[weekIndex].map((percentage, catIndex) => (
                  <div
                    key={catIndex}
                    className={`transition-all duration-300 hover:opacity-100 relative ${weekIndex === weeks.length - 1 ? 'opacity-50' : 'opacity-80'}`}
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: colors[catIndex],
                      ...(weekIndex === weeks.length - 1 && { 
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)',
                        backgroundSize: '8px 8px'
                      })
                    }}
                  >
                    {hoveredWeek === weekIndex && (
                      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black/95 text-white text-xs px-4 py-3 rounded-xl whitespace-nowrap z-10 shadow-2xl border border-gray-500 tooltip-enter">
                        <div className="font-semibold">{categories[catIndex]}</div>
                        <div className="text-[#4FBDBA]">{percentage}%</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-4 mt-4 text-xs">
        {categories.map((category, index) => (
          <div key={index} className="flex items-center">
            <div 
              className="w-3 h-3 rounded mr-2" 
              style={{ backgroundColor: colors[index] }}
            ></div>
            <span className="text-gray-400">{category}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FRTDistributionChart;
