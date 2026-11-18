import { useState, useRef, useReducer, useEffect, useCallback } from "react";
import { api, ApiError } from "./api";
import { SaveQueue, type Field } from "./save-queue";
import type { Snapshot, Period, User, Item, Kind } from "../../shared/domain";
export type { Field, Draft } from "./save-queue";
export function useFinance(user: User | null) {
  const [periods, setPeriods] = useState<(Period & { owners: string[] })[]>([]),
    [period, setPeriod] = useState(""),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(navigator.onLine);
  const current = useRef(snapshot);
  current.current = snapshot;
  const selected = useRef(period);
  selected.current = period;
  const epoch = useRef(0),
    refreshRef = useRef(async () => {});
  const [, redraw] = useReducer((n) => n + 1, 0),
    queueRef = useRef<SaveQueue | null>(null);
  function setItem(item: Item) {
    epoch.current++;
    setSnapshot((s) =>
      s
        ? {
            ...s,
            items: s.items.map((old) =>
              old.id === item.id &&
              old.row_version <= item.row_version &&
              (!old.deleted_at || Boolean(item.deleted_at))
                ? item
                : old,
            ),
          }
        : s,
    );
  }
  if (!queueRef.current)
    queueRef.current = new SaveQueue({
      send: async (draft, value) =>
        (
          await api<{ item: Item }>(`/items/${draft.itemId}`, {
            method: "PATCH",
            body: {
              field: draft.field,
              value,
              expectedVersion: draft.baseVersion,
              ...(draft.field === "amount" && value === null
                ? { confirmCancel: draft.confirmCancel === true }
                : {}),
            },
          })
        ).item,
      saved: setItem,
      notify: redraw,
      idle: () => refreshRef.current(),
      online: () => navigator.onLine,
    });
  const queue = queueRef.current;
  const refresh = useCallback(
    async (force = false) => {
      if (!user || !period || !navigator.onLine) return;
      const generation = epoch.current;
      try {
        const next = await api<Snapshot | { unchanged: true }>(
          `/periods/${period}${force ? "" : "?revision=" + current.current?.revision}`,
        );
        if (
          "unchanged" in next ||
          selected.current !== period ||
          generation !== epoch.current ||
          (current.current &&
            current.current.id === next.id &&
            current.current.revision > next.revision)
        )
          return;
        const missing =
          current.current?.id === period
            ? current.current.items.filter(
                (item) =>
                  [...queue.drafts.values()].some(
                    (d) => d.itemId === item.id,
                  ) && !next.items.some((i) => i.id === item.id),
              )
            : [];
        for (const item of missing) {
          const deleted = { ...item, deleted_at: Date.now() };
          next.items.push(deleted);
          queue.markDeleted(deleted);
        }
        setSnapshot(next);
      } catch (e) {
        setMessage((e as Error).message);
      }
    },
    [period, user?.id, queue],
  );
  refreshRef.current = () => refresh(true);
  const loadPeriods = useCallback(async () => {
    const result = await api<{ periods: (Period & { owners: string[] })[] }>(
      "/periods",
    );
    setPeriods(result.periods);
    return result.periods;
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    loadPeriods()
      .then((rows) => {
        if (active)
          setPeriod((p) =>
            rows.some((r) => r.id === p) ? p : rows[0]?.id || "",
          );
      })
      .catch((e) => setMessage(e.message))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, loadPeriods]);
  useEffect(() => {
    if (!user || !period) return;
    setLoading(true);
    void refresh(true).finally(() => setLoading(false));
  }, [refresh, user?.id]);
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (user && navigator.onLine && document.visibilityState === "visible") {
        void refresh();
        void loadPeriods()
          .then((rows) => {
            if (!selected.current && rows[0]) setPeriod(rows[0].id);
          })
          .catch((e) => setMessage(e.message));
      }
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    document.addEventListener("visibilitychange", update);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") update();
    }, 10000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh, user?.id, loadPeriods]);
  async function flush() {
    return busy ? false : queue.flush();
  }
  async function mutate<T>(
    path: string,
    method: string,
    body: unknown,
  ): Promise<T> {
    if (!(await flush()))
      throw new Error("Simpan atau perbaiki isian yang belum selesai.");
    setBusy(true);
    try {
      const result = await api<T>(path, { method, body });
      epoch.current++;
      await refresh(true);
      await loadPeriods();
      return result;
    } finally {
      setBusy(false);
    }
  }
  async function choose(id: string) {
    if (!(await flush())) {
      setMessage("Perbaiki atau simpan isian sebelum berpindah bulan.");
      return;
    }
    if (id === period) {
      await refresh(true);
      return;
    }
    setSnapshot(null);
    setPeriod(id);
  }
  async function createMonth(id: string, source?: string) {
    try {
      await mutate("/periods", "POST", {
        id,
        mode: source ? "copy" : "default",
        ...(source ? { sourcePeriodId: source } : {}),
      });
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 409) throw e;
      const existing = await api<Snapshot>(`/periods/${id}`).catch(() => null);
      if (!existing) throw e;
      setMessage(
        "Anggaran bulan ini sudah ada. Kami membukanya tanpa mengubah data.",
      );
      await loadPeriods();
    }
    if (id === period) await refresh(true);
    else {
      setSnapshot(null);
      setPeriod(id);
    }
  }
  async function addItem(
    label: string,
    kind: Kind,
    id: string,
    postingKind?: "external" | "internal" | "reserve",
  ) {
    await mutate(`/periods/${period}/items`, "POST", {
      id,
      label,
      kind,
      postingKind,
    });
  }
  async function itemForDelete(item: Item) {
    if (!(await flush()))
      throw Error("Selesaikan isian sebelum menghapus pos.");
    return queue.confirmed(item);
  }
  function clear() {
    epoch.current++;
    queue.drafts.clear();
    setSnapshot(null);
    setPeriods([]);
    setPeriod("");
    setMessage("");
    redraw();
  }
  const draftList = [...queue.drafts.entries()];
  return {
    periods,
    period,
    snapshot,
    loading,
    message,
    setMessage,
    busy,
    online,
    drafts: queue.drafts,
    draftList,
    edit: (item: Item, field: Field, value: string, confirmCancel = false) =>
      queue.edit(item, field, value, confirmCancel),
    commit: (key: string) => queue.commit(key),
    flush,
    resolve: (key: string, keep: boolean) => queue.resolve(key, keep),
    refresh,
    choose,
    createMonth,
    addItem,
    itemForDelete,
    mutate,
    clear,
    hasDrafts: draftList.length > 0,
  };
}
export type FinanceStore = ReturnType<typeof useFinance>;
