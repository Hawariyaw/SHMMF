import type { DashboardSnapshot } from "@shmmf/shared";
import { db } from "../../common/db";

export function buildDashboardSnapshot(): DashboardSnapshot {
  const shareholders = db
    .prepare(
      `SELECT COUNT(*) as total,
      SUM(CASE WHEN is_high_power = 1 THEN 1 ELSE 0 END) as highPower,
      COALESCE(SUM(shares), 0) as sharesTotal
      FROM shareholders`
    )
    .get() as { total: number; highPower: number; sharesTotal: number };

  const attended = db
    .prepare("SELECT COUNT(*) as count FROM attendance_records WHERE status = 'APPROVED'")
    .get() as { count: number };
  const attendancePending = db
    .prepare("SELECT COUNT(*) as count FROM attendance_records WHERE status = 'PENDING'")
    .get() as { count: number };
  const totalVotes = db.prepare("SELECT COUNT(*) as count FROM votes WHERE status = 'APPROVED'").get() as {
    count: number;
  };
  const votingPending = db.prepare("SELECT COUNT(*) as count FROM votes WHERE status = 'PENDING'").get() as {
    count: number;
  };

  return {
    shareholders: {
      total: shareholders.total,
      highPower: shareholders.highPower ?? 0,
      lowPower: shareholders.total - (shareholders.highPower ?? 0),
      sharesTotal: shareholders.sharesTotal,
    },
    attendance: {
      quorumPercentage: shareholders.total ? Number(((attended.count / shareholders.total) * 100).toFixed(1)) : 0,
      attendedShareholders: attended.count,
      pendingApprovals: attendancePending.count,
      completionPercentage: shareholders.total
        ? Number(((attended.count / shareholders.total) * 100).toFixed(1))
        : 0,
    },
    voting: { totalVotes: totalVotes.count, pendingApprovals: votingPending.count },
    agenda: { activeTitle: "Board Chair Election", progressPercentage: 45, pendingItems: 3 },
    updatedAt: new Date().toISOString(),
  };
}
