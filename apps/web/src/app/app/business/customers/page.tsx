import { BusinessDataTable } from '@/components/business-data';
export default function Page() {
  return <BusinessDataTable kind="customers" title="Customers" description="Customer records synced from connected business integrations." />;
}