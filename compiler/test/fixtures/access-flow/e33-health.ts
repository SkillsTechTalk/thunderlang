// expect: none (reads no stored record)
import express from 'express';
const app = express();
app.get('/e33/health', (req, res) => {
  res.json({ ok: true, at: Date.now() });
});
