import { useLocalSearchParams } from "expo-router";

import { BotDefinitionEditorScreen } from "@/components/bots/BotDefinitionEditorScreen";

export default function BotDefinitionRoute() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  return <BotDefinitionEditorScreen botId={botId} />;
}
