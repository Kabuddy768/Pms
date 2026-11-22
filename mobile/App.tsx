import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  formatKES,
  mobileFetch,
  type DashboardSummary,
  type InvoiceSummary,
  type LeaseSummary,
  type MaintenanceSummary,
  type MeterReadingSummary,
  type PaymentSummary,
  type PropertySummary,
  type UnitSummary,
  type UserProfile,
} from "./src/api";

type TabKey = "portfolio" | "payments" | "maintenance" | "meters";

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("portfolio");

  // Login form
  const [email, setEmail] = useState("admin@pms.local");
  const [password, setPassword] = useState("password123");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // Workspace data
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [leases, setLeases] = useState<LeaseSummary[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceSummary[]>([]);

  // Payment capture form (PMS-071)
  const [payLeaseId, setPayLeaseId] = useState("");
  const [payRef, setPayRef] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"MPESA_PAYBILL" | "BANK_TRANSFER" | "CASH">(
    "MPESA_PAYBILL"
  );
  const [payState, setPayState] = useState<"IDLE" | "SUBMITTING" | "CONFIRMED" | "FAILED">(
    "IDLE"
  );
  const [payFeedback, setPayFeedback] = useState("");

  // Maintenance form
  const [maintPropId, setMaintPropId] = useState("");
  const [maintTitle, setMaintTitle] = useState("");

  // Utility meter readings state
  const [units, setUnits] = useState<UnitSummary[]>([]);
  const [meterReadings, setMeterReadings] = useState<MeterReadingSummary[]>([]);
  const [meterUnitId, setMeterUnitId] = useState("");
  const [meterPeriod, setMeterPeriod] = useState("2026-11");
  const [meterPrev, setMeterPrev] = useState("");
  const [meterCurr, setMeterCurr] = useState("");
  const [meterRate, setMeterRate] = useState("150.00");
  const [meterFeedback, setMeterFeedback] = useState("");

  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const tokens = await mobileFetch<{ access: string }>("/auth/token/", {
        method: "POST",
        body: { email, password },
      });
      const me = await mobileFetch<UserProfile>("/auth/me/", { token: tokens.access });
      setToken(tokens.access);
      setUser(me);
      if (me.memberships.length > 0) {
        setOrgId(me.memberships[0].organization_id);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const loadWorkspace = async (activeToken: string, activeOrgId: string) => {
    setLoading(true);
    setError("");
    try {
      const [dash, propRes, leaseRes, invRes, payRes, maintRes, unitRes, meterRes] =
        await Promise.all([
          mobileFetch<DashboardSummary>("/reports/dashboard/", {
            token: activeToken,
            orgId: activeOrgId,
          }),
          mobileFetch<{ results: PropertySummary[] }>("/properties/", {
            token: activeToken,
            orgId: activeOrgId,
          }),
          mobileFetch<{ results: LeaseSummary[] }>("/leases/?status=ACTIVE", {
            token: activeToken,
            orgId: activeOrgId,
          }),
          mobileFetch<{ results: InvoiceSummary[] }>("/invoices/", {
            token: activeToken,
            orgId: activeOrgId,
          }),
          mobileFetch<{ results: PaymentSummary[] }>("/payments/", {
            token: activeToken,
            orgId: activeOrgId,
          }),
          mobileFetch<{ results: MaintenanceSummary[] }>("/maintenance-requests/", {
            token: activeToken,
            orgId: activeOrgId,
          }),
          mobileFetch<{ results: UnitSummary[] }>("/units/?page_size=200", {
            token: activeToken,
            orgId: activeOrgId,
          }),
          mobileFetch<{ results: MeterReadingSummary[] }>("/meter-readings/", {
            token: activeToken,
            orgId: activeOrgId,
          }),
        ]);
      setDashboard(dash);
      setProperties(propRes.results);
      setLeases(leaseRes.results);
      setInvoices(invRes.results);
      setPayments(payRes.results);
      setMaintenance(maintRes.results);
      setUnits(unitRes.results);
      setMeterReadings(meterRes.results);
      if (!payLeaseId && leaseRes.results.length > 0) {
        setPayLeaseId(leaseRes.results[0].id);
      }
      if (!maintPropId && propRes.results.length > 0) {
        setMaintPropId(propRes.results[0].id);
      }
      if (!meterUnitId && unitRes.results.length > 0) {
        setMeterUnitId(unitRes.results[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && orgId) {
      void loadWorkspace(token, orgId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, orgId]);

  const handleSubmitPayment = async () => {
    if (!token || !orgId || payState === "SUBMITTING") return;
    if (!payRef.trim() || !payAmount.trim()) {
      setPayState("FAILED");
      setPayFeedback("Reference and amount are required.");
      return;
    }
    setPayState("SUBMITTING");
    setPayFeedback("");
    try {
      const created = await mobileFetch<PaymentSummary>("/payments/", {
        method: "POST",
        token,
        orgId,
        body: {
          lease: payLeaseId || null,
          payment_reference: payRef.trim(),
          method: payMethod,
          amount: payAmount.trim(),
          auto_allocate: true,
        },
      });
      setPayState("CONFIRMED");
      setPayFeedback(`Receipt ${created.receipt_number} confirmed.`);
      setPayRef("");
      setPayAmount("");
      await loadWorkspace(token, orgId);
    } catch (err) {
      setPayState("FAILED");
      setPayFeedback(err instanceof Error ? err.message : "Payment failed");
    }
  };

  const handleCreateMaintenance = async () => {
    if (!token || !orgId || !maintPropId || !maintTitle.trim()) return;
    setError("");
    try {
      await mobileFetch("/maintenance-requests/", {
        method: "POST",
        token,
        orgId,
        body: { property: maintPropId, title: maintTitle.trim(), priority: "MEDIUM" },
      });
      setMaintTitle("");
      await loadWorkspace(token, orgId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log request");
    }
  };

  const handleCycleMaintenance = async (item: MaintenanceSummary) => {
    if (!token || !orgId) return;
    const nextStatus =
      item.status === "OPEN"
        ? "IN_PROGRESS"
        : item.status === "IN_PROGRESS"
        ? "RESOLVED"
        : "CLOSED";
    try {
      await mobileFetch(`/maintenance-requests/${item.id}/`, {
        method: "PATCH",
        token,
        orgId,
        body: { status: nextStatus },
      });
      await loadWorkspace(token, orgId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    }
  };

  const handleSubmitMeter = async () => {
    if (!token || !orgId || !meterUnitId || !meterPrev.trim() || !meterCurr.trim()) return;
    setError("");
    setMeterFeedback("");
    try {
      const created = await mobileFetch<MeterReadingSummary>("/meter-readings/", {
        method: "POST",
        token,
        orgId,
        body: {
          unit: meterUnitId,
          charge_type: "WATER",
          billing_period: meterPeriod.trim(),
          previous_reading: meterPrev.trim(),
          current_reading: meterCurr.trim(),
          unit_rate: meterRate.trim() || "150.00",
        },
      });
      setMeterPrev("");
      setMeterCurr("");
      setMeterFeedback(
        `Saved ${created.unit_code} water charge: ${formatKES(created.total_amount)}`
      );
      await loadWorkspace(token, orgId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record reading");
    }
  };

  if (!token || !user) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <View style={styles.authContainer}>
          <View style={styles.card}>
            <Text style={styles.eyebrow}>PMS MOBILE</Text>
            <Text style={styles.heading}>Sign in to workspace</Text>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {authError ? <Text style={styles.errorBox}>{authError}</Text> : null}
            <Pressable
              style={styles.primaryBtn}
              onPress={handleLogin}
              disabled={authLoading}
            >
              <Text style={styles.primaryBtnText}>
                {authLoading ? "Signing in..." : "Sign in"}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>PMS MOBILE</Text>
          <Text style={styles.headerTitle}>
            {user.memberships.find((m) => m.organization_id === orgId)
              ?.organization_name || "No Organization"}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            setToken(null);
            setUser(null);
            setOrgId(null);
          }}
        >
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
      </View>

      {/* Organization Switcher Pills */}
      {user.memberships.length > 1 && (
        <ScrollView horizontal style={styles.orgBar} showsHorizontalScrollIndicator={false}>
          {user.memberships.map((m) => (
            <Pressable
              key={m.organization_id}
              onPress={() => setOrgId(m.organization_id)}
              style={[
                styles.orgPill,
                m.organization_id === orgId && styles.orgPillActive,
              ]}
            >
              <Text
                style={[
                  styles.orgPillText,
                  m.organization_id === orgId && styles.orgPillTextActive,
                ]}
              >
                {m.organization_name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Navigation Tabs */}
      <View style={styles.tabBar}>
        {(
          [
            ["portfolio", "Portfolio"],
            ["payments", "Payments"],
            ["maintenance", "Maintenance"],
            ["meters", "Meters"],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tabItem, tab === key && styles.tabItemActive]}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {loading && <ActivityIndicator color="#0F5338" style={{ marginVertical: 12 }} />}
        {error ? <Text style={styles.errorBox}>{error}</Text> : null}

        {tab === "portfolio" && (
          <>
            {dashboard && (
              <View style={styles.kpiGrid}>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Occupancy</Text>
                  <Text style={styles.kpiValue}>{dashboard.occupancy_rate}%</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Collected</Text>
                  <Text style={[styles.kpiValue, { color: "#047857" }]}>
                    {formatKES(dashboard.total_collected)}
                  </Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Arrears</Text>
                  <Text style={[styles.kpiValue, { color: "#B91C1C" }]}>
                    {formatKES(dashboard.total_arrears)}
                  </Text>
                </View>
              </View>
            )}

            <Text style={styles.sectionTitle}>Properties ({properties.length})</Text>
            {properties.length === 0 ? (
              <Text style={styles.emptyText}>No properties in this organization.</Text>
            ) : (
              properties.map((p) => (
                <View key={p.id} style={styles.listRow}>
                  <Text style={styles.rowTitle}>{p.name}</Text>
                  <Text style={styles.rowMeta}>
                    {p.unit_count} units ({p.vacant_unit_count} vacant)
                  </Text>
                </View>
              ))
            )}

            <Text style={styles.sectionTitle}>Invoices &amp; Balances ({invoices.length})</Text>
            {invoices.length === 0 ? (
              <Text style={styles.emptyText}>No invoices issued yet.</Text>
            ) : (
              invoices.slice(0, 10).map((inv) => (
                <View key={inv.id} style={styles.listRow}>
                  <View>
                    <Text style={styles.rowTitle}>
                      {inv.invoice_number} • {inv.unit_code}
                    </Text>
                    <Text style={styles.rowMeta}>{inv.tenant_name}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.moneyValue}>
                      {formatKES(inv.outstanding_balance)}
                    </Text>
                    <Text style={styles.rowMeta}>{inv.status}</Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {tab === "payments" && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Capture Payment (PMS-071)</Text>
              <Text style={styles.label}>Lease / Unit</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {leases.map((l) => (
                  <Pressable
                    key={l.id}
                    onPress={() => setPayLeaseId(l.id)}
                    style={[
                      styles.orgPill,
                      payLeaseId === l.id && styles.orgPillActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.orgPillText,
                        payLeaseId === l.id && styles.orgPillTextActive,
                      ]}
                    >
                      {l.unit_code}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.label}>Method</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                {(["MPESA_PAYBILL", "BANK_TRANSFER", "CASH"] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setPayMethod(m)}
                    style={[styles.orgPill, payMethod === m && styles.orgPillActive]}
                  >
                    <Text
                      style={[
                        styles.orgPillText,
                        payMethod === m && styles.orgPillTextActive,
                      ]}
                    >
                      {m === "MPESA_PAYBILL" ? "M-Pesa" : m === "BANK_TRANSFER" ? "Bank" : "Cash"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Payment Reference</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. SJK89123XY"
                autoCapitalize="characters"
                value={payRef}
                onChangeText={setPayRef}
              />

              <Text style={styles.label}>Amount (KES)</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder="30000.00"
                value={payAmount}
                onChangeText={setPayAmount}
              />

              {payState === "CONFIRMED" && (
                <Text style={styles.successBox}>{payFeedback}</Text>
              )}
              {payState === "FAILED" && (
                <Text style={styles.errorBox}>{payFeedback}</Text>
              )}

              <Pressable
                style={styles.primaryBtn}
                onPress={handleSubmitPayment}
                disabled={payState === "SUBMITTING"}
              >
                <Text style={styles.primaryBtnText}>
                  {payState === "SUBMITTING" ? "Submitting..." : "Submit Payment"}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Recent Payments ({payments.length})</Text>
            {payments.map((p) => (
              <View key={p.id} style={styles.listRow}>
                <View>
                  <Text style={styles.rowTitle}>
                    {p.receipt_number || p.payment_reference}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {p.unit_code || "UNMATCHED"} • {p.payment_reference}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.moneyValue}>{formatKES(p.amount)}</Text>
                  <Text
                    style={[
                      styles.statusBadge,
                      p.status === "CONFIRMED"
                        ? styles.statusConfirmed
                        : p.status === "REVERSED" || p.status === "FAILED"
                        ? styles.statusDanger
                        : styles.statusPending,
                    ]}
                  >
                    {p.status}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        {tab === "maintenance" && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Log Maintenance Request</Text>
              <TextInput
                style={styles.input}
                placeholder="Issue title (e.g. Gate lock broken)"
                value={maintTitle}
                onChangeText={setMaintTitle}
              />
              <Pressable style={styles.primaryBtn} onPress={handleCreateMaintenance}>
                <Text style={styles.primaryBtnText}>Create Ticket</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Tickets ({maintenance.length})</Text>
            {maintenance.length === 0 ? (
              <Text style={styles.emptyText}>No maintenance tickets.</Text>
            ) : (
              maintenance.map((m) => (
                <View key={m.id} style={styles.listRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{m.title}</Text>
                    <Text style={styles.rowMeta}>
                      {m.property_name}
                      {m.unit_code ? ` • ${m.unit_code}` : ""} ({m.priority})
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleCycleMaintenance(m)}
                    style={styles.orgPill}
                  >
                    <Text style={styles.orgPillText}>{m.status}</Text>
                  </Pressable>
                </View>
              ))
            )}
          </>
        )}

        {tab === "meters" && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Log Water Meter Reading</Text>
              <Text style={styles.label}>Unit</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 8 }}
              >
                {units.map((u) => (
                  <Pressable
                    key={u.id}
                    onPress={() => setMeterUnitId(u.id)}
                    style={[styles.orgPill, meterUnitId === u.id && styles.orgPillActive]}
                  >
                    <Text
                      style={[
                        styles.orgPillText,
                        meterUnitId === u.id && styles.orgPillTextActive,
                      ]}
                    >
                      {u.unit_code}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.label}>Billing Period (YYYY-MM)</Text>
              <TextInput
                style={styles.input}
                value={meterPeriod}
                onChangeText={setMeterPeriod}
              />

              <Text style={styles.label}>Previous Reading</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder="100.00"
                value={meterPrev}
                onChangeText={setMeterPrev}
              />

              <Text style={styles.label}>Current Reading</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                placeholder="112.00"
                value={meterCurr}
                onChangeText={setMeterCurr}
              />

              <Text style={styles.label}>Rate per Unit (KES)</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={meterRate}
                onChangeText={setMeterRate}
              />

              {meterFeedback ? <Text style={styles.successBox}>{meterFeedback}</Text> : null}

              <Pressable style={styles.primaryBtn} onPress={handleSubmitMeter}>
                <Text style={styles.primaryBtnText}>Save Meter Reading</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>
              Meter Readings ({meterReadings.length})
            </Text>
            {meterReadings.map((m) => (
              <View key={m.id} style={styles.listRow}>
                <View>
                  <Text style={styles.rowTitle}>
                    {m.unit_code} • {m.charge_type} ({m.billing_period})
                  </Text>
                  <Text style={styles.rowMeta}>
                    {m.previous_reading} → {m.current_reading} ({m.units_consumed} units)
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.moneyValue}>{formatKES(m.total_amount)}</Text>
                  <Text style={styles.rowMeta}>
                    {m.billed_invoice_number || "PENDING"}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  authContainer: { flex: 1, justifyContent: "center", padding: 20 },
  header: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: { fontSize: 10, fontWeight: "600", color: "#64748B", letterSpacing: 1 },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "#0F172A" },
  logoutText: { fontSize: 12, fontWeight: "600", color: "#B91C1C" },
  orgBar: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 48,
  },
  orgPill: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
  },
  orgPillActive: { backgroundColor: "#ECFDF5", borderColor: "#0F5338" },
  orgPillText: { fontSize: 12, color: "#475569", fontWeight: "500" },
  orgPillTextActive: { color: "#0F5338", fontWeight: "600" },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  tabItem: { flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabItemActive: { borderBottomColor: "#0F5338" },
  tabText: { fontSize: 13, color: "#64748B", fontWeight: "500" },
  tabTextActive: { color: "#0F5338", fontWeight: "600" },
  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    padding: 16,
  },
  heading: { fontSize: 18, fontWeight: "600", color: "#0F172A", marginTop: 4, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: "500", color: "#475569", marginBottom: 4, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
  },
  primaryBtn: {
    backgroundColor: "#0F5338",
    borderRadius: 4,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 6,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  kpiGrid: { flexDirection: "row", gap: 8 },
  kpiCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    padding: 10,
  },
  kpiLabel: { fontSize: 11, color: "#64748B" },
  kpiValue: { fontSize: 14, fontWeight: "700", color: "#0F172A", marginTop: 4, fontVariant: ["tabular-nums"] },
  sectionTitle: { fontSize: 13, fontWeight: "600", color: "#0F172A", marginTop: 6 },
  listRow: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 6,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowTitle: { fontSize: 13, fontWeight: "600", color: "#0F172A" },
  rowMeta: { fontSize: 11, color: "#64748B", marginTop: 2 },
  moneyValue: { fontSize: 13, fontWeight: "600", color: "#0F172A", fontVariant: ["tabular-nums"] },
  emptyText: { fontSize: 12, color: "#64748B", paddingVertical: 8 },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    color: "#B91C1C",
    padding: 8,
    borderRadius: 4,
    fontSize: 12,
    marginBottom: 8,
  },
  successBox: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    color: "#047857",
    padding: 8,
    borderRadius: 4,
    fontSize: 12,
    marginBottom: 8,
  },
  statusBadge: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  statusConfirmed: { color: "#047857" },
  statusPending: { color: "#B45309" },
  statusDanger: { color: "#B91C1C" },
});
