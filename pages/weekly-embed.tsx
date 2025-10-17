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

export default function WeeklyEmbedPage(): JSX.Element {
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
            <div className="w-full" style={{ aspectRatio: "16 / 9" }}>
              <svg width="100%" height="100%" viewBox="0 0 960 540">
                <rect x="0" y="0" width="960" height="540" fill="transparent" />
                <line x1="80" y1="60" x2="80" y2="440" stroke="#374151" strokeWidth="2" />
                <line x1="80" y1="440" x2="900" y2="440" stroke="#374151" strokeWidth="2" />

                {chartData.yAxisValues.map((value, index) => {
                  const safeMax = chartData.maxAxisValue === 0 ? 1 : chartData.maxAxisValue;
                  const y = 440 - (value / safeMax) * 360;
                  return (
                    <g key={`y-${index}`}>
                      <line x1="80" y1={y} x2="900" y2={y} stroke="#374151" strokeWidth="1" opacity="0.2" />
                      <text x="70" y={y + 4} fill="#9CA3AF" fontSize="18" textAnchor="end">
                        {value}
                      </text>
                    </g>
                  );
                })}

                {chartData.inValues.map((inValue, index) => {
                  const resolvedValue = chartData.resolvedValues[index] ?? 0;
                  const label = chartData.labels[index] ?? "";
                  const barGroupWidth = 720 / Math.max(chartData.labels.length, 1);
                  const groupX = 120 + index * barGroupWidth;
                  const barWidth = Math.min(56, barGroupWidth / 2.4);
                  const safeMax = chartData.maxAxisValue === 0 ? 1 : chartData.maxAxisValue;
                  const inHeight = (inValue / safeMax) * 360;
                  const resolvedHeight = (resolvedValue / safeMax) * 360;

                  return (
                    <g key={`bar-${index}`}>
                      <rect
                        x={groupX - barWidth}
                        y={440 - inHeight}
                        width={barWidth}
                        height={inHeight}
                        fill="#4FBDBA"
                        rx="6"
                      />
                      <rect
                        x={groupX + 8}
                        y={440 - resolvedHeight}
                        width={barWidth}
                        height={resolvedHeight}
                        fill="#F3C969"
                        rx="6"
                      />
                      <text x={groupX + barWidth / 2} y="470" fill="#9CA3AF" fontSize="18" textAnchor="middle">
                        {label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 px-8 py-6">
              {LEGEND_ITEMS.map(item => (
                <div key={item.label} className="flex items-center text-sm text-gray-300">
                  <span className="mr-2 h-3 w-3 rounded" style={{ backgroundColor: item.color }} />
                  {item.label}
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
