export const formatDate = (value?: string): string => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('ru-RU');
};

export const formatDateTime = (value?: string): string => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('ru-RU');
};

export const dateTimeLocalToIso = (value: string): string => {
  return new Date(value).toISOString();
};

export const parseDate = (value?: string): Date | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

export const getQuestState = (
  dateofstart?: string,
  dateofend?: string,
  now = new Date()
): 'scheduled' | 'active' | 'finished' | 'unknown' => {
  const startsAt = parseDate(dateofstart);
  const endsAt = parseDate(dateofend);

  if (!startsAt || !endsAt) {
    return 'unknown';
  }

  if (now < startsAt) {
    return 'scheduled';
  }

  if (now >= endsAt) {
    return 'finished';
  }

  return 'active';
};
