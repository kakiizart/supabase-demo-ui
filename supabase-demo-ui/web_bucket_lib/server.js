// server.js
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,                 // server env var (no VITE_)
  process.env.SUPABASE_SERVICE_ROLE_KEY     // server env var (KEEP SECRET)
);

app.post("/api/create-bucket", async (req, res) => {
  try {
    const { name, isPublic = false } = req.body || {};
    if (!name) return res.status(400).json({ error: "Bucket name required" });
    const { error } = await supabase.storage.createBucket(name, {
      public: isPublic,
      fileSizeLimit: "50MB",
    });
    if (error && !/already exists/i.test(error.message)) {
      return res.status(400).json({ error: error.message });
    }
    res.json({ ok: true, bucket: name });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
