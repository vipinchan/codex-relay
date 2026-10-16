import { useLocalSearchParams } from "expo-router";

import { BotDetailScreen } from "@/components/bots/BotDetailScreen";

export default function BotDetailRoute() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  return <BotDetailScreen botId={botId} />;
}
