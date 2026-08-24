import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT ?? "http://127.0.0.1:8333";
const bucket = process.env.S3_BUCKET ?? "neraca-docs";
const s3 = new S3Client({
  endpoint, region: "us-east-1", forcePathStyle: true,
  credentials: { accessKeyId: "demo", secretAccessKey: "demo" },
});

for (let i = 0; i < 10; i++) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`bucket ${bucket} exists`);
    process.exit(0);
  } catch (e) {
    if (String(e).includes("404") || String(e).includes("NotFound")) break;
    await new Promise((r) => setTimeout(r, 1500)); // s3 gateway warming up
  }
}
await s3.send(new CreateBucketCommand({ Bucket: bucket }));
console.log(`bucket ${bucket} created at ${endpoint}`);
