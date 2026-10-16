import { useLocalSearchParams } from "expo-router";

import { BotChatScreen } from "@/components/bots/BotChatScreen";

export default function BotChatRoute() {
  const { conversationId, messageId } = useLocalSearchParams<{
    conversationId: string;
    messageId?: string;
  }>();
  return (
    <BotChatScreen key={conversationId} conversationId={conversationId} messageId={messageId} />
  );
}
