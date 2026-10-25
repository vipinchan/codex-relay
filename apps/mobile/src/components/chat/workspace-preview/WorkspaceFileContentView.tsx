import { memo, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { WebView, type WebViewProps } from "react-native-webview";

import { Image } from "expo-image";

import { ThemedText } from "@/components/themed-text";
import { Colors, Spacing } from "@/constants/theme";

export const WorkspaceFileContentView = memo(function WorkspaceFileContentView({
  base64Content,
  content,
  isImage,
  mimeType,
  viewMode,
}: {
  base64Content: string;
  content: string;
  isImage: boolean;
  mimeType: string | null;
  viewMode: "render" | "source";
}) {
  const [webViewError, setWebViewError] = useState<string | null>(null);

  const imageSource = useMemo(
    () => ({ uri: `data:${mimeType ?? "application/octet-stream"};base64,${base64Content}` }),
    [base64Content, mimeType],
  );

  if (isImage && viewMode === "render") {
    return (
      <View style={styles.imageFrame}>
        <Pressable accessibilityLabel="Preview image" style={styles.imagePress}>
          <Image
            contentFit="contain"
            placeholder={null}
            source={imageSource}
            style={styles.image}
          />
        </Pressable>
      </View>
    );
  }

  if (viewMode === "render") {
    return (
      <View style={styles.renderFrame}>
        <WebView
          originWhitelist={["*"]}
          renderError={(name) => (
            <View style={styles.renderError}>
              <ThemedText type="smallBold">Unable to render HTML</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                {name || "The page failed to load."}
              </ThemedText>
            </View>
          )}
          onError={(event) => setWebViewError(event.nativeEvent.description || null)}
          scalesPageToFit
          setSupportMultipleWindows={false}
          source={{ baseUrl: "about:blank", html: content }}
          startInLoadingState
          style={styles.renderWebView}
          {...htmlWebViewSecurityProps}
        />
        {webViewError ? (
          <View style={styles.renderErrorBar}>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {webViewError}
            </ThemedText>
          </View>
        ) : null}
      </View>
    );
  }

  return null;
});

const htmlWebViewSecurityProps: Pick<
  WebViewProps,
  "allowFileAccess" | "javaScriptEnabled" | "domStorageEnabled"
> = {
  allowFileAccess: false,
  javaScriptEnabled: true,
  domStorageEnabled: false,
};

const styles = StyleSheet.create({
  imageFrame: {
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundElement,
    borderColor: "rgba(132, 145, 165, 0.2)",
    borderCurve: "continuous",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 220,
    overflow: "hidden",
    padding: Spacing.two,
  },
  imagePress: {
    flex: 1,
    width: "100%",
  },
  image: {
    flex: 1,
    resizeMode: "contain",
    width: "100%",
  },
  renderFrame: {
    backgroundColor: Colors.dark.backgroundElement,
    borderColor: "rgba(132, 145, 165, 0.2)",
    borderCurve: "continuous",
    borderRadius: 8,
    borderWidth: 1,
    height: 420,
    overflow: "hidden",
  },
  renderWebView: {
    backgroundColor: "#FFFFFF",
    flex: 1,
  },
  renderError: {
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundElement,
    flex: 1,
    gap: Spacing.one,
    justifyContent: "center",
    padding: Spacing.three,
  },
  renderErrorBar: {
    backgroundColor: "rgba(248, 113, 113, 0.12)",
    borderColor: "rgba(248, 113, 113, 0.3)",
    borderTopWidth: 1,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
});
