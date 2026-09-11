import logger from "../logger.js";
import { getTokenListJson, saveTokenListJson } from "../utils.js";
import { TOKEN_ROLES } from "../constant.js";

const isValidRole = (role) => Object.values(TOKEN_ROLES).includes(role);

const parseChannels = (channels) => {
    if (!Array.isArray(channels) || channels.length === 0) {
        throw new Error("'channels' must be a non-empty array of channel ids");
    }
    if (channels.some(channel => typeof channel !== "string" || !channel.trim())) {
        throw new Error("'channels' must contain only non-empty strings");
    }
    return [...new Set(channels.map(channel => channel.trim()))];
};

class TokenManager {
    constructor() {
        this.queue = this.#readTokenQueue() || [];
    }

    #readTokenQueue() {
        return getTokenListJson();
    }

    #saveTokenQueue() {
        saveTokenListJson(this.queue);
    }

    getToken(token) {
        return this.queue.find(entry => entry.token === token) || null;
    }

    isDuplicate(token, username) {
        return this.queue.some(item => item.token === token || item.username === username);
    }

    addToken({ token, username, role, channels }) {
        if (!token || !username) {
            throw new Error("Token requires both 'token' and 'username'");
        }
        if (!isValidRole(role)) {
            throw new Error(`Invalid role '${role}'. Allowed roles: ${Object.values(TOKEN_ROLES).join(", ")}`);
        }
        if (this.isDuplicate(token, username)) {
            logger.warn(`Duplicate item not added: ${token}`);
            throw new Error(`Duplicate username not allowed!`);
        }
        this.queue.push({
            token,
            username,
            role,
            channels: parseChannels(channels),
            createdAt: new Date().toISOString()
        });
        this.#saveTokenQueue();
    }

    updateTokenChannels(username, channels) {
        const parsed = parseChannels(channels);
        const item = this.queue.find(entry => entry.username === username);
        if (!item) {
            return null;
        }
        item.channels = parsed;
        this.#saveTokenQueue();
        return item;
    }

    removeChannelFromAllTokens(channelId) {
        let updated = 0;
        for (const item of this.queue) {
            if (!item.channels.includes(channelId)) {
                continue;
            }
            item.channels = item.channels.filter(channel => channel !== channelId);
            updated++;
        }
        if (updated > 0) {
            this.#saveTokenQueue();
        }
        return updated;
    }

    removeTokenByUsername(username) {
        const index = this.queue.findIndex(item => item.username === username);
        if (index === -1) {
            return null;
        }
        const removedItem = this.queue.splice(index, 1)[0];
        this.#saveTokenQueue();
        return removedItem;
    }

    printQueue() {
        return this.queue;
    }
}

export default TokenManager;
