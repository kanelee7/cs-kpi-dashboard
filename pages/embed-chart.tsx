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

  const svgWidth = 960;
  const svgHeight = 480; // 2:1 ratio
  const yAxisTop = 40;
  const yAxisBottom = svgHeight - 60;
  const yDrawHeight = yAxisBottom - yAxisTop; // 380
  const xAxisLeft = 80;
  const xAxisRight = svgWidth - 60;

  return (
    <div className="min-h-screen bg-[#1f2020] text-white">
      <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">
        {isLoading && (
          <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-[#4FBDBA]" />
            <p className="text-gray-400">Loading chart...</p>
          </div>
        )}
        {!isLoading && error && (
          <div className="text-red-400 text-base">{error}</div>
        )}
        {!isLoading && !error && chartData && chartData.labels.length > 0 && (
          <div className="w-full overflow-hidden rounded-2xl bg-[#232424] shadow-xl">
            {/* 제목 추가 */}
            <div className="px-8 pt-6 pb-1">
              <h2 className="text-xl font-semibold text-white">
                Weekly Tickets: In vs Resolved
              </h2>
            </div>

            <div className="w-full px-8 pb-1" style={{ aspectRatio: "2 / 1" }}>
              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                preserveAspectRatio="xMidYMid meet"
              >
                <rect x="0" y="0" width={svgWidth} height={svgHeight} fill="transparent" />
                
                {/* Y축 */}
                <line x1={xAxisLeft} y1={yAxisTop} x2={xAxisLeft} y2={yAxisBottom} stroke="#374151" strokeWidth="2" />
                
                {/* X축 */}
                <line x1={xAxisLeft} y1={yAxisBottom} x2={xAxisRight} y2={yAxisBottom} stroke="#374151" strokeWidth="2" />

                {/* Y축 그리드 라인과 라벨 */}
                {chartData.yAxisValues.map((value, index) => {
                  const safeMax = chartData.maxAxisValue === 0 ? 1 : chartData.maxAxisValue;
                  const y = yAxisBottom - (value / safeMax) * yDrawHeight;
                  return (
                    <g key={`y-${index}`}>
                      <line
                        x1={xAxisLeft}
                        y1={y}
                        x2={xAxisRight}
                        y2={y}
                        stroke="#374151"
                        strokeWidth="1"
                        opacity="0.2"
                      />
                      <text
                        x={xAxisLeft - 10}
                        y={y + 4}
                        fill="#9CA3AF"
                        fontSize="16"
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
                  const chartWidth = xAxisRight - xAxisLeft;
                  const groupWidth = chartWidth / totalGroups;
                  const centerX = xAxisLeft + (index + 0.5) * groupWidth;
                  
                  // 바 크기 계산
                  const barWidth = Math.min(50, groupWidth / 3);
                  const barSpacing = 4;
                  
                  // 높이 계산
                  const safeMax = chartData.maxAxisValue === 0 ? 1 : chartData.maxAxisValue;
                  const inHeight = Math.max(0, (inValue / safeMax) * yDrawHeight);
                  const resolvedHeight = Math.max(0, (resolvedValue / safeMax) * yDrawHeight);
                  
                  // 둥근 모서리 반경
                  const cornerRadiusIn = inHeight > 0 ? Math.min(8, barWidth / 2) : 0;
                  const cornerRadiusResolved = resolvedHeight > 0 ? Math.min(8, barWidth / 2) : 0;

                  const inLabelX = centerX - barSpacing / 2 - barWidth / 2;
                  const inLabelY = (yAxisBottom - inHeight) - 5;
                  const resolvedLabelX = centerX + barSpacing / 2 + barWidth / 2;
                  const resolvedLabelY = (yAxisBottom - resolvedHeight) - 5;

                  return (
                    <g key={`bar-${index}`}>
                      {/* Tickets In - Teal (왼쪽) */}
                      <rect
                        x={centerX - barWidth - barSpacing / 2}
                        y={yAxisBottom - inHeight}
                        width={barWidth}
                        height={inHeight}
                        fill="#4FBDBA"
                        rx={cornerRadiusIn}
                        ry={cornerRadiusIn}
                        style={{ fill: '#4FBDBA' }}
                      />
                      <text
                        x={inLabelX}
                        y={inLabelY}
                        textAnchor="middle"
                        dominantBaseline="auto"
                        fill="#F5F5F5"
                        fontSize="12px"
                        fontWeight="600"
                        fontFamily="Arial, sans-serif"
                      >
                        {Math.round(inValue)}
                      </text>
                      
                      {/* Resolved - Yellow (오른쪽) */}
                      <rect
                        x={centerX + barSpacing / 2}
                        y={yAxisBottom - resolvedHeight}
                        width={barWidth}
                        height={resolvedHeight}
                        fill="#F3C969"
                        rx={cornerRadiusResolved}
                        ry={cornerRadiusResolved}
                        style={{ fill: '#F3C969' }}
                      />
                      <text
                        x={resolvedLabelX}
                        y={resolvedLabelY}
                        textAnchor="middle"
                        dominantBaseline="auto"
                        fill="#F5F5F5"
                        fontSize="12px"
                        fontWeight="600"
                        fontFamily="Arial, sans-serif"
                      >
                        {Math.round(resolvedValue)}
                      </text>
                      
                      {/* X축 라벨 */}
                      <text 
                        x={centerX} 
                        y={yAxisBottom + 28}
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
            <div className="flex flex-wrap items-center justify-center gap-6 px-8 pb-6 pt-1">
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
