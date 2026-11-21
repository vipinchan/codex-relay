import { useWindowDimensions } from "react-native";
import { ConversationsHome } from "@/components/chat/ConversationsHome";
import { SessionsWorkspace } from "@/components/chat/SessionsWorkspace";
import { IpadSplitLayoutProvider } from "@/components/chat/ipad-split-layout";
import { shouldShowDesktopWorkspace } from "@/components/chat/workspace-layout";

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const isWorkspace = shouldShowDesktopWorkspace(width);

  if (isWorkspace) {
    return (
      <IpadSplitLayoutProvider>
        <SessionsWorkspace />
      </IpadSplitLayoutProvider>
    );
  }

  return <ConversationsHome />;
}
