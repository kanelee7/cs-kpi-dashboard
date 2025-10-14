'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface KPIData {
  id: string
  brand: string
  week_start_date: string
  week_end_date: string
  week_label: string
  tickets_in: number
  tickets_resolved: number
  frt_median: number
  aht: number
  fcr_percent: number
  frt_distribution: {
    "0-1h": number
    "1-8h": number
    "8-24h": number
    ">24h": number
    "No Reply": number
  }
  fcr_breakdown: {
    oneTouch: number
    twoTouch: number
    reopened: number
  }
}

export default function DashboardPage() {
  const [kpiData, setKpiData] = useState<KPIData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBrand, setSelectedBrand] = useState('all')
  const [timeRange, setTimeRange] = useState('5w')

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/kpis?brand=${selectedBrand}`)
        if (!response.ok) {
          throw new Error('Failed to fetch KPI data')
        }
        const data = await response.json()
        // Ensure data is an array before setting state
        if (Array.isArray(data)) {
          setKpiData(data)
        } else {
          console.error('Expected array but got:', data)
          setKpiData([])
        }
      } catch (error) {
        console.error('Error fetching KPI data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [selectedBrand, timeRange])

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num)
  }

  const formatPercentage = (num: number) => {
    return new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 1 }).format(num / 100)
  }

  const formatTime = (minutes: number) => {
    if (minutes < 60) {
      return `${Math.round(minutes)}분`
    } else {
      const hours = Math.floor(minutes / 60)
      const mins = Math.round(minutes % 60)
      return `${hours}시간 ${mins}분`
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="grid gap-6">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">CS KPI 대시보드</h1>
        <div className="flex gap-4">
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="px-4 py-2 border rounded-md"
          >
            <option value="all">전체 브랜드</option>
            <option value="brand-a">브랜드 A</option>
            <option value="brand-b">브랜드 B</option>
            <option value="brand-c">브랜드 C</option>
            <option value="brand-d">브랜드 D</option>
            <option value="brand-e">브랜드 E</option>
          </select>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 border rounded-md"
          >
            <option value="5w">최근 5주</option>
            <option value="10w">최근 10주</option>
            <option value="15w">최근 15주</option>
          </select>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">개요</TabsTrigger>
          <TabsTrigger value="frt">응답 시간</TabsTrigger>
          <TabsTrigger value="fcr">1차 해결률</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">총 티켓 수</CardTitle>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  className="h-4 w-4 text-muted-foreground"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(kpiData.reduce((sum, kpi) => sum + kpi.tickets_in, 0))}
                </div>
                <p className="text-xs text-muted-foreground">
                  지난 {kpiData.length}주간 누적
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">해결된 티켓</CardTitle>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  className="h-4 w-4 text-muted-foreground"
                >
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(kpiData.reduce((sum, kpi) => sum + kpi.tickets_resolved, 0))}
                </div>
                <p className="text-xs text-muted-foreground">
                  해결률: {kpiData.length > 0 ? formatPercentage(kpiData.reduce((sum, kpi) => sum + kpi.tickets_resolved, 0) / kpiData.reduce((sum, kpi) => sum + kpi.tickets_in, 0) * 100) : '0%'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">평균 응답 시간</CardTitle>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  className="h-4 w-4 text-muted-foreground"
                >
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {kpiData.length > 0 ? formatTime(kpiData.reduce((sum, kpi) => sum + kpi.frt_median, 0) / kpiData.length) : 'N/A'}
                </div>
                <p className="text-xs text-muted-foreground">
                  중앙값 기준
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">1차 해결률</CardTitle>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  className="h-4 w-4 text-muted-foreground"
                >
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {kpiData.length > 0 ? formatPercentage(kpiData.reduce((sum, kpi) => sum + kpi.fcr_percent, 0) / kpiData.length) : 'N/A'}
                </div>
                <p className="text-xs text-muted-foreground">
                  평균 1차 해결률
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4">
              <CardHeader>
                <CardTitle>주간 티켓 추이</CardTitle>
              </CardHeader>
              <CardContent className="pl-2">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={kpiData.slice(-5).map((item, index, array) => ({
                        ...item,
                        // Ensure we're showing the most recent 5 weeks in chronological order
                        week_label: array[array.length - 5 + index]?.week_label || item.week_label
                      }))}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week_label" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="tickets_in" name="수신 티켓" stroke="#8884d8" activeDot={{ r: 8 }} />
                      <Line type="monotone" dataKey="tickets_resolved" name="해결된 티켓" stroke="#82ca9d" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>응답 시간 분포</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[kpiData.length > 0 ? kpiData[kpiData.length - 1] : {}]}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="frt_distribution.0-1h" name="0-1시간" fill="#8884d8" />
                      <Bar dataKey="frt_distribution.1-8h" name="1-8시간" fill="#82ca9d" />
                      <Bar dataKey="frt_distribution.8-24h" name="8-24시간" fill="#ffc658" />
                      <Bar dataKey="frt_distribution.>24h" name="24시간 이상" fill="#ff8042" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="frt" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>응답 시간 추이</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={kpiData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week_label" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="frt_median" name="중앙 응답 시간 (분)" stroke="#8884d8" activeDot={{ r: 8 }} />
                    <Line type="monotone" dataKey="aht" name="평균 처리 시간 (분)" stroke="#82ca9d" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fcr" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>1차 해결률 추이</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={kpiData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week_label" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`${value}%`, '1차 해결률']} />
                    <Legend />
                    <Line type="monotone" dataKey="fcr_percent" name="1차 해결률" stroke="#8884d8" activeDot={{ r: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
