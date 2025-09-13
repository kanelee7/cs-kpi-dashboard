'use client'

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  CheckCircle, 
  FileText,
  Menu,
  X,
  LayoutDashboard,
  Settings,
  LogOut,
  ChevronDown,
  Users,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface KPIData {
  weeklyTicketsIn: number[];
  weeklyTicketsResolved: number[];
  frtMedian: number;
  avgHandleTime: number;
  fcrRate: number;
  csatAverage: number;
  trends: {
    frt: number[];
    aht: number[];
    fcr: number[];
    csat: number[];
  };
}

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
    <div className={`bg-[#232424] rounded-xl p-4 shadow-lg hover:shadow-xl hover:shadow-black/20 transition-all duration-300 hover:scale-[1.02] ${isCompact ? 'flex-1 min-w-0' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-gray-400 flex-shrink-0">
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
        {trend === 'up' && <TrendingUp className="w-3 h-3 mr-1" />}
        {trend === 'down' && <TrendingDown className="w-3 h-3 mr-1" />}
        {change}
      </div>
    </div>
  );
};

const FCRBreakdownCard: React.FC<{ title: string; value: string; percentage: string; icon: React.ReactNode; color: string }> = ({ 
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

const CompactChart: React.FC<{ title: string; inData: number[]; resolvedData: number[] }> = ({ title, inData, resolvedData }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const maxValue = Math.max(...inData, ...resolvedData);
  const weeks = ['W-4', 'W-3', 'W-2', 'W-1'];
  
  // Remove current week data for compact view
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
                <div className="absolute -top-16 bg-[rgba(35,36,36,0.9)] text-white text-[13px] px-3 py-2 rounded-lg whitespace-nowrap z-20 shadow-2xl border border-[rgba(255,255,255,0.1)] backdrop-blur-sm tooltip-enter">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between min-w-[120px]">
                      <div className="flex items-center">
                        <span className="text-[#CCCCCC] mr-2">📥 In:</span>
                      </div>
                      <span className="text-[#5CD6C0] font-bold">{inValue}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="text-[#CCCCCC] mr-2">✅ Resolved:</span>
                      </div>
                      <span className="text-[#E5B567] font-bold">{resolvedValue}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="w-full flex space-x-2 justify-center">
                <div
                  className="bg-[#4FBDBA] rounded-t transition-all duration-300 hover:bg-[#4FBDBA]/80 hover:shadow-lg hover:shadow-[#4FBDBA]/30 hover:outline hover:outline-2 hover:outline-[#4FBDBA]/50"
                  style={{ 
                    height: `${(inValue / maxValue) * 80}px`,
                    width: '35%'
                  }}
                />
                <div
                  className="bg-[#F3C969] rounded-t transition-all duration-300 hover:bg-[#F3C969]/80 hover:shadow-lg hover:shadow-[#F3C969]/30 hover:outline hover:outline-2 hover:outline-[#F3C969]/50"
                  style={{ 
                    height: `${(resolvedValue / maxValue) * 80}px`,
                    width: '35%'
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

const TrendChart: React.FC<{ title: string; data: number[]; color: string; unit?: string }> = ({ title, data, color, unit = '' }) => {
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
        <svg width="320" height="120" className="absolute inset-0">
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
                className={`cursor-pointer hover:r-6 transition-all ${isCurrentWeek ? 'opacity-50' : ''}`}
                strokeDasharray={isCurrentWeek ? '2,2' : 'none'}
                stroke={isCurrentWeek ? color : 'none'}
                strokeWidth={isCurrentWeek ? '1' : '0'}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            );
          })}
        </svg>
        {hoveredIndex !== null && (
          <div 
            className="absolute bg-[rgba(35,36,36,0.9)] text-white text-[13px] px-3 py-2 rounded-lg whitespace-nowrap pointer-events-none z-10 border border-[rgba(255,255,255,0.1)] backdrop-blur-sm"
            style={{
              left: `${40 + (hoveredIndex / (data.length - 1)) * 240}px`,
              top: `${120 - ((data[hoveredIndex] - minValue) / range) * 80 - 30}px`,
              transform: 'translateX(-50%)'
            }}
          >
            <div className="flex items-center">
              <span className="text-[#CCCCCC] mr-2">{weeks[hoveredIndex]}:</span>
              <span className="text-[#5CD6C0] font-bold">{data[hoveredIndex]}{unit}</span>
            </div>
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
                    className={`transition-all duration-300 hover:opacity-80 relative ${weekIndex === weeks.length - 1 ? 'opacity-50' : ''}`}
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: colors[catIndex],
                    }}
                  >
                    {hoveredWeek === weekIndex && (
                      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-[rgba(35,36,36,0.9)] text-white text-[13px] px-3 py-2 rounded-lg whitespace-nowrap z-10 border border-[rgba(255,255,255,0.1)] backdrop-blur-sm">
                        <div className="flex items-center">
                          <span className="text-[#CCCCCC] mr-2">{categories[catIndex]}:</span>
                          <span className="text-[#5CD6C0] font-bold">{percentage}%</span>
                        </div>
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

const WeeklyTicketBar: React.FC<{
  inValue: number;
  resolvedValue: number;
  maxValue: number;
  isCurrentWeek: boolean;
  weekLabel: string;
  index: number;
}> = ({ inValue, resolvedValue, maxValue, isCurrentWeek, weekLabel, index }) => {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  return (
    <div 
      className="relative flex-1 flex flex-col items-center space-y-1"
      onMouseEnter={() => setHoveredBar(index)}
      onMouseLeave={() => setHoveredBar(null)}
    >
      {hoveredBar === index && (
        <div className="absolute -top-16 bg-[rgba(35,36,36,0.9)] text-white text-[13px] px-3 py-2 rounded-lg whitespace-nowrap z-10 border border-[rgba(255,255,255,0.1)] backdrop-blur-sm">
          <div className="space-y-1">
            <div className="flex items-center justify-between min-w-[120px]">
              <div className="flex items-center">
                <span className="text-[#CCCCCC] mr-2">📥 In:</span>
              </div>
              <span className="text-[#5CD6C0] font-bold">{inValue}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-[#CCCCCC] mr-2">✅ Resolved:</span>
              </div>
              <span className="text-[#E5B567] font-bold">{resolvedValue}</span>
            </div>
          </div>
        </div>
      )}
      <div className="w-full flex space-x-2 max-w-12">
        <div
          className={`flex-1 bg-[#4FBDBA] rounded-t transition-all duration-300 hover:bg-[#4FBDBA]/80 ${isCurrentWeek ? 'opacity-50' : ''}`}
          style={{ height: `${(inValue / maxValue) * 120}px` }}
        />
        <div
          className={`flex-1 bg-[#F3C969] rounded-t transition-all duration-300 hover:bg-[#F3C969]/80 ${isCurrentWeek ? 'opacity-50' : ''}`}
          style={{ height: `${(resolvedValue / maxValue) * 120}px` }}
        />
      </div>
      <span className={`text-xs text-gray-500 ${isCurrentWeek ? 'opacity-50' : ''}`}>
        {weekLabel}
      </span>
    </div>
  );
};

