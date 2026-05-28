import { BarChart3, Clock3, LayoutDashboard, ShieldCheck, Users, Vote } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DashboardSnapshot, Role } from "@shmmf/shared";
import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

const API_BASE = "http://localhost:4000/api/v1";
type Section = "dashboard" | "shareholders" | "attendance" | "votes" | "audit";
interface ShareholderRow {
  id: string;
  fullNameEn: string;
  shares: number;
  isHighPower: boolean;
}

interface AttendanceRow {
  id: string;
  shareholder_id: string;
  status: string;
  timestamp: string;
  notes?: string;
}

interface VoteRow {
  id: string;
  shareholder_id: string;
  candidate_id: string;
  shares_used: number;
  status: string;
  timestamp: string;
}

interface AuditRow {
  id: string;
  action_type: string;
  module: string;
  timestamp: string;
}

interface LoginResponse {
  token: string;
  role: Role;
}
interface ConfigResponse {
  attendanceMakerCheckerEnabled: boolean;
  votingMakerCheckerEnabled: boolean;
  influentialAutoClassificationEnabled: boolean;
  influentialShareThreshold: number;
}

const STORAGE_KEY = "shmmf_auth_session";

async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error("Unable to login");
  return (await res.json()) as LoginResponse;
}

async function getDashboard(token: string): Promise<DashboardSnapshot> {
  const res = await fetch(`${API_BASE}/dashboard/snapshot`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Unable to load dashboard snapshot");
  return (await res.json()) as DashboardSnapshot;
}

async function fetchList<T>(token: string, path: string): Promise<T[]> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Unable to fetch ${path}`);
  return (await res.json()) as T[];
}

async function fetchConfig(token: string): Promise<ConfigResponse> {
  const res = await fetch(`${API_BASE}/config`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Unable to fetch configuration");
  return (await res.json()) as ConfigResponse;
}

async function postAuthorized(token: string, path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Unable to POST ${path}`);
}

