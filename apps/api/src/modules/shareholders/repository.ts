import type { Shareholder } from "@shmmf/shared";
import { db } from "../../common/db";

function mapRow(row: {
  id: string;
  full_name_en: string;
  full_name_am: string | null;
  shares: number;
  is_high_power: number;
  contact_info: string | null;
}): Shareholder {
  return {
    id: row.id,
    fullNameEn: row.full_name_en,
    fullNameAm: row.full_name_am ?? undefined,
    shares: row.shares,
    isHighPower: Boolean(row.is_high_power),
    contactInfo: row.contact_info ?? undefined,
  };
}

export function listShareholders(query?: string): Shareholder[] {
  if (!query) {
    const rows = db
      .prepare(
        "SELECT id, full_name_en, full_name_am, shares, is_high_power, contact_info FROM shareholders ORDER BY full_name_en ASC"
      )
      .all() as Array<{
      id: string;
      full_name_en: string;
      full_name_am: string | null;
      shares: number;
      is_high_power: number;
      contact_info: string | null;
    }>;
    return rows.map(mapRow);
  }

  const rows = db
    .prepare(
      `SELECT id, full_name_en, full_name_am, shares, is_high_power, contact_info
       FROM shareholders
       WHERE lower(full_name_en) LIKE lower(?) OR id LIKE ?
       ORDER BY full_name_en ASC`
    )
    .all(`%${query}%`, `%${query}%`) as Array<{
    id: string;
    full_name_en: string;
    full_name_am: string | null;
    shares: number;
    is_high_power: number;
    contact_info: string | null;
  }>;
  return rows.map(mapRow);
}

export function getShareholderById(id: string): Shareholder | null {
  const row = db
    .prepare(
      "SELECT id, full_name_en, full_name_am, shares, is_high_power, contact_info FROM shareholders WHERE id = ?"
    )
    .get(id) as
    | {
        id: string;
        full_name_en: string;
        full_name_am: string | null;
        shares: number;
        is_high_power: number;
        contact_info: string | null;
      }
    | undefined;
  return row ? mapRow(row) : null;
}

export function insertShareholder(input: Shareholder): void {
  db.prepare(
    "INSERT INTO shareholders (id, full_name_en, full_name_am, shares, is_high_power, contact_info) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    input.id,
    input.fullNameEn,
    input.fullNameAm ?? null,
    input.shares,
    input.isHighPower ? 1 : 0,
    input.contactInfo ?? null
  );
}

export function updateShareholder(input: Shareholder): void {
  db.prepare(
    "UPDATE shareholders SET full_name_en = ?, full_name_am = ?, shares = ?, is_high_power = ?, contact_info = ? WHERE id = ?"
  ).run(
    input.fullNameEn,
    input.fullNameAm ?? null,
    input.shares,
    input.isHighPower ? 1 : 0,
    input.contactInfo ?? null,
    input.id
  );
}

export function deleteShareholder(id: string): void {
  db.prepare("DELETE FROM shareholders WHERE id = ?").run(id);
}
