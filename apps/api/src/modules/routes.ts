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

function normalizeText(value: string): string {
  return value.normalize("NFC").trim();
}

function getUsernameById(userId: string | undefined): string | null {
  if (!userId) return null;
  const user = db.prepare("SELECT username FROM users WHERE id = ?").get(userId) as { username: string } | undefined;
  return user?.username ?? null;
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

  app.get("/api/v1/agendas", requireAuth, (req, res) => {
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    const rows = date
      ? db
          .prepare(
            "SELECT id, title, details, agenda_date, sort_order, is_active, created_at FROM agendas WHERE agenda_date = ? ORDER BY sort_order ASC, created_at ASC"
          )
          .all(date)
      : db
          .prepare(
            "SELECT id, title, details, agenda_date, sort_order, is_active, created_at FROM agendas ORDER BY agenda_date DESC, sort_order ASC, created_at ASC"
          )
          .all();
    res.json(rows);
  });

  app.post("/api/v1/agendas", requireAuth, requireRoles(["SUPER_ADMIN"]), (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        title: z.string().transform(normalizeText).pipe(z.string().min(2)),
        details: z.string().transform(normalizeText).optional(),
        agendaDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        sortOrder: z.number().int().nonnegative().optional(),
        isActive: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
      return;
    }
    if (parsed.data.isActive) {
      db.prepare("UPDATE agendas SET is_active = 0").run();
    }
    const id = `ag-${randomUUID().slice(0, 8)}`;
    const createdAt = new Date().toISOString();
    db.prepare(
      "INSERT INTO agendas (id, title, details, agenda_date, sort_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      id,
      parsed.data.title,
      parsed.data.details ?? null,
      parsed.data.agendaDate,
      parsed.data.sortOrder ?? 0,
      parsed.data.isActive ? 1 : 0,
      createdAt
    );
    writeAuditLog({
      userId: req.user?.id,
      actionType: "AGENDA_CREATE",
      module: "AGENDA",
      newValue: { id, ...parsed.data },
      req,
    });
    emitDashboardRefresh("agenda-created");
    res.status(201).json({ id });
  });

  app.put("/api/v1/agendas/:id", requireAuth, requireRoles(["SUPER_ADMIN"]), (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        title: z.string().transform(normalizeText).pipe(z.string().min(2)),
        details: z.string().transform(normalizeText).optional(),
        agendaDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        sortOrder: z.number().int().nonnegative().optional(),
        isActive: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
      return;
    }
    const agendaId = readParam(req.params.id);
    const existing = db.prepare("SELECT id FROM agendas WHERE id = ?").get(agendaId) as { id: string } | undefined;
    if (!existing) {
      res.status(404).json({ message: "Agenda not found" });
      return;
    }
    if (parsed.data.isActive) {
      db.prepare("UPDATE agendas SET is_active = 0").run();
    }
    db.prepare(
      "UPDATE agendas SET title = ?, details = ?, agenda_date = ?, sort_order = ?, is_active = ? WHERE id = ?"
    ).run(
      parsed.data.title,
      parsed.data.details ?? null,
      parsed.data.agendaDate,
      parsed.data.sortOrder ?? 0,
      parsed.data.isActive ? 1 : 0,
      agendaId
    );
    writeAuditLog({
      userId: req.user?.id,
      actionType: "AGENDA_UPDATE",
      module: "AGENDA",
      newValue: { id: agendaId, ...parsed.data },
      req,
    });
    emitDashboardRefresh("agenda-updated");
    res.json({ ok: true });
  });

  app.post("/api/v1/agendas/:id/activate", requireAuth, requireRoles(["SUPER_ADMIN"]), (req: AuthenticatedRequest, res) => {
    const agendaId = readParam(req.params.id);
    const existing = db.prepare("SELECT id FROM agendas WHERE id = ?").get(agendaId) as { id: string } | undefined;
    if (!existing) {
      res.status(404).json({ message: "Agenda not found" });
      return;
    }
    db.prepare("UPDATE agendas SET is_active = 0").run();
    db.prepare("UPDATE agendas SET is_active = 1 WHERE id = ?").run(agendaId);
    writeAuditLog({
      userId: req.user?.id,
      actionType: "AGENDA_ACTIVATE",
      module: "AGENDA",
      newValue: { id: agendaId },
      req,
    });
    emitDashboardRefresh("agenda-activated");
    res.json({ ok: true });
  });

  app.delete("/api/v1/agendas/:id", requireAuth, requireRoles(["SUPER_ADMIN"]), (req: AuthenticatedRequest, res) => {
    const agendaId = readParam(req.params.id);
    const existing = db.prepare("SELECT id FROM agendas WHERE id = ?").get(agendaId) as { id: string } | undefined;
    if (!existing) {
      res.status(404).json({ message: "Agenda not found" });
      return;
    }
    db.prepare("DELETE FROM agendas WHERE id = ?").run(agendaId);
    writeAuditLog({
      userId: req.user?.id,
      actionType: "AGENDA_DELETE",
      module: "AGENDA",
      newValue: { id: agendaId },
      req,
    });
    emitDashboardRefresh("agenda-deleted");
    res.status(204).send();
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

  app.get("/api/v1/shareholders/template", requireAuth, requireRoles(["SUPER_ADMIN"]), async (req, res) => {
    const format = typeof req.query.format === "string" ? req.query.format : "xlsx";
    const headers = ["fullNameEn", "shares", "isHighPower", "fullNameAm", "contactInfo"];
    const sampleRows: Array<Array<string | number | null>> = [
      ["Abebe Kebede", 12500, "false", "አበበ ከበደ", "abebe@example.com"],
      ["Lulit Tadesse", 8900, "true", "ሉሊት ታደሰ", "+251900000001"],
    ];
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=shareholders-template.csv");
      res.send(createCsv(headers, sampleRows));
      return;
    }
    if (format === "xlsx") {
      const buffer = await createExcelBuffer(headers, sampleRows, "Shareholders Template");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=shareholders-template.xlsx");
      res.send(buffer);
      return;
    }
    res.status(400).json({ message: "Unsupported format" });
  });

  app.post("/api/v1/shareholders/bulk", requireAuth, requireRoles(["SUPER_ADMIN"]), (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        rows: z.array(
          z.object({
            fullNameEn: z.string().min(2),
            shares: z.number().int().positive(),
            isHighPower: z.boolean().optional(),
            fullNameAm: z.string().optional(),
            contactInfo: z.string().optional(),
          })
        ),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid bulk payload", issues: parsed.error.issues });
      return;
    }

    const created = parsed.data.rows.map((row) =>
      createShareholder({
        fullNameEn: row.fullNameEn,
        shares: row.shares,
        isHighPower: resolveInfluentialFlag(row.isHighPower, row.shares),
        fullNameAm: row.fullNameAm,
        contactInfo: row.contactInfo,
      })
    );

    writeAuditLog({
      userId: req.user?.id,
      actionType: "SHAREHOLDER_BULK_CREATE",
      module: "SHAREHOLDERS",
      newValue: { count: created.length },
      req,
    });
    emitDashboardRefresh("shareholder-bulk-created");
    res.status(201).json({ count: created.length, created });
  });

  app.get("/api/v1/candidates", requireAuth, (_req, res) => {
    const rows = db
      .prepare(
        `SELECT c.id, c.shareholder_id, COALESCE(s.full_name_en, c.name) as name, c.position
         FROM candidates c
         LEFT JOIN shareholders s ON s.id = c.shareholder_id
         WHERE c.is_active = 1
         ORDER BY name`
      )
      .all() as Array<{ id: string; shareholder_id: string | null; name: string; position: string }>;
    res.json(rows);
  });

  app.post("/api/v1/candidates", requireAuth, requireRoles(["SUPER_ADMIN"]), (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        shareholderId: z.string(),
        position: z.string().transform(normalizeText).pipe(z.string().min(2)).default("Board Member"),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
      return;
    }
    const shareholder = db
      .prepare("SELECT id, full_name_en FROM shareholders WHERE id = ?")
      .get(parsed.data.shareholderId) as { id: string; full_name_en: string } | undefined;
    if (!shareholder) {
      res.status(404).json({ message: "Shareholder not found" });
      return;
    }
    const duplicate = db
      .prepare("SELECT id FROM candidates WHERE shareholder_id = ? AND is_active = 1")
      .get(parsed.data.shareholderId) as { id: string } | undefined;
    if (duplicate) {
      res.status(409).json({ message: "Shareholder is already a registered candidate" });
      return;
    }
    const candidateId = `c-${randomUUID().slice(0, 8)}`;
    db.prepare("INSERT INTO candidates (id, shareholder_id, name, position, is_active) VALUES (?, ?, ?, ?, 1)").run(
      candidateId,
      shareholder.id,
      shareholder.full_name_en,
      parsed.data.position
    );
    writeAuditLog({
      userId: req.user?.id,
      actionType: "CANDIDATE_CREATE",
      module: "CANDIDATES",
      newValue: { id: candidateId, shareholderId: shareholder.id },
      req,
    });
    emitDashboardRefresh("candidate-created");
    res.status(201).json({ id: candidateId, shareholderId: shareholder.id, name: shareholder.full_name_en, position: parsed.data.position });
  });

  app.delete("/api/v1/candidates/:id", requireAuth, requireRoles(["SUPER_ADMIN"]), (req: AuthenticatedRequest, res) => {
    const id = readParam(req.params.id);
    const existing = db.prepare("SELECT id FROM candidates WHERE id = ? AND is_active = 1").get(id) as { id: string } | undefined;
    if (!existing) {
      res.status(404).json({ message: "Candidate not found" });
      return;
    }
    db.prepare("UPDATE candidates SET is_active = 0 WHERE id = ?").run(id);
    writeAuditLog({
      userId: req.user?.id,
      actionType: "CANDIDATE_DELETE",
      module: "CANDIDATES",
      newValue: { id },
      req,
    });
    emitDashboardRefresh("candidate-deleted");
    res.status(204).send();
  });

  app.get("/api/v1/candidate-nominations/results", requireAuth, (req, res) => {
    const rows = db
      .prepare(
        `SELECT
          s.id as nomineeShareholderId,
          s.full_name_en as nomineeName,
          COALESCE(SUM(nv.shares_used), 0) as totalShares,
          COUNT(nv.id) as voteCount
        FROM shareholders s
        LEFT JOIN candidate_nomination_votes nv ON nv.nominee_shareholder_id = s.id
        GROUP BY s.id, s.full_name_en
        ORDER BY totalShares DESC, voteCount DESC, nomineeName ASC`
      )
      .all() as Array<{
      nomineeShareholderId: string;
      nomineeName: string;
      totalShares: number;
      voteCount: number;
    }>;
    res.json(rows);
  });

  app.get("/api/v1/candidate-nominations/eligible-voters", requireAuth, (req, res) => {
    const rows = db
      .prepare(
        `SELECT s.id, s.full_name_en as fullNameEn, s.shares
         FROM shareholders s
         INNER JOIN attendance_records a ON a.shareholder_id = s.id AND a.status = 'APPROVED'
         LEFT JOIN candidate_nomination_votes nv ON nv.voter_shareholder_id = s.id
         WHERE nv.id IS NULL
         ORDER BY s.full_name_en`
      )
      .all();
    res.json(rows);
  });

  app.post(
    "/api/v1/candidate-nominations/vote",
    requireAuth,
    requireRoles(["SUPER_ADMIN", "VOTE_ENCODER"]),
    (req: AuthenticatedRequest, res) => {
      const parsed = z
        .object({ voterShareholderId: z.string(), nomineeShareholderId: z.string() })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
        return;
      }
      if (parsed.data.voterShareholderId === parsed.data.nomineeShareholderId) {
        res.status(400).json({ message: "Shareholder cannot nominate themselves" });
        return;
      }
      const voter = db
        .prepare("SELECT id, shares FROM shareholders WHERE id = ?")
        .get(parsed.data.voterShareholderId) as { id: string; shares: number } | undefined;
      if (!voter) {
        res.status(404).json({ message: "Voter shareholder not found" });
        return;
      }
      const nominee = db
        .prepare("SELECT id, full_name_en FROM shareholders WHERE id = ?")
        .get(parsed.data.nomineeShareholderId) as { id: string; full_name_en: string } | undefined;
      if (!nominee) {
        res.status(404).json({ message: "Nominee shareholder not found" });
        return;
      }
      const attended = db
        .prepare("SELECT id FROM attendance_records WHERE shareholder_id = ? AND status = 'APPROVED' LIMIT 1")
        .get(parsed.data.voterShareholderId) as { id: string } | undefined;
      if (!attended) {
        res.status(400).json({ message: "Only attended shareholders can vote for nominations" });
        return;
      }
      const existing = db
        .prepare("SELECT id FROM candidate_nomination_votes WHERE voter_shareholder_id = ?")
        .get(parsed.data.voterShareholderId) as { id: string } | undefined;
      if (existing) {
        res.status(409).json({ message: "This shareholder has already cast a nomination vote" });
        return;
      }

      const nominationId = `nv-${randomUUID().slice(0, 8)}`;
      db.prepare(
        "INSERT INTO candidate_nomination_votes (id, voter_shareholder_id, nominee_shareholder_id, shares_used, timestamp) VALUES (?, ?, ?, ?, ?)"
      ).run(nominationId, parsed.data.voterShareholderId, parsed.data.nomineeShareholderId, voter.shares, new Date().toISOString());
      writeAuditLog({
        userId: req.user?.id,
        actionType: "CANDIDATE_NOMINATION_VOTE",
        module: "CANDIDATES",
        newValue: {
          id: nominationId,
          voterShareholderId: parsed.data.voterShareholderId,
          nomineeShareholderId: parsed.data.nomineeShareholderId,
          sharesUsed: voter.shares,
        },
        req,
      });
      emitDashboardRefresh("candidate-nomination-voted");
      res.status(201).json({ id: nominationId, sharesUsed: voter.shares });
    }
  );

  app.post(
    "/api/v1/candidate-nominations/promote",
    requireAuth,
    requireRoles(["SUPER_ADMIN"]),
    (req: AuthenticatedRequest, res) => {
      const parsed = z
        .object({ nomineeShareholderId: z.string(), position: z.string().min(2).default("Board Member") })
      .transform((data) => ({ ...data, position: normalizeText(data.position) }))
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
        return;
      }
      const nominee = db
        .prepare("SELECT id, full_name_en FROM shareholders WHERE id = ?")
        .get(parsed.data.nomineeShareholderId) as { id: string; full_name_en: string } | undefined;
      if (!nominee) {
        res.status(404).json({ message: "Nominee shareholder not found" });
        return;
      }
      const duplicate = db
        .prepare("SELECT id FROM candidates WHERE shareholder_id = ? AND is_active = 1")
        .get(parsed.data.nomineeShareholderId) as { id: string } | undefined;
      if (duplicate) {
        res.status(409).json({ message: "Nominee is already an active candidate" });
        return;
      }
      const candidateId = `c-${randomUUID().slice(0, 8)}`;
      db.prepare("INSERT INTO candidates (id, shareholder_id, name, position, is_active) VALUES (?, ?, ?, ?, 1)").run(
        candidateId,
        nominee.id,
        nominee.full_name_en,
        parsed.data.position
      );
      writeAuditLog({
        userId: req.user?.id,
        actionType: "CANDIDATE_PROMOTE_FROM_NOMINATION",
        module: "CANDIDATES",
        newValue: { candidateId, nomineeShareholderId: nominee.id, position: parsed.data.position },
        req,
      });
      emitDashboardRefresh("candidate-promoted");
      res.status(201).json({ id: candidateId, shareholderId: nominee.id, name: nominee.full_name_en, position: parsed.data.position });
    }
  );

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

  app.post("/api/v1/admin/session/reset", requireAuth, requireRoles(["SUPER_ADMIN"]), (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        clearCandidates: z.boolean().optional(),
        clearAuditLogs: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid payload", issues: parsed.error.issues });
      return;
    }
    const clearCandidates = parsed.data.clearCandidates ?? false;
    const clearAuditLogs = parsed.data.clearAuditLogs ?? false;

    const attendanceCount = (db.prepare("SELECT COUNT(*) as count FROM attendance_records").get() as { count: number }).count;
    const votesCount = (db.prepare("SELECT COUNT(*) as count FROM votes").get() as { count: number }).count;
    const nominationVotesCount = (
      db.prepare("SELECT COUNT(*) as count FROM candidate_nomination_votes").get() as { count: number }
    ).count;
    const candidateCount = (db.prepare("SELECT COUNT(*) as count FROM candidates WHERE is_active = 1").get() as { count: number }).count;
    const auditCount = (db.prepare("SELECT COUNT(*) as count FROM audit_logs").get() as { count: number }).count;

    const tx = db.transaction(() => {
      db.prepare("DELETE FROM attendance_records").run();
      db.prepare("DELETE FROM votes").run();
      db.prepare("DELETE FROM candidate_nomination_votes").run();
      if (clearCandidates) {
        db.prepare("UPDATE candidates SET is_active = 0").run();
      }
      if (clearAuditLogs) {
        db.prepare("DELETE FROM audit_logs").run();
      }
    });
    tx();

    writeAuditLog({
      userId: req.user?.id,
      actionType: "RESET_AGM_SESSION",
      module: "ADMIN",
      newValue: {
        clearCandidates,
        clearAuditLogs,
        cleared: {
          attendanceCount,
          votesCount,
          nominationVotesCount,
          candidateCount: clearCandidates ? candidateCount : 0,
          auditCount: clearAuditLogs ? auditCount : 0,
        },
      },
      req,
    });
    emitDashboardRefresh("session-reset");
    res.json({
      ok: true,
      cleared: {
        attendanceCount,
        votesCount,
        nominationVotesCount,
        candidateCount: clearCandidates ? candidateCount : 0,
        auditCount: clearAuditLogs ? auditCount : 0,
      },
    });
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
        newValue: {
          id,
          ...parsed.data,
          status,
          makerUserId: req.user?.id,
          makerUsername: getUsernameById(req.user?.id),
          checkerUserId: makerChecker ? null : req.user?.id,
          checkerUsername: makerChecker ? null : getUsernameById(req.user?.id),
        },
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
      const previous = db
        .prepare("SELECT id, marked_by, approved_by, status FROM attendance_records WHERE id = ?")
        .get(parsed.data.attendanceId) as
        | { id: string; marked_by: string; approved_by: string | null; status: string }
        | undefined;
      if (!previous) {
        res.status(404).json({ message: "Attendance record not found" });
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
        previousValue: previous,
        newValue: {
          id: parsed.data.attendanceId,
          status,
          makerUserId: previous.marked_by,
          makerUsername: getUsernameById(previous.marked_by),
          checkerUserId: req.user?.id,
          checkerUsername: getUsernameById(req.user?.id),
        },
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
        .object({ shareholderId: z.string(), candidateId: z.string() })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid payload" });
        return;
      }
      const candidate = db
        .prepare("SELECT id, shareholder_id FROM candidates WHERE id = ? AND is_active = 1")
        .get(parsed.data.candidateId) as { id: string; shareholder_id: string | null } | undefined;
      if (!candidate) {
        res.status(400).json({ message: "Candidate is not registered" });
        return;
      }
      const shareholder = db
        .prepare("SELECT shares FROM shareholders WHERE id = ?")
        .get(parsed.data.shareholderId) as { shares: number } | undefined;
      if (!shareholder) {
        res.status(404).json({ message: "Shareholder not found" });
        return;
      }
      if (candidate.shareholder_id && candidate.shareholder_id === parsed.data.shareholderId) {
        res.status(400).json({ message: "Shareholder cannot vote for themselves" });
        return;
      }
      const approvedAttendance = db
        .prepare("SELECT id FROM attendance_records WHERE shareholder_id = ? AND status = 'APPROVED' LIMIT 1")
        .get(parsed.data.shareholderId) as { id: string } | undefined;
      if (!approvedAttendance) {
        res.status(400).json({ message: "Only attended shareholders can vote" });
        return;
      }
      const existingVote = db
        .prepare("SELECT id FROM votes WHERE shareholder_id = ? LIMIT 1")
        .get(parsed.data.shareholderId) as { id: string } | undefined;
      if (existingVote) {
        res.status(409).json({ message: "This shareholder has already voted" });
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
        shareholder.shares,
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
        newValue: {
          id,
          ...parsed.data,
          sharesUsed: shareholder.shares,
          status,
          makerUserId: req.user?.id,
          makerUsername: getUsernameById(req.user?.id),
          checkerUserId: makerChecker ? null : req.user?.id,
          checkerUsername: makerChecker ? null : getUsernameById(req.user?.id),
        },
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
      const previous = db
        .prepare("SELECT id, encoded_by, approved_by, status FROM votes WHERE id = ?")
        .get(parsed.data.voteId) as
        | { id: string; encoded_by: string; approved_by: string | null; status: string }
        | undefined;
      if (!previous) {
        res.status(404).json({ message: "Vote record not found" });
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
        previousValue: previous,
        newValue: {
          id: parsed.data.voteId,
          status,
          makerUserId: previous.encoded_by,
          makerUsername: getUsernameById(previous.encoded_by),
          checkerUserId: req.user?.id,
          checkerUsername: getUsernameById(req.user?.id),
        },
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
      .prepare(
        `SELECT
          a.id,
          a.user_id,
          u.username as actor_username,
          a.action_type,
          a.module,
          a.previous_value,
          a.new_value,
          a.timestamp
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.timestamp DESC
        LIMIT 100`
      )
      .all() as Array<{
      id: string;
      user_id: string | null;
      actor_username: string | null;
      action_type: string;
      module: string;
      previous_value: string | null;
      new_value: string | null;
      timestamp: string;
    }>;
    const normalized = logs.map((log) => {
      let previousValue: unknown = null;
      let newValue: unknown = null;
      try {
        previousValue = log.previous_value ? JSON.parse(log.previous_value) : null;
      } catch {
        previousValue = log.previous_value;
      }
      try {
        newValue = log.new_value ? JSON.parse(log.new_value) : null;
      } catch {
        newValue = log.new_value;
      }
      return {
        id: log.id,
        user_id: log.user_id,
        actor_username: log.actor_username,
        action_type: log.action_type,
        module: log.module,
        previous_value: previousValue,
        new_value: newValue,
        timestamp: log.timestamp,
      };
    });
    res.json(normalized);
  });

  app.get("/api/v1/reports/attendance", requireAuth, requireRoles(["SUPER_ADMIN"]), async (req, res) => {
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

  app.get("/api/v1/reports/votes", requireAuth, requireRoles(["SUPER_ADMIN"]), async (req, res) => {
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

  app.get("/api/v1/reports/candidate-nominations", requireAuth, requireRoles(["SUPER_ADMIN"]), async (req, res) => {
    const format = typeof req.query.format === "string" ? req.query.format : "csv";
    const rows = db
      .prepare(
        `SELECT
          s.id as nominee_shareholder_id,
          s.full_name_en as nominee_name,
          COALESCE(SUM(nv.shares_used), 0) as total_shares,
          COUNT(nv.id) as vote_count
        FROM shareholders s
        LEFT JOIN candidate_nomination_votes nv ON nv.nominee_shareholder_id = s.id
        GROUP BY s.id, s.full_name_en
        ORDER BY total_shares DESC, vote_count DESC`
      )
      .all() as Array<{
      nominee_shareholder_id: string;
      nominee_name: string;
      total_shares: number;
      vote_count: number;
    }>;
    const headers = ["Nominee Shareholder ID", "Nominee Name", "Total Shares", "Vote Count"];
    const dataRows = rows.map((row) => [row.nominee_shareholder_id, row.nominee_name, row.total_shares, row.vote_count]);
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=candidate-nominations-report.csv");
      res.send(createCsv(headers, dataRows));
      return;
    }
    if (format === "xlsx") {
      const buffer = await createExcelBuffer(headers, dataRows, "Candidate Nominations");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=candidate-nominations-report.xlsx");
      res.send(buffer);
      return;
    }
    if (format === "pdf") {
      const buffer = await createPdfBuffer("Candidate Nominations Report", headers, dataRows);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=candidate-nominations-report.pdf");
      res.send(buffer);
      return;
    }
    res.status(400).json({ message: "Unsupported format" });
  });
}