async function deleteAuthorized(token: string, path: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Unable to DELETE ${path}`);
}

async function downloadReport(token: string, path: string, fileName: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Unable to download ${fileName}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function App() {
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>("dashboard");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin1234");
  const [rememberMe, setRememberMe] = useState(true);
  const [shareholderName, setShareholderName] = useState("");
  const [shareholderShares, setShareholderShares] = useState("100");
  const [manualInfluentialFlag, setManualInfluentialFlag] = useState(false);
  const [editingShareholderId, setEditingShareholderId] = useState("");
  const [editingShareholderName, setEditingShareholderName] = useState("");
  const [editingShareholderShares, setEditingShareholderShares] = useState("100");
  const [editingInfluentialFlag, setEditingInfluentialFlag] = useState(false);
  const [autoClassificationEnabled, setAutoClassificationEnabled] = useState(false);
  const [influentialThreshold, setInfluentialThreshold] = useState("100000");
  const [selectedShareholder, setSelectedShareholder] = useState("");
  const [selectedAttendance, setSelectedAttendance] = useState("");
  const [selectedVote, setSelectedVote] = useState("");
  const [session, setSession] = useState<LoginResponse | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LoginResponse;
    } catch {
      return null;
    }
  });
  const loginMutation = useMutation({
    mutationFn: ({ user, pass }: { user: string; pass: string }) => login(user, pass),
    onSuccess: (data) => {
      setSession(data);
      if (rememberMe) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    },
  });
  const auth = session;
  const token = auth?.token;
  const role = auth?.role;
  const isSuperAdmin = role === "SUPER_ADMIN";
  const canMarkAttendance = role === "SUPER_ADMIN" || role === "ATTENDANCE_MAKER";
  const canApproveAttendance = role === "SUPER_ADMIN" || role === "ATTENDANCE_CHECKER";
  const canEncodeVote = role === "SUPER_ADMIN" || role === "VOTE_ENCODER";
  const canApproveVote = role === "SUPER_ADMIN" || role === "VOTE_CHECKER";
  const canViewAudit = role === "SUPER_ADMIN";

  const dashboard = useQuery({
    queryKey: ["dashboard", token],
    queryFn: () => getDashboard(token!),
    enabled: Boolean(token),
    refetchInterval: 5000,
  });

  const cards = [
    { label: "Quorum", value: `${dashboard.data?.attendance.quorumPercentage ?? 0}%`, icon: BarChart3, tone: "success" },
    { label: "Attendance Pending", value: `${dashboard.data?.attendance.pendingApprovals ?? 0}`, icon: Clock3, tone: "warning" },
    { label: "Votes Counted", value: `${dashboard.data?.voting.totalVotes ?? 0}`, icon: Vote, tone: "primary" },
    { label: "Shareholders", value: `${dashboard.data?.shareholders.total ?? 0}`, icon: ShieldCheck, tone: "neutral" },
  ] as const;
  const attendancePending = useQuery({
    queryKey: ["attendance-pending", token],
    queryFn: () => fetchList<AttendanceRow>(token!, "/attendance?status=PENDING"),
    enabled: Boolean(token),
  });
  const attendanceAll = useQuery({
    queryKey: ["attendance-all", token],
    queryFn: () => fetchList<AttendanceRow>(token!, "/attendance"),
    enabled: Boolean(token),
  });
  const votesPending = useQuery({
    queryKey: ["votes-pending", token],
    queryFn: () => fetchList<VoteRow>(token!, "/votes?status=PENDING"),
    enabled: Boolean(token),
  });
  const votesAll = useQuery({
    queryKey: ["votes-all", token],
    queryFn: () => fetchList<VoteRow>(token!, "/votes"),
    enabled: Boolean(token),
  });
  const shareholders = useQuery({
    queryKey: ["shareholders", token],
    queryFn: () => fetchList<ShareholderRow>(token!, "/shareholders"),
    enabled: Boolean(token),
  });
  const auditLogs = useQuery({
    queryKey: ["audit", token],
    queryFn: () => fetchList<AuditRow>(token!, "/audit-logs"),
    enabled: Boolean(token),
  });
  const config = useQuery({
    queryKey: ["config", token],
    queryFn: () => fetchConfig(token!),
    enabled: Boolean(token && isSuperAdmin),
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard", token] });
    queryClient.invalidateQueries({ queryKey: ["attendance-pending", token] });
    queryClient.invalidateQueries({ queryKey: ["attendance-all", token] });
    queryClient.invalidateQueries({ queryKey: ["votes-pending", token] });
    queryClient.invalidateQueries({ queryKey: ["votes-all", token] });
    queryClient.invalidateQueries({ queryKey: ["shareholders", token] });
    queryClient.invalidateQueries({ queryKey: ["audit", token] });
    queryClient.invalidateQueries({ queryKey: ["config", token] });
  };

  const createShareholderMutation = useMutation({
    mutationFn: async () => {
      await fetch(`${API_BASE}/shareholders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullNameEn: shareholderName,
          shares: Number(shareholderShares),
          isHighPower: manualInfluentialFlag,
        }),
      });
    },
    onSuccess: () => {
      setShareholderName("");
      setShareholderShares("100");
      setManualInfluentialFlag(false);
      refreshAll();
    },
  });

  const deleteShareholderMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteAuthorized(token!, `/shareholders/${id}`);
    },
    onSuccess: refreshAll,
  });

  const updateShareholderMutation = useMutation({
    mutationFn: async () => {
      const current = shareholders.data?.find((s) => s.id === editingShareholderId);
      if (!current) {
        throw new Error("Shareholder not found");
      }
      const res = await fetch(`${API_BASE}/shareholders/${editingShareholderId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullNameEn: editingShareholderName,
          shares: Number(editingShareholderShares),
          isHighPower: editingInfluentialFlag,
          contactInfo: current.id,
        }),
      });
      if (!res.ok) {
        throw new Error("Unable to update shareholder");
      }
    },
    onSuccess: () => {
      setEditingShareholderId("");
      setEditingShareholderName("");
      setEditingShareholderShares("100");
      setEditingInfluentialFlag(false);
      refreshAll();
    },
  });

  const saveInfluentialConfigMutation = useMutation({
    mutationFn: async () => {
      await fetch(`${API_BASE}/config`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          influentialAutoClassificationEnabled: autoClassificationEnabled,
          influentialShareThreshold: Number(influentialThreshold),
          applyInfluentialClassificationNow: true,
        }),
      });
    },
    onSuccess: refreshAll,
  });

  const markAttendanceMutation = useMutation({
    mutationFn: async () => {
      await postAuthorized(token!, "/attendance/mark", { shareholderId: selectedShareholder });
    },
    onSuccess: refreshAll,
  });

  const approveAttendanceMutation = useMutation({
    mutationFn: async (payload: { id: string; approve: boolean }) => {
      await postAuthorized(token!, "/attendance/approve", { attendanceId: payload.id, approve: payload.approve });
    },
    onSuccess: refreshAll,
  });

  const reverseAttendanceMutation = useMutation({
    mutationFn: async () => {
      await postAuthorized(token!, "/attendance/reverse", {
        attendanceId: selectedAttendance,
        reason: "Admin correction",
      });
    },
    onSuccess: () => {
      setSelectedAttendance("");
      refreshAll();
    },
  });

  const encodeVoteMutation = useMutation({
    mutationFn: async () => {
      await postAuthorized(token!, "/votes/encode", {
        shareholderId: selectedShareholder,
        candidateId: "c-01",
        sharesUsed: 100,
      });
    },
    onSuccess: refreshAll,
  });

  const approveVoteMutation = useMutation({
    mutationFn: async (payload: { id: string; approve: boolean }) => {
      await postAuthorized(token!, "/votes/approve", { voteId: payload.id, approve: payload.approve });
    },
    onSuccess: refreshAll,
  });

  const reverseVoteMutation = useMutation({
    mutationFn: async () => {
      await postAuthorized(token!, "/votes/reverse", { voteId: selectedVote, reason: "Admin correction" });
    },
    onSuccess: () => {
      setSelectedVote("");
      refreshAll();
    },
  });

  const sidebarItems = useMemo(
    () =>
      [
        { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard, visible: true },
        { id: "shareholders" as const, label: "Shareholders", icon: Users, visible: isSuperAdmin },
        { id: "attendance" as const, label: "Attendance Queue", icon: Clock3, visible: canMarkAttendance || canApproveAttendance || isSuperAdmin },
        { id: "votes" as const, label: "Vote Queue", icon: Vote, visible: canEncodeVote || canApproveVote || isSuperAdmin },
        { id: "audit" as const, label: "Audit Logs", icon: ShieldCheck, visible: canViewAudit },
      ].filter((item) => item.visible),
    [canApproveAttendance, canApproveVote, canEncodeVote, canMarkAttendance, canViewAudit, isSuperAdmin]
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    const socket = io("http://localhost:4000");
    socket.on("dashboard:refresh", () => {
      refreshAll();
    });
    return () => {
      socket.disconnect();
    };
  }, [token, queryClient]);

  useEffect(() => {
    if (config.data) {
      setAutoClassificationEnabled(config.data.influentialAutoClassificationEnabled);
      setInfluentialThreshold(String(config.data.influentialShareThreshold));
    }
  }, [config.data]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const timeoutMs = 15 * 60 * 1000;
    let timeoutId: ReturnType<typeof setTimeout>;
    const logout = () => {
      setSession(null);
      localStorage.removeItem(STORAGE_KEY);
      setSection("dashboard");
    };
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(logout, timeoutMs);
    };
    const events: Array<keyof WindowEventMap> = ["mousemove", "keydown", "click", "scroll"];
    resetTimer();
    events.forEach((event) => window.addEventListener(event, resetTimer));
    return () => {
      clearTimeout(timeoutId);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [token]);

  return (
    <main className="app-shell app-layout">
      {!token && (
        <section className="panel">
          <h2>System Access</h2>
          <p className="paragraph">Sign in with your assigned role account to continue.</p>
          <div className="inline-form">
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="input" placeholder="Username" />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="Password"
              type="password"
            />
          </div>
          <label className="remember-row">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>Remember me</span>
          </label>
          <button
            className="action-btn"
            type="button"
            onClick={() => loginMutation.mutate({ user: username, pass: password })}
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? "Signing in..." : "Enter Command Dashboard"}
          </button>
          {loginMutation.isError && <p className="error">Could not authenticate with API.</p>}
        </section>
      )}
      {token && (
        <>
          <aside className="sidebar">
            <p className="muted">SHMMF Console</p>
            <h2 className="sidebar-title">AGM Operations</h2>
            <p className="paragraph">Role: {role}</p>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                setSession(null);
                localStorage.removeItem(STORAGE_KEY);
                setSection("dashboard");
              }}
            >
              Logout
            </button>
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-btn ${section === item.id ? "active" : ""}`}
                onClick={() => setSection(item.id)}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
              </button>
            ))}
          </aside>

          <section>
            <header className="top-bar">
              <div>
                <p className="muted">Shareholders Meeting Management Framework</p>
                <h1>AGM Command Center</h1>
              </div>
              <span className="badge">Live Session</span>
            </header>

            {section === "dashboard" && (
              <>
                {dashboard.isLoading && <section className="panel"><p>Loading dashboard snapshot...</p></section>}
                <section className="grid">
                  {cards.map((card) => (
                    <article key={card.label} className={`card card-${card.tone}`}>
                      <div className="card-head">
                        <card.icon size={20} />
                        <span>{card.label}</span>
                      </div>
                      <p className="value">{card.value}</p>
                    </article>
                  ))}
                </section>
              </>
            )}

            {section === "shareholders" && (
              <section className="panel">
                <h2>Shareholders</h2>
                <p className="paragraph">Total loaded: {shareholders.data?.length ?? 0}</p>
                {isSuperAdmin && (
                  <div className="panel subpanel">
                    <h3>Influential Classification</h3>
                    <label className="remember-row">
                      <input
                        type="checkbox"
                        checked={autoClassificationEnabled}
                        onChange={(e) => setAutoClassificationEnabled(e.target.checked)}
                      />
                      <span>Enable automatic influential classification by share threshold</span>
                    </label>
                    <div className="inline-form">
                      <input
                        value={influentialThreshold}
                        onChange={(e) => setInfluentialThreshold(e.target.value)}
                        className="input"
                        placeholder="Share threshold"
                        disabled={!autoClassificationEnabled}
                      />
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => saveInfluentialConfigMutation.mutate()}
                        disabled={saveInfluentialConfigMutation.isPending}
                      >
                        Save Classification Settings
                      </button>
                    </div>
                  </div>
                )}
                <div className="inline-form">
                  <input
                    value={shareholderName}
                    onChange={(e) => setShareholderName(e.target.value)}
                    className="input"
                    placeholder="Full name"
                  />
                  <input
                    value={shareholderShares}
                    onChange={(e) => setShareholderShares(e.target.value)}
                    className="input"
                    placeholder="Shares"
                  />
                  <label className="remember-row">
                    <input
                      type="checkbox"
                      checked={manualInfluentialFlag}
                      onChange={(e) => setManualInfluentialFlag(e.target.checked)}
                      disabled={autoClassificationEnabled}
                    />
                    <span>Mark as Influential Shareholder</span>
                  </label>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => createShareholderMutation.mutate()}
                    disabled={!shareholderName || createShareholderMutation.isPending || !isSuperAdmin}
                  >
                    Add Shareholder
                  </button>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Shares</th>
                        <th>Classification</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {shareholders.data?.map((s) => (
                        <tr key={s.id}>
                          <td>{s.id}</td>
                          <td>{s.fullNameEn}</td>
                          <td>{s.shares}</td>
                          <td>{s.isHighPower ? "Influential" : "Non-influential"}</td>
                          <td>
                            <button
                              type="button"
                              className="text-btn"
                              onClick={() => {
                                setEditingShareholderId(s.id);
                                setEditingShareholderName(s.fullNameEn);
                                setEditingShareholderShares(String(s.shares));
                                setEditingInfluentialFlag(s.isHighPower);
                              }}
                              disabled={!isSuperAdmin}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-btn danger"
                              onClick={() => deleteShareholderMutation.mutate(s.id)}
                              disabled={!isSuperAdmin}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {editingShareholderId && (
                  <div className="inline-form">
                    <input
                      value={editingShareholderName}
                      onChange={(e) => setEditingShareholderName(e.target.value)}
                      className="input"
                      placeholder="Edit full name"
                    />
                    <input
                      value={editingShareholderShares}
                      onChange={(e) => setEditingShareholderShares(e.target.value)}
                      className="input"
                      placeholder="Edit shares"
                    />
                    <label className="remember-row">
                      <input
                        type="checkbox"
                        checked={editingInfluentialFlag}
                        onChange={(e) => setEditingInfluentialFlag(e.target.checked)}
                        disabled={autoClassificationEnabled}
                      />
                      <span>Influential Shareholder</span>
                    </label>
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() => updateShareholderMutation.mutate()}
                      disabled={updateShareholderMutation.isPending || !isSuperAdmin}
                    >
                      Save Edit
                    </button>
                  </div>
                )}
              </section>
            )}

            {section === "attendance" && (
              <section className="panel">
                <h2>Pending Attendance Approvals</h2>
                <p className="paragraph">Queue size: {attendancePending.data?.length ?? 0}</p>
                <div className="inline-form">
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => downloadReport(token!, "/reports/attendance?format=csv", "attendance-report.csv")}
                  >
                    Export Attendance CSV
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => downloadReport(token!, "/reports/attendance?format=xlsx", "attendance-report.xlsx")}
                  >
                    Export Attendance Excel
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => downloadReport(token!, "/reports/attendance?format=pdf", "attendance-report.pdf")}
                  >
                    Export Attendance PDF
                  </button>
                </div>
                <div className="inline-form">
                  <select className="input" value={selectedShareholder} onChange={(e) => setSelectedShareholder(e.target.value)}>
                    <option value="">Select shareholder</option>
                    {shareholders.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullNameEn}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => markAttendanceMutation.mutate()}
                    disabled={!selectedShareholder || markAttendanceMutation.isPending || !canMarkAttendance}
                  >
                    Mark Attendance
                  </button>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Shareholder</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendancePending.data?.map((a) => (
                        <tr key={a.id}>
                          <td>{a.id.slice(0, 8)}</td>
                          <td>{a.shareholder_id}</td>
                          <td>{a.status}</td>
                          <td className="actions">
                            <button
                              type="button"
                              className="text-btn"
                              onClick={() => approveAttendanceMutation.mutate({ id: a.id, approve: true })}
                              disabled={!canApproveAttendance}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="text-btn danger"
                              onClick={() => approveAttendanceMutation.mutate({ id: a.id, approve: false })}
                              disabled={!canApproveAttendance}
                            >
                              Reject
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="inline-form">
                  <select className="input" value={selectedAttendance} onChange={(e) => setSelectedAttendance(e.target.value)}>
                    <option value="">Select attendance to reverse</option>
                    {attendanceAll.data?.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.id.slice(0, 8)} - {a.status}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="action-btn danger-bg"
                    onClick={() => reverseAttendanceMutation.mutate()}
                    disabled={!selectedAttendance || reverseAttendanceMutation.isPending || !isSuperAdmin}
                  >
                    Reverse Attendance
                  </button>
                </div>
              </section>
            )}

            {section === "votes" && (
              <section className="panel">
                <h2>Pending Vote Approvals</h2>
                <p className="paragraph">Queue size: {votesPending.data?.length ?? 0}</p>
                <div className="inline-form">
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => downloadReport(token!, "/reports/votes?format=csv", "voting-report.csv")}
                  >
                    Export Voting CSV
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => downloadReport(token!, "/reports/votes?format=xlsx", "voting-report.xlsx")}
                  >
                    Export Voting Excel
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => downloadReport(token!, "/reports/votes?format=pdf", "voting-report.pdf")}
                  >
                    Export Voting PDF
                  </button>
                </div>
                <div className="inline-form">
                  <select className="input" value={selectedShareholder} onChange={(e) => setSelectedShareholder(e.target.value)}>
                    <option value="">Select shareholder</option>
                    {shareholders.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullNameEn}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => encodeVoteMutation.mutate()}
                    disabled={!selectedShareholder || encodeVoteMutation.isPending || !canEncodeVote}
                  >
                    Encode Vote
                  </button>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Shareholder</th>
                        <th>Candidate</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {votesPending.data?.map((v) => (
                        <tr key={v.id}>
                          <td>{v.id.slice(0, 8)}</td>
                          <td>{v.shareholder_id}</td>
                          <td>{v.candidate_id}</td>
                          <td className="actions">
                            <button
                              type="button"
                              className="text-btn"
                              onClick={() => approveVoteMutation.mutate({ id: v.id, approve: true })}
                              disabled={!canApproveVote}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="text-btn danger"
                              onClick={() => approveVoteMutation.mutate({ id: v.id, approve: false })}
                              disabled={!canApproveVote}
                            >
                              Reject
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="inline-form">
                  <select className="input" value={selectedVote} onChange={(e) => setSelectedVote(e.target.value)}>
                    <option value="">Select vote to reverse</option>
                    {votesAll.data?.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.id.slice(0, 8)} - {v.status}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="action-btn danger-bg"
                    onClick={() => reverseVoteMutation.mutate()}
                    disabled={!selectedVote || reverseVoteMutation.isPending || !isSuperAdmin}
                  >
                    Reverse Vote
                  </button>
                </div>
              </section>
            )}

            {section === "audit" && (
              <section className="panel">
                <h2>Latest Audit Events</h2>
                <p className="paragraph">Recent entries: {auditLogs.data?.length ?? 0}</p>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Module</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.data?.map((log) => (
                        <tr key={log.id}>
                          <td>{new Date(log.timestamp).toLocaleString()}</td>
                          <td>{log.module}</td>
                          <td>{log.action_type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default App;
