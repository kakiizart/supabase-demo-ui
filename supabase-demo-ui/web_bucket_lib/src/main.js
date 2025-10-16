// src/main.js
// 1) Use your existing browser client (anon) for public operations (download/getURL, simple list).
// 2) ALSO spin up an "admin" client using the SERVICE ROLE KEY *exposed via Vite* for bucket admin & uploads.
//    DANGER: Only do this for a controlled lab. Do NOT ship to production like this.

import { supabase as anonClient } from "../lib/supabaseBrowserClient.js";
import { createClient } from "@supabase/supabase-js";

/** -------------------- ENV & Clients -------------------- */
// Expect these in .env (for Vite):
// VITE_SUPABASE_URL=<https://XXXX.supabase.co or your custom domain>
// VITE_SUPABASE_ANON_KEY=<anon key>
// VITE_SUPABASE_SERVICE_ROLE_KEY=<service role key>  <-- expose ONLY in this lab
// Optional (for Studio deep-link):
// VITE_SUPABASE_STUDIO_URL=<https://app.supabase.com or your Studio domain>
// VITE_SUPABASE_PROJECT_REF=<project ref id>

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY =
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  import.meta.env.VITE_SERVICE_ROLE_KEY ||
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY; // fallbacks if you renamed

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY in .env (required for admin ops & uploads)."
    // eslint-disable-next-line no-console
  );
}

// Admin client (uses service role). Again: lab-only.
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** -------------------- Tiny DOM helpers -------------------- */
const $ = (sel) => document.querySelector(sel);
const logEl = $("#log");
const statusEl = $("#status");
const studioLinkEl = $("#studioLink");
const bucketSelect = $("#bucketSelect");
const dropZone = $("#dropZone");
const fileInput = $("#fileInput");
const galleryEl = $("#gallery");
const emptyEl = $("#emptyState");
const galleryCountEl = $("#galleryCount");
const lightbox = $("#lightbox");
const lightboxImg = $("#lightboxImg");
const lightboxCaption = $("#lightboxCaption");
const lightboxClose = $("#lightboxClose");

