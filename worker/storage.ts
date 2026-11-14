import { AwsClient } from "aws4fetch";

export interface StorageConfig {
  AWS_ENDPOINT_URL_S3: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  EVIDENCE_BUCKET: string;
}
export class EvidenceStorage {
  private client: AwsClient;
  constructor(private config: StorageConfig) {
    const url = new URL(config.AWS_ENDPOINT_URL_S3);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw Error("INVALID_STORAGE_ENDPOINT");
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.EVIDENCE_BUCKET))
      throw Error("INVALID_BUCKET");
    this.client = new AwsClient({
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
      service: "s3",
      region: config.AWS_REGION,
      retries: 0,
    });
  }
  private url(key: string) {
    if (!/^evidence\/[a-f0-9-]{36}$/.test(key))
      throw Error("INVALID_OBJECT_KEY");
    return (
      this.config.AWS_ENDPOINT_URL_S3.replace(/\/$/, "") +
      "/" +
      this.config.EVIDENCE_BUCKET +
      "/" +
      key.split("/").map(encodeURIComponent).join("/")
    );
  }
  async put(
    key: string,
    data: Uint8Array,
    options: {
      httpMetadata: { contentType: string };
      customMetadata: { sha256: string };
    },
  ) {
    const response = await this.client.fetch(this.url(key), {
      method: "PUT",
      body: data as Uint8Array<ArrayBuffer>,
      headers: {
        "Content-Type": options.httpMetadata.contentType,
        "x-amz-meta-sha256": options.customMetadata.sha256,
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Error("STORAGE_PUT_FAILED");
    }
    await response.body?.cancel();
  }
  async get(key: string) {
    const response = await this.client.fetch(this.url(key));
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw Error("STORAGE_GET_FAILED");
    }
    return { body: response.body };
  }
  async head(key: string) {
    const response = await this.client.fetch(this.url(key), { method: "HEAD" });
    await response.body?.cancel();
    if (response.status === 404) return null;
    if (!response.ok) throw Error("STORAGE_HEAD_FAILED");
    return { size: Number(response.headers.get("content-length")) };
  }
  async delete(key: string) {
    const response = await this.client.fetch(this.url(key), {
      method: "DELETE",
    });
    if (!response.ok && response.status !== 404) {
      await response.body?.cancel();
      throw Error("STORAGE_DELETE_FAILED");
    }
    await response.body?.cancel();
  }
}
