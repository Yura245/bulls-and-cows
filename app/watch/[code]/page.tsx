import { WatchPage } from "@/components/watch-page";

export default async function WatchRoute({
  params,
  searchParams
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  return <WatchPage code={resolvedParams.code} spectatorKey={resolvedSearchParams.key ?? ""} />;
}
