import type { Role } from "@shmmf/shared";
import bcrypt from "bcryptjs";
import type { Express, Request, Response } from "express";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import PDFDocument from "pdfkit";
import { z } from "zod";
import { requireAuth, requireRoles, signToken, type AuthenticatedRequest } from "../common/auth";
import { writeAuditLog } from "../common/audit";
import { db } from "../common/db";
import { emitDashboardRefresh } from "../common/realtime/socket";
import { buildDashboardSnapshot } from "./dashboard/service";
import {
  createShareholder,
  editShareholder,
  getShareholders,
  removeShareholder,
  shareholderSchema,
} from "./shareholders/service";

function configEnabled(key: string): boolean {
  const row = db.prepare("SELECT value FROM configurations WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value === "true";
}

function configNumber(key: string, fallback: number): number {
  const row = db.prepare("SELECT value FROM configurations WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  const value = Number(row?.value);
  return Number.isFinite(value) ? value : fallback;
}

function resolveInfluentialFlag(manualFlag: boolean | undefined, shares: number): boolean {
  const auto = configEnabled("influentialAutoClassificationEnabled");
  if (auto) {
    const threshold = configNumber("influentialShareThreshold", 100000);
    return shares >= threshold;
  }
  return Boolean(manualFlag);
}

function createCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  const escapeValue = (value: string | number | null): string => {
    if (value === null) return "";
    const text = String(value);
    if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
      return `"${text.replaceAll("\"", "\"\"")}"`;
    }
    return text;
  };
  return [headers.join(","), ...rows.map((row) => row.map(escapeValue).join(","))].join("\n");
}

async function createExcelBuffer(
  headers: string[],
  rows: Array<Array<string | number | null>>,
  sheetName: string
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function createPdfBuffer(title: string, headers: string[], rows: Array<Array<string | number | null>>): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 40 });
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.fontSize(16).text(title);
    doc.moveDown();
    doc.fontSize(10).text(headers.join(" | "));
    doc.moveDown(0.5);
    rows.forEach((row) => {
      doc.text(row.map((cell) => (cell === null ? "" : String(cell))).join(" | "));
    });
    doc.end();
  });
}

