import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const BASE_HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

/**
 * Perform a GET request against the Supabase REST API.
 * @param {string} table - Table name
 * @param {string} [queryString] - e.g. "select=*,customers(name)&order=created_at.desc"
 * @returns {Promise<Array>}
 */
export async function supabaseGet(table, queryString = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${queryString ? '?' + queryString : ''}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...BASE_HEADERS,
      // Return full count in header for pagination
      'Prefer': 'count=exact',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `GET ${table} failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Perform a PATCH request against the Supabase REST API.
 * @param {string} table - Table name
 * @param {string} filter - e.g. "id=eq.42"
 * @param {Object} data - Patch body
 * @returns {Promise<Array>}
 */
export async function supabasePatch(table, filter, data) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...BASE_HEADERS,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `PATCH ${table} failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Execute a raw SQL query via Supabase RPC (requires a DB function).
 * For simple aggregates, we use the REST API with select=count.
 * @param {string} table
 * @param {string} filter
 * @returns {Promise<number>} - count
 */
export async function supabaseCount(table, filter = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=id${filter ? '&' + filter : ''}`;
  const response = await fetch(url, {
    method: 'HEAD',
    headers: {
      ...BASE_HEADERS,
      'Prefer': 'count=exact',
    },
  });

  if (!response.ok) {
    throw new Error(`COUNT ${table} failed: ${response.status}`);
  }

  const countHeader = response.headers.get('Content-Range');
  if (!countHeader) return 0;
  const match = countHeader.match(/\/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Perform a POST (INSERT) request against the Supabase REST API.
 * @param {string} table - Table name
 * @param {Object} data - Row to insert
 * @returns {Promise<Object>} - Inserted row
 */
export async function supabasePost(table, data) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...BASE_HEADERS,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `POST ${table} failed: ${response.status}`);
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

/**
 * Perform a DELETE request against the Supabase REST API.
 * @param {string} table - Table name
 * @param {string} filter - e.g. "id=eq.42"
 * @returns {Promise<void>}
 */
export async function supabaseDelete(table, filter) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: BASE_HEADERS,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `DELETE ${table} failed: ${response.status}`);
  }
}
