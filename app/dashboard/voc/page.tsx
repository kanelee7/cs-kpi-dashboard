import VOCDashboard from '@/components/VOCDashboard';

export default function DashboardVocPage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">VOC Dashboard</h1>
      </div>
      <VOCDashboard />
    </section>
  );
}
