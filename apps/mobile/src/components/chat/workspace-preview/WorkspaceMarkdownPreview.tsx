import { useMemo } from "react";
import { openBrowserAsync, WebBrowserPresentationStyle } from "expo-web-browser";
import {
  EnrichedMarkdownText,
  type LinkPressEvent,
  type MarkdownStyle,
  type TextSelectionMenuConfig,
} from "react-native-enriched-markdown";

import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

const MARKDOWN_SELECTION_MENU_CONFIG = {
  copyAsMarkdown: { enabled: true },
  copyImageUrl: { enabled: true },
} satisfies TextSelectionMenuConfig;

export function WorkspaceMarkdownPreview({ markdown }: { markdown: string }) {
  const theme = useTheme();
  const markdownStyle = useMemo(() => workspaceMarkdownStyle(theme), [theme]);

  return (
    <EnrichedMarkdownText
      allowFontScaling={false}
      allowTrailingMargin={false}
      enableLinkPreview
      flavor="github"
      markdown={markdown || " "}
      markdownStyle={markdownStyle}
      maxFontSizeMultiplier={1}
      md4cFlags={{ latexMath: true, underline: false }}
      onLinkPress={handleMarkdownLinkPress}
      selectable
      selectionColor={theme.accentBorder}
      selectionHandleColor={theme.accentStrong}
      selectionMenuConfig={MARKDOWN_SELECTION_MENU_CONFIG}
      spoilerOverlay="solid"
    />
  );
}

export function isMarkdownLanguage(language: string) {
  return language === "markdown" || language === "mdx";
}

function handleMarkdownLinkPress(event: LinkPressEvent) {
  const url = event.url.trim();
  if (!/^https?:\/\//i.test(url)) {
    return;
  }

  void openBrowserAsync(url, {
    presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
  });
}

function workspaceMarkdownStyle(theme: ReturnType<typeof useTheme>): MarkdownStyle {
  return {
    blockquote: {
      backgroundColor: theme.accentSoft,
      borderColor: theme.accentStrong,
      borderWidth: 2,
      color: theme.text,
      fontFamily: Fonts.sans,
      fontSize: 14,
      gapWidth: 8,
      lineHeight: 21,
      marginBottom: 10,
      marginTop: 0,
    },
    code: {
      backgroundColor: theme.inlineCodeBackground,
      borderColor: theme.inlineCodeBorder,
      color: theme.inlineCodeText,
      fontFamily: Fonts.monoMedium,
      fontSize: 13,
    },
    codeBlock: {
      backgroundColor: theme.backgroundSelected,
      borderColor: theme.borderStrong,
      borderRadius: 8,
      borderWidth: 1,
      color: theme.text,
      fontFamily: Fonts.mono,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 10,
      padding: 10,
    },
    h1: {
      color: theme.text,
      fontFamily: Fonts.sansSemiBold,
      fontSize: 20,
      lineHeight: 26,
      marginBottom: 10,
      marginTop: 0,
    },
    h2: {
      color: theme.text,
      fontFamily: Fonts.sansSemiBold,
      fontSize: 17,
      lineHeight: 23,
      marginBottom: 8,
      marginTop: 12,
    },
    h3: {
      color: theme.text,
      fontFamily: Fonts.sansSemiBold,
      fontSize: 15,
      lineHeight: 21,
      marginBottom: 6,
      marginTop: 10,
    },
    h4: {
      color: theme.text,
      fontFamily: Fonts.sansSemiBold,
      fontSize: 14,
      lineHeight: 20,
      marginBottom: 5,
      marginTop: 8,
    },
    h5: {
      color: theme.text,
      fontFamily: Fonts.sansSemiBold,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 4,
      marginTop: 8,
    },
    h6: {
      color: theme.textSecondary,
      fontFamily: Fonts.sansSemiBold,
      fontSize: 12,
      lineHeight: 18,
      marginBottom: 4,
      marginTop: 8,
    },
    em: {
      color: theme.text,
      fontFamily: Fonts.sans,
      fontStyle: "italic",
    },
    image: {
      borderRadius: 8,
      height: 220,
      marginBottom: 10,
      marginTop: 4,
    },
    inlineImage: {
      size: 18,
    },
    inlineMath: {
      color: theme.inlineCodeText,
    },
    link: {
      color: theme.accentStrong,
      fontFamily: Fonts.sans,
      underline: false,
    },
    list: {
      color: theme.text,
      fontFamily: Fonts.sans,
      fontSize: 14,
      gapWidth: 8,
      lineHeight: 21,
      markerColor: theme.textSecondary,
      markerMinWidth: 14,
      marginBottom: 8,
      marginLeft: 16,
      marginTop: 0,
    },
    math: {
      backgroundColor: theme.tintMuted,
      color: theme.text,
      fontSize: 14,
      marginBottom: 10,
      marginTop: 4,
      padding: 10,
      textAlign: "left",
    },
    paragraph: {
      color: theme.text,
      fontFamily: Fonts.sans,
      fontSize: 14,
      lineHeight: 21,
      marginBottom: 8,
      marginTop: 0,
    },
    strong: {
      color: theme.text,
      fontFamily: Fonts.sansSemiBold,
      fontWeight: "normal",
    },
    strikethrough: {
      color: theme.textSecondary,
    },
    table: {
      borderColor: theme.borderStrong,
      borderRadius: 8,
      borderWidth: 1,
      cellPaddingHorizontal: 10,
      cellPaddingVertical: 8,
      color: theme.text,
      fontFamily: Fonts.sans,
      fontSize: 13,
      headerBackgroundColor: theme.tintMedium,
      headerFontFamily: Fonts.sansSemiBold,
      headerTextColor: theme.text,
      lineHeight: 19,
      marginBottom: 10,
      marginTop: 2,
      rowEvenBackgroundColor: theme.tintSubtle,
      rowOddBackgroundColor: theme.tintMuted,
    },
    taskList: {
      borderColor: theme.borderEmphasis,
      checkboxBorderRadius: 4,
      checkboxSize: 18,
      checkedColor: theme.accentStrong,
      checkedStrikethrough: true,
      checkedTextColor: theme.textSecondary,
      checkmarkColor: theme.background,
    },
    thematicBreak: {
      color: theme.tintHeavy,
      height: 1,
      marginBottom: 12,
      marginTop: 8,
    },
    underline: {
      color: theme.text,
    },
  };
}
