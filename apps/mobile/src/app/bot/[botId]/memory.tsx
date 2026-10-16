import { useLocalSearchParams } from "expo-router";

import { BotMemoryScreen } from "@/components/bots/BotMemoryScreen";

export default function BotMemoryRoute() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  return <BotMemoryScreen botId={botId} />;
}
