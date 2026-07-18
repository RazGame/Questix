export type QuestState = 'scheduled' | 'active' | 'finished';

export interface QuestDates {
  dateofstart: Date;
  dateofend: Date;
}

export interface QuestRuleResult {
  ok: boolean;
  error?: string;
  state?: QuestState;
}

export const hasInvalidDateRange = (
  dateofstart?: Date,
  dateofend?: Date
): boolean => {
  return Boolean(dateofstart && dateofend && dateofend <= dateofstart);
};

export const getQuestState = (
  quest: QuestDates,
  now = new Date()
): QuestState => {
  if (now < quest.dateofstart) {
    return 'scheduled';
  }

  if (now >= quest.dateofend) {
    return 'finished';
  }

  return 'active';
};

export const canApplyToQuest = (
  quest: QuestDates,
  now = new Date()
): QuestRuleResult => {
  const state = getQuestState(quest, now);

  if (state !== 'scheduled') {
    return {
      ok: false,
      error:
        state === 'finished'
          ? 'Подача заявок закрыта: квест уже завершен'
          : 'Подача заявок закрыта: квест уже начался',
      state,
    };
  }

  return { ok: true, state };
};

export const canPlayQuest = (
  quest: QuestDates,
  now = new Date()
): QuestRuleResult => {
  const state = getQuestState(quest, now);

  if (state === 'scheduled') {
    return { ok: false, error: 'Игра еще не началась', state };
  }

  if (state === 'finished') {
    return { ok: false, error: 'Игра уже завершена', state };
  }

  return { ok: true, state };
};
