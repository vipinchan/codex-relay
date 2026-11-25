import { useRef, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import {
  AppBottomSheet,
  AppBottomSheetTextInput,
  SheetActionRow,
  SheetSelectedDot,
} from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { useTheme } from "@/hooks/use-theme";

import { inputRequestAnswers, type InputRequestQuestion } from "./input-request-answers";

const zh = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith("zh");
const tr = (chinese: string, english: string) => (zh ? chinese : english);

export function InputRequestSheet({
  questions,
  onSubmit,
  onSkip,
  autoOpen = false,
}: {
  questions: InputRequestQuestion[];
  onSubmit: (answers: string[][]) => Promise<boolean>;
  onSkip: () => Promise<boolean>;
  autoOpen?: boolean;
}) {
  const [visible, setVisible] = useState(autoOpen);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [drafts, setDrafts] = useState(new Map<string, { picks: string[]; text: string }>());
  const theme = useTheme();
  const answers = inputRequestAnswers(
    questions,
    new Map(
      Array.from(drafts, ([id, draft]) => [id, draft.text.trim() ? [draft.text] : draft.picks]),
    ),
  );

  async function finish(action: () => Promise<boolean>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (await action()) setVisible(false);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Button size="sm" variant="secondary" disabled={busy} onPress={() => setVisible(true)}>
        <Text numberOfLines={2}>
          {questions[0]?.question ?? tr("回答问题", "Answer questions")}
        </Text>
      </Button>
      <AppBottomSheet
        title={tr("回答问题", "Answer questions")}
        visible={visible}
        onClose={() => setVisible(false)}
      >
        {questions.map((question) => {
          const draft = drafts.get(question.id);
          const picks = draft?.picks ?? [];
          const multi = question.mode === "multi";
          return (
            <View key={question.id} style={styles.question}>
              {question.header ? <Text style={styles.header}>{question.header}</Text> : null}
              <Text>{question.question}</Text>
              {multi ? (
                <Text style={styles.hint}>{tr("可选多项", "Select all that apply")}</Text>
              ) : null}
              {question.options?.map((option) => {
                const selected = picks.includes(option.label);
                return (
                  <SheetActionRow
                    key={option.label}
                    accessibilityLabel={option.label}
                    accessibilityRole={multi ? "checkbox" : "radio"}
                    disabled={busy}
                    icon="chevronRight"
                    selected={selected}
                    title={option.label}
                    subtitle={option.description}
                    trailing={
                      multi ? (
                        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                          {selected ? <Icon name="check" size={12} tintColor={theme.text} /> : null}
                        </View>
                      ) : (
                        <SheetSelectedDot selected={selected} />
                      )
                    }
                    onPress={() =>
                      setDrafts((current) => {
                        const existing = current.get(question.id)?.picks ?? [];
                        const next = multi
                          ? existing.includes(option.label)
                            ? existing.filter((pick) => pick !== option.label)
                            : [...existing, option.label]
                          : [option.label];
                        return new Map(current).set(question.id, { picks: next, text: "" });
                      })
                    }
                  />
                );
              })}
              <AppBottomSheetTextInput
                accessibilityLabel={`${tr("你的回答", "Your answer")}: ${question.question}`}
                editable={!busy}
                multiline
                maxLength={4000}
                placeholder={
                  question.options?.length
                    ? tr("或填写自己的答案", "Or type your own answer")
                    : tr("请输入答案", "Type your answer")
                }
                placeholderTextColor={theme.inputPlaceholder}
                value={draft?.text ?? ""}
                style={styles.input}
                onChangeText={(text) =>
                  setDrafts((current) => new Map(current).set(question.id, { picks: [], text }))
                }
              />
            </View>
          );
        })}
        <View style={styles.actions}>
          <Button variant="secondary" disabled={busy} onPress={() => void finish(onSkip)}>
            <Text>{tr("跳过", "Skip")}</Text>
          </Button>
          <Button
            disabled={busy || !answers}
            onPress={() => {
              if (answers) void finish(() => onSubmit(answers));
            }}
          >
            <Text>{tr("提交", "Submit")}</Text>
          </Button>
        </View>
      </AppBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { padding: 8 },
  question: { gap: 8, marginHorizontal: 16, paddingVertical: 10 },
  header: { color: theme.textSecondary, fontSize: 12 },
  hint: { color: theme.textSecondary },
  checkbox: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.textSecondary,
    borderRadius: 4,
  },
  checkboxSelected: { borderColor: theme.accent, backgroundColor: theme.backgroundSelected },
  input: {
    minHeight: 44,
    padding: 10,
    borderRadius: 10,
    backgroundColor: theme.backgroundElement,
    color: theme.text,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    padding: 16,
  },
}));
