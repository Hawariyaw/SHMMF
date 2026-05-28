export interface DashboardSnapshot {
  shareholders: {
    total: number;
    highPower: number;
    lowPower: number;
    sharesTotal: number;
  };
  attendance: {
    quorumPercentage: number;
    attendedShareholders: number;
    pendingApprovals: number;
    completionPercentage: number;
  };
  voting: {
    totalVotes: number;
    pendingApprovals: number;
  };
  agenda: {
    activeTitle: string;
    progressPercentage: number;
    pendingItems: number;
  };
  updatedAt: string;
}
