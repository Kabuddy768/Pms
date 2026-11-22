"use client";

import { useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  type AttachmentItem,
  type PaginatedResponse,
} from "@/lib/api";

interface AttachmentListProps {
  entityType: AttachmentItem["entity_type"];
  entityId: string;
  canWrite: boolean;
  canDelete?: boolean;
  heading?: string;
}

export function AttachmentList({
  entityType,
  entityId,
  canWrite,
  canDelete = false,
  heading = "External Attachments (URL-Only)",
}: AttachmentListProps) {
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const res = await apiFetch<PaginatedResponse<AttachmentItem>>(
      `/attachments/?entity_type=${entityType}&entity_id=${entityId}&page_size=50`
    );
    setItems(res.results);
  }, [entityType, entityId]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<PaginatedResponse<AttachmentItem>>(
      `/attachments/?entity_type=${entityType}&entity_id=${entityId}&page_size=50`
    )
      .then((res) => {
        if (!cancelled) {
          setItems(res.results);
          setError("");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load attachments");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await apiFetch("/attachments/", {
        method: "POST",
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          title,
          file_url: fileUrl,
        }),
      });
      setTitle("");
      setFileUrl("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach URL");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError("");
    try {
      await apiFetch(`/attachments/${id}/`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete attachment");
    }
  };

  return (
    <div className="pt-4 border-t border-[#E2E8F0] space-y-3 text-xs">
      <div className="font-semibold text-[#0F172A]">{heading}</div>

      {error && (
        <div className="p-2 bg-[#FEF2F2] border border-[#FECACA] rounded text-[#B91C1C]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[#64748B]">Loading attachments...</div>
      ) : items.length === 0 ? (
        <div className="text-[#64748B]">No external file URLs attached yet.</div>
      ) : (
        <div className="border border-[#E2E8F0] rounded divide-y divide-[#E2E8F0]">
          {items.map((item) => (
            <div key={item.id} className="p-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <a
                  href={item.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#0F5338] hover:underline block truncate"
                >
                  {item.title} &rarr;
                </a>
                <div className="text-[10px] font-mono text-[#64748B] truncate">
                  {item.file_url}
                </div>
              </div>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => void handleDelete(item.id)}
                  className="px-2 py-1 text-[11px] text-[#B91C1C] border border-[#FECACA] bg-[#FEF2F2] rounded shrink-0"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <form onSubmit={handleAdd} className="space-y-2">
          <input
            type="text"
            required
            placeholder="Title (e.g. Move-in kitchen photo)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-[#CBD5E1] rounded px-2.5 py-1.5 bg-white"
          />
          <div className="flex gap-2">
            <input
              type="url"
              required
              placeholder="https://cdn.example.com/photo.jpg"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              className="flex-1 border border-[#CBD5E1] rounded px-2.5 py-1.5 font-mono bg-white"
            />
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 bg-[#0F5338] hover:bg-[#0B3F2A] text-white font-medium rounded disabled:opacity-50"
            >
              {saving ? "..." : "Attach URL"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
