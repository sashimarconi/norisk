const { isKvConfigured, kvSet, kvSadd } = require('./_kv');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
    return;
  }

  const publicKey = process.env.NITRO_PUBLIC_KEY;
  const secretKey = process.env.NITRO_SECRET_KEY;

  if (!publicKey || !secretKey) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Nitro credentials not configured on server' }));
    return;
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const auth = Buffer.from(publicKey + ':' + secretKey).toString('base64');

    const upstream = await fetch('https://api.nitropagamento.app', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + auth,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await upstream.json();

    if (upstream.ok && data && data.success && data.data && data.data.id && isKvConfigured()) {
      try {
        const tx = data.data;
        const customer = tx.customer || payload.customer || {};
        const record = {
          id: tx.id,
          status: tx.status || 'pendente',
          amount: Number(tx.amount != null ? tx.amount : payload.amount || 0),
          payment_method: tx.payment_method || payload.payment_method || 'pix',
          gateway: 'nitro',
          created_at: tx.created_at || new Date().toISOString(),
          paid_at: tx.paid_at || '',
          customer: {
            name: customer.name || '',
            phone: customer.phone || '',
            email: customer.email || '',
            document: customer.document || ''
          },
          pix_code: tx.pix_code || '',
          pix_qr_code: tx.pix_qr_code || '',
          metadata: tx.metadata || payload.metadata || {}
        };

        await kvSet('payment:' + tx.id, JSON.stringify(record));
        await kvSadd('payments:ids', tx.id);
      } catch (e) {
        // non-blocking log persistence
      }
    }

    res.statusCode = upstream.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: error.message || 'Internal server error' }));
  }
};
