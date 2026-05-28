import { randomUUID } from "node:crypto";
import { db } from "./db";
export function writeAuditLog(input) {
    db.prepare(`INSERT INTO audit_logs
    (id, user_id, action_type, module, previous_value, new_value, ip_address, device_info, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), input.userId ?? null, input.actionType, input.module, input.previousValue ? JSON.stringify(input.previousValue) : null, input.newValue ? JSON.stringify(input.newValue) : null, input.req?.ip ?? null, input.req?.header("user-agent") ?? null, new Date().toISOString());
}
