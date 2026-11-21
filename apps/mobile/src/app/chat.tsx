import { useEffect } from "react";
import { useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useSelector } from "@legendapp/state/react";

import { ChatScreen } from "@/components/chat/ChatScreen";
import { NewChatWorkspaceScreen } from "@/components/chat/NewChatWorkspaceScreen";
import { IpadSplitLayoutProvider } from "@/components/chat/ipad-split-layout";
import { shouldShowDesktopWorkspace } from "@/components/chat/workspace-layout";
import { chatStore$ } from "@/state/chat-store";

export default function ChatRoute() {
  const { width } = useWindowDimensions();
  const isWorkspace = shouldShowDesktopWorkspace(width);
  const activeThreadId = useSelector(() => chatStore$.activeThreadId.get());
  const hasPairedSession = useSelector(() => chatStore$.hasPairedSession.get());

  useEffect(() => {
    if (isWorkspace) {
      router.replace("/(drawer)");
    }
  }, [isWorkspace]);

  if (isWorkspace) {
    return null;
  }

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
