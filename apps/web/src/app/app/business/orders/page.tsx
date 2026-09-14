import { BusinessDataTable } from '@/components/business-data';
export default function Page() {
  return <BusinessDataTable kind="orders" title="Orders" description="Order records synced from connected business integrations." />;
}