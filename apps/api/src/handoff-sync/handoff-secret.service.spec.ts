import { ConfigService } from '@nestjs/config';
import { AppEnvironment } from '../config/env.validation';
import {
  EncryptedHandoffSecret,
  HandoffSecretService,
} from './handoff-secret.service';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function createService(key = encryptionKey) {
  const config = {
    getOrThrow: jest.fn(() => key),
  } as unknown as ConfigService<AppEnvironment, true>;

  return new HandoffSecretService(config);
}

function flipFirstByte(value: string) {
  const bytes = Buffer.from(value, 'base64');
  bytes[0] ^= 1;
  return bytes.toString('base64');
}

function captureError(action: () => unknown) {
  try {
    action();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected action to throw');
}

describe('HandoffSecretService', () => {
  it('uses a fresh IV so encrypting the same value produces different output', () => {
    const service = createService();

    const first = service.encrypt('same protected value');
    const second = service.encrypt('same protected value');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.iv).not.toBe(second?.iv);
    expect(first?.ciphertext).not.toBe(second?.ciphertext);
  });

  it('round-trips long Unicode text without removing surrounding whitespace', () => {
    const service = createService();
    const value = `  客户交接信息 🔐\n${'秘密🌏'.repeat(2_000)}  `;

    const encrypted = service.encrypt(value);

    expect(encrypted).not.toBeNull();
    expect(service.decrypt(encrypted as EncryptedHandoffSecret)).toBe(value);
  });

  it('does not expose plaintext in the ciphertext', () => {
    const service = createService();
    const value = 'customer-password-should-not-be-visible';

    const encrypted = service.encrypt(value);

    expect(encrypted).not.toBeNull();
    expect(encrypted?.ciphertext).not.toContain(value);
    expect(
      Buffer.from(encrypted?.ciphertext ?? '', 'base64').toString(),
    ).not.toContain(value);
  });

  it.each(['ciphertext', 'iv', 'authTag'] as const)(
    'rejects a modified %s with the same safe error',
    (field) => {
      const service = createService();
      const plaintext = 'do-not-leak-this-secret';
      const encrypted = service.encrypt(plaintext) as EncryptedHandoffSecret;
      const tampered = {
        ...encrypted,
        [field]: flipFirstByte(encrypted[field]),
      };

      const error = captureError(() => service.decrypt(tampered));

      expect(error.message).toBe('Unable to decrypt protected handoff field');
      expect(error.message).not.toContain(plaintext);
      expect(error.message).not.toContain(encryptionKey);
    },
  );

  it.each(['', ' ', '\t\n  '])(
    'returns null instead of encrypting an empty or whitespace-only value',
    (value) => {
      expect(createService().encrypt(value)).toBeNull();
    },
  );

  it.each([
    [
      'invalid ciphertext base64',
      {
        ciphertext: 'not+base64!',
        iv: 'AAAAAAAAAAAAAAAA',
        authTag: 'AAAAAAAAAAAAAAAAAAAAAA==',
      },
    ],
    [
      'non-canonical ciphertext base64',
      {
        ciphertext: 'AB==',
        iv: 'AAAAAAAAAAAAAAAA',
        authTag: 'AAAAAAAAAAAAAAAAAAAAAA==',
      },
    ],
    [
      'invalid IV base64',
      {
        ciphertext: 'AA==',
        iv: 'invalid!',
        authTag: 'AAAAAAAAAAAAAAAAAAAAAA==',
      },
    ],
    [
      'an IV of the wrong length',
      {
        ciphertext: 'AA==',
        iv: 'AAAAAAAAAAAAAA==',
        authTag: 'AAAAAAAAAAAAAAAAAAAAAA==',
      },
    ],
    [
      'invalid auth tag base64',
      { ciphertext: 'AA==', iv: 'AAAAAAAAAAAAAAAA', authTag: 'invalid!' },
    ],
    [
      'an auth tag of the wrong length',
      {
        ciphertext: 'AA==',
        iv: 'AAAAAAAAAAAAAAAA',
        authTag: 'AAAAAAAAAAAAAAAAAAAA',
      },
    ],
  ])('safely rejects %s', (_description, payload) => {
    const error = captureError(() => createService().decrypt(payload));

    expect(error.message).toBe('Unable to decrypt protected handoff field');
    expect(error.message).not.toContain(encryptionKey);
  });

  it.each([
    'too-short-key',
    'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
  ])('rejects an encryption key that is not exactly 32 bytes', (key) => {
    const error = captureError(() => createService(key));

    expect(error.message).toBe(
      'HANDOFF_SECRET_ENCRYPTION_KEY must be 32 bytes encoded as 64 hexadecimal characters',
    );
    expect(error.message).not.toContain(key);
  });
});
