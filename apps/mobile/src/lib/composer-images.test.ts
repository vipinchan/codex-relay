import { expect, it, vi } from "vitest";
import { invalidateConnection } from "./connection-context";

const mocks = vi.hoisted(() => ({
  pick: vi.fn<() => Promise<unknown>>(),
  upload: vi.fn<() => Promise<unknown>>(),
  append: vi.fn<() => void>(),
}));
vi.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
  launchImageLibraryAsync: mocks.pick,
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: "compatible" },
}));
vi.mock("react-native", () => ({ Alert: { alert: vi.fn<() => void>() } }));
vi.mock("./codex-relay-api", () => ({ uploadImageAttachments: mocks.upload }));
vi.mock("@/state/chat-store", () => ({
  getComposerAttachments: () => [],
  appendComposerAttachments: mocks.append,
}));

it("does not upload an image to another computer after switching in the picker", async () => {
  let finish!: (value: unknown) => void;
  mocks.pick.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { attachComposerImages } = await import("./composer-images");
  const operation = attachComposerImages("same-thread");
  await vi.waitFor(() => expect(mocks.pick).toHaveBeenCalledOnce());
  invalidateConnection();
  finish({ canceled: false, assets: [{ uri: "file:///image.jpg" }] });
  await operation.catch(() => undefined);
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.append).not.toHaveBeenCalled();
});
