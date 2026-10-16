import { useLocalSearchParams } from "expo-router";

import { BotHistoryScreen } from "@/components/bots/BotHistoryScreen";

export default function BotHistoryRoute() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  return <BotHistoryScreen botId={botId} />;
}