export function registerRoutes(app: Express): void {
  const readParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value ?? "");
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.post("/api/v1/auth/login", (req: Request, res: Response) => {
    const parsed = z.object({ username: z.string(), password: z.string() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid payload" });
      return;
    }

    const user = db
      .prepare("SELECT id, username, password_hash, role FROM users WHERE username = ? AND is_active = 1")
      .get(parsed.data.username) as
      | { id: string; username: string; password_hash: string; role: Role }
      | undefined;

    if (!user || !bcrypt.compareSync(parsed.data.password, user.password_hash)) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    writeAuditLog({ userId: user.id, actionType: "LOGIN", module: "AUTH", req });
    res.json({ token: signToken({ id: user.id, username: user.username, role: user.role }), role: user.role });
  });

  app.get("/api/v1/dashboard/snapshot", requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    res.json(buildDashboardSnapshot());
  });

  app.get("/api/v1/shareholders", requireAuth, (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q : undefined;
    res.json(getShareholders(query));
  });

  app.post("/api/v1/shareholders", requireAuth, requireRoles(["SUPER_ADMIN"]), (req: AuthenticatedRequest, res) => {
    const parsed = shareholderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
      return;
    }
    const created = createShareholder({
      ...parsed.data,
      isHighPower: resolveInfluentialFlag(parsed.data.isHighPower, parsed.data.shares),
    });
    writeAuditLog({
      userId: req.user?.id,
      actionType: "SHAREHOLDER_CREATE",
      module: "SHAREHOLDERS",
      newValue: created,
      req,
    });
    emitDashboardRefresh("shareholder-created");
    res.status(201).json(created);
  });

  app.put(
    "/api/v1/shareholders/:id",
    requireAuth,
    requireRoles(["SUPER_ADMIN"]),
    (req: AuthenticatedRequest, res) => {
      const parsed = shareholderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
        return;
      }
      const updated = editShareholder(readParam(req.params.id), {
        ...parsed.data,
        isHighPower: resolveInfluentialFlag(parsed.data.isHighPower, parsed.data.shares),
      });
      if (!updated) {
        res.status(404).json({ message: "Shareholder not found" });
        return;
      }
      writeAuditLog({
        userId: req.user?.id,
        actionType: "SHAREHOLDER_UPDATE",
        module: "SHAREHOLDERS",
        newValue: updated,
        req,
      });
      emitDashboardRefresh("shareholder-updated");
      res.json(updated);
    }
  );

  app.delete(
    "/api/v1/shareholders/:id",
    requireAuth,
    requireRoles(["SUPER_ADMIN"]),
    (req: AuthenticatedRequest, res) => {
      const id = readParam(req.params.id);
      const ok = removeShareholder(id);
      if (!ok) {
        res.status(404).json({ message: "Shareholder not found" });
        return;
      }
      writeAuditLog({
        userId: req.user?.id,
        actionType: "SHAREHOLDER_DELETE",
        module: "SHAREHOLDERS",
        newValue: { id },
        req,
      });
      emitDashboardRefresh("shareholder-deleted");
      res.status(204).send();
    }
  );

  app.get("/api/v1/config", requireAuth, requireRoles(["SUPER_ADMIN"]), (_req, res) => {
    res.json({
      attendanceMakerCheckerEnabled: configEnabled("attendanceMakerCheckerEnabled"),
      votingMakerCheckerEnabled: configEnabled("votingMakerCheckerEnabled"),
      influentialAutoClassificationEnabled: configEnabled("influentialAutoClassificationEnabled"),
      influentialShareThreshold: configNumber("influentialShareThreshold", 100000),
    });
  });

  app.patch("/api/v1/config", requireAuth, requireRoles(["SUPER_ADMIN"]), (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        attendanceMakerCheckerEnabled: z.boolean().optional(),
        votingMakerCheckerEnabled: z.boolean().optional(),
        influentialAutoClassificationEnabled: z.boolean().optional(),
        influentialShareThreshold: z.number().int().positive().optional(),
        applyInfluentialClassificationNow: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid payload" });
      return;
    }

    for (const [key, value] of Object.entries(parsed.data)) {
      if (key === "applyInfluentialClassificationNow") {
        continue;
      }
      if (typeof value === "boolean") {
        db.prepare("UPDATE configurations SET value = ? WHERE key = ?").run(value ? "true" : "false", key);
      }
      if (typeof value === "number") {
        db.prepare("UPDATE configurations SET value = ? WHERE key = ?").run(String(value), key);
      }
    }
    if (parsed.data.applyInfluentialClassificationNow) {
      const threshold = configNumber("influentialShareThreshold", 100000);
      db.prepare("UPDATE shareholders SET is_high_power = CASE WHEN shares >= ? THEN 1 ELSE 0 END").run(threshold);
    }

    writeAuditLog({
      userId: req.user?.id,
      actionType: "UPDATE_CONFIG",
      module: "CONFIG",
      newValue: parsed.data,
      req,
    });

    emitDashboardRefresh("config-updated");
    res.json({ ok: true });
  });

  app.post(
    "/api/v1/attendance/mark",
    requireAuth,
    requireRoles(["SUPER_ADMIN", "ATTENDANCE_MAKER"]),
    (req: AuthenticatedRequest, res) => {
      const parsed = z.object({ shareholderId: z.string(), notes: z.string().optional() }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid payload" });
        return;
      }
      const makerChecker = configEnabled("attendanceMakerCheckerEnabled");
      const status = makerChecker ? "PENDING" : "APPROVED";
      const id = randomUUID();
      db.prepare(
        "INSERT INTO attendance_records (id, shareholder_id, marked_by, approved_by, status, notes, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(id, parsed.data.shareholderId, req.user?.id, makerChecker ? null : req.user?.id, status, parsed.data.notes ?? null, new Date().toISOString());

      writeAuditLog({
        userId: req.user?.id,
        actionType: "ATTENDANCE_MARK",
        module: "ATTENDANCE",
        newValue: { id, ...parsed.data, status },
        req,
      });
      emitDashboardRefresh(`attendance-${status.toLowerCase()}`);
      res.json({ id, status });
    }
  );

  app.get("/api/v1/attendance", requireAuth, (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status) {
      const rows = db
        .prepare(
          "SELECT id, shareholder_id, marked_by, approved_by, status, notes, timestamp FROM attendance_records WHERE status = ? ORDER BY timestamp DESC"
        )
        .all(status);
      res.json(rows);
      return;
    }
    const rows = db
      .prepare(
        "SELECT id, shareholder_id, marked_by, approved_by, status, notes, timestamp FROM attendance_records ORDER BY timestamp DESC"
      )
      .all();
    res.json(rows);
  });

  app.post(
    "/api/v1/attendance/approve",
    requireAuth,
    requireRoles(["SUPER_ADMIN", "ATTENDANCE_CHECKER"]),
    (req: AuthenticatedRequest, res) => {
      const parsed = z.object({ attendanceId: z.string(), approve: z.boolean() }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid payload" });
        return;
      }
      const status = parsed.data.approve ? "APPROVED" : "REJECTED";
      db.prepare("UPDATE attendance_records SET status = ?, approved_by = ? WHERE id = ?").run(
        status,
        req.user?.id,
        parsed.data.attendanceId
      );
      writeAuditLog({
        userId: req.user?.id,
        actionType: "ATTENDANCE_APPROVAL",
        module: "ATTENDANCE",
        newValue: { id: parsed.data.attendanceId, status },
        req,
      });
      emitDashboardRefresh(`attendance-${status.toLowerCase()}`);
      res.json({ id: parsed.data.attendanceId, status });
    }
  );

  app.post(
    "/api/v1/attendance/reverse",
    requireAuth,
    requireRoles(["SUPER_ADMIN"]),
    (req: AuthenticatedRequest, res) => {
      const parsed = z.object({ attendanceId: z.string(), reason: z.string().min(3) }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid payload" });
        return;
      }
      const previous = db
        .prepare("SELECT id, status, notes FROM attendance_records WHERE id = ?")
        .get(parsed.data.attendanceId);
      if (!previous) {
        res.status(404).json({ message: "Attendance record not found" });
        return;
      }
      db.prepare("UPDATE attendance_records SET status = 'REJECTED', notes = ? WHERE id = ?").run(
        `Reversed: ${parsed.data.reason}`,
        parsed.data.attendanceId
      );
      writeAuditLog({
        userId: req.user?.id,
        actionType: "ATTENDANCE_REVERSE",
        module: "ATTENDANCE",
        previousValue: previous,
        newValue: { id: parsed.data.attendanceId, status: "REJECTED", reason: parsed.data.reason },
        req,
      });
      emitDashboardRefresh("attendance-reversed");
      res.json({ ok: true });
    }
  );

  app.post(
    "/api/v1/votes/encode",
    requireAuth,
    requireRoles(["SUPER_ADMIN", "VOTE_ENCODER"]),
    (req: AuthenticatedRequest, res) => {
      const parsed = z
        .object({ shareholderId: z.string(), candidateId: z.string(), sharesUsed: z.number().int().positive() })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid payload" });
        return;
      }
      const makerChecker = configEnabled("votingMakerCheckerEnabled");
      const status = makerChecker ? "PENDING" : "APPROVED";
      const id = randomUUID();
      db.prepare(
        "INSERT INTO votes (id, shareholder_id, candidate_id, shares_used, encoded_by, approved_by, status, correction_history, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        id,
        parsed.data.shareholderId,
        parsed.data.candidateId,
        parsed.data.sharesUsed,
        req.user?.id,
        makerChecker ? null : req.user?.id,
        status,
        "[]",
        new Date().toISOString()
      );
      writeAuditLog({
        userId: req.user?.id,
        actionType: "VOTE_ENCODE",
        module: "VOTING",
        newValue: { id, ...parsed.data, status },
        req,
      });
      emitDashboardRefresh(`vote-${status.toLowerCase()}`);
      res.json({ id, status });
    }
  );

  app.get("/api/v1/votes", requireAuth, (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status) {
      const rows = db
        .prepare(
          "SELECT id, shareholder_id, candidate_id, shares_used, encoded_by, approved_by, status, timestamp FROM votes WHERE status = ? ORDER BY timestamp DESC"
        )
        .all(status);
      res.json(rows);
      return;
    }
    const rows = db
      .prepare(
        "SELECT id, shareholder_id, candidate_id, shares_used, encoded_by, approved_by, status, timestamp FROM votes ORDER BY timestamp DESC"
      )
      .all();
    res.json(rows);
  });

  app.post(
    "/api/v1/votes/approve",
    requireAuth,
    requireRoles(["SUPER_ADMIN", "VOTE_CHECKER"]),
    (req: AuthenticatedRequest, res) => {
      const parsed = z.object({ voteId: z.string(), approve: z.boolean() }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid payload" });
        return;
      }
      const status = parsed.data.approve ? "APPROVED" : "REJECTED";
      db.prepare("UPDATE votes SET status = ?, approved_by = ? WHERE id = ?").run(
        status,
        req.user?.id,
        parsed.data.voteId
      );
      writeAuditLog({
        userId: req.user?.id,
        actionType: "VOTE_APPROVAL",
        module: "VOTING",
        newValue: { id: parsed.data.voteId, status },
        req,
      });
      emitDashboardRefresh(`vote-${status.toLowerCase()}`);
      res.json({ id: parsed.data.voteId, status });
    }
  );

  app.post(
    "/api/v1/votes/reverse",
    requireAuth,
    requireRoles(["SUPER_ADMIN"]),
    (req: AuthenticatedRequest, res) => {
      const parsed = z.object({ voteId: z.string(), reason: z.string().min(3) }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid payload" });
        return;
      }
      const previous = db.prepare("SELECT id, status, correction_history FROM votes WHERE id = ?").get(parsed.data.voteId) as
        | { id: string; status: string; correction_history: string }
        | undefined;
      if (!previous) {
        res.status(404).json({ message: "Vote record not found" });
        return;
      }
      const history = JSON.parse(previous.correction_history) as string[];
      history.push(`${new Date().toISOString()} reversed: ${parsed.data.reason}`);
      db.prepare("UPDATE votes SET status = 'REJECTED', correction_history = ? WHERE id = ?").run(
        JSON.stringify(history),
        parsed.data.voteId
      );
      writeAuditLog({
        userId: req.user?.id,
        actionType: "VOTE_REVERSE",
        module: "VOTING",
        previousValue: previous,
        newValue: { id: parsed.data.voteId, status: "REJECTED", reason: parsed.data.reason },
        req,
      });
      emitDashboardRefresh("vote-reversed");
      res.json({ ok: true });
    }
  );

  app.get("/api/v1/audit-logs", requireAuth, requireRoles(["SUPER_ADMIN"]), (_req, res) => {
    const logs = db
      .prepare("SELECT id, user_id, action_type, module, timestamp FROM audit_logs ORDER BY timestamp DESC LIMIT 100")
      .all();
    res.json(logs);
  });

  app.get("/api/v1/reports/attendance", requireAuth, async (req, res) => {
    const format = typeof req.query.format === "string" ? req.query.format : "csv";
    const rows = db
      .prepare(
        "SELECT id, shareholder_id, status, marked_by, approved_by, timestamp FROM attendance_records ORDER BY timestamp DESC"
      )
      .all() as Array<{
      id: string;
      shareholder_id: string;
      status: string;
      marked_by: string;
      approved_by: string | null;
      timestamp: string;
    }>;
    const headers = ["Record ID", "Shareholder ID", "Status", "Marked By", "Approved By", "Timestamp"];
    const dataRows = rows.map((row) => [
      row.id,
      row.shareholder_id,
      row.status,
      row.marked_by,
      row.approved_by,
      row.timestamp,
    ]);
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=attendance-report.csv");
      res.send(createCsv(headers, dataRows));
      return;
    }
    if (format === "xlsx") {
      const buffer = await createExcelBuffer(headers, dataRows, "Attendance");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=attendance-report.xlsx");
      res.send(buffer);
      return;
    }
    if (format === "pdf") {
      const buffer = await createPdfBuffer("Attendance Report", headers, dataRows);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=attendance-report.pdf");
      res.send(buffer);
      return;
    }
    res.status(400).json({ message: "Unsupported format" });
  });

  app.get("/api/v1/reports/votes", requireAuth, async (req, res) => {
    const format = typeof req.query.format === "string" ? req.query.format : "csv";
    const rows = db
      .prepare(
        "SELECT id, shareholder_id, candidate_id, shares_used, status, encoded_by, approved_by, timestamp FROM votes ORDER BY timestamp DESC"
      )
      .all() as Array<{
      id: string;
      shareholder_id: string;
      candidate_id: string;
      shares_used: number;
      status: string;
      encoded_by: string;
      approved_by: string | null;
      timestamp: string;
    }>;
    const headers = [
      "Record ID",
      "Shareholder ID",
      "Candidate ID",
      "Shares Used",
      "Status",
      "Encoded By",
      "Approved By",
      "Timestamp",
    ];
    const dataRows = rows.map((row) => [
      row.id,
      row.shareholder_id,
      row.candidate_id,
      row.shares_used,
      row.status,
      row.encoded_by,
      row.approved_by,
      row.timestamp,
    ]);
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=voting-report.csv");
      res.send(createCsv(headers, dataRows));
      return;
    }
    if (format === "xlsx") {
      const buffer = await createExcelBuffer(headers, dataRows, "Votes");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=voting-report.xlsx");
      res.send(buffer);
      return;
    }
    if (format === "pdf") {
      const buffer = await createPdfBuffer("Voting Report", headers, dataRows);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=voting-report.pdf");
      res.send(buffer);
      return;
    }
    res.status(400).json({ message: "Unsupported format" });
  });
}
