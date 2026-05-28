import type { DashboardSnapshot, Role } from "@shmmf/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  App as AntdApp,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfigProvider,
  Descriptions,
  Dropdown,
  Form,
  Input,
  Layout,
  Menu,
  Modal,
  Progress,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
  theme as antdTheme,
} from "antd";
import type { UploadProps } from "antd";
import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
import {
  IconCheckupList,
  IconCalendarEvent,
  IconCloudUpload,
  IconClockCheck,
  IconDatabaseImport,
  IconDownload,
  IconEdit,
  IconBell,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconFileSpreadsheet,
  IconFileTypeCsv,
  IconFileTypePdf,
  IconLanguage,
  IconLayoutDashboard,
  IconLayoutGrid,
  IconLogout,
  IconMoon,
  IconPodium,
  IconReceipt2,
  IconShieldCheck,
  IconSettings,
  IconSun,
  IconTrophy,
  IconTrash,
  IconUserPlus,
  IconUserStar,
  IconUsers,
} from "@tabler/icons-react";
import * as XLSX from "xlsx";

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;

const API_BASE = "http://localhost:4000/api/v1";
const STORAGE_KEY = "shmmf_auth_session";
const THEME_KEY = "shmmf_theme";
const LANGUAGE_KEY = "shmmf_language";

type ThemeMode = "light" | "dark";
type Language = "en" | "am";
type Section = "dashboard" | "shareholders" | "candidates" | "agendas" | "attendance" | "votes" | "audit" | "settings";

const i18n: Record<string, { en: string; am: string }> = {
  Dashboard: { en: "Dashboard", am: "ዳሽቦርድ" },
  Shareholders: { en: "Shareholders", am: "ባለአክሲዮኖች" },
  Candidates: { en: "Candidates", am: "እጩዎች" },
  Attendance: { en: "Attendance", am: "መገኘት" },
  Votes: { en: "Votes", am: "ድምጾች" },
  "Audit Logs": { en: "Audit Logs", am: "ኦዲት መዝገቦች" },
  Settings: { en: "Settings", am: "ቅንብሮች" },
  Login: { en: "Login", am: "ግባ" },
  "Welcome back": { en: "Welcome back", am: "እንኳን ደህና መጡ" },
  Username: { en: "Username", am: "የተጠቃሚ ስም" },
  Password: { en: "Password", am: "የይለፍ ቃል" },
  "Remember me": { en: "Remember me", am: "አስታውሰኝ" },
  "Register Candidate": { en: "Register Candidate", am: "እጩ መዝግብ" },
  "Save Settings": { en: "Save Settings", am: "ቅንብሮችን አስቀምጥ" },
  "Reset AGM Session Data": { en: "Reset AGM Session Data", am: "የAGM ክፍለ-ጊዜ መረጃ አጥፋ" },
  "Mark Attendance": { en: "Mark Attendance", am: "መገኘት መዝግብ" },
  Approve: { en: "Approve", am: "አፅድቅ" },
  Reject: { en: "Reject", am: "አትቀበል" },
  "Reverse Attendance": { en: "Reverse Attendance", am: "መገኘት ቀይር" },
  "Encode Vote": { en: "Encode Vote", am: "ድምጽ መዝግብ" },
  "Reverse Vote": { en: "Reverse Vote", am: "ድምጽ ቀይር" },
  "Latest Audit Events": { en: "Latest Audit Events", am: "የቅርብ ኦዲት ክስተቶች" },
  Time: { en: "Time", am: "ጊዜ" },
  Actor: { en: "Actor", am: "ፈጻሚ" },
  Module: { en: "Module", am: "ሞጁል" },
  Action: { en: "Action", am: "እርምጃ" },
  Maker: { en: "Maker", am: "ፈጻሚ (Maker)" },
  Checker: { en: "Checker", am: "ፈታሽ (Checker)" },
  "Total Number of Shareholders": { en: "Total Number of Shareholders", am: "ጠቅላላ የባለአክሲዮኖች ብዛት" },
  "Total Shares": { en: "Total Shares", am: "ጠቅላላ ሼሮች" },
  "Number of Influential Shareholders": { en: "Number of Influential Shareholders", am: "ተፅዕኖ ያላቸው ባለአክሲዮኖች ብዛት" },
  "Number of Non-Influential Shareholders": { en: "Number of Non-Influential Shareholders", am: "ተፅዕኖ የሌላቸው ባለአክሲዮኖች ብዛት" },
  "Votes by Candidate (Weighted by Shares)": { en: "Votes by Candidate (Weighted by Shares)", am: "በእጩ የተመዘነ ድምጽ (በሼር መሰረት)" },
  "Quorum Progress": { en: "Quorum Progress", am: "የኮረም ሂደት" },
  "Add Shareholder": { en: "Add Shareholder", am: "ባለአክሲዮን ጨምር" },
  "Download Template": { en: "Download Template", am: "ቴምፕሌት አውርድ" },
  "Upload Template": { en: "Upload Template", am: "ቴምፕሌት አስገባ" },
  "Import Rows": { en: "Import Rows", am: "ረድፎችን አስመጣ" },
  Edit: { en: "Edit", am: "አርትዕ" },
  Delete: { en: "Delete", am: "ሰርዝ" },
  Remove: { en: "Remove", am: "አስወግድ" },
  "Pending Attendance Approvals": { en: "Pending Attendance Approvals", am: "በመጠባበቅ ላይ ያሉ የመገኘት ፍቃዶች" },
  "Pending Vote Approvals": { en: "Pending Vote Approvals", am: "በመጠባበቅ ላይ ያሉ የድምጽ ፍቃዶች" },
  "Select shareholder": { en: "Select shareholder", am: "ባለአክሲዮን ይምረጡ" },
  "Select candidate": { en: "Select candidate", am: "እጩ ይምረጡ" },
  "Cast Nomination Vote": { en: "Cast Nomination Vote", am: "የእጩ ድምጽ ይስጡ" },
  "Nomination Results Dashboard": { en: "Nomination Results Dashboard", am: "የእጩ ውጤት ዳሽቦርድ" },
  "Promote to Candidate": { en: "Promote to Candidate", am: "ወደ እጩ አሻሽል" },
  "Maker-Checker Controls": { en: "Maker-Checker Controls", am: "የMaker-Checker መቆጣጠሪያዎች" },
  "AGM Session Maintenance": { en: "AGM Session Maintenance", am: "የAGM ክፍለ-ጊዜ ጥገና" },
  "Reset Session": { en: "Reset Session", am: "ክፍለ-ጊዜን አድስ" },
  "Live Session": { en: "Live Session", am: "ቀጥታ ክፍለ-ጊዜ" },
  "Export CSV": { en: "Export CSV", am: "CSV አውጣ" },
  "Export Excel": { en: "Export Excel", am: "Excel አውጣ" },
  "Export PDF": { en: "Export PDF", am: "PDF አውጣ" },
  Position: { en: "Position", am: "የስራ መደብ" },
  "Login failed. Check credentials.": { en: "Login failed. Check credentials.", am: "መግቢያ አልተሳካም። መረጃዎን ያረጋግጡ።" },
  "Shareholder added.": { en: "Shareholder added.", am: "ባለአክሲዮኑ ተጨምሯል።" },
  "Shareholder updated.": { en: "Shareholder updated.", am: "ባለአክሲዮኑ ተሻሽሏል።" },
  "Shareholder removed.": { en: "Shareholder removed.", am: "ባለአክሲዮኑ ተወግዷል።" },
  "Bulk shareholders imported.": { en: "Bulk shareholders imported.", am: "ብዙ ባለአክሲዮኖች በተሳካ ሁኔታ ገብተዋል።" },
  "Candidate registered.": { en: "Candidate registered.", am: "እጩው ተመዝግቧል።" },
  "Could not register candidate.": { en: "Could not register candidate.", am: "እጩ መመዝገብ አልተቻለም።" },
  "Candidate removed.": { en: "Candidate removed.", am: "እጩው ተወግዷል።" },
  "Nomination vote recorded.": { en: "Nomination vote recorded.", am: "የእጩ ድምጽ ተመዝግቧል።" },
  "Could not record nomination vote.": { en: "Could not record nomination vote.", am: "የእጩ ድምጽ መመዝገብ አልተቻለም።" },
  "Nominee promoted to official candidate.": { en: "Nominee promoted to official candidate.", am: "ተመራጩ ወደ ኦፊሴላዊ እጩ ተሻሽሏል።" },
  "Could not promote nominee.": { en: "Could not promote nominee.", am: "ተመራጩን ማሻሻል አልተቻለም።" },
  "Settings saved.": { en: "Settings saved.", am: "ቅንብሮች ተቀምጠዋል።" },
  "AGM session data cleared.": { en: "AGM session data cleared.", am: "የAGM ክፍለ-ጊዜ መረጃ ተሰርዟል።" },
  "Could not clear AGM session data.": { en: "Could not clear AGM session data.", am: "የAGM መረጃ ማጥፋት አልተቻለም።" },
  "Attendance marked.": { en: "Attendance marked.", am: "መገኘት ተመዝግቧል።" },
  "No valid rows found in uploaded file.": { en: "No valid rows found in uploaded file.", am: "በተጫነው ፋይል ውስጥ ትክክለኛ ረድፎች አልተገኙም።" },
  "Failed to parse spreadsheet.": { en: "Failed to parse spreadsheet.", am: "የSpreadsheet ፋይሉን ማንበብ አልተቻለም።" },
  "Welcome to SHMMF": { en: "Welcome to SHMMF", am: "ወደ SHMMF እንኳን ደህና መጡ" },
  "A polished AGM operations suite for compliant workflows and approvals.": {
    en: "A polished AGM operations suite for compliant workflows and approvals.",
    am: "ለተግባራዊ ሂደቶች እና ማፅደቂያዎች የተሻለ የAGM ኦፕሬሽን መድረክ።",
  },
  "Quorum +8.2%": { en: "Quorum +8.2%", am: "ኮረም +8.2%" },
  "Votes 12.4k": { en: "Votes 12.4k", am: "ድምጾች 12.4k" },
};

