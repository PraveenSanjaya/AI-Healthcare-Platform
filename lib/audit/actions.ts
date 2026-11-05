/** Every action name written to AuditLog.action. Add new ones here, never inline. */
export const AUDIT = {
  GENERATION_CREATED: "GENERATION_CREATED",
  GENERATION_REFINED: "GENERATION_REFINED",
  GENERATION_REVIEWED: "GENERATION_REVIEWED",
  PHI_BLOCKED: "PHI_BLOCKED",
  PHI_OVERRIDE: "PHI_OVERRIDE",
  EXPORTED: "EXPORTED",
  SETTINGS_CHANGED: "SETTINGS_CHANGED",
  TEMPLATE_CREATED: "TEMPLATE_CREATED",
  TEMPLATE_VERSIONED: "TEMPLATE_VERSIONED",
  TEMPLATE_UPDATED: "TEMPLATE_UPDATED",
  TEMPLATE_ARCHIVED: "TEMPLATE_ARCHIVED",
} as const;

export type AuditAction = (typeof AUDIT)[keyof typeof AUDIT];

export type AuditEntry = {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

/** Writes one audit row. Implemented with Prisma in lib/ai/repo.ts; faked in tests. */
export type AuditWriter = (entry: AuditEntry) => Promise<void>;
