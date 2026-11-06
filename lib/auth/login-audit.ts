import { createHash } from "node:crypto";
import { AUDIT, type AuditWriter } from "@/lib/audit/actions";
import { authorizeCredentials, type FindUserByEmail } from "./authorize";

/** Short, stable fingerprint of an email, so repeated failures can be correlated without storing it. */
export function emailFingerprint(raw: unknown): string | null {
  const email = raw && typeof raw === "object" ? (raw as Record<string, unknown>).email : undefined;
  if (typeof email !== "string" || !email.trim()) return null;
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 12);
}

/**
 * The credentials check, plus an audit row for every outcome: LOGIN_SUCCESS (with the user)
 * or LOGIN_FAILED (with an email fingerprint, never the email or the password). A failure to
 * write the audit row never blocks or changes the login result.
 */
export async function authorizeWithAudit(
  raw: unknown,
  findUser: FindUserByEmail,
  audit: AuditWriter,
) {
  const user = await authorizeCredentials(raw, findUser);
  try {
    if (user) {
      await audit({
        actorId: user.id,
        action: AUDIT.LOGIN_SUCCESS,
        entityType: "User",
        entityId: user.id,
        metadata: { role: user.role },
      });
    } else {
      await audit({
        actorId: null,
        action: AUDIT.LOGIN_FAILED,
        entityType: "User",
        metadata: { emailFingerprint: emailFingerprint(raw) },
      });
    }
  } catch {
    // Deliberately silent: auditing must not turn a login into an error.
  }
  return user;
}
