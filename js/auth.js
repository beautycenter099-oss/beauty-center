import { ADMIN_PASSWORD, SESSION_KEY } from './config.js';

/**
 * Check if the admin is currently authenticated.
 * @returns {boolean}
 */
export function isAuthenticated() {
  return sessionStorage.getItem(SESSION_KEY) === btoa(ADMIN_PASSWORD);
}

/**
 * Attempt to log in with a password.
 * @param {string} password
 * @returns {boolean} - true if correct
 */
export function login(password) {
  if (password === ADMIN_PASSWORD) {
    sessionStorage.setItem(SESSION_KEY, btoa(ADMIN_PASSWORD));
    return true;
  }
  return false;
}

/**
 * Log out and clear session.
 */
export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}
