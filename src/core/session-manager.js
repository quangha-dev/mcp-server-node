/**
 * In-memory session store keyed by bearer token.
 * Keeps conversation context/parameters between turns.
 */
class SessionManager {
    constructor() {
        this.sessions = new Map();
    }

    getSession(token) {
        if (!token) return {};
        return this.sessions.get(token) || {};
    }

    updateSession(token, newParams = {}) {
        if (!token) return {};
        const current = this.sessions.get(token) || {};
        const merged = { ...current, ...newParams };
        this.sessions.set(token, merged);
        return merged;
    }

    clearSession(token) {
        if (!token) return;
        this.sessions.delete(token);
    }
}

module.exports = new SessionManager();
