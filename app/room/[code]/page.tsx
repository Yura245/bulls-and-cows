import { RoomPage } from "@/components/room-page";

export default async function RoomRoute({ params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = await params;
  return <RoomPage code={resolvedParams.code} />;
}
