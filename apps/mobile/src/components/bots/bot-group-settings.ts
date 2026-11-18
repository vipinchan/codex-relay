export type GroupSettingsDraft = {
  name: string;
  workspacePath: string;
  botIds: string[];
  defaultBotId: string;
};

export function groupSettingsPatch(
  saved: GroupSettingsDraft,
  draft: GroupSettingsDraft,
): Partial<GroupSettingsDraft> {
  const patch: Partial<GroupSettingsDraft> = {};
  const name = draft.name.trim();
  const workspacePath = draft.workspacePath.trim();
  if (name !== saved.name) patch.name = name;
  if (workspacePath !== saved.workspacePath) patch.workspacePath = workspacePath;
  if (
    draft.botIds.length !== saved.botIds.length ||
    draft.botIds.some((id, index) => id !== saved.botIds[index])
  ) {
    patch.botIds = draft.botIds;
  }
  if (draft.defaultBotId !== saved.defaultBotId) patch.defaultBotId = draft.defaultBotId;
  return patch;
}

export function toggleGroupSettingsMember(draft: GroupSettingsDraft, botId: string) {
  if (!draft.botIds.includes(botId)) return { ...draft, botIds: [...draft.botIds, botId] };
  return {
    ...draft,
    botIds: draft.botIds.filter((id) => id !== botId),
    defaultBotId: draft.defaultBotId === botId ? "" : draft.defaultBotId,
  };
}

export function validGroupSettings(draft: GroupSettingsDraft) {
  return (
    !!draft.name.trim() &&
    draft.workspacePath.trim().startsWith("/") &&
    draft.botIds.includes(draft.defaultBotId)
  );
}
