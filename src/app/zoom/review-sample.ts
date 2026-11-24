// A small change for "Review a change in Thunder" on /zoom: an admin job that gains a secret check, and a late fee
// whose limit moves. Plain code a reader can recognize; the review shown is computed from it by the compiler.
export const REVIEW_BEFORE = [
  {
    path: "server.ts",
    source: `// Weekly synthetic-transcript supply for the human calibration bench.
app.post('/api/admin/cron-generate-calibration-transcripts', async (req: Request, res: Response) => {
  try {
    const { generateWeeklyTranscripts } = await import('./lib/calibration/generate-transcripts')
    const force = req.query.force === '1' || req.query.force === 'true'
    const result = await generateWeeklyTranscripts({ force })
    res.json({ success: true, data: result })
  } catch (e: any) {
    console.error('cron-generate-calibration-transcripts failed:', e?.message ?? e)
    res.status(500).json({ success: false, error: 'transcript generation failed' })
  }
})
`,
  },
  {
    path: "fees.py",
    source: `def late_fee(days_late: int) -> str:
    """Small fines for late books."""
    if days_late <= 0:
        return "NoFee"
    if days_late <= 7:
        return "SmallFee"
    return "BigFee"
`,
  },
  {
    path: "cart.ts",
    source: `export function subtotal(items: Item[]) {
  let sum = 0
  for (const item of items) sum += item.price * item.quantity
  return sum
}
`,
  },
];

export const REVIEW_AFTER = [
  {
    path: "server.ts",
    source: REVIEW_BEFORE[0].source.replace(
      "async (req: Request, res: Response) => {\n",
      "async (req: Request, res: Response) => {\n  if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {\n    res.status(403).json({ success: false, error: 'forbidden' })\n    return\n  }\n",
    ),
  },
  {
    path: "fees.py",
    // The limit moves from 7 to 10, and a comment is added: only the first changes what it does.
    source: REVIEW_BEFORE[1].source.replace("days_late <= 7:", "days_late <= 10:  # a little more time"),
  },
  {
    path: "cart.ts",
    // Only the form: a local name changes, and a comment is added.
    source: `export function subtotal(items: Item[]) {
  // Price times quantity, added up.
  let total = 0
  for (const item of items) total += item.price * item.quantity
  return total
}
`,
  },
];
