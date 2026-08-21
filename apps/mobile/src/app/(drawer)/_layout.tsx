import { Stack } from "expo-router";

import { IpadSplitLayoutProvider } from "@/components/chat/ipad-split-layout";

export default function SessionStackLayout() {
  return (
    <IpadSplitLayoutProvider>
      <Stack
        screenOptions={{
          animation: "slide_from_right",
          contentStyle: { backgroundColor: "#000000" },
          gestureEnabled: true,
          gestureDirection: "horizontal",
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="chat" />
        {__DEV__ ? <Stack.Screen name="preview" /> : null}
      </Stack>
    </IpadSplitLayoutProvider>
  );
}
