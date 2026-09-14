import { BusinessDataTable } from '@/components/business-data';
export default function Page() {
  return <BusinessDataTable kind="products" title="Products" description="Product records synced from connected business integrations." />;
}