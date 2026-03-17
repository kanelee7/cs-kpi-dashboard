import { redirect } from 'next/navigation';

export default function DashboardPage({
  searchParams,
}: {
  searchParams?: { brand?: string };
}) {
  const brand = (searchParams?.brand || 'all').trim().toLowerCase();
  redirect(`/dashboard/overview?brand=${encodeURIComponent(brand)}`);
}
