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
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: error.message || 'Internal server error' }));
  }
};
