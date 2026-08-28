const OPERATIONAL_TIMEZONE = 'America/Sao_Paulo';

const resolveDate = (value: string | number | Date) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getOperationalParts = (value: string | number | Date, timeZone = OPERATIONAL_TIMEZONE) => {
  const date = resolveDate(value);
  if (!date) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
  };
};

export const formatOperationalTime = (value: string | number | Date, timeZone = OPERATIONAL_TIMEZONE) => {
  const parts = getOperationalParts(value, timeZone);
  return parts ? `${parts.hour}:${parts.minute}` : '';
};

export const formatOperationalDate = (value: string | number | Date, timeZone = OPERATIONAL_TIMEZONE) => {
  const parts = getOperationalParts(value, timeZone);
  return parts ? `${parts.day}/${parts.month}/${parts.year}` : '';
};

export const formatOperationalDateTime = (
  value: string | number | Date,
  options: { timeZone?: string; separator?: string } = {},
) => {
  const timeZone = options.timeZone || OPERATIONAL_TIMEZONE;
  const separator = options.separator || ' as ';
  const date = formatOperationalDate(value, timeZone);
  const time = formatOperationalTime(value, timeZone);
  if (!date && !time) return '';
  if (!date) return time;
  if (!time) return date;
  return `${date}${separator}${time}`;
};

export const toOperationalDate = (value: string | number | Date, timeZone = OPERATIONAL_TIMEZONE) => {
  const parts = getOperationalParts(value, timeZone);
  if (!parts) return new Date();
  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12, 0, 0, 0);
};

;
