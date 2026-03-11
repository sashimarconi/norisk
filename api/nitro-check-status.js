const { isKvConfigured, kvGet, kvSet } = require('./_kv');

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
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const paymentId = body.paymentId;

    if (!paymentId) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: 'paymentId is required' }));
      return;
    }

    const auth = Buffer.from(publicKey + ':' + secretKey).toString('base64');

    const upstream = await fetch('https://api.nitropagamento.app/transactions/' + encodeURIComponent(paymentId), {
      method: 'GET',
      headers: {
        Authorization: 'Basic ' + auth,
        'Content-Type': 'application/json'
      }
    });

    const data = await upstream.json();

    if (upstream.ok && data && data.success && data.data && data.data.id && isKvConfigured()) {
      try {
        const tx = data.data;
        const current = await kvGet('payment:' + tx.id);
        let currentObj = {};
        if (current) {
          try {
            currentObj = JSON.parse(current);
          } catch (e) {
            currentObj = {};
          }
        }

        const merged = {
          ...currentObj,
          id: tx.id,
          status: tx.status || currentObj.status || '',
          amount: Number(tx.amount != null ? tx.amount : currentObj.amount || 0),
          payment_method: tx.payment_method || currentObj.payment_method || 'pix',
          gateway: 'nitro',
          created_at: tx.created_at || currentObj.created_at || '',
          paid_at: tx.paid_at || currentObj.paid_at || '',
          customer: {
            name: (tx.customer && tx.customer.name) || (currentObj.customer && currentObj.customer.name) || '',
            phone: (tx.customer && tx.customer.phone) || (currentObj.customer && currentObj.customer.phone) || '',
            email: (tx.customer && tx.customer.email) || (currentObj.customer && currentObj.customer.email) || '',
            document: (tx.customer && tx.customer.document) || (currentObj.customer && currentObj.customer.document) || ''
          },
          pix_code: tx.pix_code || currentObj.pix_code || '',
          pix_qr_code: tx.pix_qr_code || currentObj.pix_qr_code || '',
          metadata: tx.metadata || currentObj.metadata || {}
        };

        await kvSet('payment:' + tx.id, JSON.stringify(merged));
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
