import { observable } from "@legendapp/state";

import { persistLocalObservable } from "./persistence";

export type ConversationsGroupingMode = "project" | "time";

type ConversationsViewState = {
  groupingMode: ConversationsGroupingMode;
};

export const conversationsViewStore$ = observable<ConversationsViewState>({
  groupingMode: "time",
});

persistLocalObservable(conversationsViewStore$, "conversations-view");

export function getConversationsGroupingMode(): ConversationsGroupingMode {
  const mode = conversationsViewStore$.groupingMode.peek();
  return mode === "project" ? "project" : "time";
}

export function setConversationsGroupingMode(mode: ConversationsGroupingMode) {
  conversationsViewStore$.groupingMode.set(mode === "project" ? "project" : "time");
}

export function toggleConversationsGroupingMode() {
  conversationsViewStore$.groupingMode.set((current) =>
    current === "project" ? "time" : "project",
  );
}
