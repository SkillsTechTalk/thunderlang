// Weekly synthetic-transcript supply for the human calibration bench.
app.post('/api/admin/cron-generate-calibration-transcripts', async (req: Request, res: Response) => {
  if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
    res.status(403).json({ success: false, error: 'forbidden' })
    return
  }
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
