import { ENV } from "./_core/env";
import { withProviderTelemetry } from "./services/providerTelemetry";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as getAwsSignedUrl } from "@aws-sdk/s3-request-presigner";

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY",
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function getS3Config() {
  if (
    !ENV.s3Bucket ||
    !ENV.s3AccessKeyId ||
    !ENV.s3SecretAccessKey ||
    !ENV.s3Endpoint
  ) {
    throw new Error(
      "S3 config missing: set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY"
    );
  }
  return {
    endpoint: ENV.s3Endpoint,
    bucket: ENV.s3Bucket,
    region: ENV.s3Region,
    accessKeyId: ENV.s3AccessKeyId,
    secretAccessKey: ENV.s3SecretAccessKey,
  };
}

let _s3Client: S3Client | null = null;
function getS3Client() {
  if (_s3Client) return _s3Client;
  const cfg = getS3Config();
  _s3Client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  return _s3Client;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

async function forgePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));

  // 1. Get presigned PUT URL from Forge
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  // 2. PUT file directly to S3
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: `/manus-storage/${key}` };
}

async function s3Put(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const cfg = getS3Config();
  const client = getS3Client();
  const key = appendHashSuffix(normalizeKey(relKey));
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);

  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return {
    key,
    url: `/manus-storage/${key}`,
  };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

async function forgeGetSignedUrl(relKey: string): Promise<string> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);

  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}

async function s3GetSignedUrl(relKey: string): Promise<string> {
  const cfg = getS3Config();
  const client = getS3Client();
  const key = normalizeKey(relKey);
  const signed = await getAwsSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
    }),
    { expiresIn: 3600 }
  );
  return signed;
}

async function verifyKeyReadableInS3(key: string) {
  const cfg = getS3Config();
  const client = getS3Client();
  await client.send(
    new HeadObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
    })
  );
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const provider = ENV.storageProvider.toLowerCase();
  return withProviderTelemetry(
    "storage",
    provider,
    "put",
    { relKey },
    async () => {
      const preferred = provider === "s3" || provider === "r2" ? "s3" : "forge";
      const primary =
        preferred === "s3"
          ? await s3Put(relKey, data, contentType)
          : await forgePut(relKey, data, contentType);

      if (ENV.storageDualWrite) {
        try {
          if (preferred === "s3") {
            await forgePut(relKey, data, contentType);
          } else {
            await s3Put(relKey, data, contentType);
          }
        } catch (error) {
          console.warn("[Storage] dual write failed:", error);
        }
      }

      return primary;
    }
  );
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const provider = ENV.storageProvider.toLowerCase();
  return withProviderTelemetry(
    "storage",
    provider,
    "presign_get",
    { relKey },
    async () => {
      const preferred = provider === "s3" || provider === "r2" ? "s3" : "forge";
      if (preferred === "s3") {
        if (ENV.storageDualReadVerify) {
          try {
            await verifyKeyReadableInS3(relKey);
          } catch (error) {
            console.warn("[Storage] dual read verification failed:", error);
          }
        }
        return s3GetSignedUrl(relKey);
      }
      return forgeGetSignedUrl(relKey);
    }
  );
}
