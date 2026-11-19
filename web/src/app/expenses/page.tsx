"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { SlideOver } from "@/components/SlideOver";
import {
  apiFetch,
  formatKES,
  type ExpenseCategoryItem,
  type ExpenseItem,
  type PaginatedResponse,
  type PropertyItem,
} from "@/lib/api";

function ExpensesContent({
  orgId,
  role,
}: {
  orgId: string | null;
  role: string | null;
}) {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [ordering, setOrdering] = useState("-expense_date");

  const [categories, setCategories] = useState<ExpenseCategoryItem[]>([]);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [selected, setSelected] = useState<ExpenseItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newCategory, setNewCategory] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState("2026-11-14");

  const canWrite = role === "OWNER" || role === "MANAGER" || role === "ACCOUNTANT";
  const canApprove = role === "OWNER" || role === "MANAGER";

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (propertyFilter) params.set("property", propertyFilter);
    if (ordering) params.set("ordering", ordering);
    return `?${params.toString()}`;
  }, [page, search, statusFilter, propertyFilter, ordering]);

  const reloadAll = useCallback(
    async (selectId?: string) => {
      const [expRes, catRes, propRes] = await Promise.all([
        apiFetch<PaginatedResponse<ExpenseItem>>(`/expenses/${buildQuery()}`),
        apiFetch<PaginatedResponse<ExpenseCategoryItem>>(
          "/expense-categories/?page_size=200"
        ),
        apiFetch<PaginatedResponse<PropertyItem>>("/properties/?page_size=200"),
      ]);
      setExpenses(expRes.results);
      setTotalCount(expRes.count);
      setCategories(catRes.results);
      setProperties(propRes.results);
      if (selectId) {
        const updated =
          expRes.results.find((e) => e.id === selectId) ||
          (await apiFetch<ExpenseItem>(`/expenses/${selectId}/`));
        setSelected(updated);
      }
    },
    [buildQuery]
  );

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    Promise.all([
      apiFetch<PaginatedResponse<ExpenseItem>>(`/expenses/${buildQuery()}`),
      apiFetch<PaginatedResponse<ExpenseCategoryItem>>(
        "/expense-categories/?page_size=200"
      ),
      apiFetch<PaginatedResponse<PropertyItem>>("/properties/?page_size=200"),
    ])
      .then(([expRes, catRes, propRes]) => {
        if (cancelled) return;
        setExpenses(expRes.results);
        setTotalCount(expRes.count);
        setCategories(catRes.results);
        setProperties(propRes.results);
        setError("");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load expenses");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, buildQuery]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    setError("");
    try {
      const cat = await apiFetch<ExpenseCategoryItem>("/expense-categories/", {
        method: "POST",
        body: JSON.stringify({ name: newCategory.trim() }),
      });
      setNewCategory("");
      await reloadAll();
      setCategoryId(cat.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add category");
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await apiFetch("/expenses/", {
        method: "POST",
        body: JSON.stringify({
          property: propertyId,
          category: categoryId,
          description,
          amount,
          expense_date: expenseDate,
        }),
      });
      setDescription("");
      setAmount("");
      await reloadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record expense");
    }
  };

  const handleApprove = async (id: string) => {
    setError("");
    try {
      await apiFetch(`/expenses/${id}/approve/`, { method: "POST" });
      await reloadAll(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    }
  };

  const handleVoid = async (id: string) => {
    setError("");
    try {
      await apiFetch(`/expenses/${id}/void/`, { method: "POST" });
      await reloadAll(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Void failed");
    }
  };

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

  const columns: DataTableColumn<ExpenseItem>[] = [
    {
      key: "expense_date",
      header: "Date",
      sortField: "expense_date",
      render: (exp) => (
        <span className="font-mono text-xs text-[#64748B] tabular-nums">
          {exp.expense_date}
        </span>
      ),
      csvValue: (exp) => exp.expense_date,
    },
    {
      key: "property_name",
      header: "Property",
      render: (exp) => <span className="font-medium">{exp.property_name}</span>,
      csvValue: (exp) => exp.property_name,
    },
    {
      key: "category_name",
      header: "Category",
      render: (exp) => (
        <span className="text-xs text-[#475569]">{exp.category_name}</span>
      ),
      csvValue: (exp) => exp.category_name,
    },
    {
      key: "description",
      header: "Description",
      render: (exp) => <span className="text-[#0F172A]">{exp.description}</span>,
      csvValue: (exp) => exp.description,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortField: "amount",
      render: (exp) => (
        <span className="font-mono tabular-nums">{formatKES(exp.amount)}</span>
      ),
      csvValue: (exp) => exp.amount,
    },
    {
      key: "status",
      header: "Status",
      sortField: "status",
      render: (exp) => (
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded border ${
            exp.status === "APPROVED"
              ? "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]"
              : exp.status === "VOID"
              ? "bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]"
              : "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]"
          }`}
        >
          {exp.status}
        </span>
      ),
      csvValue: (exp) => exp.status,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] pb-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-[#64748B]">
            Operations
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-[#0F172A]">Expenses</h1>
        </div>

        {canWrite && (
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="New category (e.g. Plumbing)"
              className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs bg-white"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-medium border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] rounded"
            >
              + Category
            </button>
          </form>
        )}
      </div>

      {canWrite && (
        <form
          onSubmit={handleCreateExpense}
          className="bg-white border border-[#E2E8F0] rounded-md p-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Property
            </label>
            <select
              required
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Select property...</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Category
            </label>
            <select
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm bg-white"
            >
              <option value="">Select category...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Description
            </label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Water pump replacement"
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#475569] mb-1">
              Amount (KES)
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="8500.00"
              className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 text-sm font-mono bg-white"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              required
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="flex-1 border border-[#CBD5E1] rounded px-2 py-1.5 text-xs font-mono bg-white"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-sm font-medium rounded"
            >
              Add
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={expenses}
        rowKey={(exp) => exp.id}
        totalCount={totalCount}
        page={page}
        onPageChange={(next) => setPage(next)}
        searchPlaceholder="Search description, property, category..."
        onSearchChange={(val) => {
          setPage(1);
          setSearch(val);
        }}
        ordering={ordering}
        onOrderingChange={(next) => {
          setPage(1);
          setOrdering(next);
        }}
        filters={
          <>
            <select
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value);
              }}
              className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs bg-white"
            >
              <option value="">All Statuses</option>
              <option value="RECORDED">Recorded</option>
              <option value="APPROVED">Approved</option>
              <option value="VOID">Void</option>
            </select>
            <select
              value={propertyFilter}
              onChange={(e) => {
                setPage(1);
                setPropertyFilter(e.target.value);
              }}
              className="border border-[#CBD5E1] rounded px-2.5 py-1.5 text-xs bg-white"
            >
              <option value="">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        }
        csvFilename="expenses.csv"
        loading={loading}
        emptyMessage="No expenses match your filters."
        onRowClick={(exp) => setSelected(exp)}
        selectedRowKey={selected?.id || null}
      />

      <SlideOver
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.description || "Expense Detail"}
        subtitle={
          selected ? `${selected.property_name} · ${selected.category_name}` : ""
        }
      >
        {selected && (
          <div className="space-y-4 text-xs">
            <div className="border border-[#E2E8F0] rounded p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#64748B]">Amount</span>
                <span className="font-mono font-semibold tabular-nums text-sm">
                  {formatKES(selected.amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Date</span>
                <span className="font-mono tabular-nums">{selected.expense_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Status</span>
                <span className="font-mono">{selected.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Recorded by</span>
                <span>{selected.recorded_by_email || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Approved by</span>
                <span>{selected.approved_by_email || "Pending approval"}</span>
              </div>
            </div>

            {canApprove && selected.status !== "VOID" && (
              <div className="flex gap-2">
                {selected.status === "RECORDED" && (
                  <button
                    type="button"
                    onClick={() => handleApprove(selected.id)}
                    className="flex-1 py-2 bg-[#0F5338] hover:bg-[#0B3F2A] text-white font-medium rounded"
                  >
                    Approve Expense
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleVoid(selected.id)}
                  className="flex-1 py-2 border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C] font-medium rounded"
                >
                  Void Expense
                </button>
              </div>
            )}
          </div>
        )}
      </SlideOver>
    </div>
  );
}

export default function ExpensesPage() {
  return (
    <AppShell>
      {({ activeMembership }) => (
        <ExpensesContent
          orgId={activeMembership?.organization_id || null}
          role={activeMembership?.role || null}
        />
      )}
    </AppShell>
  );
}
