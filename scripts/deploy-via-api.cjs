/**
 * Deploy order-pdf edge function via Supabase Management API (multipart).
 * Reads mcp-deploy-args.json — all 5 source files with full content.
 */
const fs = require('fs');
const path = require('path');

const PROJECT_REF = 'wufvmxalvnouyddrjmyb';
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN is not set');
  process.exit(1);
}

const args = require('../mcp-deploy-args.json');
const metadata = {
  name: args.name,
  entrypoint_path: args.entrypoint_path,
  verify_jwt: args.verify_jwt,
};

const form = new FormData();
form.append(
  'metadata',
  new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
);
for (const file of args.files) {
  form.append(
    'file',
    new Blob([file.content], { type: 'application/typescript' }),
    file.name,
  );
}

const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${args.name}`;

fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
})
  .then(async (res) => {
    const text = await res.text();
    if (!res.ok) {
      console.error('Deploy failed', res.status, text);
      process.exit(1);
    }
    console.log(text);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
