import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getPublicVehicleBySlug } from '@/lib/services/public-inventory';
import { getViewingFee } from '@/lib/services/booking-settings';
import { mpesa } from '@/lib/services/payments';
import VehicleDetails from './vehicle-details';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const result = await getPublicVehicleBySlug((await params).slug);
  return { title: result.kind === 'found' ? `${result.vehicle.title} | JoyCars` : 'Vehicle | JoyCars' };
}
export default async function VehiclePage({ params }: { params: Promise<{ slug: string }> }) {
  const result = await getPublicVehicleBySlug((await params).slug);
  if (result.kind === 'redirect') permanentRedirect(`/vehicles/${result.slug}`);
  if (result.kind !== 'found') notFound();
  return <VehicleDetails vehicle={result.vehicle} feeKes={await getViewingFee()} paymentsEnabled={Boolean(mpesa())} />;
}
