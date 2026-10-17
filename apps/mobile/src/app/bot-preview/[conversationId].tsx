import { useLocalSearchParams } from "expo-router";

import { BotPreviewScreen } from "@/components/bots/BotPreviewScreen";

export default function BotPreviewRoute() {
  const { conversationId, filePath } = useLocalSearchParams<{
    conversationId: string;
    filePath?: string;
  }>();
  return <BotPreviewScreen conversationId={conversationId} filePath={filePath} />;
}
