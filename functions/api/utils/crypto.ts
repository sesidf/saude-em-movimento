const ITERATIONS = 100000;

function buf2hex(buffer: ArrayBuffer): string {
  return Array.prototype.map.call(new Uint8Array(buffer), (x: number) => ('00' + x.toString(16)).slice(-2)).join('');
}

function hex2buf(hex: string): ArrayBuffer {
  const view = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    view[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return view.buffer;
}

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const saltBuf = hex2buf(saltHex);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const key = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuf,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  return buf2hex(key);
}

export async function createPasswordHash(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = buf2hex(salt.buffer);
  const hashHex = await hashPassword(password, saltHex);
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [saltHex, originalHash] = storedHash.split(':');
  if (!saltHex || !originalHash) return false;

  const newHash = await hashPassword(password, saltHex);
  return newHash === originalHash;
}

export function generateUUID(): string {
  return crypto.randomUUID();
}
