export type Role = "SUPER_ADMIN" | "ATTENDANCE_MAKER" | "ATTENDANCE_CHECKER" | "VOTE_ENCODER" | "VOTE_CHECKER" | "GUEST";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export interface Shareholder {
    id: string;
    fullNameEn: string;
    fullNameAm?: string;
    shares: number;
    isHighPower: boolean;
    contactInfo?: string;
}
export interface AttendanceRecord {
    id: string;
    shareholderId: string;
    timestamp: string;
    markedBy: string;
    approvedBy?: string;
    status: ApprovalStatus;
    notes?: string;
}
export interface VoteRecord {
    id: string;
    shareholderId: string;
    candidateId: string;
    sharesUsed: number;
    timestamp: string;
    encodedBy: string;
    approvedBy?: string;
    status: ApprovalStatus;
    correctionHistory: string[];
}
