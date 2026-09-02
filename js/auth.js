import { SESSION_KEY } from './config.js';
import { supabaseGet } from './api.js';

/**
 * Get the currently logged-in user object.
 * @returns {{ id?: number, name: string, username: string, role: string } | null}
 */
export function getCurrentUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse user session:', err);
    return null;
  }
}

/**
 * Check if a valid session exists.
 * @returns {boolean}
 */
export function isAuthenticated() {
  return getCurrentUser() !== null;
}

/**
 * Check if current user is an Admin.
 * @returns {boolean}
 */
export function isAdmin() {
  const user = getCurrentUser();
  return user?.role === 'admin';
}

/**
 * Attempt to log in with a username and password against database records.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ success: boolean, user?: Object, error?: string }>}
 */
export async function login(username, password) {
  const cleanUsername = (username || '').trim();
  const cleanPassword = (password || '').trim();

  if (!cleanUsername || !cleanPassword) {
    return { success: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' };
  }

  // 1. Query Staff Table in Supabase (includes Admin and Staff roles)
  try {
    const query = `select=*&username=eq.${encodeURIComponent(cleanUsername)}&active=eq.true`;
    const rows = await supabaseGet('staff', query);
    
    if (rows && rows.length > 0) {
      const userRow = rows[0];
      if (userRow.password && userRow.password === cleanPassword) {
        const session = {
          id: userRow.id,
          name: userRow.name,
          username: userRow.username,
          role: userRow.role || 'staff'
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return { success: true, user: session };
      }
    }
  } catch (err) {
    console.warn('Database login query failed, checking offline local storage:', err);
  }

  // 2. Fallback: check localStorage staff if offline
  try {
    const local = localStorage.getItem('bc_staff');
    if (local) {
      const staffList = JSON.parse(local);
      const userRow = staffList.find(s => 
        (s.username || '').toLowerCase() === cleanUsername.toLowerCase() && 
        s.password === cleanPassword && 
        s.active !== false
      );
      if (userRow) {
        const session = {
          id: userRow.id,
          name: userRow.name,
          username: userRow.username,
          role: userRow.role || 'staff'
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return { success: true, user: session };
      }
    }
  } catch (e) {
    console.error('Local fallback login error:', e);
  }

  return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
}

/**
 * Log out and clear session.
 */
export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}
