const normalizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = normalizeValue((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value ?? null;
};

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const fallbackHash = (value: string): string => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0).toString(16).padStart(8, '0');
};

const createActionNonce = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const withActionNonce = (payload: unknown, nonce: string): unknown => {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return { ...(payload as Record<string, unknown>), __request_nonce: nonce };
  }

  return {
    payload,
    __request_nonce: nonce,
  };
};

const stableSerialize = (value: unknown): string => JSON.stringify(normalizeValue(value));

export const buildStableIdempotencyKey = async (operation: string, payload: unknown): Promise<string> => {
  const normalizedOperation = operation.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '-');
  const serialized = `${normalizedOperation}:${stableSerialize(payload)}`;

  if (typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined') {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
    return `${normalizedOperation}:${toHex(digest)}`;
  }

  return `${normalizedOperation}:${fallbackHash(serialized)}`;
};

export const buildIdempotencyKey = async (operation: string, payload: unknown): Promise<string> => (
  buildStableIdempotencyKey(operation, withActionNonce(payload, createActionNonce()))
);
