import { useSelector } from "@legendapp/state/react";

import { ChatScreen } from "@/components/chat/ChatScreen";
import { ConversationHistoryScreen } from "@/components/chat/ConversationHistoryScreen";
import { chatStore$ } from "@/state/chat-store";

export default function HomeScreen() {
  const activeThreadId = useSelector(() => chatStore$.activeThreadId.get());
  const hasPairedSession = useSelector(() => chatStore$.hasPairedSession.get());

  if (hasPairedSession && !activeThreadId) {
    return <ConversationHistoryScreen />;
  }

  return <ChatScreen />;
}
