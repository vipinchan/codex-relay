import { useSelector } from "@legendapp/state/react";

import { ChatScreen } from "@/components/chat/ChatScreen";
import { NewChatWorkspaceScreen } from "@/components/chat/NewChatWorkspaceScreen";
import { IpadSplitLayoutProvider } from "@/components/chat/ipad-split-layout";
import { chatStore$ } from "@/state/chat-store";

export default function ChatRoute() {
  const activeThreadId = useSelector(() => chatStore$.activeThreadId.get());
  const hasPairedSession = useSelector(() => chatStore$.hasPairedSession.get());

  return (
    <IpadSplitLayoutProvider>
      {!hasPairedSession ? (
        <ChatScreen />
      ) : activeThreadId ? (
        <ChatScreen />
      ) : (
        <NewChatWorkspaceScreen />
      )}
    </IpadSplitLayoutProvider>
  );
}