function log(msg, obj) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent += `[${time}] ${msg}\n`;
  if (obj) logEl.textContent += `${JSON.stringify(obj, null, 2)}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}
function setStatus(kind, text) {
  statusEl.className = `status ${kind}`;
  statusEl.textContent = text || "";
}
function computeStudioBucketUrl(bucket) {
  const studioBase =
    import.meta.env.VITE_SUPABASE_STUDIO_URL || import.meta.env.VITE_SUPABASE_URL || "";
  const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_REF || "";
  // If we have a project ref, deep-link to Storage → Buckets → bucket
  if (studioBase && projectRef) {
    return `${studioBase.replace(/\/$/, "")}/project/${projectRef}/storage/buckets/${encodeURIComponent(
      bucket
    )}`;
  }
  // Fallback: just link to the Studio base (user can navigate to Storage)
  return studioBase || "#";
}
function setStudioLink(bucket, reason = "View in Supabase Studio") {
  const href = computeStudioBucketUrl(bucket);
  if (!href || href === "#") {
    studioLinkEl.innerHTML = "";
    return;
  }
  studioLinkEl.innerHTML = `<a href="${href}" target="_blank" rel="noopener noreferrer">🔗 <span style="color:#f7d36b">${reason}: <code>${bucket}</code></span></a>`;
}

/** -------------------- Buckets -------------------- */
async function listBuckets() {
  const { data, error } = await adminClient.storage.listBuckets();
  if (error) throw error;
  return data || [];
}

async function createBucket(name) {
  const { error } = await adminClient.storage.createBucket(name, {
    public: false,
    fileSizeLimit: "50MB",
  });
  // ignore "already exists"
  if (error && !/already exists/i.test(error.message)) throw error;
}

function populateBucketDropdown(buckets, defaultName = "") {
  bucketSelect.innerHTML = "";
  for (const b of buckets.sort((a, b) => a.name.localeCompare(b.name))) {
    const opt = document.createElement("option");
    opt.value = b.name;
    opt.textContent = b.name;
    bucketSelect.appendChild(opt);
  }
  if (defaultName && [...bucketSelect.options].some(o => o.value === defaultName)) {
    bucketSelect.value = defaultName;
  }
}

/** -------------------- Uploads (images) -------------------- */
const IMAGE_TYPES = ["image/png","image/jpeg","image/jpg","image/gif","image/webp"];
function isImage(file) {
  return IMAGE_TYPES.includes(file.type);
}

async function uploadFiles(bucket, files) {
  if (!bucket) throw new Error("Pick a bucket first.");
  if (!files?.length) throw new Error("Pick or drop at least one image.");

  const results = [];
  for (const file of files) {
    if (!isImage(file)) {
      results.push({ file, error: new Error(`Skipping non-image: ${file.name}`) });
      continue;
    }

    // store at root; avoid collisions by prefixing timestamp
    const key = `${Date.now()}-${file.name}`.replace(/\s+/g, "_");
    const { data, error } = await adminClient.storage.from(bucket).upload(key, file, {
      cacheControl: "3600",
      upsert: false,
    });
    results.push({ file, data, error });
  }
  return results;
}

/** -------------------- Listing & Gallery -------------------- */
async function listBucketObjects(bucket) {
  const { data, error } = await adminClient.storage.from(bucket).list("", {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;
  return (data || []).filter((e) => !e.name.endsWith("/")); // exclude folders
}
async function getPublicURL(bucket, path) {
  // Use anon client to generate a signed URL-ish path via storage URL builder
  // If bucket is private, adminClient can create a signed URL. Prefer that:
  const { data, error } = await adminClient.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (!error && data?.signedUrl) return data.signedUrl;

  // fallback (if bucket is public):
  const { data: pub } = anonClient.storage.from(bucket).getPublicUrl(path);
  return pub?.publicUrl || "";
}

async function renderGallery(bucket) {
  galleryEl.innerHTML = "";
  emptyEl.style.display = "none";
  galleryCountEl.textContent = "";

  if (!bucket) {
    emptyEl.textContent = "Select a bucket, then click “Load gallery”.";
    emptyEl.style.display = "block";
    return;
  }

  const objects = await listBucketObjects(bucket);
  galleryCountEl.textContent = `${objects.length} file(s)`;

  if (!objects.length) {
    emptyEl.textContent = "No images in this bucket yet.";
    emptyEl.style.display = "block";
    return;
  }

  for (const obj of objects) {
    const url = await getPublicURL(bucket, obj.name);
    const div = document.createElement("div");
    div.className = "thumb";
    const img = document.createElement("img");
    img.src = url;
    img.alt = obj.name;
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("click", () => openLightbox(url, obj.name));
    const cap = document.createElement("div");
    cap.className = "cap";
    cap.textContent = obj.name;
    div.appendChild(img);
    div.appendChild(cap);
    galleryEl.appendChild(div);
  }

  // yellow link to Studio for this bucket
  setStudioLink(bucket, "Open bucket in Studio");
}

/** -------------------- Lightbox -------------------- */
function openLightbox(src, caption) {
  lightboxImg.src = src;
  lightboxCaption.textContent = caption || "";
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
}
function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImg.src = "";
  lightboxCaption.textContent = "";
}
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});
lightboxClose.addEventListener("click", closeLightbox);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});

/** -------------------- Drop Zone -------------------- */
let pickedFiles = []; // what the user chose or dropped (staged for upload)

function setDragOver(on) {
  dropZone.classList.toggle("drag-over", !!on);
}
["dragenter", "dragover"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (ev === "drop") {
      const files = [...(e.dataTransfer?.files || [])];
      pickedFiles = files;
      setStatus("info", `${files.length} file(s) staged for upload`);
      log(`Staged ${files.length} file(s) from drop`);
    }
    setDragOver(false);
  })
);

// File picker
$("#btnPickFiles").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  pickedFiles = [...fileInput.files];
  setStatus("info", `${pickedFiles.length} file(s) staged for upload`);
  log(`Staged ${pickedFiles.length} file(s) from picker`);
});

/** -------------------- UI: Buttons -------------------- */
$("#btnCreateBucket").addEventListener("click", async () => {
  try {
    const name = $("#bucketName").value.trim().toLowerCase();
    if (!name) throw new Error("Enter a bucket name first.");
    await createBucket(name);
    setStatus("success", `Bucket ready: ${name}`);
    log(`Bucket ready: ${name}`);

    // Refresh bucket list & select the newly created one by default
    const buckets = await listBuckets();
    populateBucketDropdown(buckets, name);
  } catch (err) {
    setStatus("error", err.message);
    log(`Create bucket failed`, err);
  }
});

$("#btnRefreshBuckets").addEventListener("click", async () => {
  try {
    const buckets = await listBuckets();
    populateBucketDropdown(buckets);
    setStatus("info", `Found ${buckets.length} buckets`);
  } catch (err) {
    setStatus("error", `List buckets failed: ${err.message}`);
    log(`List buckets failed`, err);
  }
});

$("#btnUpload").addEventListener("click", async () => {
  try {
    const bucket = bucketSelect.value;
    if (!bucket) throw new Error("Pick a bucket first.");
    if (!pickedFiles.length) throw new Error("Choose or drop one or more images.");

    setStatus("info", "Uploading…");
    const results = await uploadFiles(bucket, pickedFiles);

    const ok = results.filter(r => !r.error);
    const bad = results.filter(r => r.error);

    if (ok.length) {
      setStatus("success", `Uploaded ${ok.length} file(s) to ${bucket}`);
      setStudioLink(bucket, "Open bucket in Studio");
    } else {
      setStatus("error", `Nothing uploaded. ${bad.length} file(s) skipped/failed.`);
    }

    for (const r of results) {
      if (r.error) log(`Upload failed: ${r.file?.name}`, r.error);
      else log(`Uploaded ${r.file?.name} → ${bucket}`, r.data);
    }
  } catch (err) {
    setStatus("error", `Upload failed: ${err.message}`);
    log(`Upload failed`, err);
  }
});

$("#btnLoadGallery").addEventListener("click", async () => {
  try {
    const bucket = bucketSelect.value;
    if (!bucket) throw new Error("Pick a bucket first.");
    setStatus("info", `Loading gallery for ${bucket}…`);
    await renderGallery(bucket);
    setStatus("success", `Gallery loaded for ${bucket}`);
    setStudioLink(bucket, "Open bucket in Studio");
  } catch (err) {
    setStatus("error", `Load gallery failed: ${err.message}`);
    log(`Load gallery failed`, err);
  }
});

/** -------------------- Boot -------------------- */
(async function boot() {
  try {
    const buckets = await listBuckets();
    populateBucketDropdown(buckets);
    setStatus("info", `Buckets loaded (${buckets.length})`);
  } catch (err) {
    setStatus("warning", "Could not load buckets (check Service Role env).");
    log("Initial bucket load failed", err);
  }
})();
