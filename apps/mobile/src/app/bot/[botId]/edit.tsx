import { useLocalSearchParams } from "expo-router";

import { BotEditorScreen } from "@/components/bots/BotEditorScreen";

export default function EditBotRoute() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  return <BotEditorScreen botId={botId} />;
}
