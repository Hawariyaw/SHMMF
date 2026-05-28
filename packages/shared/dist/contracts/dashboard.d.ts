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
        byCandidate: Array<{
            candidateId: string;
            candidateName: string;
            totalShares: number;
            voteCount: number;
        }>;
    };
    agenda: {
        activeTitle: string;
        progressPercentage: number;
        pendingItems: number;
    };
    updatedAt: string;
}
