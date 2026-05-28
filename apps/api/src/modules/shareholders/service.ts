import type { Shareholder } from "@shmmf/shared";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  deleteShareholder,
  getShareholderById,
  insertShareholder,
  listShareholders,
  updateShareholder,
} from "./repository";

function normalizeText(value: string): string {
  return value.normalize("NFC").trim();
}

export const shareholderSchema = z.object({
  fullNameEn: z.string().transform(normalizeText).pipe(z.string().min(2)),
  fullNameAm: z
    .string()
    .transform((value) => normalizeText(value))
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  shares: z.number().int().positive(),
  isHighPower: z.boolean().optional(),
  contactInfo: z
    .string()
    .transform((value) => normalizeText(value))
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export function getShareholders(query?: string): Shareholder[] {
  return listShareholders(query);
}

export function createShareholder(input: z.infer<typeof shareholderSchema>): Shareholder {
  const entity: Shareholder = {
    id: `sh-${randomUUID().slice(0, 8)}`,
    ...input,
    isHighPower: input.isHighPower ?? false,
  };
  insertShareholder(entity);
  return entity;
}

export function editShareholder(id: string, input: z.infer<typeof shareholderSchema>): Shareholder | null {
  const existing = getShareholderById(id);
  if (!existing) {
    return null;
  }
  const updated: Shareholder = { id, ...input, isHighPower: input.isHighPower ?? false };
  updateShareholder(updated);
  return updated;
}

export function removeShareholder(id: string): boolean {
  const existing = getShareholderById(id);
  if (!existing) {
    return false;
  }
  deleteShareholder(id);
  return true;
}
