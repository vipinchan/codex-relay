import type { MarkdownStyle } from "react-native-enriched-markdown";

export const ASSISTANT_MARKDOWN_FLAVOR = "github" as const;

type AssistantMarkdownTheme = {
  backgroundSelected: string;
  text: string;
  textSecondary: string;
};

type AssistantMarkdownFonts = {
  mono: string;
  monoMedium: string;
  sans: string;
  sansMedium: string;
  sansSemiBold: string;
};

export function createAssistantMarkdownStyle(
  theme: AssistantMarkdownTheme,
  fonts: AssistantMarkdownFonts,
): MarkdownStyle {
  return {
    paragraph: {
      color: theme.text,
      fontFamily: fonts.sans,
      fontSize: 15,
      lineHeight: 24,
      marginTop: 0,
      marginBottom: 13,
    },
    h1: {
      color: theme.text,
      fontFamily: fonts.sansSemiBold,
      fontSize: 22,
      lineHeight: 30,
      marginTop: 28,
      marginBottom: 14,
    },
    h2: {
      color: theme.text,
      fontFamily: fonts.sansSemiBold,
      fontSize: 20,
      lineHeight: 28,
      marginTop: 24,
      marginBottom: 12,
    },
    h3: {
      color: theme.text,
      fontFamily: fonts.sansSemiBold,
      fontSize: 18,
      lineHeight: 26,
      marginTop: 20,
      marginBottom: 10,
    },
    h4: {
      color: theme.text,
      fontFamily: fonts.sansSemiBold,
      fontSize: 16,
      lineHeight: 24,
      marginTop: 16,
      marginBottom: 8,
    },
    h5: {
      color: theme.text,
      fontFamily: fonts.sansSemiBold,
      fontSize: 15,
      lineHeight: 23,
      marginTop: 14,
      marginBottom: 7,
    },
    h6: {
      color: theme.textSecondary,
      fontFamily: fonts.sansSemiBold,
      fontSize: 14,
      lineHeight: 22,
      marginTop: 12,
      marginBottom: 6,
    },
    strong: {
      color: theme.text,
      fontFamily: fonts.sansSemiBold,
      fontWeight: "normal",
    },
    em: {
      color: theme.text,
      fontFamily: fonts.sans,
    },
    link: {
      color: "#6EB6FF",
      fontFamily: fonts.sansMedium,
      underline: false,
    },
    code: {
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      borderColor: "rgba(255, 255, 255, 0.12)",
      color: "#DCE6F0",
      fontFamily: fonts.monoMedium,
      fontSize: 13,
    },
    codeBlock: {
      backgroundColor: theme.backgroundSelected,
      borderColor: "rgba(132, 145, 165, 0.28)",
      borderRadius: 10,
      borderWidth: 1,
      color: theme.text,
      fontFamily: fonts.mono,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 10,
      marginBottom: 16,
      padding: 12,
      syntaxColors: {
        keyword: "#FF7B72",
        operator: "#C9D1D9",
        punctuation: "#C9D1D9",
        string: "#A5D6FF",
        number: "#79C0FF",
        constant: "#79C0FF",
        comment: "#8B949E",
        function: "#D2A8FF",
        type: "#FFA657",
        variable: "#FFA657",
        property: "#79C0FF",
        tag: "#7EE787",
        attribute: "#79C0FF",
        embedded: "#C9D1D9",
      },
    },
    list: {
      color: theme.text,
      fontFamily: fonts.sans,
      fontSize: 15,
      lineHeight: 24,
      gapWidth: 9,
      markerColor: theme.textSecondary,
      markerFontWeight: "bold",
      markerMinWidth: 16,
      marginLeft: 18,
      marginTop: 8,
      marginBottom: 13,
      itemSpacing: 6,
    },
    blockquote: {
      backgroundColor: "rgba(95, 167, 255, 0.07)",
      borderColor: "#5FA7FF",
      borderRadius: 8,
      borderWidth: 3,
      color: theme.text,
      fontFamily: fonts.sans,
      fontSize: 15,
      gapWidth: 12,
      lineHeight: 24,
      marginTop: 10,
      marginBottom: 16,
      padding: 10,
    },
    table: {
      color: theme.text,
      fontFamily: fonts.sans,
      fontSize: 13,
      lineHeight: 20,
      marginTop: 12,
      marginBottom: 18,
      headerFontFamily: fonts.sansSemiBold,
      headerBackgroundColor: "rgba(255, 255, 255, 0.08)",
      headerTextColor: theme.text,
      rowEvenBackgroundColor: "rgba(255, 255, 255, 0.025)",
      rowOddBackgroundColor: "rgba(255, 255, 255, 0.045)",
      borderColor: "rgba(132, 145, 165, 0.28)",
      borderWidth: 1,
      borderRadius: 9,
      cellPaddingHorizontal: 12,
      cellPaddingVertical: 9,
      horizontalOverflow: 24,
      align: "left",
    },
    taskList: {
      borderColor: "rgba(214, 222, 232, 0.46)",
      checkedColor: "#5FA7FF",
      checkmarkColor: "#07111D",
      checkboxBorderRadius: 4,
      checkboxSize: 17,
      checkedTextColor: theme.textSecondary,
      checkedStrikethrough: false,
    },
    thematicBreak: {
      color: "rgba(132, 145, 165, 0.28)",
      height: 1,
      marginTop: 20,
      marginBottom: 20,
    },
  };
}
