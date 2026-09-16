/**
 * DatabaseKeyVault
 * ----------------
 * Retrieves (or provisions) the AES-256 key that SQLCipher uses to encrypt the
 * TrentPlayer SQLite ledger at rest.
 *
 * THREAT MODEL
 *   An attacker who obtains the raw `trent_player_library.db` file (rooted
 *   device, `adb backup`, jailbroken iOS, cloud-backup extraction) must not be
 *   able to read track metadata. SQLCipher makes the file ciphertext; this
 *   module makes sure the key that unlocks it is never in the source tree, the
 *   JS bundle, or any plain-text preference store.
 *
 * WHERE THE KEY LIVES
 *   `expo-secure-store` is a thin wrapper over the platform hardware vaults:
 *
 *     Android -> EncryptedSharedPreferences backed by the *Android Keystore*.
 *                The wrapping key is generated inside the TEE / StrongBox
 *                (when available) and is non-exportable.
 *     iOS     -> *Keychain Services* (`kSecClassGenericPassword`). Items are
 *                protected by the Secure Enclave-derived class keys.
 *
 *   The value is written with `keychainAccessible: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`
 *   so it (a) is available to background playback after the first unlock and
 *   (b) is NOT migrated to a new device via encrypted iCloud/Google backups,
 *   which would otherwise let a restored database be opened elsewhere.
 *
 * KEY FORMAT
 *   32 bytes from the platform CSPRNG (`expo-crypto`), hex-encoded to a
 *   64-character string and applied to SQLCipher in *raw key* mode
 *   (`PRAGMA key = "x'<64 hex>'"`). Raw-key mode bypasses PBKDF2 passphrase
 *   derivation and uses the 256 bits directly as the AES-256-CBC key.
 *
 * WHY NOT HARDCODE?
 *   A static string in the repo ends up in the bundle; `strings` on the APK/IPA
 *   reveals it, and every install shares it. A per-device random key defeats
 *   both class breaks and single-device extraction.
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/** Alias under which the key is stored in the hardware vault. Not secret. */
const KEY_ALIAS = 'trentplayer.db.aes256.v1';

/** 32 bytes == 256 bits; SQLCipher raw-key mode expects exactly this. */
const KEY_LENGTH_BYTES = 32;

/**
 * Strict allow-list for key material that is later placed into `PRAGMA key`.
 * Because PRAGMA statements cannot be parameter-bound, this regex is the
 * injection barrier: only lowercase hex, exactly 64 chars, nothing else.
 */
const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/;

export class DatabaseKeyVaultError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'DatabaseKeyVaultError';
  }
}

/** Options shared by every SecureStore call so accessibility is consistent. */
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Returns `true` only if `candidate` is a well-formed 256-bit hex key.
 * Exported so `LocalDatabase` can re-validate right before the PRAGMA.
 */
export function isValidHexKey(candidate: string): boolean {
  return HEX_KEY_PATTERN.test(candidate);
}

/**
 * Fetches the database key from the hardware vault, generating and persisting
 * one on first run. Idempotent and safe to call on every app start.
 */
export async function getOrCreateDatabaseKey(): Promise<string> {
  // 1. Confirm the platform vault is actually usable (e.g. not a web build).
  let available = false;
  try {
    available = await SecureStore.isAvailableAsync();
  } catch (error) {
    throw new DatabaseKeyVaultError('Failed probing SecureStore availability.', error);
  }
  if (!available) {
    throw new DatabaseKeyVaultError(
      'Hardware-backed secure storage is unavailable on this platform; refusing to open an encrypted database.',
    );
  }

  // 2. Try to read an existing key.
  let existing: string | null = null;
  try {
    existing = await SecureStore.getItemAsync(KEY_ALIAS, SECURE_STORE_OPTIONS);
  } catch (error) {
    throw new DatabaseKeyVaultError('Failed reading database key from secure storage.', error);
  }

  if (existing !== null) {
    if (!isValidHexKey(existing)) {
      // Tampered or corrupted entry. Do NOT fall back to a new key silently:
      // that would orphan the existing encrypted database.
      throw new DatabaseKeyVaultError('Stored database key failed integrity validation.');
    }
    return existing;
  }

  // 3. First launch: provision a fresh random key.
  let key: string;
  try {
    const randomBytes = await Crypto.getRandomBytesAsync(KEY_LENGTH_BYTES);
    key = toHex(randomBytes);
  } catch (error) {
    throw new DatabaseKeyVaultError('Failed generating database key material.', error);
  }

  if (!isValidHexKey(key)) {
    throw new DatabaseKeyVaultError('Generated key did not meet format requirements.');
  }

  try {
    await SecureStore.setItemAsync(KEY_ALIAS, key, SECURE_STORE_OPTIONS);
  } catch (error) {
    throw new DatabaseKeyVaultError('Failed persisting database key to secure storage.', error);
  }

  // 4. Read-back check: guarantees the vault accepted the value before we
  //    encrypt anything with it.
  let confirmed: string | null = null;
  try {
    confirmed = await SecureStore.getItemAsync(KEY_ALIAS, SECURE_STORE_OPTIONS);
  } catch (error) {
    throw new DatabaseKeyVaultError('Failed verifying persisted database key.', error);
  }
  if (confirmed !== key) {
    throw new DatabaseKeyVaultError('Secure storage read-back mismatch after writing database key.');
  }

  return key;
}

/**
 * Permanently removes the key. Only call this when also deleting the database
 * file (e.g. "sign out & wipe device data"), because the ciphertext becomes
 * unrecoverable the moment the key is gone.
 */
export async function destroyDatabaseKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_ALIAS, SECURE_STORE_OPTIONS);
  } catch (error) {
    throw new DatabaseKeyVaultError('Failed deleting database key from secure storage.', error);
  }
}
