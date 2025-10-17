'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
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
import { getWeekRange, getZendeskWeekNumber } from '../../utils/dateUtils';

interface KPIData {
  weeklyTicketsIn: number[];
  weeklyTicketsResolved: number[];
  weeklyLabels: string[];
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
  fcrBreakdown?: {
    oneTouch: number;
    twoTouch: number;
    reopened: number;
  };
  frtDistribution?: {
    '0-1h': number;
    '1-8h': number;
    '8-24h': number;
    '>24h': number;
    'No Reply': number;
  }[];
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

const CompactChart: React.FC<{ title: string; inData: number[]; resolvedData: number[]; labels?: string[] }> = ({ title, inData, resolvedData, labels = [] }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const totalPoints = Math.min(inData.length, resolvedData.length);
  const sliceStart = Math.max(0, totalPoints - 4);
  const compactInData = inData.slice(sliceStart, totalPoints);
  const compactResolvedData = resolvedData.slice(sliceStart, totalPoints);

  const compactLabels = labels.length > 0
    ? labels.slice(sliceStart, sliceStart + compactInData.length)
    : Array.from({ length: compactInData.length }, (_, index) => {
        const offset = compactInData.length - index;
        const { start } = getWeekRange(offset);
        return `Week ${getZendeskWeekNumber(start)}`;
      });

  const maxValue = Math.max(1, ...compactInData, ...compactResolvedData);

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
              aria-label={`${compactLabels[index] ?? `Week ${index + 1}`}: ${inValue} tickets in, ${resolvedValue} resolved`}
            >
              {hoveredIndex === index && (
                <div className="absolute -top-16 bg-[rgba(35,36,36,0.9)] text-white text-[13px] px-3 py-2 rounded-lg whitespace-nowrap z-20 shadow-2xl border border-[rgba(255,255,255,0.1)] backdrop-blur-sm tooltip-enter">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between min-w-[120px]">
                      <div className="flex items-center">
                        <span className="text-[#CCCCCC] mr-2">In:</span>
                      </div>
                      <span className="text-[#5CD6C0] font-bold">{inValue}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="text-[#CCCCCC] mr-2">Resolved:</span>
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
                {compactLabels[index] ?? `Week ${index + 1}`}
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

const TrendChart: React.FC<{ title: string; data: number[]; color: string; unit?: string; labels?: string[] }> = ({ title, data, color, unit = '', labels = [] }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 320, height: 120 });

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: Math.max(width, 200),
          height: Math.max(height, 120)
        });
      }
    });

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);
  
  const trimmedData = [...(data || [])];
  const maxPoints = Math.min(5, trimmedData.length || 5);
  const chartData = trimmedData.slice(-maxPoints);

  if (chartData.length === 0) {
    chartData.push(0, 0, 0, 0, 0);
  }

  const minValue = Math.max(0, Math.min(...chartData) * 0.9);
  const maxValue = Math.max(...chartData) * 1.1;
  const range = maxValue - minValue || 1;

  const effectiveLabels = labels.length > 0
    ? labels.slice(-chartData.length)
    : Array.from({ length: chartData.length }, (_, index) => {
        const offset = chartData.length - index;
        const { start } = getWeekRange(offset);
        return `Week ${getZendeskWeekNumber(start)}`;
      });
  
  // Calculate y-axis ticks
  const yAxisTicks = 5;
  const yAxisValues = Array.from({ length: yAxisTicks }, (_, i) => {
    return minValue + (range * i) / (yAxisTicks - 1);
  });
  
  const CHART_WIDTH = dimensions.width;
  const CHART_HEIGHT = dimensions.height;
  const PADDING_X = 40;
  const PADDING_Y = 20;
  const CHART_LEFT = PADDING_X;
  const CHART_RIGHT = Math.max(CHART_WIDTH - PADDING_X, CHART_LEFT + 60);
  const CHART_TOP = PADDING_Y;
  const CHART_BOTTOM = Math.max(CHART_HEIGHT - PADDING_Y, CHART_TOP + 60);
  const xStepDenominator = Math.max(chartData.length - 1, 1);
  const computeX = (index: number) => CHART_LEFT + (index / xStepDenominator) * (CHART_RIGHT - CHART_LEFT);
  const computeY = (value: number) => CHART_BOTTOM - ((value - minValue) / range) * (CHART_BOTTOM - CHART_TOP);
  const computeXPercent = (index: number) => (computeX(index) / CHART_WIDTH) * 100;
  const computeYPercent = (value: number) => (computeY(value) / CHART_HEIGHT) * 100;

  // Calculate points for the line
  const points = chartData.map((value, index) => {
    const x = computeX(index);
    const y = computeY(value);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="bg-[#232424] rounded-xl p-6 shadow-lg">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      <div ref={containerRef} className="relative h-36 md:h-44">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="absolute inset-0 w-full h-full">
          {/* Y-axis */}
          <line x1={CHART_LEFT} y1={CHART_TOP} x2={CHART_LEFT} y2={CHART_BOTTOM} stroke="#374151" strokeWidth="1" />
          {/* X-axis */}
          <line x1={CHART_LEFT} y1={CHART_BOTTOM} x2={CHART_RIGHT} y2={CHART_BOTTOM} stroke="#374151" strokeWidth="1" />
          
          {/* Y-axis labels */}
          {yAxisValues.map((value, index) => {
            const y = CHART_BOTTOM - (index / (yAxisTicks - 1)) * (CHART_BOTTOM - CHART_TOP);
            return (
              <g key={index}>
                <line x1={CHART_LEFT - 5} y1={y} x2={CHART_LEFT} y2={y} stroke="#374151" strokeWidth="1" />
                <text x={CHART_LEFT - 10} y={y + 3} fill="#9CA3AF" fontSize="10" textAnchor="end">
                  {Math.round(value * 10) / 10}{unit}
                </text>
              </g>
            );
          })}
          
          {/* Grid lines */}
          {yAxisValues.map((_, index) => {
            const y = CHART_BOTTOM - (index / (yAxisTicks - 1)) * (CHART_BOTTOM - CHART_TOP);
            return (
              <line key={index} x1={CHART_LEFT} y1={y} x2={CHART_RIGHT} y2={y} stroke="#374151" strokeWidth="0.5" opacity="0.3" />
            );
          })}
          
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            points={points}
            className="drop-shadow-sm"
          />
          {chartData.map((value, index) => {
            const x = computeX(index);
            const y = computeY(value);
            const isCurrentWeek = false; // We're not showing current week
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

          {/* X-axis labels */}
          {effectiveLabels.map((week, index) => (
            <text key={`${week}-${index}`} x={computeX(index)} y={CHART_BOTTOM + 15} fill="#9CA3AF" fontSize="10" textAnchor="middle">
              {week}
            </text>
          ))}
        </svg>
        {hoveredIndex !== null && (
          <div 
            className="absolute bg-[rgba(35,36,36,0.9)] text-white text-[13px] px-3 py-2 rounded-lg whitespace-nowrap pointer-events-none z-10 border border-[rgba(255,255,255,0.1)] backdrop-blur-sm"
            style={{
              left: `${computeXPercent(hoveredIndex)}%`,
              top: `${computeYPercent(chartData[hoveredIndex])}%`,
              transform: 'translate(-50%, -120%)'
            }}
          >
            <div className="flex items-center">
              <span className="text-[#CCCCCC] mr-2">{effectiveLabels[hoveredIndex]}:</span>
              <span className="text-[#5CD6C0] font-bold">{chartData[hoveredIndex]}{unit}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

type TimeBracket = '0-1h' | '1-8h' | '8-24h' | '>24h' | 'No Reply';

type WeekData = {
  [key in TimeBracket]: number;
};

const FRTDistributionChart: React.FC = () => {
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null);
  const [hoveredCategory, setHoveredCategory] = useState<number | null>(null);
  
  // Get current week number (1-52)
  const weeks = Array.from({length: 4}, (_, i) => {
    const offset = 4 - i;
    const { start } = getWeekRange(offset);
    return `Week ${getZendeskWeekNumber(start)}`;
  });

  const categories: TimeBracket[] = ['0-1h', '1-8h', '8-24h', '>24h', 'No Reply'];
  const colors = ['#4FBDBA', '#F3C969', '#F47C7C', '#8B5CF6', '#6B7280'];
  
  // Sample data: percentage distribution for each week (last 4 weeks, excluding current)
  const chartData: WeekData[] = [
    { '0-1h': 45, '1-8h': 35, '8-24h': 15, '>24h': 4, 'No Reply': 1 },
    { '0-1h': 48, '1-8h': 32, '8-24h': 16, '>24h': 3, 'No Reply': 1 },
    { '0-1h': 52, '1-8h': 30, '8-24h': 14, '>24h': 3, 'No Reply': 1 },
    { '0-1h': 49, '1-8h': 33, '8-24h': 15, '>24h': 2, 'No Reply': 1 },
  ];

  return (
    <div className="bg-[#232424] rounded-xl p-6 shadow-lg">
      <h3 className="text-lg font-semibold text-white mb-4">Tickets by First Reply Time</h3>
      <div className="space-y-3">
        {weeks.map((week, weekIndex) => (
          <div
            key={weekIndex}
            className="relative"
            onMouseEnter={() => {
              setHoveredWeek(weekIndex);
              setHoveredCategory(null);
            }}
            onMouseLeave={() => {
              setHoveredWeek(null);
              setHoveredCategory(null);
            }}
          >
            <div className="flex items-center mb-1">
              <span className={`text-sm text-gray-400 pr-3 shrink-0 whitespace-nowrap ${weekIndex === weeks.length - 1 ? 'opacity-50' : ''}`}>
                {week}
              </span>
              <div className="flex-1 flex h-6 rounded overflow-visible">
                {categories.map((category, catIndex) => {
                  const value = chartData[weekIndex][category];
                  const rowHovered = hoveredWeek === weekIndex;
                  const segmentHovered = rowHovered && hoveredCategory === catIndex;
                  const barOpacity = rowHovered ? (segmentHovered ? 1 : 0.6) : 0.85;
                  
                  return (
                    <div
                      key={category}
                      className="transition-all duration-300 relative group"
                      style={{
                        width: `${value}%`,
                        backgroundColor: colors[catIndex],
                        opacity: barOpacity
                      }}
                      onMouseEnter={() => {
                        setHoveredWeek(weekIndex);
                        setHoveredCategory(catIndex);
                      }}
                      onMouseLeave={() => setHoveredCategory(null)}
                    >
                      {segmentHovered && (
                        <div 
                          className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-[rgba(35,36,36,0.95)] text-white text-xs px-3 py-2 rounded whitespace-nowrap z-50 border border-[rgba(255,255,255,0.2)] shadow-lg"
                          style={{
                            minWidth: '80px',
                            textAlign: 'center',
                            pointerEvents: 'none'
                          }}
                        >
                          <div className="flex flex-col items-center">
                            <span className="text-[#CCCCCC] text-xs font-medium">{category}</span>
                            <span className="text-[#5CD6C0] font-bold text-sm mt-0.5">{value}%</span>
                          </div>
                          <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-3 h-3 bg-[rgba(35,36,36,0.95)] rotate-45 -z-10 border-r border-b border-[rgba(255,255,255,0.2)]"></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-3 mt-4 text-xs">
        {categories.map((category, index) => {
          const isHovered = hoveredCategory === index;
          return (
            <div 
              key={index} 
              className="flex items-center cursor-pointer"
              onMouseEnter={() => setHoveredCategory(index)}
              onMouseLeave={() => setHoveredCategory(null)}
            >
              <div 
                className="w-3 h-3 rounded mr-1.5 transition-all" 
                style={{ 
                  backgroundColor: colors[index],
                  transform: isHovered ? 'scale(1.2)' : 'scale(1)'
                }}
              ></div>
              <span 
                className="text-gray-400 transition-colors"
                style={{
                  color: isHovered ? '#fff' : '#9CA3AF'
                }}
              >
                {category}
              </span>
            </div>
          );
        })}
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
      className="relative flex-1 flex flex-col items-center"
      onMouseEnter={() => setHoveredBar(index)}
      onMouseLeave={() => setHoveredBar(null)}
    >
      {hoveredBar === index && (
        <div className="absolute -top-16 bg-[rgba(35,36,36,0.9)] text-white text-[13px] px-3 py-2 rounded-lg whitespace-nowrap z-10 border border-[rgba(255,255,255,0.1)] backdrop-blur-sm">
          <div className="space-y-1">
            <div className="flex items-center justify-between min-w-[120px]">
              <div className="flex items-center">
                <span className="text-[#CCCCCC] mr-2">In:</span>
              </div>
              <span className="text-[#5CD6C0] font-bold">{inValue}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-[#CCCCCC] mr-2">Resolved:</span>
              </div>
              <span className="text-[#E5B567] font-bold">{resolvedValue}</span>
            </div>
          </div>
        </div>
      )}
      
      {/* 막대 컨테이너 - X축에 맞춰 정렬 */}
      <div className="w-full flex space-x-2 max-w-12" style={{ height: '120px', alignItems: 'flex-end' }}>
        <div
          className={`flex-1 bg-[#4FBDBA] rounded-t transition-all duration-300 hover:bg-[#4FBDBA]/80 ${isCurrentWeek ? 'opacity-50' : ''}`}
          style={{ height: `${(inValue / maxValue) * 120}px` }}
        />
        <div
          className={`flex-1 bg-[#F3C969] rounded-t transition-all duration-300 hover:bg-[#F3C969]/80 ${isCurrentWeek ? 'opacity-50' : ''}`}
          style={{ height: `${(resolvedValue / maxValue) * 120}px` }}
        />
      </div>
      
      {/* 주간 라벨 */}
      <span className={`text-xs text-gray-500 mt-1 ${isCurrentWeek ? 'opacity-50' : ''}`}>
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
              <Link href="/embed-chart" className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-[#282929]">
                <BarChart3 className="w-5 h-5" />
                <span>EmbedChart</span>
              </Link>
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
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [kpiData, setKpiData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);

  const brands = [
    { value: 'all', label: 'All Brands' },
    { value: 'brand-a', label: 'League of Kingdoms' },
    { value: 'brand-b', label: 'LOK Chronicle' },
    { value: 'brand-c', label: 'LOK Hunters' },
    { value: 'brand-d', label: 'Arena-Z' },
    { value: 'brand-e', label: 'The New Order' }
  ];

  const fetchKPIData = useCallback(async (brand: string = selectedBrand) => {
    try {
      setLoading(true);
      const url = brand === 'all' ? '/api/kpis' : `/api/kpis?brand=${brand}`;
      const response = await fetch(url);
      const data = await response.json();
      setKpiData(data);
    } catch (error) {
      console.error('Error fetching KPI data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedBrand]);

  useEffect(() => {
    fetchKPIData();
  }, [fetchKPIData]);

  // Calculate FCR breakdown with proper handling of zero values
  const fcrBreakdownData = (() => {
    const breakdown = kpiData?.fcrBreakdown || { oneTouch: 0, twoTouch: 0, reopened: 0 };
    const total = Math.max(1, breakdown.oneTouch + breakdown.twoTouch + breakdown.reopened);
    
    return [
      {
        title: 'One-touch',
        value: breakdown.oneTouch.toString(),
        percentage: `${((breakdown.oneTouch / total) * 100).toFixed(1)}%`,
        icon: <CheckCircle className="w-4 h-4" />,
        color: '#4FBDBA',
        show: breakdown.oneTouch > 0
      },
      {
        title: 'Two-touch',
        value: breakdown.twoTouch.toString(),
        percentage: `${((breakdown.twoTouch / total) * 100).toFixed(1)}%`,
        icon: <RefreshCw className="w-4 h-4" />,
        color: '#F3C969',
        show: breakdown.twoTouch > 0
      },
      {
        title: 'Re-opened',
        value: breakdown.reopened.toString(),
        percentage: `${((breakdown.reopened / total) * 100).toFixed(1)}%`,
        icon: <AlertCircle className="w-4 h-4" />,
        color: '#F47C7C',
        show: true // Always show Re-opened even if 0
      }
    ].filter(item => item.show);
  })();

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
            onClick={() => fetchKPIData()}
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
      value: kpiData?.weeklyTicketsIn?.[kpiData.weeklyTicketsIn.length - 1]?.toString() || '0',
      change: '+12.5%',
      trend: 'up' as const,
      icon: <FileText className="w-5 h-5" />,
      sparklineData: kpiData?.weeklyTicketsIn || [],
    },
    {
      title: 'Weekly Tickets Resolved',
      value: kpiData?.weeklyTicketsResolved?.[kpiData.weeklyTicketsResolved.length - 1]?.toString() || '0',
      change: '+8.3%',
      trend: 'up' as const,
      icon: <CheckCircle className="w-5 h-5" />,
      sparklineData: kpiData?.weeklyTicketsResolved || [],
    },
    {
      title: 'FRT Median',
      value: `${(kpiData?.frtMedian || 0).toFixed(1)}h`,
      change: '-15min',
      trend: 'up' as const,
      icon: <Clock className="w-5 h-5" />,
      sparklineData: kpiData?.trends?.frt || [],
    },
    {
      title: 'Average Handle Time',
      value: `${(kpiData?.avgHandleTime || 0).toFixed(1)}h`,
      change: '-2.1h',
      trend: 'up' as const,
      icon: <Clock className="w-5 h-5" />,
      sparklineData: kpiData?.trends?.aht || [],
    },
    {
      title: 'FCR %',
      value: `${(kpiData?.fcrRate || 0).toFixed(1)}%`,
      change: '+3.1%',
      trend: 'up' as const,
      icon: <TrendingUp className="w-5 h-5" />,
      sparklineData: kpiData?.trends?.fcr || [],
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
                        onChange={(e) => {
                          setSelectedBrand(e.target.value);
                          fetchKPIData(e.target.value);
                        }}
                        className="bg-[#282929] text-white px-4 py-2 rounded-lg border border-gray-600 focus:border-[#4FBDBA] focus:outline-none appearance-none pr-8"
                      >
                        {brands.map((brand) => (
                          <option key={brand.value} value={brand.value}>{brand.label}</option>
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
                  inData={kpiData?.weeklyTicketsIn || []}
                  resolvedData={kpiData?.weeklyTicketsResolved || []}
                  labels={kpiData?.weeklyLabels || []}
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
                          
                          {/* Y-axis labels - dynamic based on actual data */}
                          {(() => {
                            const allValues = [...(kpiData?.weeklyTicketsIn || []), ...(kpiData?.weeklyTicketsResolved || [])];
                            const maxValue = Math.max(...allValues, 1);
                            const step = Math.ceil(maxValue / 4);
                            const labels = [0, step, step * 2, step * 3, step * 4];
                            
                            return labels.map((value, index) => {
                              const y = 140 - (value / (step * 4)) * 120;
                              return (
                                <g key={index}>
                                  <line x1="35" y1={y} x2="40" y2={y} stroke="#374151" strokeWidth="1" />
                                  <text x="30" y={y + 3} fill="#9CA3AF" fontSize="10" textAnchor="end">
                                    {value}
                                  </text>
                                </g>
                              );
                            });
                          })()}
                          
                          {/* Grid lines - dynamic based on actual data */}
                          {(() => {
                            const allValues = [...(kpiData?.weeklyTicketsIn || []), ...(kpiData?.weeklyTicketsResolved || [])];
                            const maxValue = Math.max(...allValues, 1);
                            const step = Math.ceil(maxValue / 4);
                            const labels = [0, step, step * 2, step * 3, step * 4];
                            
                            return labels.map((value, index) => {
                              const y = 140 - (value / (step * 4)) * 120;
                              return (
                                <line key={index} x1="40" y1={y} x2="90%" y2={y} stroke="#374151" strokeWidth="0.5" opacity="0.2" />
                              );
                            });
                          })()}
                        </svg>
                        
                        <div className="h-40 flex items-end space-x-6 ml-12" style={{ height: '160px' }}>
                        {(kpiData?.weeklyTicketsIn || []).map((inValue, index) => {
                          const resolvedValue = kpiData?.weeklyTicketsResolved?.[index] || 0;
                          const allValues = [...(kpiData?.weeklyTicketsIn || []), ...(kpiData?.weeklyTicketsResolved || [])];
                          const maxValue = Math.max(...allValues, 1); // 최소값 1로 설정하여 0으로 나누기 방지
                          const isCurrentWeek = false; // Remove transparency for all weeks
                          const weekLabel = kpiData?.weeklyLabels?.[index] || `W-${4-index}`;
                          
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
                    data={kpiData?.trends?.frt || []} 
                    color="#4FBDBA" 
                    unit="h"
                    labels={kpiData?.weeklyLabels || []}
                  />
                  <FRTDistributionChart />
                </div>

                {/* Final Row: AHT + FCR% Trends */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <TrendChart 
                    title="Average Handle Time" 
                    data={kpiData?.trends?.aht || []} 
                    color="#F3C969" 
                    unit="min"
                    labels={kpiData?.weeklyLabels || []}
                  />
                  <TrendChart 
                    title="First Contact Resolution %" 
                    data={kpiData?.trends?.fcr || []} 
                    color="#4FBDBA" 
                    unit="%"
                    labels={kpiData?.weeklyLabels || []}
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
