import { IpadSplitLayoutProvider } from "@/components/chat/ipad-split-layout";
import { ChatPreviewScreen } from "@/components/chat/ChatPreviewScreen";
import { Redirect } from "expo-router";

export default function PreviewRoute() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  return (
    <IpadSplitLayoutProvider>
      <ChatPreviewScreen />
    </IpadSplitLayoutProvider>
  );
}
