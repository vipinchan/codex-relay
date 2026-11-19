import type { MessageFileRequest } from "codex-relay/api-schema";
import { router } from "expo-router";
import { Alert } from "react-native";

import {
  downloadMessageFile,
  getMessageFileState,
  messageFileKey,
} from "@/lib/message-file-downloads";

export function openExternalImage(url: string) {
  router.push({ pathname: "/image-viewer", params: { uri: url, title: "Image" } });
}

export async function openMessageImage(request: MessageFileRequest) {
  const key = messageFileKey(request);
  if (getMessageFileState(key)?.status !== "ready") {
    await downloadMessageFile(request);
  }
  const state = getMessageFileState(key);
  if (state?.status !== "ready") {
    Alert.alert("Couldn't open image", "The image could not be downloaded.");
    return;
  }
  router.push({ pathname: "/image-viewer", params: { uri: state.file.uri, title: "Image" } });
}
