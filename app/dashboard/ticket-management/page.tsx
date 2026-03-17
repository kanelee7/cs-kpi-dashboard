import DevSummaryTool from '@/components/DevSummaryTool';

export default function DashboardTicketManagementPage() {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Ticket Management</h1>
      </div>
      <DevSummaryTool />
    </section>
  );
}