interface LoginResponse {
  token: string;
  role: Role;
  username?: string;
}
interface ConfigResponse {
  attendanceMakerCheckerEnabled: boolean;
  votingMakerCheckerEnabled: boolean;
  influentialAutoClassificationEnabled: boolean;
  influentialShareThreshold: number;
}
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
}
interface VoteRow {
  id: string;
  shareholder_id: string;
  candidate_id: string;
  shares_used: number;
  status: string;
  timestamp: string;
}
interface CandidateRow {
  id: string;
  shareholder_id: string | null;
  name: string;
  position: string;
}
interface CandidateNominationResultRow {
  nomineeShareholderId: string;
  nomineeName: string;
  totalShares: number;
  voteCount: number;
}
interface AgendaRow {
  id: string;
  title: string;
  details: string | null;
  agenda_date: string;
  sort_order: number;
  is_active: number;
  created_at: string;
}
interface ConfirmDialogState {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm?: () => void;
}
interface AuditRow {
  id: string;
  user_id: string | null;
  actor_username: string | null;
  action_type: string;
  module: string;
  previous_value: unknown;
  new_value: unknown;
  timestamp: string;
}
interface BulkRowInput {
  fullNameEn: string;
  shares: number;
  isHighPower?: boolean;
  fullNameAm?: string;
  contactInfo?: string;
}

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
  const res = await fetch(`${API_BASE}/config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Unable to fetch configuration");
  return (await res.json()) as ConfigResponse;
}
async function postAuthorized(token: string, path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
async function downloadFile(token: string, path: string, fileName: string): Promise<void> {
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
  const { message } = AntdApp.useApp();

  const [section, setSection] = useState<Section>("dashboard");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin1234");
  const [rememberMe, setRememberMe] = useState(true);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => (localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"));
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem(LANGUAGE_KEY) === "am" ? "am" : "en"));
  const [session, setSession] = useState<LoginResponse | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LoginResponse;
    } catch {
      return null;
    }
  });

  const [shareholderName, setShareholderName] = useState("");
  const [shareholderShares, setShareholderShares] = useState("100");
  const [manualInfluentialFlag, setManualInfluentialFlag] = useState(false);
  const [editingShareholderId, setEditingShareholderId] = useState("");
  const [editingShareholderName, setEditingShareholderName] = useState("");
  const [editingShareholderShares, setEditingShareholderShares] = useState("100");
  const [editingInfluentialFlag, setEditingInfluentialFlag] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCandidateModal, setShowCandidateModal] = useState(false);
  const [selectedShareholder, setSelectedShareholder] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [selectedAttendance, setSelectedAttendance] = useState("");
  const [selectedVote, setSelectedVote] = useState("");
  const [candidateShareholderId, setCandidateShareholderId] = useState("");
  const [candidatePosition, setCandidatePosition] = useState("Board Member");
  const [nominationVoterShareholderId, setNominationVoterShareholderId] = useState("");
  const [nominationNomineeShareholderId, setNominationNomineeShareholderId] = useState("");
  const [promoteNomineeShareholderId, setPromoteNomineeShareholderId] = useState("");
  const [promoteCandidatePosition, setPromoteCandidatePosition] = useState("Board Member");
  const [attendanceMakerCheckerEnabled, setAttendanceMakerCheckerEnabled] = useState<boolean | null>(null);
  const [votingMakerCheckerEnabled, setVotingMakerCheckerEnabled] = useState<boolean | null>(null);
  const [autoClassificationEnabled, setAutoClassificationEnabled] = useState<boolean | null>(null);
  const [influentialThreshold, setInfluentialThreshold] = useState("");
  const [bulkRowsPreview, setBulkRowsPreview] = useState<BulkRowInput[]>([]);
  const [showAgendaModal, setShowAgendaModal] = useState(false);
  const [editingAgendaId, setEditingAgendaId] = useState("");
  const [agendaTitleInput, setAgendaTitleInput] = useState("");
  const [agendaDetailsInput, setAgendaDetailsInput] = useState("");
  const [agendaDateInput, setAgendaDateInput] = useState(new Date().toISOString().slice(0, 10));
  const [agendaSortOrderInput, setAgendaSortOrderInput] = useState("0");
  const [agendaActiveInput, setAgendaActiveInput] = useState(false);
  const [showAgendaFullscreen, setShowAgendaFullscreen] = useState(false);
  const [showResetSessionModal, setShowResetSessionModal] = useState(false);
  const [resetClearCandidates, setResetClearCandidates] = useState(false);
  const [resetClearAuditLogs, setResetClearAuditLogs] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    title: "",
    description: "",
  });

  const token = session?.token;
  const role = session?.role;
  const activeUsername = session?.username || username || role || "User";

  const isSuperAdmin = role === "SUPER_ADMIN";
  const canMarkAttendance = role === "SUPER_ADMIN" || role === "ATTENDANCE_MAKER";
  const canApproveAttendance = role === "SUPER_ADMIN" || role === "ATTENDANCE_CHECKER";
  const canEncodeVote = role === "SUPER_ADMIN" || role === "VOTE_ENCODER";
  const canApproveVote = role === "SUPER_ADMIN" || role === "VOTE_CHECKER";
  const canViewAudit = role === "SUPER_ADMIN";
  const t = (text: string): string => (i18n[text] ? i18n[text][language] : text);

  const loginMutation = useMutation({
    mutationFn: ({ user, pass }: { user: string; pass: string }) => login(user, pass),
    onSuccess: (data) => {
      const nextSession = { ...data, username };
      setSession(nextSession);
      if (rememberMe) localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
      else localStorage.removeItem(STORAGE_KEY);
    },
    onError: () => message.error(t("Login failed. Check credentials.")),
  });

  const dashboard = useQuery({
    queryKey: ["dashboard", token],
    queryFn: () => getDashboard(token!),
    enabled: Boolean(token),
    refetchInterval: 5000,
  });
  const shareholders = useQuery({
    queryKey: ["shareholders", token],
    queryFn: () => fetchList<ShareholderRow>(token!, "/shareholders"),
    enabled: Boolean(token),
  });
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
  const candidates = useQuery({
    queryKey: ["candidates", token],
    queryFn: () => fetchList<CandidateRow>(token!, "/candidates"),
    enabled: Boolean(token),
  });
  const candidateNominationResults = useQuery({
    queryKey: ["candidate-nominations-results", token],
    queryFn: () => fetchList<CandidateNominationResultRow>(token!, "/candidate-nominations/results"),
    enabled: Boolean(token),
  });
  const candidateNominationEligibleVoters = useQuery({
    queryKey: ["candidate-nominations-eligible-voters", token],
    queryFn: () => fetchList<ShareholderRow>(token!, "/candidate-nominations/eligible-voters"),
    enabled: Boolean(token),
  });
  const agendas = useQuery({
    queryKey: ["agendas", token],
    queryFn: () => fetchList<AgendaRow>(token!, "/agendas"),
    enabled: Boolean(token),
  });
  const auditLogs = useQuery({
    queryKey: ["audit", token],
    queryFn: () => fetchList<AuditRow>(token!, "/audit-logs"),
    enabled: Boolean(token && canViewAudit),
  });
  const config = useQuery({
    queryKey: ["config", token],
    queryFn: () => fetchConfig(token!),
    enabled: Boolean(token && isSuperAdmin),
  });

  const resolvedAutoClassificationEnabled = autoClassificationEnabled ?? config.data?.influentialAutoClassificationEnabled ?? false;
  const resolvedInfluentialThreshold = influentialThreshold || String(config.data?.influentialShareThreshold ?? 100000);
  const resolvedAttendanceMakerCheckerEnabled =
    attendanceMakerCheckerEnabled ?? config.data?.attendanceMakerCheckerEnabled ?? true;
  const resolvedVotingMakerCheckerEnabled = votingMakerCheckerEnabled ?? config.data?.votingMakerCheckerEnabled ?? true;

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboard", token] });
    queryClient.invalidateQueries({ queryKey: ["shareholders", token] });
    queryClient.invalidateQueries({ queryKey: ["attendance-pending", token] });
    queryClient.invalidateQueries({ queryKey: ["attendance-all", token] });
    queryClient.invalidateQueries({ queryKey: ["votes-pending", token] });
    queryClient.invalidateQueries({ queryKey: ["votes-all", token] });
    queryClient.invalidateQueries({ queryKey: ["candidates", token] });
    queryClient.invalidateQueries({ queryKey: ["candidate-nominations-results", token] });
    queryClient.invalidateQueries({ queryKey: ["candidate-nominations-eligible-voters", token] });
    queryClient.invalidateQueries({ queryKey: ["agendas", token] });
    queryClient.invalidateQueries({ queryKey: ["audit", token] });
    queryClient.invalidateQueries({ queryKey: ["config", token] });
  }, [queryClient, token]);

  const createShareholderMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/shareholders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fullNameEn: shareholderName,
          shares: Number(shareholderShares),
          isHighPower: manualInfluentialFlag,
        }),
      });
      if (!res.ok) throw new Error("Unable to create");
    },
    onSuccess: () => {
      setShowCreateModal(false);
      setShareholderName("");
      setShareholderShares("100");
      setManualInfluentialFlag(false);
      refreshAll();
      message.success(t("Shareholder added."));
    },
  });
  const updateShareholderMutation = useMutation({
    mutationFn: async () => {
      const current = shareholders.data?.find((s) => s.id === editingShareholderId);
      if (!current) throw new Error("Shareholder not found");
      const res = await fetch(`${API_BASE}/shareholders/${editingShareholderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fullNameEn: editingShareholderName,
          shares: Number(editingShareholderShares),
          isHighPower: editingInfluentialFlag,
          contactInfo: current.id,
        }),
      });
      if (!res.ok) throw new Error("Unable to update shareholder");
    },
    onSuccess: () => {
      setShowEditModal(false);
      setEditingShareholderId("");
      refreshAll();
      message.success(t("Shareholder updated."));
    },
  });
  const deleteShareholderMutation = useMutation({
    mutationFn: (id: string) => deleteAuthorized(token!, `/shareholders/${id}`),
    onSuccess: () => {
      refreshAll();
      message.success(t("Shareholder removed."));
    },
  });
  const bulkCreateShareholdersMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/shareholders/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: bulkRowsPreview }),
      });
      if (!res.ok) throw new Error("Unable to import shareholder list");
    },
    onSuccess: () => {
      setBulkRowsPreview([]);
      refreshAll();
      message.success(t("Bulk shareholders imported."));
    },
  });
  const createCandidateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ shareholderId: candidateShareholderId, position: candidatePosition }),
      });
      if (!res.ok) throw new Error("Unable to register candidate");
    },
    onSuccess: () => {
      setShowCandidateModal(false);
      setCandidateShareholderId("");
      setCandidatePosition("Board Member");
      refreshAll();
      message.success(t("Candidate registered."));
    },
    onError: () => message.error(t("Could not register candidate.")),
  });
  const deleteCandidateMutation = useMutation({
    mutationFn: (id: string) => deleteAuthorized(token!, `/candidates/${id}`),
    onSuccess: () => {
      refreshAll();
      message.success(t("Candidate removed."));
    },
  });
  const castCandidateNominationVoteMutation = useMutation({
    mutationFn: async () => {
      await postAuthorized(token!, "/candidate-nominations/vote", {
        voterShareholderId: nominationVoterShareholderId,
        nomineeShareholderId: nominationNomineeShareholderId,
      });
    },
    onSuccess: () => {
      setNominationVoterShareholderId("");
      setNominationNomineeShareholderId("");
      refreshAll();
      message.success(t("Nomination vote recorded."));
    },
    onError: () => {
      message.error(t("Could not record nomination vote."));
    },
  });
  const promoteNomineeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/candidate-nominations/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nomineeShareholderId: promoteNomineeShareholderId, position: promoteCandidatePosition }),
      });
      if (!res.ok) throw new Error("Unable to promote nominee");
    },
    onSuccess: () => {
      setPromoteNomineeShareholderId("");
      setPromoteCandidatePosition("Board Member");
      refreshAll();
      message.success(t("Nominee promoted to official candidate."));
    },
    onError: () => {
      message.error(t("Could not promote nominee."));
    },
  });
  const createAgendaMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/agendas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: agendaTitleInput,
          details: agendaDetailsInput || undefined,
          agendaDate: agendaDateInput,
          sortOrder: Number(agendaSortOrderInput || 0),
          isActive: agendaActiveInput,
        }),
      });
      if (!res.ok) throw new Error("Unable to create agenda");
    },
    onSuccess: () => {
      setShowAgendaModal(false);
      setEditingAgendaId("");
      setAgendaTitleInput("");
      setAgendaDetailsInput("");
      setAgendaDateInput(new Date().toISOString().slice(0, 10));
      setAgendaSortOrderInput("0");
      setAgendaActiveInput(false);
      refreshAll();
      message.success("Agenda created.");
    },
    onError: () => message.error("Could not create agenda."),
  });
  const updateAgendaMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/agendas/${editingAgendaId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: agendaTitleInput,
          details: agendaDetailsInput || undefined,
          agendaDate: agendaDateInput,
          sortOrder: Number(agendaSortOrderInput || 0),
          isActive: agendaActiveInput,
        }),
      });
      if (!res.ok) throw new Error("Unable to update agenda");
    },
    onSuccess: () => {
      setShowAgendaModal(false);
      setEditingAgendaId("");
      setAgendaTitleInput("");
      setAgendaDetailsInput("");
      setAgendaDateInput(new Date().toISOString().slice(0, 10));
      setAgendaSortOrderInput("0");
      setAgendaActiveInput(false);
      refreshAll();
      message.success("Agenda updated.");
    },
    onError: () => message.error("Could not update agenda."),
  });
  const deleteAgendaMutation = useMutation({
    mutationFn: (id: string) => deleteAuthorized(token!, `/agendas/${id}`),
    onSuccess: () => {
      refreshAll();
      message.success("Agenda deleted.");
    },
  });
  const activateAgendaMutation = useMutation({
    mutationFn: (id: string) => postAuthorized(token!, `/agendas/${id}/activate`, {}),
    onSuccess: () => {
      refreshAll();
      message.success("Agenda activated.");
    },
  });
  const saveAdminConfigMutation = useMutation({
    mutationFn: async () => {
      await fetch(`${API_BASE}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          attendanceMakerCheckerEnabled: resolvedAttendanceMakerCheckerEnabled,
          votingMakerCheckerEnabled: resolvedVotingMakerCheckerEnabled,
          influentialAutoClassificationEnabled: resolvedAutoClassificationEnabled,
          influentialShareThreshold: Number(resolvedInfluentialThreshold),
          applyInfluentialClassificationNow: true,
        }),
      });
    },
    onSuccess: () => {
      refreshAll();
      message.success(t("Settings saved."));
    },
  });
  const resetSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/admin/session/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clearCandidates: resetClearCandidates,
          clearAuditLogs: resetClearAuditLogs,
        }),
      });
      if (!res.ok) {
        throw new Error("Unable to reset AGM session");
      }
    },
    onSuccess: () => {
      setShowResetSessionModal(false);
      setResetClearCandidates(false);
      setResetClearAuditLogs(false);
      refreshAll();
      message.success(t("AGM session data cleared."));
    },
    onError: () => message.error(t("Could not clear AGM session data.")),
  });
  const markAttendanceMutation = useMutation({
    mutationFn: () => postAuthorized(token!, "/attendance/mark", { shareholderId: selectedShareholder }),
    onSuccess: () => {
      refreshAll();
      message.success(t("Attendance marked."));
    },
  });
  const approveAttendanceMutation = useMutation({
    mutationFn: (payload: { id: string; approve: boolean }) =>
      postAuthorized(token!, "/attendance/approve", { attendanceId: payload.id, approve: payload.approve }),
    onSuccess: refreshAll,
  });
  const reverseAttendanceMutation = useMutation({
    mutationFn: () => postAuthorized(token!, "/attendance/reverse", { attendanceId: selectedAttendance, reason: "Admin correction" }),
    onSuccess: () => {
      setSelectedAttendance("");
      refreshAll();
    },
  });
  const encodeVoteMutation = useMutation({
    mutationFn: () =>
      postAuthorized(token!, "/votes/encode", { shareholderId: selectedShareholder, candidateId: selectedCandidate }),
    onSuccess: refreshAll,
  });
  const approveVoteMutation = useMutation({
    mutationFn: (payload: { id: string; approve: boolean }) =>
      postAuthorized(token!, "/votes/approve", { voteId: payload.id, approve: payload.approve }),
    onSuccess: refreshAll,
  });
  const reverseVoteMutation = useMutation({
    mutationFn: () => postAuthorized(token!, "/votes/reverse", { voteId: selectedVote, reason: "Admin correction" }),
    onSuccess: () => {
      setSelectedVote("");
      refreshAll();
    },
  });

  useEffect(() => {
    localStorage.setItem(THEME_KEY, themeMode);
  }, [themeMode]);
  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);
  useEffect(() => {
    if (!token) return;
    const socket = io("http://localhost:4000");
    socket.on("dashboard:refresh", refreshAll);
    return () => {
      socket.disconnect();
    };
  }, [refreshAll, token]);

  const menuItems = [
    { key: "dashboard", label: t("Dashboard"), icon: <IconLayoutDashboard size={16} />, visible: true },
    { key: "shareholders", label: t("Shareholders"), icon: <IconUsers size={16} />, visible: isSuperAdmin },
    { key: "candidates", label: t("Candidates"), icon: <IconUserStar size={16} />, visible: isSuperAdmin },
    { key: "agendas", label: "Agendas", icon: <IconCalendarEvent size={16} />, visible: isSuperAdmin },
    {
      key: "attendance",
      label: t("Attendance"),
      icon: <IconClockCheck size={16} />,
      visible: canMarkAttendance || canApproveAttendance || isSuperAdmin,
    },
    { key: "votes", label: t("Votes"), icon: <IconCheckupList size={16} />, visible: canEncodeVote || canApproveVote || isSuperAdmin },
    { key: "audit", label: t("Audit Logs"), icon: <IconReceipt2 size={16} />, visible: canViewAudit },
    { key: "settings", label: t("Settings"), icon: <IconSettings size={16} />, visible: isSuperAdmin },
  ].filter((item) => item.visible);
  const activeSectionLabel = menuItems.find((item) => item.key === section)?.label ?? t("Dashboard");

  const parseBoolCell = (value: unknown): boolean | undefined => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1 ? true : value === 0 ? false : undefined;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes"].includes(normalized)) return true;
      if (["false", "0", "no"].includes(normalized)) return false;
    }
    return undefined;
  };
  const uploadProps: UploadProps = {
    accept: ".xlsx,.xls",
    maxCount: 1,
    beforeUpload: async (file) => {
      try {
        const bytes = await file.arrayBuffer();
        const workbook = XLSX.read(bytes, { type: "array" });
        const first = workbook.SheetNames[0];
        if (!first) throw new Error("No sheet found");
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[first], { defval: "" });
        const parsed = raw
          .map((row) => ({
            fullNameEn: String(row.fullNameEn ?? "").trim(),
            shares: Number(row.shares),
            isHighPower: parseBoolCell(row.isHighPower),
            fullNameAm: String(row.fullNameAm ?? "").trim() || undefined,
            contactInfo: String(row.contactInfo ?? "").trim() || undefined,
          }))
          .filter((row) => row.fullNameEn.length > 0 && Number.isFinite(row.shares) && row.shares > 0);
        if (!parsed.length) {
          message.error(t("No valid rows found in uploaded file."));
          setBulkRowsPreview([]);
        } else {
          setBulkRowsPreview(parsed);
          message.success(`Prepared ${parsed.length} rows for import.`);
        }
      } catch {
        message.error(t("Failed to parse spreadsheet."));
      }
      return false;
    },
  };

  const dashboardCards = [
    {
      key: "shareholders-total",
      title: "Total Shareholders",
      value: `${dashboard.data?.shareholders.total ?? 0}`,
      meta: "All registered shareholders",
      icon: <IconUsers size={18} />,
      tone: "success",
    },
    {
      key: "shares-total",
      title: "Total Shares",
      value: `${dashboard.data?.shareholders.sharesTotal ?? 0}`,
      meta: "Combined ownership shares",
      icon: <IconDatabaseImport size={18} />,
      tone: "primary",
    },
    {
      key: "shareholders-influential",
      title: "Influential Shareholders",
      value: `${dashboard.data?.shareholders.highPower ?? 0}`,
      meta: "High shares",
      icon: <IconShieldCheck size={18} />,
      tone: "warning",
    },
    {
      key: "shareholders-non-influential",
      title: "Non-Influential Shareholders",
      value: `${dashboard.data?.shareholders.lowPower ?? 0}`,
      meta: "Low shares",
      icon: <IconCheckupList size={18} />,
      tone: "neutral",
    },
  ] as const;
  const attendedShareholderIds = new Set(
    (attendanceAll.data ?? [])
      .filter((row) => row.status === "APPROVED")
      .map((row) => row.shareholder_id)
  );
  const votedShareholderIds = new Set((votesAll.data ?? []).map((vote) => vote.shareholder_id));
  const eligibleVoters = (shareholders.data ?? []).filter(
    (shareholder) => attendedShareholderIds.has(shareholder.id) && !votedShareholderIds.has(shareholder.id)
  );
  const selectableCandidates = (candidates.data ?? []).filter(
    (candidate) => !selectedShareholder || candidate.shareholder_id !== selectedShareholder
  );
  const selectableNomineeShareholders = (shareholders.data ?? []).filter(
    (shareholder) => !nominationVoterShareholderId || shareholder.id !== nominationVoterShareholderId
  );
  const todayAgendaItems = (agendas.data ?? [])
    .filter((agenda) => agenda.agenda_date === new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.sort_order - b.sort_order);
  const handleVoteVoterChange = (nextVoterId: string) => {
    setSelectedShareholder(nextVoterId);
    const selectedCandidateEntry = (candidates.data ?? []).find((candidate) => candidate.id === selectedCandidate);
    if (selectedCandidateEntry?.shareholder_id === nextVoterId) {
      setSelectedCandidate("");
    }
  };
  const handleNominationVoterChange = (nextVoterId: string) => {
    setNominationVoterShareholderId(nextVoterId);
    if (nominationNomineeShareholderId === nextVoterId) {
      setNominationNomineeShareholderId("");
    }
  };
  const openConfirmDialog = (options: Omit<ConfirmDialogState, "open">) => {
    setConfirmDialog({ open: true, ...options });
  };
  const renderAgendaList = (expanded = false) => (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Tag color="purple">Active: {dashboard.data?.agenda.activeTitle ?? "-"}</Tag>
      <div className={expanded ? "vx-agenda-scroll" : undefined}>
        {todayAgendaItems.map((agenda) => (
          <div
            key={agenda.id}
            className={`vx-vote-row vx-agenda-item ${agenda.is_active === 1 ? "is-active" : ""}`}
          >
            <div className="vx-vote-label">
              <strong>{agenda.title}</strong>
              {agenda.is_active === 1 ? <Tag color="green">In Discussion</Tag> : <Tag>Pending</Tag>}
            </div>
            {agenda.details && <Text type="secondary">{agenda.details}</Text>}
          </div>
        ))}
      </div>
    </Space>
  );
  const closeConfirmDialog = () => {
    setConfirmDialog({ open: false, title: "", description: "", onConfirm: undefined });
  };

  if (!token) {
    return (
      <ConfigProvider
        theme={{
          algorithm: themeMode === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: { colorPrimary: "#7367f0", borderRadius: 8 },
        }}
      >
        <div className={`vx-login-page ${themeMode === "dark" ? "is-dark" : ""}`}>
          <Card className="vx-login-card" styles={{ body: { padding: 0 } }}>
            <div className="vx-login-grid">
              <div className="vx-login-cover">
                <Tag color="purple">SHMMF</Tag>
                <Title level={2} style={{ marginTop: 18 }}>{t("Welcome to SHMMF")}</Title>
                <Text type="secondary">{t("A polished AGM operations suite for compliant workflows and approvals.")}</Text>
                <div className="vx-cover-visual">
                  <div className="vx-orbit" />
                  <div className="vx-avatar-figure">SM</div>
                  <div className="vx-float-card vx-float-left">{t("Quorum +8.2%")}</div>
                  <div className="vx-float-card vx-float-right">{t("Votes 12.4k")}</div>
                </div>
              </div>
              <div className="vx-login-form-wrap">
                <Space className="vx-login-form-head">
                  <Title level={4} style={{ margin: 0 }}>{t("Welcome back")}</Title>
                  <Select
                    value={language}
                    style={{ width: 140 }}
                    onChange={(value) => setLanguage(value as Language)}
                    options={[
                      { value: "en", label: "English" },
                      { value: "am", label: "አማርኛ" },
                    ]}
                  />
                  <Switch
                    checkedChildren="Dark"
                    unCheckedChildren="Light"
                    checked={themeMode === "dark"}
                    onChange={(checked) => setThemeMode(checked ? "dark" : "light")}
                  />
                </Space>
                <Form layout="vertical" onFinish={() => loginMutation.mutate({ user: username, pass: password })}>
                  <Form.Item label={t("Username")} required>
                    <Input value={username} onChange={(e) => setUsername(e.target.value)} />
                  </Form.Item>
                  <Form.Item label={t("Password")} required>
                    <Input.Password value={password} onChange={(e) => setPassword(e.target.value)} />
                  </Form.Item>
                  <Form.Item label={t("Remember me")}>
                    <Switch checked={rememberMe} onChange={setRememberMe} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={loginMutation.isPending}>
                    {t("Login")}
                  </Button>
                </Form>
              </div>
            </div>
          </Card>
        </div>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: themeMode === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: { colorPrimary: "#7367f0", borderRadius: 8 },
      }}
    >
      <Layout className={`vx-app ${themeMode === "dark" ? "is-dark" : ""}`}>
        <Sider width={264} className="vx-sider">
          <div className="vx-brand">
            <Title level={5} style={{ color: "#fff", margin: 0 }}>SHMMF Console</Title>
            <Text className="vx-brand-role">Role: {role}</Text>
          </div>
          <Menu
            theme="dark"
            mode="inline"
            className="vx-menu"
            selectedKeys={[section]}
            items={menuItems.map((item) => ({ key: item.key, icon: item.icon, label: item.label }))}
            onClick={(e) => setSection(e.key as Section)}
          />
        </Sider>
        <Layout className="vx-main-layout">
          <Header className="vx-topbar">
            <div className="vx-header-left" />
            <Space className="vx-header-right" size={14}>
              <Select
                value={language}
                size="small"
                style={{ width: 130 }}
                prefix={<IconLanguage size={14} />}
                onChange={(value) => setLanguage(value as Language)}
                options={[
                  { value: "en", label: "English" },
                  { value: "am", label: "አማርኛ" },
                ]}
              />
              <Switch
                checked={themeMode === "dark"}
                onChange={(checked) => setThemeMode(checked ? "dark" : "light")}
                checkedChildren={<><IconMoon size={14} /> Dark</>}
                unCheckedChildren={<><IconSun size={14} /> Light</>}
              />
              <Button className="vx-icon-btn" type="text" icon={<IconLayoutGrid size={17} />} />
              <Badge dot>
                <Button className="vx-icon-btn" type="text" icon={<IconBell size={17} />} />
              </Badge>
              <Badge dot>
                <Dropdown
                  trigger={["click"]}
                  menu={{
                    items: [
                      {
                        key: "profile",
                        label: (
                          <div style={{ minWidth: 170 }}>
                            <div style={{ fontWeight: 600 }}>{activeUsername}</div>
                            <div style={{ opacity: 0.75, fontSize: 12 }}>{role}</div>
                          </div>
                        ),
                        disabled: true,
                      },
                      { type: "divider" },
                      {
                        key: "logout",
                        icon: <IconLogout size={15} />,
                        label: "Logout",
                        danger: true,
                      },
                    ],
                    onClick: ({ key }) => {
                      if (key === "logout") {
                        setSession(null);
                        localStorage.removeItem(STORAGE_KEY);
                      }
                    },
                  }}
                >
                  <Avatar style={{ backgroundColor: "#1677ff", cursor: "pointer" }}>{activeUsername.charAt(0).toUpperCase()}</Avatar>
                </Dropdown>
              </Badge>
              <div className="vx-user-meta">
                <Text strong>{activeUsername}</Text>
                <Text type="secondary" className="vx-user-role">{role}</Text>
              </div>
            </Space>
          </Header>
          <Content className="vx-content">
            <div className="vx-page-title">
              <Title level={4} style={{ margin: 0 }}>{activeSectionLabel}</Title>
              <Tag color="green">{t("Live Session")}</Tag>
            </div>
            {section === "dashboard" && (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <div className="vx-stats-grid">
                  {dashboardCards.map((item) => (
                    <Card key={item.key} className={`vx-card vx-kpi-card vx-kpi-${item.tone}`}>
                      <div className="vx-kpi-head">
                        <div>
                          <Text className="vx-kpi-title">{item.title}</Text>
                          <h3 className="vx-kpi-value">{item.value}</h3>
                        </div>
                        <span className="vx-kpi-icon">{item.icon}</span>
                      </div>
                      <div className="vx-kpi-footer">
                        <Text type="secondary">{item.meta}</Text>
                      </div>
                    </Card>
                  ))}
                </div>
                <div className="vx-dashboard-grid">
                  <Card title={t("Quorum Progress")} className="vx-card">
                    <div className="vx-quorum-wrap">
                      <Progress
                        type="circle"
                        percent={Number(dashboard.data?.attendance.quorumPercentage ?? 0)}
                        strokeColor="#7367f0"
                        trailColor="rgba(115, 103, 240, 0.14)"
                      />
                      <div>
                        <h3 style={{ margin: "0 0 6px" }}>{dashboard.data?.attendance.attendedShareholders ?? 0} attended</h3>
                        <Text type="secondary">
                          Out of {dashboard.data?.shareholders.total ?? 0} total shareholders.
                        </Text>
                      </div>
                    </div>
                  </Card>
                  <Card title={t("Votes by Candidate (Weighted by Shares)")} className="vx-card">
                    <div className="vx-vote-chart">
                      {(dashboard.data?.voting.byCandidate ?? []).map((row: DashboardSnapshot["voting"]["byCandidate"][number]) => {
                        const maxShares = Math.max(
                          ...(dashboard.data?.voting.byCandidate ?? []).map((candidate: DashboardSnapshot["voting"]["byCandidate"][number]) => candidate.totalShares),
                          1
                        );
                        const widthPercent = Math.max(6, Math.round((row.totalShares / maxShares) * 100));
                        return (
                          <div key={row.candidateId} className="vx-vote-row">
                            <div className="vx-vote-label">
                              <strong>{row.candidateName}</strong>
                              <span>{row.voteCount} votes</span>
                            </div>
                            <div className="vx-vote-bar-track">
                              <div className="vx-vote-bar-fill" style={{ width: `${widthPercent}%` }} />
                            </div>
                            <div className="vx-vote-value">{row.totalShares.toLocaleString()} shares</div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                  <Card
                    title="Today's Agenda"
                    className="vx-card vx-full-width-card"
                    extra={
                      <Button
                        icon={<IconArrowsMaximize size={15} />}
                        onClick={() => setShowAgendaFullscreen(true)}
                      >
                        Fullscreen
                      </Button>
                    }
                  >
                    {renderAgendaList()}
                  </Card>
                </div>
              </Space>
            )}

            {section === "shareholders" && (
              <Card title={t("Shareholders")} className="vx-card">
                <Space wrap style={{ marginBottom: 16 }}>
                  <Button type="primary" icon={<IconUserPlus size={16} />} onClick={() => setShowCreateModal(true)} disabled={!isSuperAdmin}>{t("Add Shareholder")}</Button>
                  <Button icon={<IconDownload size={16} />} onClick={() => downloadFile(token, "/shareholders/template?format=xlsx", "shareholders-template.xlsx")} disabled={!isSuperAdmin}>
                    Download Template
                  </Button>
                  <Upload {...uploadProps}>
                    <Button icon={<IconCloudUpload size={16} />} disabled={!isSuperAdmin}>{t("Upload Template")}</Button>
                  </Upload>
                  <Button
                    type="primary"
                    icon={<IconDatabaseImport size={16} />}
                    onClick={() => bulkCreateShareholdersMutation.mutate()}
                    loading={bulkCreateShareholdersMutation.isPending}
                    disabled={!isSuperAdmin || bulkRowsPreview.length === 0}
                  >
                    Import {bulkRowsPreview.length || ""} Rows
                  </Button>
                </Space>

                <Table
                  rowKey="id"
                  dataSource={shareholders.data ?? []}
                  pagination={{ pageSize: 8 }}
                  columns={[
                    { title: "ID", dataIndex: "id" },
                    { title: "Name", dataIndex: "fullNameEn" },
                    { title: "Shares", dataIndex: "shares" },
                    {
                      title: "Classification",
                      dataIndex: "isHighPower",
                      render: (value: boolean) => <Tag color={value ? "gold" : "default"}>{value ? "Influential" : "Standard"}</Tag>,
                    },
                    {
                      title: "Action",
                      render: (_, record: ShareholderRow) => (
                        <Space>
                          <Button
                            icon={<IconEdit size={15} />}
                            onClick={() => {
                              setEditingShareholderId(record.id);
                              setEditingShareholderName(record.fullNameEn);
                              setEditingShareholderShares(String(record.shares));
                              setEditingInfluentialFlag(record.isHighPower);
                              setShowEditModal(true);
                            }}
                            disabled={!isSuperAdmin}
                          >
                            Edit
                          </Button>
                          <Button
                            danger
                            icon={<IconTrash size={15} />}
                            onClick={() =>
                              openConfirmDialog({
                                title: "Delete Shareholder",
                                description: `Are you sure you want to delete ${record.fullNameEn}? This action cannot be undone.`,
                                confirmText: "Delete",
                                danger: true,
                                onConfirm: () => deleteShareholderMutation.mutate(record.id),
                              })
                            }
                            disabled={!isSuperAdmin}
                          >
                            Delete
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            )}

            {section === "candidates" && (
              <Card title={t("Candidates")} className="vx-card">
                <Space wrap style={{ marginBottom: 16 }}>
                  <Button type="primary" icon={<IconUserStar size={16} />} onClick={() => setShowCandidateModal(true)} disabled={!isSuperAdmin}>
                    Register Candidate
                  </Button>
                  {isSuperAdmin && (
                    <>
                      <Button icon={<IconFileTypeCsv size={16} />} onClick={() => downloadFile(token, "/reports/candidate-nominations?format=csv", "candidate-nominations-report.csv")}>
                        Export Nominations CSV
                      </Button>
                      <Button icon={<IconFileSpreadsheet size={16} />} onClick={() => downloadFile(token, "/reports/candidate-nominations?format=xlsx", "candidate-nominations-report.xlsx")}>
                        Export Nominations Excel
                      </Button>
                      <Button icon={<IconFileTypePdf size={16} />} onClick={() => downloadFile(token, "/reports/candidate-nominations?format=pdf", "candidate-nominations-report.pdf")}>
                        Export Nominations PDF
                      </Button>
                    </>
                  )}
                </Space>
                <Card size="small" className="vx-card vx-subcard">
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    <Space>
                      <IconPodium size={17} />
                      <Text strong>Shareholder Nomination Voting (Share-weighted)</Text>
                    </Space>
                    <Text type="secondary">
                      Shareholders can vote for nominee shareholders. Vote weight uses the voter's shares, and top nominees can be promoted to the official candidate list.
                    </Text>
                    <Space wrap>
                      <Select
                        style={{ minWidth: 280 }}
                        placeholder="Select voter shareholder"
                        showSearch
                        optionFilterProp="label"
                        value={nominationVoterShareholderId || undefined}
                        onChange={handleNominationVoterChange}
                        options={(candidateNominationEligibleVoters.data ?? []).map((s) => ({
                          value: s.id,
                          label: `${s.fullNameEn} (${s.shares.toLocaleString()} shares)`,
                        }))}
                      />
                      <Select
                        style={{ minWidth: 280 }}
                        placeholder="Select nominee shareholder"
                        showSearch
                        optionFilterProp="label"
                        value={nominationNomineeShareholderId || undefined}
                        onChange={setNominationNomineeShareholderId}
                        options={selectableNomineeShareholders.map((s) => ({
                          value: s.id,
                          label: `${s.fullNameEn} (${s.shares.toLocaleString()} shares)`,
                        }))}
                      />
                      <Button
                        type="primary"
                        icon={<IconDatabaseImport size={16} />}
                        onClick={() => castCandidateNominationVoteMutation.mutate()}
                        loading={castCandidateNominationVoteMutation.isPending}
                        disabled={!nominationVoterShareholderId || !nominationNomineeShareholderId}
                      >
                        Cast Nomination Vote
                      </Button>
                    </Space>
                    <Text type="secondary">
                      Eligible nomination voters remaining: {candidateNominationEligibleVoters.data?.length ?? 0}
                    </Text>
                  </Space>
                </Card>
                <Card size="small" className="vx-card vx-subcard">
                  <Space direction="vertical" size={10} style={{ width: "100%" }}>
                    <Space>
                      <IconTrophy size={17} />
                      <Text strong>{t("Nomination Results Dashboard")}</Text>
                    </Space>
                    <Table
                      rowKey="nomineeShareholderId"
                      dataSource={candidateNominationResults.data ?? []}
                      pagination={{ pageSize: 6 }}
                      columns={[
                        { title: "Nominee", dataIndex: "nomineeName" },
                        { title: "Weighted Shares", dataIndex: "totalShares", render: (value: number) => value.toLocaleString() },
                        { title: "Vote Count", dataIndex: "voteCount" },
                      ]}
                    />
                    {isSuperAdmin && (
                      <Space wrap>
                        <Select
                          style={{ minWidth: 300 }}
                          placeholder={t("Promote to Candidate")}
                          showSearch
                          optionFilterProp="label"
                          value={promoteNomineeShareholderId || undefined}
                          onChange={setPromoteNomineeShareholderId}
                          options={(candidateNominationResults.data ?? [])
                            .filter((row) => row.totalShares > 0)
                            .map((row) => ({ value: row.nomineeShareholderId, label: `${row.nomineeName} (${row.totalShares.toLocaleString()} shares)` }))}
                        />
                        <Input
                          style={{ minWidth: 220 }}
                          placeholder={t("Position")}
                          value={promoteCandidatePosition}
                          onChange={(e) => setPromoteCandidatePosition(e.target.value)}
                        />
                        <Button
                          type="primary"
                          icon={<IconUserStar size={16} />}
                          onClick={() => promoteNomineeMutation.mutate()}
                          loading={promoteNomineeMutation.isPending}
                          disabled={!promoteNomineeShareholderId}
                        >
                          Promote to Candidate
                        </Button>
                      </Space>
                    )}
                  </Space>
                </Card>
                <Table
                  rowKey="id"
                  dataSource={candidates.data ?? []}
                  columns={[
                    { title: "Candidate", dataIndex: "name" },
                    { title: "Position", dataIndex: "position" },
                    { title: "Linked Shareholder ID", dataIndex: "shareholder_id" },
                    {
                      title: "Action",
                      render: (_, record: CandidateRow) => (
                        <Button
                          danger
                          icon={<IconTrash size={15} />}
                          onClick={() =>
                            openConfirmDialog({
                              title: "Remove Candidate",
                              description: `Remove ${record.name} from active candidates?`,
                              confirmText: "Remove",
                              danger: true,
                              onConfirm: () => deleteCandidateMutation.mutate(record.id),
                            })
                          }
                          disabled={!isSuperAdmin}
                        >
                          Remove
                        </Button>
                      ),
                    },
                  ]}
                  pagination={{ pageSize: 8 }}
                />
              </Card>
            )}

            {section === "agendas" && (
              <Card title="Agenda Management" className="vx-card">
                <Space wrap style={{ marginBottom: 16 }}>
                  <Button
                    type="primary"
                    icon={<IconCalendarEvent size={16} />}
                    onClick={() => {
                      setEditingAgendaId("");
                      setAgendaTitleInput("");
                      setAgendaDetailsInput("");
                      setAgendaDateInput(new Date().toISOString().slice(0, 10));
                      setAgendaSortOrderInput("0");
                      setAgendaActiveInput(false);
                      setShowAgendaModal(true);
                    }}
                    disabled={!isSuperAdmin}
                  >
                    Create Agenda
                  </Button>
                </Space>
                <Table
                  rowKey="id"
                  dataSource={agendas.data ?? []}
                  columns={[
                    { title: "Title", dataIndex: "title" },
                    { title: "Date", dataIndex: "agenda_date" },
                    { title: "Order", dataIndex: "sort_order" },
                    {
                      title: "Status",
                      render: (_, row: AgendaRow) => (row.is_active === 1 ? <Tag color="green">Active</Tag> : <Tag>Pending</Tag>),
                    },
                    {
                      title: "Actions",
                      render: (_, row: AgendaRow) => (
                        <Space>
                          <Button
                            icon={<IconEdit size={15} />}
                            onClick={() => {
                              setEditingAgendaId(row.id);
                              setAgendaTitleInput(row.title);
                              setAgendaDetailsInput(row.details ?? "");
                              setAgendaDateInput(row.agenda_date);
                              setAgendaSortOrderInput(String(row.sort_order));
                              setAgendaActiveInput(row.is_active === 1);
                              setShowAgendaModal(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            onClick={() =>
                              openConfirmDialog({
                                title: "Set Active Agenda",
                                description: `Mark "${row.title}" as active discussion agenda?`,
                                confirmText: "Set Active",
                                onConfirm: () => activateAgendaMutation.mutate(row.id),
                              })
                            }
                            disabled={row.is_active === 1}
                          >
                            Set Active
                          </Button>
                          <Button
                            danger
                            icon={<IconTrash size={15} />}
                            onClick={() =>
                              openConfirmDialog({
                                title: "Delete Agenda",
                                description: `Delete agenda "${row.title}"?`,
                                confirmText: "Delete",
                                danger: true,
                                onConfirm: () => deleteAgendaMutation.mutate(row.id),
                              })
                            }
                          >
                            Delete
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                  pagination={{ pageSize: 8 }}
                />
              </Card>
            )}

            {section === "attendance" && (
              <Card title={t("Pending Attendance Approvals")} className="vx-card">
                <Space wrap style={{ marginBottom: 16 }}>
                  {isSuperAdmin && (
                    <>
                      <Button icon={<IconFileTypeCsv size={16} />} onClick={() => downloadFile(token, "/reports/attendance?format=csv", "attendance-report.csv")}>{t("Export CSV")}</Button>
                      <Button icon={<IconFileSpreadsheet size={16} />} onClick={() => downloadFile(token, "/reports/attendance?format=xlsx", "attendance-report.xlsx")}>{t("Export Excel")}</Button>
                      <Button icon={<IconFileTypePdf size={16} />} onClick={() => downloadFile(token, "/reports/attendance?format=pdf", "attendance-report.pdf")}>{t("Export PDF")}</Button>
                    </>
                  )}
                </Space>
                <Space wrap style={{ marginBottom: 16 }}>
                  <Select
                    style={{ minWidth: 320 }}
                    placeholder={t("Select shareholder")}
                    showSearch
                    optionFilterProp="label"
                    value={selectedShareholder || undefined}
                    onChange={setSelectedShareholder}
                    options={(shareholders.data ?? []).map((s) => ({ value: s.id, label: s.fullNameEn }))}
                  />
                  <Button type="primary" icon={<IconCheckupList size={16} />} onClick={() => markAttendanceMutation.mutate()} disabled={!selectedShareholder || !canMarkAttendance}>
                    Mark Attendance
                  </Button>
                </Space>
                <Table
                  rowKey="id"
                  dataSource={attendancePending.data ?? []}
                  columns={[
                    { title: "ID", dataIndex: "id", render: (id: string) => id.slice(0, 8) },
                    { title: "Shareholder", dataIndex: "shareholder_id" },
                    { title: "Status", dataIndex: "status" },
                    {
                      title: "Actions",
                      render: (_, row: AttendanceRow) => (
                        <Space>
                          <Button
                            icon={<IconShieldCheck size={15} />}
                            onClick={() =>
                              openConfirmDialog({
                                title: "Approve Attendance",
                                description: `Approve attendance record ${row.id.slice(0, 8)}?`,
                                confirmText: "Approve",
                                onConfirm: () => approveAttendanceMutation.mutate({ id: row.id, approve: true }),
                              })
                            }
                            disabled={!canApproveAttendance}
                          >
                            Approve
                          </Button>
                          <Button
                            danger
                            onClick={() =>
                              openConfirmDialog({
                                title: "Reject Attendance",
                                description: `Reject attendance record ${row.id.slice(0, 8)}?`,
                                confirmText: "Reject",
                                danger: true,
                                onConfirm: () => approveAttendanceMutation.mutate({ id: row.id, approve: false }),
                              })
                            }
                            disabled={!canApproveAttendance}
                          >
                            Reject
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                  pagination={{ pageSize: 7 }}
                />
                <Space style={{ marginTop: 16 }}>
                  <Select
                    style={{ minWidth: 320 }}
                    placeholder="Select attendance to reverse"
                    showSearch
                    optionFilterProp="label"
                    value={selectedAttendance || undefined}
                    onChange={setSelectedAttendance}
                    options={(attendanceAll.data ?? []).map((a) => ({ value: a.id, label: `${a.id.slice(0, 8)} - ${a.status}` }))}
                  />
                  <Button
                    danger
                    icon={<IconTrash size={15} />}
                    onClick={() =>
                      openConfirmDialog({
                        title: "Reverse Attendance",
                        description: "Reverse this attendance record and mark it rejected?",
                        confirmText: "Reverse",
                        danger: true,
                        onConfirm: () => reverseAttendanceMutation.mutate(),
                      })
                    }
                    disabled={!selectedAttendance || !isSuperAdmin}
                  >
                    Reverse Attendance
                  </Button>
                </Space>
              </Card>
            )}

            {section === "votes" && (
              <Card title={t("Pending Vote Approvals")} className="vx-card">
                <Card size="small" className="vx-card vx-subcard">
                  <Space direction="vertical" size={2}>
                    <Text strong>Voting Eligibility Rule</Text>
                    <Text type="secondary">
                      Only shareholders with approved attendance are eligible to vote and appear in the voter dropdown.
                    </Text>
                    <Text type="secondary">
                      Eligible voters: {eligibleVoters.length} / {shareholders.data?.length ?? 0}
                    </Text>
                  </Space>
                </Card>
                <Space wrap style={{ marginBottom: 16 }}>
                  {isSuperAdmin && (
                    <>
                      <Button icon={<IconFileTypeCsv size={16} />} onClick={() => downloadFile(token, "/reports/votes?format=csv", "voting-report.csv")}>{t("Export CSV")}</Button>
                      <Button icon={<IconFileSpreadsheet size={16} />} onClick={() => downloadFile(token, "/reports/votes?format=xlsx", "voting-report.xlsx")}>{t("Export Excel")}</Button>
                      <Button icon={<IconFileTypePdf size={16} />} onClick={() => downloadFile(token, "/reports/votes?format=pdf", "voting-report.pdf")}>{t("Export PDF")}</Button>
                    </>
                  )}
                </Space>
                <Space wrap style={{ marginBottom: 16 }}>
                  <Select
                    style={{ minWidth: 320 }}
                    placeholder={t("Select shareholder")}
                    showSearch
                    optionFilterProp="label"
                    value={selectedShareholder || undefined}
                    onChange={handleVoteVoterChange}
                    options={eligibleVoters.map((s) => ({ value: s.id, label: s.fullNameEn }))}
                  />
                  <Select
                    style={{ minWidth: 320 }}
                    placeholder={t("Select candidate")}
                    showSearch
                    optionFilterProp="label"
                    value={selectedCandidate || undefined}
                    onChange={setSelectedCandidate}
                    options={selectableCandidates.map((candidate) => ({ value: candidate.id, label: `${candidate.name} (${candidate.position})` }))}
                  />
                  <Button type="primary" icon={<IconDatabaseImport size={16} />} onClick={() => encodeVoteMutation.mutate()} disabled={!selectedShareholder || !selectedCandidate || !canEncodeVote}>
                    Encode Vote
                  </Button>
                </Space>
                <Table
                  rowKey="id"
                  dataSource={votesPending.data ?? []}
                  columns={[
                    { title: "ID", dataIndex: "id", render: (id: string) => id.slice(0, 8) },
                    { title: "Shareholder", dataIndex: "shareholder_id" },
                    { title: "Candidate", dataIndex: "candidate_id" },
                    {
                      title: "Actions",
                      render: (_, row: VoteRow) => (
                        <Space>
                          <Button
                            icon={<IconShieldCheck size={15} />}
                            onClick={() =>
                              openConfirmDialog({
                                title: "Approve Vote",
                                description: `Approve vote record ${row.id.slice(0, 8)}?`,
                                confirmText: "Approve",
                                onConfirm: () => approveVoteMutation.mutate({ id: row.id, approve: true }),
                              })
                            }
                            disabled={!canApproveVote}
                          >
                            Approve
                          </Button>
                          <Button
                            danger
                            onClick={() =>
                              openConfirmDialog({
                                title: "Reject Vote",
                                description: `Reject vote record ${row.id.slice(0, 8)}?`,
                                confirmText: "Reject",
                                danger: true,
                                onConfirm: () => approveVoteMutation.mutate({ id: row.id, approve: false }),
                              })
                            }
                            disabled={!canApproveVote}
                          >
                            Reject
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                  pagination={{ pageSize: 7 }}
                />
                <Space style={{ marginTop: 16 }}>
                  <Select
                    style={{ minWidth: 320 }}
                    placeholder="Select vote to reverse"
                    showSearch
                    optionFilterProp="label"
                    value={selectedVote || undefined}
                    onChange={setSelectedVote}
                    options={(votesAll.data ?? []).map((v) => ({ value: v.id, label: `${v.id.slice(0, 8)} - ${v.status}` }))}
                  />
                  <Button
                    danger
                    icon={<IconTrash size={15} />}
                    onClick={() =>
                      openConfirmDialog({
                        title: "Reverse Vote",
                        description: "Reverse this vote record and mark it rejected?",
                        confirmText: "Reverse",
                        danger: true,
                        onConfirm: () => reverseVoteMutation.mutate(),
                      })
                    }
                    disabled={!selectedVote || !isSuperAdmin}
                  >
                    Reverse Vote
                  </Button>
                </Space>
              </Card>
            )}

            {section === "audit" && (
              <Card title={t("Latest Audit Events")} className="vx-card">
                <Table
                  rowKey="id"
                  dataSource={auditLogs.data ?? []}
                  columns={[
                    { title: "Time", dataIndex: "timestamp", render: (value: string) => new Date(value).toLocaleString() },
                    {
                      title: "Actor",
                      render: (_, row: AuditRow) => row.actor_username ?? row.user_id ?? "System",
                    },
                    { title: "Module", dataIndex: "module" },
                    { title: "Action", dataIndex: "action_type" },
                    {
                      title: "Maker",
                      render: (_, row: AuditRow) => {
                        const payload = row.new_value as
                          | { makerUsername?: string | null; makerUserId?: string | null }
                          | null
                          | undefined;
                        return payload?.makerUsername ?? payload?.makerUserId ?? "-";
                      },
                    },
                    {
                      title: "Checker",
                      render: (_, row: AuditRow) => {
                        const payload = row.new_value as
                          | { checkerUsername?: string | null; checkerUserId?: string | null }
                          | null
                          | undefined;
                        return payload?.checkerUsername ?? payload?.checkerUserId ?? "-";
                      },
                    },
                  ]}
                />
              </Card>
            )}

            {section === "settings" && (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Card title={t("Maker-Checker Controls")} className="vx-card">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="Attendance Maker-Checker">
                      <Switch checked={resolvedAttendanceMakerCheckerEnabled} onChange={setAttendanceMakerCheckerEnabled} />
                    </Descriptions.Item>
                    <Descriptions.Item label="Voting Maker-Checker">
                      <Switch checked={resolvedVotingMakerCheckerEnabled} onChange={setVotingMakerCheckerEnabled} />
                    </Descriptions.Item>
                    <Descriptions.Item label="Influential Auto Classification">
                      <Switch checked={resolvedAutoClassificationEnabled} onChange={setAutoClassificationEnabled} />
                    </Descriptions.Item>
                    <Descriptions.Item label="Influential Share Threshold">
                      <Input
                        value={resolvedInfluentialThreshold}
                        onChange={(e) => setInfluentialThreshold(e.target.value)}
                        disabled={!resolvedAutoClassificationEnabled}
                        style={{ maxWidth: 280 }}
                      />
                    </Descriptions.Item>
                    <Descriptions.Item>
                      <Button type="primary" onClick={() => saveAdminConfigMutation.mutate()} loading={saveAdminConfigMutation.isPending}>
                        Save Settings
                      </Button>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>

                <Card title={t("AGM Session Maintenance")} className="vx-card">
                  <Space direction="vertical" size={8}>
                    <Text type="secondary">
                      Start a clean AGM session by clearing operational records (attendance, votes, and nomination votes).
                    </Text>
                    <Button danger onClick={() => setShowResetSessionModal(true)}>
                      Reset AGM Session Data
                    </Button>
                  </Space>
                </Card>
              </Space>
            )}
          </Content>
        </Layout>
      </Layout>

      <Modal
        title={t("Add Shareholder")}
        open={showCreateModal}
        onCancel={() => setShowCreateModal(false)}
        onOk={() => createShareholderMutation.mutate()}
        okButtonProps={{ loading: createShareholderMutation.isPending, disabled: !shareholderName || !isSuperAdmin }}
      >
        <Form layout="vertical">
          <Form.Item label="Full name">
            <Input value={shareholderName} onChange={(e) => setShareholderName(e.target.value)} />
          </Form.Item>
          <Form.Item label="Shares">
            <Input value={shareholderShares} onChange={(e) => setShareholderShares(e.target.value)} />
          </Form.Item>
          <Form.Item label="Influential shareholder">
            <Switch checked={manualInfluentialFlag} onChange={setManualInfluentialFlag} disabled={resolvedAutoClassificationEnabled} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t("Edit")}
        open={showEditModal}
        onCancel={() => setShowEditModal(false)}
        onOk={() =>
          openConfirmDialog({
            title: "Update Shareholder",
            description: "Save these shareholder changes?",
            confirmText: "Update",
            onConfirm: () => updateShareholderMutation.mutate(),
          })
        }
        okButtonProps={{ loading: updateShareholderMutation.isPending, disabled: !isSuperAdmin }}
      >
        <Form layout="vertical">
          <Form.Item label="Full name">
            <Input value={editingShareholderName} onChange={(e) => setEditingShareholderName(e.target.value)} />
          </Form.Item>
          <Form.Item label="Shares">
            <Input value={editingShareholderShares} onChange={(e) => setEditingShareholderShares(e.target.value)} />
          </Form.Item>
          <Form.Item label="Influential shareholder">
            <Switch checked={editingInfluentialFlag} onChange={setEditingInfluentialFlag} disabled={resolvedAutoClassificationEnabled} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t("Register Candidate")}
        open={showCandidateModal}
        onCancel={() => setShowCandidateModal(false)}
        onOk={() => createCandidateMutation.mutate()}
        okButtonProps={{ loading: createCandidateMutation.isPending, disabled: !candidateShareholderId || !isSuperAdmin }}
      >
        <Form layout="vertical">
          <Form.Item label="Candidate Shareholder">
            <Select
              placeholder={t("Select shareholder")}
              showSearch
              optionFilterProp="label"
              value={candidateShareholderId || undefined}
              onChange={setCandidateShareholderId}
              options={(shareholders.data ?? []).map((s) => ({ value: s.id, label: `${s.fullNameEn} (${s.id})` }))}
            />
          </Form.Item>
          <Form.Item label="Position">
            <Input value={candidatePosition} onChange={(e) => setCandidatePosition(e.target.value)} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingAgendaId ? "Edit Agenda" : "Create Agenda"}
        open={showAgendaModal}
        onCancel={() => setShowAgendaModal(false)}
        onOk={() => (editingAgendaId ? updateAgendaMutation.mutate() : createAgendaMutation.mutate())}
        okText={editingAgendaId ? "Update Agenda" : "Create Agenda"}
        okButtonProps={{
          loading: createAgendaMutation.isPending || updateAgendaMutation.isPending,
          disabled: !agendaTitleInput.trim(),
        }}
      >
        <Form layout="vertical">
          <Form.Item label="Agenda Title">
            <Input value={agendaTitleInput} onChange={(e) => setAgendaTitleInput(e.target.value)} />
          </Form.Item>
          <Form.Item label="Details">
            <Input.TextArea rows={3} value={agendaDetailsInput} onChange={(e) => setAgendaDetailsInput(e.target.value)} />
          </Form.Item>
          <Form.Item label="Agenda Date">
            <Input type="date" value={agendaDateInput} onChange={(e) => setAgendaDateInput(e.target.value)} />
          </Form.Item>
          <Form.Item label="Display Order">
            <Input value={agendaSortOrderInput} onChange={(e) => setAgendaSortOrderInput(e.target.value)} />
          </Form.Item>
          <Form.Item label="Mark as Active">
            <Switch checked={agendaActiveInput} onChange={setAgendaActiveInput} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t("Reset AGM Session Data")}
        open={showResetSessionModal}
        onCancel={() => setShowResetSessionModal(false)}
        onOk={() => resetSessionMutation.mutate()}
        okButtonProps={{ danger: true, loading: resetSessionMutation.isPending }}
        okText={t("Reset Session")}
      >
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Text type="secondary">
            This clears attendance records, official votes, and candidate nomination votes for a fresh AGM cycle.
          </Text>
          <Checkbox checked={resetClearCandidates} onChange={(e) => setResetClearCandidates(e.target.checked)}>
            Also deactivate all current candidates
          </Checkbox>
          <Checkbox checked={resetClearAuditLogs} onChange={(e) => setResetClearAuditLogs(e.target.checked)}>
            Also clear audit log history
          </Checkbox>
        </Space>
      </Modal>

      <Modal
        title="Today's Agenda"
        open={showAgendaFullscreen}
        onCancel={() => setShowAgendaFullscreen(false)}
        footer={null}
        width="80vw"
        styles={{ body: { maxHeight: "70vh", overflow: "hidden" } }}
      >
        <Space style={{ width: "100%", justifyContent: "flex-end", marginBottom: 8 }}>
          <Button icon={<IconArrowsMinimize size={15} />} onClick={() => setShowAgendaFullscreen(false)}>
            Back to Dashboard
          </Button>
        </Space>
        {renderAgendaList(true)}
      </Modal>

      <Modal
        open={confirmDialog.open}
        onCancel={closeConfirmDialog}
        onOk={() => {
          confirmDialog.onConfirm?.();
          closeConfirmDialog();
        }}
        okText={confirmDialog.confirmText ?? "Confirm"}
        okButtonProps={{ danger: confirmDialog.danger }}
        title={null}
      >
        <Card className="vx-card vx-confirm-card" bordered={false}>
          <Space direction="vertical" size={6} style={{ width: "100%" }}>
            <Text strong style={{ fontSize: 16 }}>{confirmDialog.title}</Text>
            <Text type="secondary">{confirmDialog.description}</Text>
          </Space>
        </Card>
      </Modal>
    </ConfigProvider>
  );
}

export default function AppRoot() {
  return (
    <AntdApp>
      <App />
    </AntdApp>
  );
}
