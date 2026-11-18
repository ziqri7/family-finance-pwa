let onExpired = () => {};
export const setExpiredHandler = (handler: () => void) => {
  onExpired = handler;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public current?: unknown,
  ) {
    super(message);
  }
}
function errorData(value: unknown) {
  const data =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {},
    error =
      data.error && typeof data.error === "object"
        ? (data.error as Record<string, unknown>)
        : {};
  return {
    code: typeof error.code === "string" ? error.code : "REQUEST_FAILED",
    message:
      typeof error.message === "string"
        ? error.message
        : "Belum berhasil. Silakan coba lagi.",
    current: data.current,
  };
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      method: options.method || "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "X-Financee-Client": "3",
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch {
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Koneksi terputus. Penyimpanan belum terkonfirmasi. Coba lagi setelah tersambung.",
    );
  }
  const data = await response.json().catch(() => ({
    error: {
      code: "INVALID_RESPONSE",
      message: "Ada kendala saat menerima jawaban. Silakan coba lagi.",
    },
  }));
  if (!response.ok) {
    if (response.status === 401 && path !== "/login") onExpired();
    const error = errorData(data);
    throw new ApiError(
      response.status,
      error.code,
      error.message,
      error.current,
    );
  }
  return data as T;
}
export async function upload(
  id: string,
  file: File,
  collection:
    | "attachments"
    | "income-attachments"
    | "allocation-attachments"
    | "usage-attachments"
    | "group-attachments" = "attachments",
) {
  let response: Response;
  try {
    response = await fetch(`/api/${collection}/${id}/content`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": file.type, "X-Financee-Client": "3" },
      body: file,
    });
  } catch {
    throw new ApiError(
      0,
      "UPLOAD_FAILED",
      "Koneksi terputus saat mengunggah gambar.",
    );
  }
  if (response.status === 401) onExpired();
  if (!response.ok) {
    const error = errorData(await response.json());
    throw new ApiError(response.status, error.code, error.message);
  }
}
