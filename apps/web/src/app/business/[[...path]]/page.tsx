import { redirect } from 'next/navigation';

export default async function BusinessRoute({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  redirect(`/app/business/${path.length ? path.join('/') : 'overview'}`);
}
