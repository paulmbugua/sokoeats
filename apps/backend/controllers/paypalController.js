export const webhooks = async (_req, res) => res.status(200).json({ ok: true, provider: 'paypal', ignored: true });

