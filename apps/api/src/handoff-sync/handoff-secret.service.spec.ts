import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { AppEnvironment } from '../config/env.validation';
import {
  EncryptedHandoffSecret,
  HandoffSecretService,
} from './handoff-secret.service';

const encryptionKey =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const rotatedEncryptionKey = 'f'.repeat(64);
const context = {
  externalRecordId: 'rec-customer-a',
  fieldName: 'deploymentPassword',
};

function keyId(key: string) {
  return createHash('sha256').update(Buffer.from(key, 'hex')).digest('hex');
}

function createService(key = encryptionKey, previousKeys: string[] = []) {
  const values: Partial<AppEnvironment> = {
    HANDOFF_SECRET_ENCRYPTION_KEY: key,
    HANDOFF_SECRET_PREVIOUS_KEYS: previousKeys,
  };
  const config = {
    getOrThrow: jest.fn((name: keyof AppEnvironment) => values[name]),
    get: jest.fn((name: keyof AppEnvironment) => values[name]),
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

    const first = service.encrypt(context, 'same protected value');
    const second = service.encrypt(context, 'same protected value');

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.iv).not.toBe(second?.iv);
    expect(first?.ciphertext).not.toBe(second?.ciphertext);
  });

  it('round-trips long Unicode text without removing surrounding whitespace', () => {
    const service = createService();
    const value = `  客户交接信息 🔐\n${'秘密🌏'.repeat(2_000)}  `;

    const encrypted = service.encrypt(context, value);

    expect(encrypted).not.toBeNull();
    expect(service.decrypt(context, encrypted as EncryptedHandoffSecret)).toBe(
      value,
    );
  });

  it('does not expose plaintext in the ciphertext', () => {
    const service = createService();
    const value = 'customerPasswordShouldNotBeVisible123';

    const encrypted = service.encrypt(context, value);

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
      const encrypted = service.encrypt(
        context,
        plaintext,
      ) as EncryptedHandoffSecret;
      const tampered = {
        ...encrypted,
        [field]: flipFirstByte(encrypted[field]),
      };

      const error = captureError(() => service.decrypt(context, tampered));

      expect(error.message).toBe('Unable to decrypt protected handoff field');
      expect(error.message).not.toContain(plaintext);
      expect(error.message).not.toContain(encryptionKey);
    },
  );

  it.each(['', ' ', '\t\n  '])(
    'returns null instead of encrypting an empty or whitespace-only value',
    (value) => {
      expect(createService().encrypt(context, value)).toBeNull();
    },
  );

  it.each([
    ['invalid ciphertext base64', { ciphertext: 'not+base64!' }],
    ['non-canonical ciphertext base64', { ciphertext: 'AB==' }],
    ['invalid IV base64', { iv: 'invalid!' }],
    ['an IV of the wrong length', { iv: 'AAAAAAAAAAAAAA==' }],
    ['invalid auth tag base64', { authTag: 'invalid!' }],
    ['an auth tag of the wrong length', { authTag: 'AAAAAAAAAAAAAAAAAAAA' }],
  ])('safely rejects %s', (_description, override) => {
    const service = createService();
    const encrypted = service.encrypt(
      context,
      'protected payload',
    ) as EncryptedHandoffSecret;
    const error = captureError(() =>
      service.decrypt(context, {
        ...encrypted,
        ...override,
      }),
    );

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

  it('binds ciphertext to its external Feishu record ID', () => {
    const service = createService();
    const plaintext = 'record-bound-secret';
    const encrypted = service.encrypt(
      context,
      plaintext,
    ) as EncryptedHandoffSecret;
    const wrongContext = { ...context, externalRecordId: 'rec-customer-b' };

    const error = captureError(() => service.decrypt(wrongContext, encrypted));

    expect(error.message).toBe('Unable to decrypt protected handoff field');
    expect(error.message).not.toContain(plaintext);
    expect(error.message).not.toContain(wrongContext.externalRecordId);
    expect(error.message).not.toContain(encryptionKey);
  });

  it('binds ciphertext to its protected field name', () => {
    const service = createService();
    const plaintext = 'field-bound-secret';
    const encrypted = service.encrypt(
      context,
      plaintext,
    ) as EncryptedHandoffSecret;
    const wrongContext = { ...context, fieldName: 'contactPassword' };

    const error = captureError(() => service.decrypt(wrongContext, encrypted));

    expect(error.message).toBe('Unable to decrypt protected handoff field');
    expect(error.message).not.toContain(plaintext);
    expect(error.message).not.toContain(wrongContext.fieldName);
    expect(error.message).not.toContain(encryptionKey);
  });

  it('writes versioned envelopes identified by a SHA-256 key ID', () => {
    const encrypted = createService().encrypt(
      context,
      'versioned secret',
    ) as EncryptedHandoffSecret;

    expect(encrypted.formatVersion).toBe(1);
    expect(encrypted.keyId).toBe(keyId(encryptionKey));
    expect(encrypted.keyId).not.toContain(encryptionKey);
  });

  it('decrypts old envelopes with a previous key while writing only with the current key', () => {
    const oldService = createService(encryptionKey);
    const oldEnvelope = oldService.encrypt(
      context,
      'secret before rotation',
    ) as EncryptedHandoffSecret;
    const rotatedService = createService(rotatedEncryptionKey, [encryptionKey]);

    expect(rotatedService.decrypt(context, oldEnvelope)).toBe(
      'secret before rotation',
    );

    const newEnvelope = rotatedService.encrypt(
      context,
      'secret after rotation',
    ) as EncryptedHandoffSecret;
    expect(newEnvelope.keyId).toBe(keyId(rotatedEncryptionKey));
    expect(newEnvelope.keyId).not.toBe(oldEnvelope.keyId);
  });

  it.each([
    ['an unknown envelope version', { formatVersion: 2 }],
    ['an unknown key ID', { keyId: '0'.repeat(64) }],
  ])('safely rejects %s', (_description, override) => {
    const service = createService();
    const plaintext = 'metadata-protected-secret';
    const encrypted = service.encrypt(
      context,
      plaintext,
    ) as EncryptedHandoffSecret;

    const error = captureError(() =>
      service.decrypt(context, {
        ...encrypted,
        ...override,
      } as EncryptedHandoffSecret),
    );

    expect(error.message).toBe('Unable to decrypt protected handoff field');
    expect(error.message).not.toContain(plaintext);
    expect(error.message).not.toContain(encryptionKey);
  });
});
