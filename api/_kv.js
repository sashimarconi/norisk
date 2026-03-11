const KV_URL = process.env.KV_REST_API_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || '';

function isKvConfigured() {
  return Boolean(KV_URL && KV_TOKEN);
}

async function kvCall(path) {
  const response = await fetch(KV_URL.replace(/\/$/, '') + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + KV_TOKEN
    }
  });

  if (!response.ok) {
    throw new Error('KV request failed: ' + response.status);
  }

  return response.json();
}

async function kvGet(key) {
  const data = await kvCall('/get/' + encodeURIComponent(key));
  return data.result || null;
}

async function kvSet(key, value) {
  await kvCall('/set/' + encodeURIComponent(key) + '/' + encodeURIComponent(value));
}

async function kvSadd(key, member) {
  await kvCall('/sadd/' + encodeURIComponent(key) + '/' + encodeURIComponent(member));
}

async function kvSmembers(key) {
  const data = await kvCall('/smembers/' + encodeURIComponent(key));
  return Array.isArray(data.result) ? data.result : [];
}

module.exports = {
  isKvConfigured,
  kvGet,
  kvSet,
  kvSadd,
  kvSmembers
};