const Sidebar: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}
      <div className={`fixed left-0 top-0 h-full bg-[#232424] w-64 transform transition-transform duration-300 z-50 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 lg:static lg:z-auto`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-white">Navigation</h2>
            <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="space-y-2">
            <a href="#" className="flex items-center space-x-3 px-4 py-3 rounded-lg bg-[#4FBDBA]/10 text-[#4FBDBA]">
              <LayoutDashboard className="w-5 h-5" />
              <span>CS Dashboard</span>
            </a>
            <a href="#" className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-[#282929]">
              <FileText className="w-5 h-5" />
              <span>Ticket Management</span>
            </a>
            <a href="#" className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-[#282929]">
              <BarChart3 className="w-5 h-5" />
              <span>VOC Dashboard</span>
            </a>
            <div className="border-t border-gray-700 mt-6 pt-6">
              <a href="#" className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-[#282929]">
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </a>
              <a href="#" className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-[#282929]">
                <LogOut className="w-5 h-5" />
                <span>Logout</span>
              </a>
            </div>
          </nav>
        </div>
      </div>
    </>
  );
};

export default function Dashboard() {
  const [isCompact, setIsCompact] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState('All Brands');
  const [kpiData, setKpiData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);

  const brands = ['All Brands', 'Brand A', 'Brand B', 'Brand C'];

  useEffect(() => {
    fetchKPIData();
  }, []);

  const fetchKPIData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/kpis');
      const data = await response.json();
      setKpiData(data);
    } catch (error) {
      console.error('Error fetching KPI data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fcrBreakdownData = [
    {
      title: 'One-touch',
      value: '892',
      percentage: '75.0%',
      icon: <CheckCircle className="w-4 h-4" />,
      color: '#4FBDBA'
    },
    {
      title: 'Two-touch',
      value: '178',
      percentage: '15.0%',
      icon: <RefreshCw className="w-4 h-4" />,
      color: '#F3C969'
    },
    {
      title: 'Re-opened',
      value: '119',
      percentage: '10.0%',
      icon: <AlertCircle className="w-4 h-4" />,
      color: '#F47C7C'
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#282929] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4FBDBA] mx-auto mb-4"></div>
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!kpiData) {
    return (
      <div className="min-h-screen bg-[#282929] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Failed to load dashboard data</p>
          <button 
            onClick={fetchKPIData}
            className="px-4 py-2 bg-[#4FBDBA] text-white rounded-lg hover:bg-[#4FBDBA]/80 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const kpiCards = [
    {
      title: 'Weekly Tickets In',
      value: kpiData.weeklyTicketsIn[kpiData.weeklyTicketsIn.length - 1]?.toString() || '0',
      change: '+12.5%',
      trend: 'up' as const,
      icon: <FileText className="w-5 h-5" />,
      sparklineData: kpiData.weeklyTicketsIn,
    },
    {
      title: 'Weekly Tickets Resolved',
      value: kpiData.weeklyTicketsResolved[kpiData.weeklyTicketsResolved.length - 1]?.toString() || '0',
      change: '+8.3%',
      trend: 'up' as const,
      icon: <CheckCircle className="w-5 h-5" />,
      sparklineData: kpiData.weeklyTicketsResolved,
    },
    {
      title: 'FRT Median',
      value: `${kpiData.frtMedian.toFixed(1)}h`,
      change: '-15min',
      trend: 'up' as const,
      icon: <Clock className="w-5 h-5" />,
      sparklineData: kpiData.trends.frt,
    },
    {
      title: 'Average Handle Time',
      value: `${kpiData.avgHandleTime.toFixed(1)}min`,
      change: '-2.1min',
      trend: 'up' as const,
      icon: <Clock className="w-5 h-5" />,
      sparklineData: kpiData.trends.aht,
    },
    {
      title: 'FCR %',
      value: `${kpiData.fcrRate.toFixed(1)}%`,
      change: '+3.1%',
      trend: 'up' as const,
      icon: <TrendingUp className="w-5 h-5" />,
      sparklineData: kpiData.trends.fcr,
    },
  ];

  return (
    <div className="min-h-screen bg-[#282929] text-white">
      <div className="flex">
        {!isCompact && (
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        )}
        
        <div className="flex-1">
          {/* Header */}
          <header className="bg-[#232424] shadow-lg">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {!isCompact && (
                    <button
                      onClick={() => setSidebarOpen(true)}
                      className="lg:hidden text-gray-400 hover:text-white"
                    >
                      <Menu className="w-6 h-6" />
                    </button>
                  )}
                  <h1 className="text-2xl font-bold">CS Weekly KPI Dashboard</h1>
                </div>
                <div className="flex items-center space-x-4">
                  {!isCompact && (
                    <div className="relative">
                      <select
                        value={selectedBrand}
                        onChange={(e) => setSelectedBrand(e.target.value)}
                        className="bg-[#282929] text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-[#4FBDBA] focus:outline-none appearance-none pr-8"
                      >
                        {brands.map((brand) => (
                          <option key={brand} value={brand}>{brand}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  )}
                  <button
                    onClick={() => setIsCompact(!isCompact)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      isCompact
                        ? 'bg-[#4FBDBA] text-white'
                        : 'bg-[#282929] text-gray-300 hover:text-white'
                    }`}
                  >
                    {isCompact ? 'Full View' : 'Compact'}
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className={`${isCompact ? 'p-4' : 'p-6'}`}>
            {isCompact ? (
              /* Compact Mode - Optimized for Notion Embed */
              <div className="space-y-4">
                <div className="flex flex-col lg:flex-row gap-3">
                  {kpiCards.map((kpi, index) => (
                    <KPICard
                      key={index}
                      title={kpi.title}
                      value={kpi.value}
                      change={kpi.change}
                      trend={kpi.trend}
                      icon={kpi.icon}
                      isCompact={true}
                      sparklineData={kpi.sparklineData}
                    />
                  ))}
                </div>
                <CompactChart 
                  title="Weekly Tickets: In vs Resolved (Last 5 Weeks)"
                  inData={kpiData.weeklyTicketsIn}
                  resolvedData={kpiData.weeklyTicketsResolved}
                />
              </div>
            ) : (
              /* Full Mode - Internal Dashboard */
              <div className="space-y-6">
                {/* Top Row: 5 KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                  {kpiCards.map((kpi, index) => (
                    <KPICard
                      key={index}
                      title={kpi.title}
                      value={kpi.value}
                      change={kpi.change}
                      trend={kpi.trend}
                      icon={kpi.icon}
                      sparklineData={kpi.sparklineData}
                    />
                  ))}
                </div>

                {/* Middle Row: Weekly Tickets Chart + FCR Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <div className="bg-[#232424] rounded-xl p-6 shadow-lg">
                      <h3 className="text-lg font-semibold text-white mb-4">Weekly Tickets: In vs Resolved</h3>
                      <div className="relative h-40">
                        <svg width="100%" height="160" className="absolute inset-0">
                          {/* Y-axis */}
                          <line x1="40" y1="20" x2="40" y2="140" stroke="#374151" strokeWidth="1" />
                          
                          {/* Y-axis labels */}
                          {[0, 300, 600, 900, 1200].map((value, index) => {
                            const y = 140 - (value / 1200) * 120;
                            return (
                              <g key={index}>
                                <line x1="35" y1={y} x2="40" y2={y} stroke="#374151" strokeWidth="1" />
                                <text x="30" y={y + 3} fill="#9CA3AF" fontSize="10" textAnchor="end">
                                  {value}
                                </text>
                              </g>
                            );
                          })}
                          
                          {/* Grid lines - 연한 그리드 추가 */}
                          {[0, 300, 600, 900, 1200].map((value, index) => {
                            const y = 140 - (value / 1200) * 120;
                            return (
                              <line key={index} x1="40" y1={y} x2="90%" y2={y} stroke="#374151" strokeWidth="0.5" opacity="0.2" />
                            );
                          })}
                        </svg>
                        
                        <div className="h-40 flex items-end space-x-6 ml-12">
                        {kpiData.weeklyTicketsIn.map((inValue, index) => {
                          const resolvedValue = kpiData.weeklyTicketsResolved[index];
                          const maxValue = Math.max(...kpiData.weeklyTicketsIn, ...kpiData.weeklyTicketsResolved);
                          const isCurrentWeek = index === kpiData.weeklyTicketsIn.length - 1;
                          const weekLabel = index === 4 ? 'Current' : `W-${4-index}`;
                          
                          return (
                            <WeeklyTicketBar
                              key={index}
                              inValue={inValue}
                              resolvedValue={resolvedValue}
                              maxValue={maxValue}
                              isCurrentWeek={isCurrentWeek}
                              weekLabel={weekLabel}
                              index={index}
                            />
                          );
                        })}
                        </div>
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
                  </div>
                  
                  <div className="bg-[#232424] rounded-xl p-6 shadow-lg">
                    <h3 className="text-lg font-semibold text-white mb-4">FCR Breakdown</h3>
                    <div className="space-y-1">
                      {fcrBreakdownData.map((item, index) => (
                        <FCRBreakdownCard
                          key={index}
                          title={item.title}
                          value={item.value}
                          percentage={item.percentage}
                          icon={item.icon}
                          color={item.color}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom Row: FRT Trend + FRT Distribution */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <TrendChart 
                    title="FRT Median Trend" 
                    data={kpiData.trends.frt} 
                    color="#4FBDBA" 
                    unit="h"
                  />
                  <FRTDistributionChart />
                </div>

                {/* Final Row: AHT + FCR% Trends */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <TrendChart 
                    title="Average Handle Time" 
                    data={kpiData.trends.aht} 
                    color="#F3C969" 
                    unit="min"
                  />
                  <TrendChart 
                    title="First Contact Resolution %" 
                    data={kpiData.trends.fcr} 
                    color="#4FBDBA" 
                    unit="%"
                  />
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
