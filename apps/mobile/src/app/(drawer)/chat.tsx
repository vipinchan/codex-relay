import { useSelector } from "@legendapp/state/react";

import { ChatScreen } from "@/components/chat/ChatScreen";
import { NewChatWorkspaceScreen } from "@/components/chat/NewChatWorkspaceScreen";
import { chatStore$ } from "@/state/chat-store";

export default function ChatRoute() {
  const activeThreadId = useSelector(() => chatStore$.activeThreadId.get());

  return activeThreadId ? <ChatScreen /> : <NewChatWorkspaceScreen />;
}
