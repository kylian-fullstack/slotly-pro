import { BookingFlow } from "./booking-flow";

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <BookingFlow slug={slug} />;
}
