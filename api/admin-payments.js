const { isKvConfigured, kvGet, kvSmembers } = require('./_kv');

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

  if (!isKvConfigured()) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: 'KV not configured. Configure KV_REST_API_URL and KV_REST_API_TOKEN na Vercel para habilitar o painel.'
    }));
    return;
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const rawStatus = (url.searchParams.get('status') || 'both').toLowerCase();
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 20)));
    const ids = await kvSmembers('payments:ids');
    const records = await Promise.all(ids.map(async (id) => {
      const raw = await kvGet('payment:' + id);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }));

    const allPayments = records.filter(Boolean).sort((a, b) => {
      const da = new Date(a.created_at || 0).getTime();
      const db = new Date(b.created_at || 0).getTime();
      return db - da;
    });

    const filtered = allPayments.filter((tx) => {
      const status = (tx.status || '').toLowerCase();
      if (rawStatus === 'paid') {
        return status === 'pago' || status === 'paid' || status === 'approved';
      }
      if (rawStatus === 'pending') {
        return status === 'pendente' || status === 'pending';
      }
      return true;
    });

    const start = (page - 1) * limit;
    const detailedTransactions = filtered.slice(start, start + limit);
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      data: {
        transactions: detailedTransactions,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_items: totalItems,
          items_per_page: limit
        },
        statusFilter: rawStatus
      }
    }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: error.message || 'Internal server error' }));
  }
};
