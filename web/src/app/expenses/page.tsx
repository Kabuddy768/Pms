"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
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
  const [categories, setCategories] = useState<ExpenseCategoryItem[]>([]);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
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

  const loadAll = async () => {
    const [expRes, catRes, propRes] = await Promise.all([
      apiFetch<PaginatedResponse<ExpenseItem>>("/expenses/?page_size=200"),
      apiFetch<PaginatedResponse<ExpenseCategoryItem>>("/expense-categories/?page_size=200"),
      apiFetch<PaginatedResponse<PropertyItem>>("/properties/?page_size=200"),
    ]);
    return {
      expenses: expRes.results,
      categories: catRes.results,
      properties: propRes.results,
    };
  };

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    loadAll()
      .then((res) => {
        if (cancelled) return;
        setExpenses(res.expenses);
        setCategories(res.categories);
        setProperties(res.properties);
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
  }, [orgId]);

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
      const res = await loadAll();
      setCategories(res.categories);
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
      const res = await loadAll();
      setExpenses(res.expenses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record expense");
    }
  };

  const handleApprove = async (id: string) => {
    setError("");
    try {
      await apiFetch(`/expenses/${id}/approve/`, { method: "POST" });
      const res = await loadAll();
      setExpenses(res.expenses);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    }
  };

  if (!orgId) {
    return <div className="text-sm text-[#475569]">Select or create an organization.</div>;
  }

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
            <label className="block text-xs font-medium text-[#475569] mb-1">Property</label>
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
            <label className="block text-xs font-medium text-[#475569] mb-1">Category</label>
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
              placeholder="Gate motor servicing"
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
              className="w-full border border-[#CBD5E1] rounded px-3 py-1.5 text-sm font-mono tabular-nums"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              required
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full border border-[#CBD5E1] rounded px-2 py-1.5 text-xs font-mono"
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-[#0F5338] hover:bg-[#0B3F2A] text-white text-xs font-medium rounded shrink-0"
            >
              Record
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="bg-white border border-[#E2E8F0] rounded-md overflow-hidden">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-medium text-[#475569]">
              <th className="py-2.5 px-4">Date</th>
              <th className="py-2.5 px-4">Property</th>
              <th className="py-2.5 px-4">Category</th>
              <th className="py-2.5 px-4">Description</th>
              <th className="py-2.5 px-4 text-right">Amount</th>
              <th className="py-2.5 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-6 px-4 text-center text-[#64748B]">
                  Loading expenses...
                </td>
              </tr>
            ) : expenses.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 px-4 text-center text-[#64748B]">
                  No expenses recorded yet.
                </td>
              </tr>
            ) : (
              expenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-[#F8FAFC]">
                  <td className="py-2.5 px-4 font-mono text-xs text-[#475569] tabular-nums">
                    {exp.expense_date}
                  </td>
                  <td className="py-2.5 px-4 font-medium text-[#0F172A]">
                    {exp.property_name}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-[#475569]">{exp.category_name}</td>
                  <td className="py-2.5 px-4 text-[#0F172A]">{exp.description}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-medium">
                    {formatKES(exp.amount)}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
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
                      {canApprove && exp.status === "RECORDED" && (
                        <button
                          type="button"
                          onClick={() => handleApprove(exp.id)}
                          className="text-xs text-[#0F5338] hover:underline font-medium"
                        >
                          Approve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
