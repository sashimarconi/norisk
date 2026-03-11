module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
    return;
  }

  const adminToken = process.env.ADMIN_PANEL_TOKEN || '';
  const providedToken = req.headers['x-admin-token'] || '';

  if (adminToken && providedToken !== adminToken) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
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
    const url = new URL(req.url, 'http://localhost');
    const rawStatus = (url.searchParams.get('status') || 'both').toLowerCase();
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 20)));

    const nitroStatus = rawStatus === 'paid'
      ? 'pago'
      : rawStatus === 'pending'
        ? 'pendente'
        : '';

    const auth = Buffer.from(publicKey + ':' + secretKey).toString('base64');

    const listUrl = new URL('https://api.nitropagamento.app/transactions');
    listUrl.searchParams.set('page', String(page));
    listUrl.searchParams.set('limit', String(limit));
    if (nitroStatus) {
      listUrl.searchParams.set('status', nitroStatus);
    }

    const listResp = await fetch(listUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: 'Basic ' + auth,
        'Content-Type': 'application/json'
      }
    });

    const listData = await listResp.json();
    if (!listResp.ok || !listData.success || !listData.data) {
      res.statusCode = listResp.status || 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: false,
        error: (listData && (listData.message || listData.error)) || 'Failed to list payments'
      }));
      return;
    }

    const transactions = listData.data.transactions || [];

    const detailedTransactions = await Promise.all(
      transactions.map(async (tx) => {
        try {
          const detailResp = await fetch(
            'https://api.nitropagamento.app/transactions/' + encodeURIComponent(tx.id),
            {
              method: 'GET',
              headers: {
                Authorization: 'Basic ' + auth,
                'Content-Type': 'application/json'
              }
            }
          );

          const detailData = await detailResp.json();
          const detail = detailResp.ok && detailData.success && detailData.data ? detailData.data : {};

          return {
            id: tx.id,
            status: detail.status || tx.status || '',
            amount: Number(detail.amount != null ? detail.amount : tx.amount || 0),
            payment_method: detail.payment_method || tx.payment_method || 'pix',
            gateway: 'nitro',
            created_at: detail.created_at || tx.created_at || '',
            paid_at: detail.paid_at || tx.paid_at || '',
            customer: {
              name: (detail.customer && detail.customer.name) || (tx.customer && tx.customer.name) || '',
              phone: (detail.customer && detail.customer.phone) || '',
              email: (detail.customer && detail.customer.email) || (tx.customer && tx.customer.email) || '',
              document: (detail.customer && detail.customer.document) || ''
            },
            pix_code: detail.pix_code || '',
            pix_qr_code: detail.pix_qr_code || '',
            metadata: detail.metadata || tx.metadata || {}
          };
        } catch (error) {
          return {
            id: tx.id,
            status: tx.status || '',
            amount: Number(tx.amount || 0),
            payment_method: tx.payment_method || 'pix',
            gateway: 'nitro',
            created_at: tx.created_at || '',
            paid_at: tx.paid_at || '',
            customer: {
              name: (tx.customer && tx.customer.name) || '',
              phone: '',
              email: (tx.customer && tx.customer.email) || '',
              document: ''
            },
            pix_code: '',
            pix_qr_code: '',
            metadata: tx.metadata || {}
          };
        }
      })
    );

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      data: {
        transactions: detailedTransactions,
        pagination: listData.data.pagination || null,
        statusFilter: rawStatus
      }
    }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: error.message || 'Internal server error' }));
  }
};
