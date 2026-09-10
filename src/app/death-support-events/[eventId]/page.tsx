import { PublicEventDetail } from "./public-event-detail";

export default async function DeathSupportEventDetail({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <PublicEventDetail eventId={eventId} />;
}
