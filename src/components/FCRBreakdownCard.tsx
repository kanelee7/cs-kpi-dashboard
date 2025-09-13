import React from 'react';

interface FCRBreakdownCardProps {
  title: string;
  value: string;
  percentage: string;
  icon: React.ReactNode;
  color: string;
}

const FCRBreakdownCard: React.FC<FCRBreakdownCardProps> = ({ 
  title, value, percentage, icon, color 
}) => {
  return (
    <div className="flex items-center py-3 hover:bg-[#282929]/50 rounded-lg px-2 transition-all duration-200">
      <div className="flex items-center space-x-3">
        <div className="text-gray-400">
          {icon}
        </div>
        <span className="text-gray-300 font-medium">{title}</span>
      </div>
      <div className="flex-1 flex items-center justify-between ml-4">
        <div className="flex-1 mr-4">
          <div className="w-full bg-gray-700 rounded-full h-1.5">
            <div 
              className="h-1.5 rounded-full transition-all duration-300" 
              style={{ 
                backgroundColor: color,
                width: percentage
              }}
            ></div>
          </div>
        </div>
        <div className="text-white font-bold text-right min-w-[3rem]">{percentage}</div>
      </div>
    </div>
  );
};

export default FCRBreakdownCard;
