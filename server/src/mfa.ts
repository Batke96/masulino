import { getAuthDb } from "@masulino/database";
import { sql } from "drizzle-orm";

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const wrapped = result as { rows?: T[] };
  return wrapped.rows ?? [];
}

let syntheticClear: Promise<void> | undefined;

/**
 * Synthetic staff keep no authenticator and no backup codes.
 * Uses the auth role, which is the only role allowed to write schema `identity`.
 */
export function clearSyntheticAuthenticators(): Promise<void> {
  syntheticClear ??= clearSyntheticAuthenticatorsOnce().catch((error: unknown) => {
    syntheticClear = undefined;
    throw error;
  });
  return syntheticClear;
}

async function clearSyntheticAuthenticatorsOnce(): Promise<void> {
  const authDb = getAuthDb();
  const syntheticUsers = sql`(select id from identity."user" where email like '%@example.test')`;
  await authDb.execute(sql`
    delete from identity.verification
    where value in ${syntheticUsers}
      and (identifier like '2fa-%' or identifier like 'trust-device-%')
  `);
  await authDb.execute(sql`
    delete from identity.two_factor
    where user_id in ${syntheticUsers}
  `);
  await authDb.execute(sql`
    update identity."user"
    set two_factor_enabled = false
    where email like '%@example.test'
      and two_factor_enabled is true
  `);
}

export async function readTwoFactorEnabled(userId: string): Promise<boolean> {
  const result = await getAuthDb().execute(sql`
    select two_factor_enabled as enabled
    from identity."user"
    where id = ${userId}
    limit 1
  `);
  const found = rowsOf<{ enabled: boolean | null }>(result);
  return found[0]?.enabled === true;
}

/**
 * The first privileged request after TOTP verification drops every other session.
 * Sessions created later, after a completed challenge, stay.
 */
export async function rotatePreMfaSessions(userId: string, currentToken: string): Promise<void> {
  const authDb = getAuthDb();
  const marked = await authDb.execute(sql`
    update identity.two_factor
    set session_rotated = true
    where user_id = ${userId}
      and verified = true
      and session_rotated = false
    returning user_id
  `);
  if (rowsOf<{ user_id: string }>(marked).length === 0) return;
  await authDb.execute(sql`
    delete from identity.session
    where user_id = ${userId}
      and token <> ${currentToken}
  `);
}
