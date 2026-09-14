import { BusinessDataTable } from '@/components/business-data';
export default function Page() {
  return <BusinessDataTable kind="leads" title="Leads" description="Lead records synced from connected business integrations." />;
}