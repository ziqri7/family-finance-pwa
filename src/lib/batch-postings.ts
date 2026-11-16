import type { Item } from "../../shared/domain";
import type { PostingKind } from "../../shared/ledger";
export interface PostingReview {
  item: Item;
  relatedTotal: number;
  relatedCount: number;
  relatedEvidenceCount: number;
  expectedRevision: number;
  expenses: unknown[];
  transfers: unknown[];
}
export interface BatchChoice {
  review: PostingReview;
  amount: number;
  kind: PostingKind;
}
export interface BatchResult {
  id: string;
  status: "done" | "changed" | "failed";
  message?: string;
}
type Client = <T>(
  path: string,
  options?: { method?: string; body?: unknown; signal?: AbortSignal },
) => Promise<T>;
const fingerprint = (r: PostingReview) =>
  JSON.stringify([
    r.item.row_version,
    r.relatedEvidenceCount,
    r.expenses,
    r.transfers,
  ]);
export async function submitPostings(
  choices: BatchChoice[],
  client: Client,
  signal: AbortSignal,
  onResult: (result: BatchResult) => void,
) {
  const results: BatchResult[] = [];
  for (const choice of choices) {
    if (signal.aborted) break;
    const original = choice.review.item,
      id = original.id;
    let result: BatchResult;
    try {
      if (
        !Number.isSafeInteger(choice.amount) ||
        choice.amount < 0 ||
        choice.amount > 1e12
      )
        throw Error("Nominal tidak valid.");
      const fresh = await client<PostingReview>("/items/" + id + "/posting", {
        signal,
      });
      if (fresh.item.recording_mode === "actual") {
        result =
          fresh.item.amount === choice.amount &&
          fresh.item.posting_kind === choice.kind &&
          fresh.item.posting_date === (original.posting_date ?? null)
            ? { id, status: "done" }
            : {
                id,
                status: "changed",
                message:
                  "Pos sudah berubah. Periksa rincian pos sebelum melanjutkan.",
              };
      } else if (fingerprint(fresh) !== fingerprint(choice.review))
        result = {
          id,
          status: "changed",
          message: "Pos atau catatan terkait berubah. Periksa ulang pos ini.",
        };
      else {
        await client("/items/" + id + "/posting", {
          method: "PATCH",
          signal,
          body: {
            expectedVersion: fresh.item.row_version,
            expectedRevision: fresh.expectedRevision,
            postingKind: choice.kind,
            date: original.posting_date ?? null,
            amount: choice.amount,
            confirmed: true,
          },
        });
        result = { id, status: "done" };
      }
    } catch (e) {
      result = { id, status: "failed", message: (e as Error).message };
      const status = (e as { status?: number }).status;
      if (status === 0 || status === 401 || status === 403 || signal.aborted) {
        results.push(result);
        onResult(result);
        break;
      }
    }
    results.push(result);
    onResult(result);
  }
  return results;
}
