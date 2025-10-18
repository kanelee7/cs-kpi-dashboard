"use client";

import React, { useEffect, useMemo, useState } from "react";

type WeeklyKPIResponse = {
  weeklyTicketsIn: number[];
  weeklyTicketsResolved: number[];
  weeklyLabels: string[];
};

const LEGEND_ITEMS = [
  { label: "Tickets In", color: "#4FBDBA" },
  { label: "Resolved", color: "#F3C969" },
];

function computeYAxis(stepCount: number, values: number[]): number[] {
  const maxValue = Math.max(1, ...values);
  const step = Math.ceil(maxValue / (stepCount - 1));
  return Array.from({ length: stepCount }, (_, index) => step * index);
}

export default function EmbedChartPage(): JSX.Element {
  const [data, setData] = useState<WeeklyKPIResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("/api/kpis");
        const payload = await response.json();
        setData({
          weeklyTicketsIn: payload.weeklyTicketsIn ?? [],
          weeklyTicketsResolved: payload.weeklyTicketsResolved ?? [],
          weeklyLabels: payload.weeklyLabels ?? [],
        });
      } catch (err) {
        console.error("Failed to fetch KPI data", err);
        setError("Failed to load data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const chartData = useMemo(() => {
    if (!data) {
      return null;
    }

    const { weeklyTicketsIn, weeklyTicketsResolved } = data;
    const totalPoints = Math.min(weeklyTicketsIn.length, weeklyTicketsResolved.length);
    const labels = data.weeklyLabels.slice(-totalPoints);
    const inValues = weeklyTicketsIn.slice(-totalPoints);
    const resolvedValues = weeklyTicketsResolved.slice(-totalPoints);
    const yAxisValues = computeYAxis(5, [...inValues, ...resolvedValues]);

    const maxAxisValue = yAxisValues[yAxisValues.length - 1] || 1;

    return { labels, inValues, resolvedValues, yAxisValues, maxAxisValue };
  }, [data]);

  return (
    <div className="min-h-screen bg-[#1f2020] text-white">
      <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">
        {isLoading && (
          <div className="text-gray-300 text-base">Loading chart...</div>
        )}
        {!isLoading && error && (
          <div className="text-red-400 text-base">{error}</div>
        )}
        {!isLoading && !error && chartData && chartData.labels.length > 0 && (
          <div className="w-full overflow-hidden rounded-2xl bg-[#232424] shadow-xl">
            {/* 제목 추가 */}
            <div className="px-8 pt-6 pb-4">
              <h2 className="text-xl font-semibold text-white">
                Weekly Tickets: In vs Resolved
              </h2>
            </div>

            <div className="w-full px-8" style={{ aspectRatio: "16 / 9" }}>
              <svg width="100%" height="100%" viewBox="0 0 960 540" preserveAspectRatio="xMidYMid meet">
                <rect x="0" y="0" width="960" height="540" fill="transparent" />
                
                {/* Y축 */}
                <line x1="80" y1="60" x2="80" y2="440" stroke="#374151" strokeWidth="2" />
                
                {/* X축 */}
                <line x1="80" y1="440" x2="900" y2="440" stroke="#374151" strokeWidth="2" />

                {/* Y축 그리드 라인과 라벨 */}
                {chartData.yAxisValues.map((value, index) => {
                  const safeMax = chartData.maxAxisValue === 0 ? 1 : chartData.maxAxisValue;
                  const y = 440 - (value / safeMax) * 380;
                  return (
                    <g key={`y-${index}`}>
                      <line 
                        x1="80" 
                        y1={y} 
                        x2="900" 
                        y2={y} 
                        stroke="#374151" 
                        strokeWidth="1" 
                        opacity="0.2" 
                      />
                      <text 
                        x="70" 
                        y={y + 4} 
                        fill="#9CA3AF" 
                        fontSize="18" 
                        textAnchor="end"
                      >
                        {value}
                      </text>
                    </g>
                  );
                })}

                {/* 바 차트 */}
                {chartData.inValues.map((inValue, index) => {
                  const resolvedValue = chartData.resolvedValues[index] ?? 0;
                  const label = chartData.labels[index] ?? "";
                  
                  // 위치 계산
                  const totalGroups = chartData.labels.length;
                  const chartWidth = 820;
                  const groupWidth = chartWidth / totalGroups;
                  const centerX = 80 + (index + 0.5) * groupWidth;
                  
                  // 바 크기 계산
                  const barWidth = Math.min(50, groupWidth / 3);
                  const barSpacing = 4;
                  
                  // 높이 계산
                  const safeMax = chartData.maxAxisValue === 0 ? 1 : chartData.maxAxisValue;
                  const inHeight = Math.max(0, (inValue / safeMax) * 380);
                  const resolvedHeight = Math.max(0, (resolvedValue / safeMax) * 380);
                  
                  // 둥근 모서리 반경
                  const cornerRadiusIn = inHeight > 0 ? Math.min(8, barWidth / 2) : 0;
                  const cornerRadiusResolved = resolvedHeight > 0 ? Math.min(8, barWidth / 2) : 0;

                  return (
                    <g key={`bar-${index}`}>
                      {/* Tickets In - Teal (왼쪽) */}
                      <rect
                        x={centerX - barWidth - barSpacing / 2}
                        y={440 - inHeight}
                        width={barWidth}
                        height={inHeight}
                        fill="#4FBDBA"
                        rx={cornerRadiusIn}
                        ry={cornerRadiusIn}
                        style={{ fill: '#4FBDBA' }}
                      />
                      
                      {/* Resolved - Yellow (오른쪽) */}
                      <rect
                        x={centerX + barSpacing / 2}
                        y={440 - resolvedHeight}
                        width={barWidth}
                        height={resolvedHeight}
                        fill="#F3C969"
                        rx={cornerRadiusResolved}
                        ry={cornerRadiusResolved}
                        style={{ fill: '#F3C969' }}
                      />
                      
                      {/* X축 라벨 */}
                      <text 
                        x={centerX} 
                        y="470" 
                        fill="#9CA3AF" 
                        fontSize="16" 
                        textAnchor="middle"
                        style={{ fill: '#9CA3AF' }}
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* 범례 - 수정된 부분 */}
            <div className="flex flex-wrap items-center justify-center gap-6 px-8 py-6">
              {LEGEND_ITEMS.map(item => (
                <div key={item.label} className="flex items-center gap-2 text-sm text-gray-300">
                  <span 
                    className="block h-3 w-3 rounded"
                    style={{ 
                      backgroundColor: item.color,
                      minWidth: '12px',
                      minHeight: '12px'
                    }}
                  />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {!isLoading && !error && chartData && chartData.labels.length === 0 && (
          <div className="text-gray-400 text-base">No weekly ticket data available.</div>
        )}
      </div>
    </div>
  );
}
