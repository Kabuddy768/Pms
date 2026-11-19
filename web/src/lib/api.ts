export interface MembershipSummary {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  default_currency: string;
  role: "OWNER" | "MANAGER" | "ACCOUNTANT" | "CARETAKER";
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  joined_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
  memberships: MembershipSummary[];
}

export interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  default_currency: string;
  timezone: string;
  plan_tier: string;
  unit_limit: number;
  created_at: string;
  role: string | null;
}

export interface OrganizationMember {
  id: string;
  user: string;
  email: string;
  full_name: string;
  role: "OWNER" | "MANAGER" | "ACCOUNTANT" | "CARETAKER";
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  joined_at: string;
}

export interface AuditEventItem {
  id: string;
  actor_user: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  occurred_at: string;
}

export interface HealthCheckResponse {
  status: "ok" | "degraded";
  service: string;
  database: "ok" | "unavailable";
}

export interface TenantLedgerEntry {
  date: string;
  entry_type: string;
  reference: string;
  unit_code: string;
  description: string;
  debit: string;
  credit: string;
  running_balance: string;
}

export interface TenantLedger {
  tenant_id: string;
  full_name: string;
  phone: string;
  email: string;
  currency: string;
  total_billed: string;
  total_paid: string;
  current_balance: string;
  entries: TenantLedgerEntry[];
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface PropertyItem {
  id: string;
  name: string;
  property_type: "RESIDENTIAL" | "COMMERCIAL" | "MIXED";
  address: string;
  county: string;
  town: string;
  status: "ACTIVE" | "ARCHIVED";
  unit_count: number;
  vacant_unit_count: number;
  created_at: string;
}

export interface BuildingItem {
  id: string;
  property: string;
  property_name: string;
  name: string;
}

export interface UnitItem {
  id: string;
  property: string;
  property_name: string;
  building: string | null;
  building_name: string | null;
  unit_code: string;
  unit_type: "BEDSITTER" | "STUDIO" | "1BR" | "2BR" | "3BR" | "SHOP" | "OFFICE" | "OTHER";
  advertised_rent: string;
  status: "VACANT" | "OCCUPIED" | "MAINTENANCE" | "ARCHIVED";
}

export interface OwnerItem {
  id: string;
  full_name: string;
  phone: string;
  email: string;
}

export interface PropertyOwnerItem {
  id: string;
  property: string;
  owner: string;
  owner_name: string;
  owner_phone: string;
  owner_email: string;
  ownership_share: string;
  valid_from: string;
  valid_to: string | null;
}

export interface TenantItem {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  national_id: string;
  sms_opt_in: boolean;
  email_opt_in: boolean;
  status: "ACTIVE" | "ARCHIVED";
}

export interface LeaseOccupantItem {
  id: string;
  tenant: string;
  tenant_name: string;
  tenant_phone: string;
  occupant_role: "PRIMARY" | "CO_TENANT" | "OCCUPANT";
}

export interface LeaseEventItem {
  id: string;
  event_type: string;
  details: Record<string, unknown>;
  actor_email: string | null;
  occurred_at: string;
}

export interface DepositTransactionItem {
  id: string;
  transaction_type: "RECEIVED" | "DEDUCTED" | "REFUNDED";
  amount: string;
  reference: string;
  notes: string;
  recorded_by_email: string | null;
  occurred_at: string;
}

export interface DepositAccountItem {
  id: string;
  required_amount: string;
  held_balance: string;
  status: "PENDING" | "PARTIAL" | "HELD" | "SETTLED";
  transactions: DepositTransactionItem[];
}

export interface LeaseItem {
  id: string;
  unit: string;
  unit_code: string;
  property_id: string;
  property_name: string;
  start_date: string;
  end_date: string | null;
  rent_amount: string;
  billing_frequency: "MONTHLY" | "QUARTERLY" | "ANNUALLY";
  billing_day: number;
  status: "DRAFT" | "ACTIVE" | "TERMINATED" | "EXPIRED";
  occupants: LeaseOccupantItem[];
  deposit_account: DepositAccountItem | null;
  events: LeaseEventItem[];
}

export interface InvoiceLineItem {
  id: string;
  charge_type: string;
  description: string;
  quantity: string;
  unit_amount: string;
  line_total: string;
}

export interface InvoiceAdjustmentItem {
  id: string;
  adjustment_type: "CREDIT" | "DEBIT";
  amount: string;
  reason: string;
  approved_by_email: string | null;
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  lease: string;
  unit_code: string;
  property_name: string;
  tenant_name: string;
  invoice_number: string;
  billing_period: string;
  issue_date: string;
  due_date: string;
  currency: string;
  total_amount: string;
  adjusted_total: string;
  allocated_amount: string;
  outstanding_balance: string;
  status: "ISSUED" | "PARTIAL" | "PAID" | "VOID";
  lines: InvoiceLineItem[];
  adjustments: InvoiceAdjustmentItem[];
}

export interface PaymentAllocationItem {
  id: string;
  invoice: string;
  invoice_number: string;
  amount: string;
  status: "ACTIVE" | "REVERSED";
  allocated_at: string;
}

export interface PaymentReversalItem {
  id: string;
  amount: string;
  reason: string;
  reversed_by_email: string | null;
  reversed_at: string;
}

export interface PaymentItem {
  id: string;
  lease: string | null;
  unit_code: string | null;
  property_name: string | null;
  tenant: string | null;
  tenant_name: string | null;
  payment_reference: string;
  receipt_number: string;
  method: "MPESA_PAYBILL" | "MPESA_STK" | "BANK_TRANSFER" | "CASH" | "CHEQUE";
  currency: string;
  amount: string;
  allocated_amount: string;
  unallocated_amount: string;
  is_matched: boolean;
  received_at: string;
  status: "PENDING" | "CONFIRMED" | "REVERSED" | "FAILED";
  payer_name: string;
  payer_phone: string;
  raw_account_ref: string;
  allocations: PaymentAllocationItem[];
  reversals: PaymentReversalItem[];
}

export interface ExpenseCategoryItem {
  id: string;
  name: string;
}

export interface ExpenseItem {
  id: string;
  property: string;
  property_name: string;
  unit: string | null;
  unit_code: string | null;
  category: string;
  category_name: string;
  description: string;
  amount: string;
  currency: string;
  expense_date: string;
  status: "RECORDED" | "APPROVED" | "VOID";
  recorded_by_email: string | null;
  approved_by_email: string | null;
}

export interface MaintenanceRequestItem {
  id: string;
  property: string;
  property_name: string;
  unit: string | null;
  unit_code: string | null;
  tenant: string | null;
  tenant_name: string | null;
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  assigned_to: string | null;
  assigned_to_email: string | null;
  created_by_email: string | null;
  created_at: string;
}

export interface DashboardSummary {
  currency: string;
  total_units: number;
  occupied_units: number;
  vacant_units: number;
  occupancy_rate: string;
  total_billed: string;
  total_collected: string;
  total_arrears: string;
  total_expenses: string;
  net_cashflow: string;
  unmatched_suspense_count: number;
  unmatched_suspense_amount: string;
  open_maintenance_count: number;
  arrears_by_lease: Array<{
    lease_id: string;
    unit_code: string;
    property_name: string;
    tenant_name: string;
    outstanding_balance: string;
  }>;
  upcoming_lease_expiries: Array<{
    lease_id: string;
    unit_code: string;
    property_name: string;
    tenant_name: string;
    end_date: string;
    rent_amount: string;
  }>;
}

export function formatKES(amount: string | number): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(num)) return "KES 0.00";
  return `KES ${num.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api/v1";

const ACCESS_KEY = "pms_access_token";
const REFRESH_KEY = "pms_refresh_token";
const ORG_KEY = "pms_active_org_id";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getActiveOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ORG_KEY);
}

export function setActiveOrgId(orgId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ORG_KEY, orgId);
}

export function saveAuthTokens(access: string, refresh: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(ORG_KEY);
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return null;

  const res = await fetch(`${API_BASE}/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });

  if (!res.ok) {
    clearAuthSession();
    return null;
  }
  const data = await res.json();
  if (data.access) {
    localStorage.setItem(ACCESS_KEY, data.access);
    return data.access;
  }
  return null;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { includeOrg?: boolean } = {}
): Promise<T> {
  const { includeOrg = true, headers = {}, ...rest } = options;
  let token = getAccessToken();

  const buildHeaders = (authToken: string | null): Record<string, string> => {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      ...(headers as Record<string, string>),
    };
    if (authToken) {
      h["Authorization"] = `Bearer ${authToken}`;
    }
    if (includeOrg) {
      const orgId = getActiveOrgId();
      if (orgId) {
        h["X-Organization-ID"] = orgId;
      }
    }
    return h;
  };

  let res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: buildHeaders(token),
  });

  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      token = newToken;
      res = await fetch(`${API_BASE}${path}`, {
        ...rest,
        headers: buildHeaders(token),
      });
    }
  }

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const detail =
      parsed?.detail ||
      (typeof parsed === "object" && parsed !== null
        ? Object.values(parsed).flat().join(" ")
        : "Request failed");
    throw new ApiError(res.status, String(detail || "Request failed"), parsed);
  }

  return parsed as T;
}

export const DEMO_CREDENTIALS = {
  email: "admin@pms.local",
  password: "password123",
} as const;

export async function loginWithCredentials(
  email: string,
  password: string
): Promise<UserProfile> {
  const tokens = await apiFetch<{ access: string; refresh: string }>("/auth/token/", {
    method: "POST",
    includeOrg: false,
    body: JSON.stringify({ email, password }),
  });
  saveAuthTokens(tokens.access, tokens.refresh);
  const me = await apiFetch<UserProfile>("/auth/me/", { includeOrg: false });
  if (me.memberships.length > 0) {
    setActiveOrgId(me.memberships[0].organization_id);
  }
  return me;
}
