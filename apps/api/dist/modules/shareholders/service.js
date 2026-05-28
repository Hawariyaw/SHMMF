import { randomUUID } from "node:crypto";
import { z } from "zod";
import { deleteShareholder, getShareholderById, insertShareholder, listShareholders, updateShareholder, } from "./repository";
export const shareholderSchema = z.object({
    fullNameEn: z.string().min(2),
    fullNameAm: z.string().optional(),
    shares: z.number().int().positive(),
    isHighPower: z.boolean().optional(),
    contactInfo: z.string().optional(),
});
export function getShareholders(query) {
    return listShareholders(query);
}
export function createShareholder(input) {
    const entity = {
        id: `sh-${randomUUID().slice(0, 8)}`,
        ...input,
        isHighPower: input.isHighPower ?? false,
    };
    insertShareholder(entity);
    return entity;
}
export function editShareholder(id, input) {
    const existing = getShareholderById(id);
    if (!existing) {
        return null;
    }
    const updated = { id, ...input, isHighPower: input.isHighPower ?? false };
    updateShareholder(updated);
    return updated;
}
export function removeShareholder(id) {
    const existing = getShareholderById(id);
    if (!existing) {
        return false;
    }
    deleteShareholder(id);
    return true;
}
