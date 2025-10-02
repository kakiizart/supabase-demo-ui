// src/main.js
import { supabase } from "../lib/supabaseBrowserClient.js";

/** ---------- tiny DOM helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const logEl = $("#log");
const fileListEl = $("#fileList");

function log(msg, obj) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent += `[${time}] ${msg}\n`;
  if (obj) logEl.textContent += `${JSON.stringify(obj, null, 2)}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function getBucketName() {
  const name = $("#bucketName").value.trim();
  if (!name) throw new Error("Please enter a bucket name first.");
  return name.toLowerCase();
}

/** ---------- Bucket creation via your server API (service_role) ---------- */
/*  IMPORTANT: creating buckets is an admin action; it will NOT work with the
    anon key in the browser. We call your Express endpoint instead. */
async function ensureBucket(bucket) {
  const resp = await fetch("/api/create-bucket", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: bucket, isPublic: false }),
  });
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(j.error || `Failed to create bucket "${bucket}"`);
  }
  return j;
}

/** ---------- Supabase Storage helpers (browser, anon key) ---------- */
async function listFiles(bucket) {
  const { data, error } = await supabase.storage.from(bucket).list("", {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;
  return data || [];
}

async function uploadFile(bucket, file) {
  const path = file.name; // store at bucket root, same filename
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { cacheControl: "3600", upsert: true });
  if (error) throw error;
  return data;
}

async function downloadFile(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  return data; // Blob
}

/** ---------- UI events ---------- */
$("#btnCreateBucket").addEventListener("click", async () => {
  try {
    const bucket = getBucketName();
    await ensureBucket(bucket); // <-- server API call
    log(`Bucket ready: ${bucket}`);
  } catch (err) {
    log(`Create bucket failed: ${err.message}`);
  }
});

$("#btnUpload").addEventListener("click", async () => {
  try {
    const bucket = getBucketName();
    const file = $("#fileInput").files?.[0];
    if (!file) throw new Error("Pick a file first.");

    // Make sure the bucket exists (server-side) before uploading (client-side)
    await ensureBucket(bucket);
    const res = await uploadFile(bucket, file);
    log(`Uploaded ${file.name} → ${bucket}`, res);
  } catch (err) {
    log(`Upload failed: ${err.message}`);
  }
});

$("#btnList").addEventListener("click", async () => {
  try {
    const bucket = getBucketName();
    const entries = await listFiles(bucket);
    renderFileList(bucket, entries);
    log(`Listed ${entries.length} file(s) in ${bucket}`);
  } catch (err) {
    renderFileList(null, []);
    log(`List failed: ${err.message}`);
  }
});

/** ---------- render & download ---------- */
function renderFileList(bucket, entries) {
  fileListEl.innerHTML = "";
  if (!bucket || !entries?.length) {
    fileListEl.innerHTML = `<li><em>No files</em></li>`;
    return;
  }
  for (const item of entries) {
    const li = document.createElement("li");

    const left = document.createElement("div");
    left.innerHTML = `<code>${item.name}</code>`;

    const right = document.createElement("div");
    const btn = document.createElement("button");
    btn.textContent = "Download";
    btn.className = "small";
    btn.addEventListener("click", async () => {
      try {
        const blob = await downloadFile(bucket, item.name);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = item.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        log(`Downloaded ${item.name}`);
      } catch (err) {
        log(`Download failed: ${err.message}`);
      }
    });

    right.appendChild(btn);
    li.appendChild(left);
    li.appendChild(right);
    fileListEl.appendChild(li);
  }
}
