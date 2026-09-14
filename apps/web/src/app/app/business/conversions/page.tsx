import { BusinessDataTable } from '@/components/business-data';
export default function Page() {
  return <BusinessDataTable kind="conversions" title="Conversions" description="Conversion records synced from connected business integrations." />;
}