import { db } from "../../common/db";
function mapRow(row) {
    return {
        id: row.id,
        fullNameEn: row.full_name_en,
        fullNameAm: row.full_name_am ?? undefined,
        shares: row.shares,
        isHighPower: Boolean(row.is_high_power),
        contactInfo: row.contact_info ?? undefined,
    };
}
export function listShareholders(query) {
    if (!query) {
        const rows = db
            .prepare("SELECT id, full_name_en, full_name_am, shares, is_high_power, contact_info FROM shareholders ORDER BY full_name_en ASC")
            .all();
        return rows.map(mapRow);
    }
    const rows = db
        .prepare(`SELECT id, full_name_en, full_name_am, shares, is_high_power, contact_info
       FROM shareholders
       WHERE lower(full_name_en) LIKE lower(?) OR id LIKE ?
       ORDER BY full_name_en ASC`)
        .all(`%${query}%`, `%${query}%`);
    return rows.map(mapRow);
}
export function getShareholderById(id) {
    const row = db
        .prepare("SELECT id, full_name_en, full_name_am, shares, is_high_power, contact_info FROM shareholders WHERE id = ?")
        .get(id);
    return row ? mapRow(row) : null;
}
export function insertShareholder(input) {
    db.prepare("INSERT INTO shareholders (id, full_name_en, full_name_am, shares, is_high_power, contact_info) VALUES (?, ?, ?, ?, ?, ?)").run(input.id, input.fullNameEn, input.fullNameAm ?? null, input.shares, input.isHighPower ? 1 : 0, input.contactInfo ?? null);
}
export function updateShareholder(input) {
    db.prepare("UPDATE shareholders SET full_name_en = ?, full_name_am = ?, shares = ?, is_high_power = ?, contact_info = ? WHERE id = ?").run(input.fullNameEn, input.fullNameAm ?? null, input.shares, input.isHighPower ? 1 : 0, input.contactInfo ?? null, input.id);
}
export function deleteShareholder(id) {
    db.prepare("DELETE FROM shareholders WHERE id = ?").run(id);
}
