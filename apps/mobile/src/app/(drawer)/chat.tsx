import { useSelector } from "@legendapp/state/react";

import { ChatScreen } from "@/components/chat/ChatScreen";
import { NewChatWorkspaceScreen } from "@/components/chat/NewChatWorkspaceScreen";
import { chatStore$ } from "@/state/chat-store";

export default function ChatRoute() {
  const activeThreadId = useSelector(() => chatStore$.activeThreadId.get());
  const hasPairedSession = useSelector(() => chatStore$.hasPairedSession.get());

  if (!hasPairedSession) return <ChatScreen />;
  return activeThreadId ? <ChatScreen /> : <NewChatWorkspaceScreen />;
}
