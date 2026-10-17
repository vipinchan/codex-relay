import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

import { uploadImageAttachments } from "./codex-relay-api";
import { appendComposerAttachments, getComposerAttachments } from "@/state/chat-store";

const MAX_IMAGE_ATTACHMENTS = 3;
const MAX_ATTACHMENT_PAYLOAD_BYTES = 8 * 1024 * 1024;

export async function attachComposerImages(composerId?: string) {
  const remainingSlots = MAX_IMAGE_ATTACHMENTS - getComposerAttachments(composerId).length;
  if (remainingSlots <= 0) {
    Alert.alert("Image limit reached", `Attach up to ${MAX_IMAGE_ATTACHMENTS} images at a time.`);
    return;
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert("Photo access required", "Allow photo library access to attach images.");
    return;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    allowsMultipleSelection: true,
    mediaTypes: ["images"],
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    quality: 0.72,
    selectionLimit: remainingSlots,
    shouldDownloadFromNetwork: true,
  });
  if (result.canceled) return;

  let acceptedBytes = 0;
  let skipped = 0;
  const assets = result.assets.flatMap((asset) => {
    const size = asset.fileSize ?? 0;
    if (acceptedBytes + size > MAX_ATTACHMENT_PAYLOAD_BYTES) {
      skipped++;
      return [];
    }
    acceptedBytes += size;
    return [asset];
  });
  if (!assets.length) throw new Error("Choose a smaller image and try again.");

  const uploaded = await uploadImageAttachments(
    assets.map((asset, index) => ({
      mimeType: asset.mimeType ?? "image/jpeg",
      name: asset.fileName ?? `image-${index + 1}.jpg`,
      uri: asset.uri,
    })),
  );
  const attachments = uploaded.attachments.flatMap((attachment, index) => {
    const asset = assets[index];
    if (!asset) {
      skipped++;
      return [];
    }
    return [
      {
        id: `${Date.now()}-${index}-${asset.assetId ?? asset.uri}`,
        mimeType: attachment.mimeType ?? asset.mimeType ?? "image/jpeg",
        name: attachment.name ?? asset.fileName ?? undefined,
        path: attachment.path,
        uri: asset.uri,
        url: attachment.url,
      },
    ];
  });
  if (!attachments.length) throw new Error("Could not read the selected image.");
  appendComposerAttachments(attachments, composerId);
  if (skipped) {
    Alert.alert(
      "Some images were skipped",
      "Choose fewer or smaller images so the chat stays stable.",
    );
  }
}
