import { useLocalSearchParams } from "expo-router";

import { BotChatScreen } from "@/components/bots/BotChatScreen";

export default function BotChatRoute() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  return <BotChatScreen key={conversationId} conversationId={conversationId} />;
}
