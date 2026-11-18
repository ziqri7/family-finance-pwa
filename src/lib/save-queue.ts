import { labelSchema, amountSchema, type Item } from "../../shared/domain";
export type Field = "label" | "amount";
export interface Draft {
  itemId: string;
  field: Field;
  value: string;
  baseVersion: number;
  generation: number;
  status: "dirty" | "saving" | "error" | "conflict";
  message?: string;
  current?: Item;
  confirmCancel?: boolean;
}
interface Options {
  send: (draft: Draft, value: string | number | null) => Promise<Item>;
  saved: (item: Item) => void;
  notify: () => void;
  idle: () => Promise<void>;
  online: () => boolean;
}
export class SaveQueue {
  readonly drafts = new Map<string, Draft>();
  private acknowledged = new Map<string, Item>();
  private running = new Map<string, Promise<void>>();
  constructor(private options: Options) {}
  edit(item: Item, field: Field, value: string, confirmCancel = false) {
    const key = item.id + ":" + field,
      old = this.drafts.get(key);
    this.drafts.set(key, {
      itemId: item.id,
      field,
      value,
      confirmCancel,
      baseVersion:
        old?.baseVersion ??
        item[field === "label" ? "label_version" : "amount_version"],
      generation: (old?.generation || 0) + 1,
      status: "dirty",
    });
    this.options.notify();
  }
  commit(key: string): Promise<void> {
    if (this.running.has(key)) return this.running.get(key)!;
    const promise = (async () => {
      while (this.drafts.has(key)) {
        const draft = { ...this.drafts.get(key)! };
        if (draft.status === "conflict") return;
        let value: string | number | null;
        try {
          if (draft.field === "label") value = labelSchema.parse(draft.value);
          else {
            if (draft.value.trim() !== "" && !/^\d+$/.test(draft.value))
              throw Error();
            value = amountSchema.parse(
              draft.value.trim() === "" ? null : Number(draft.value),
            );
          }
        } catch {
          this.drafts.set(key, {
            ...this.drafts.get(key)!,
            status: "error",
            message:
              draft.field === "label"
                ? "Nama pos wajib diisi, maksimal 100 karakter."
                : "Isi rupiah bulat 0–1.000.000.000.000; kosong boleh dibiarkan.",
          });
          this.options.notify();
          return;
        }
        if (!this.options.online()) {
          this.drafts.set(key, {
            ...draft,
            status: "error",
            message:
              "Koneksi terputus. Isian tetap ada selama tab ini terbuka.",
          });
          this.options.notify();
          return;
        }
        this.drafts.set(key, { ...this.drafts.get(key)!, status: "saving" });
        this.options.notify();
        try {
          const item = await this.options.send(draft, value);
          if (
            (this.acknowledged.get(item.id)?.row_version ?? 0) <
            item.row_version
          )
            this.acknowledged.set(item.id, item);
          this.options.saved(item);
          const latest = this.drafts.get(key);
          if (latest?.generation === draft.generation) this.drafts.delete(key);
          else if (latest)
            this.drafts.set(key, {
              ...latest,
              baseVersion:
                item[
                  draft.field === "label" ? "label_version" : "amount_version"
                ],
              status: "dirty",
            });
          this.options.notify();
        } catch (e) {
          const error = e as Error & { status?: number; current?: Item },
            latest = this.drafts.get(key);
          if (latest)
            this.drafts.set(key, {
              ...latest,
              status:
                error.status === 409 && error.current ? "conflict" : "error",
              message: error.message,
              current: error.current,
            });
          this.options.notify();
          return;
        }
      }
      await this.options.idle();
    })();
    this.running.set(key, promise);
    void promise.finally(() => this.running.delete(key));
    return promise;
  }
  async flush() {
    await Promise.all([...this.drafts.keys()].map((key) => this.commit(key)));
    return this.drafts.size === 0;
  }
  confirmed(item: Item) {
    const saved = this.acknowledged.get(item.id);
    return saved && saved.row_version > item.row_version ? saved : item;
  }
  resolve(key: string, keep: boolean) {
    const draft = this.drafts.get(key);
    if (!draft) return;
    if (!keep) {
      if (draft.current) this.options.saved(draft.current);
      this.drafts.delete(key);
      this.options.notify();
      void this.options.idle();
      return;
    }
    if (!draft.current || draft.current.deleted_at) return;
    this.drafts.set(key, {
      ...draft,
      baseVersion:
        draft.current[
          draft.field === "label" ? "label_version" : "amount_version"
        ],
      status: "dirty",
    });
    void this.commit(key);
  }
  markDeleted(item: Item) {
    for (const [key, draft] of this.drafts)
      if (draft.itemId === item.id) {
        this.drafts.set(key, {
          ...draft,
          status: "conflict",
          current: item,
          message:
            "Pos ini sudah dihapus di perangkat lain. Isian Anda masih terlihat dan bisa disalin.",
        });
      }
    this.options.notify();
  }
}
