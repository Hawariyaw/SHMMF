const dashboardSnapshot = {
    shareholders: { total: 1240, highPower: 86, lowPower: 1154, sharesTotal: 12984501 },
    attendance: {
        quorumPercentage: 71.4,
        attendedShareholders: 902,
        pendingApprovals: 11,
        completionPercentage: 77.2,
    },
    voting: { totalVotes: 633, pendingApprovals: 9 },
    agenda: { activeTitle: "Board Chair Election", progressPercentage: 58, pendingItems: 4 },
    updatedAt: new Date().toISOString(),
};
export function registerRoutes(app) {
    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });
    app.get("/api/v1/dashboard/snapshot", (_req, res) => {
        res.json(dashboardSnapshot);
    });
}
