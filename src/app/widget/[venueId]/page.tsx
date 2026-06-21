import { WidgetClient } from "./widget-client";

type WidgetPageProps = {
  params: Promise<{ venueId: string }>;
};

export const metadata = {
  title: "NightVibe busyness widget",
  robots: { index: false, follow: false },
};

export default async function WidgetPage({ params }: WidgetPageProps) {
  const { venueId } = await params;

  return <WidgetClient venueId={venueId} />;
}
