import { Platform } from "react-native";

export interface MembershipSummary {
  id: string;
  organization_id: string;
  organization_name: string;
  role: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  memberships: MembershipSummary[];
}

export interface DashboardSummary {
  currency: string;
  total_units: number;
  occupied_units: number;
  occupancy_rate: string;
  total_billed: string;
  total_collected: string;
  total_arrears: string;
  unmatched_suspense_count: number;
  open_maintenance_count: number;
}

export interface LeaseSummary {
  id: string;
  unit_code: string;
  property_name: string;
  rent_amount: string;
  status: string;
  occupants: Array<{ tenant_name: string; tenant_phone: string }>;
}

export interface InvoiceSummary {
  id: string;
  lease: string;
  invoice_number: string;
  unit_code: string;
  tenant_name: string;
  outstanding_balance: string;
  status: string;
}

export interface PaymentSummary {
  id: string;
  payment_reference: string;
  receipt_number: string;
  method: string;
  amount: string;
  status: "PENDING" | "CONFIRMED" | "REVERSED" | "FAILED";
  unit_code: string | null;
  is_matched: boolean;
}

export interface MaintenanceSummary {
  id: string;
  property: string;
  property_name: string;
  unit_code: string | null;
  title: string;
  priority: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
}

export interface PropertySummary {
  id: string;
  name: string;
  unit_count: number;
  vacant_unit_count: number;
}

export interface UnitSummary {
  id: string;
  property_name: string;
  unit_code: string;
}

export interface MeterReadingSummary {
  id: string;
  unit: string;
  unit_code: string;
  property_name: string;
  charge_type: "WATER" | "GARBAGE" | "SERVICE_CHARGE";
  billing_period: string;
  previous_reading: string;
  current_reading: string;
  units_consumed: string;
  total_amount: string;
  billed_invoice_number: string | null;
}

const DEFAULT_BASE =
  Platform.OS === "android"
    ? "http://10.0.2.2:8000/api/v1"
    : "http://127.0.0.1:8000/api/v1";

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_BASE;

export function formatKES(amount: string | number): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(num)) return "KES 0.00";
  return `KES ${num.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export async function mobileFetch<T>(
  path: string,
  options: {
    method?: string;
    token?: string | null;
    orgId?: string | null;
    body?: unknown;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }
  if (options.orgId) {
    headers["X-Organization-ID"] = options.orgId;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail =
      parsed?.detail ||
      (typeof parsed === "object" && parsed !== null
        ? Object.values(parsed).flat().join(" ")
        : "Request failed");
    throw new Error(String(detail || "Request failed"));
  }
  return parsed as T;
}
