import TokenManager from "../utils/queue/tokenManager.js";
import channelManager from "../lib/channelManager.js";
import secret from "../utils/secret.js";
import { errorRes } from "../utils/response.js";
import { TOKEN_ROLES } from "../utils/constant.js";

const hasEnvAdminCredentials = (req) => {
    const tokenKey = req.headers['x-admin-token-key'];
    const apikey = req.headers['x-admin-api-key'];
    return Boolean(tokenKey && apikey && apikey === secret.X_ADMIN_API_KEY && tokenKey === secret.X_ADMIN_TOKEN_KEY);
};

const resolveIdentity = (req) => {
    if (hasEnvAdminCredentials(req)) {
        return { kind: "env-admin" };
    }
    const token = req.headers['x-token-key'];
    if (!token) {
        return null;
    }
    const record = new TokenManager().getToken(token);
    return record ? { kind: "token", record } : null;
};

const resolveRequestedChannelId = (req) => req.params?.channelId || req.body?.channelId || null;

const channelExists = (channelId) => channelManager.getChannel(channelId)?.id === channelId;

export const requireChannel = (req, res, next) => {
    const channelId = req.params?.channelId;
    if (!channelId || !channelExists(channelId)) {
        return res.status(404).json(errorRes(null, `Channel '${channelId}' not found`, 'NOT_FOUND'));
    }
    next();
};


export const requireUser = (req, res, next) => {
    const identity = resolveIdentity(req);
    if (!identity) {
        return res.status(401).json(errorRes(null, 'Unauthorized: Invalid or missing token', 'UNAUTHORIZED'));
    }

    const channelId = resolveRequestedChannelId(req);
    const isRestrictedToken = identity.kind === "token" && identity.record.role !== TOKEN_ROLES.ADMIN;

    if (isRestrictedToken && channelId && !identity.record.channels.includes(channelId)) {
        return res.status(403).json(errorRes(null, `Forbidden: channel '${channelId}' is not assigned to this token`, 'FORBIDDEN'));
    }
    
    if (channelId && !channelExists(channelId)) {
        return res.status(404).json(errorRes(null, `Channel '${channelId}' not found`, 'NOT_FOUND'));
    }
    next();
};

// Station setup: channels and global config. Env admin or a token with the admin role.
export const requireAdmin = (req, res, next) => {
    const identity = resolveIdentity(req);
    if (!identity) {
        return res.status(401).json(errorRes(null, 'Unauthorized: You have no admin access.', 'FORBIDDEN'));
    }
    if (identity.kind === "token" && identity.record.role !== TOKEN_ROLES.ADMIN) {
        return res.status(403).json(errorRes(null, 'Forbidden: admin role required', 'FORBIDDEN'));
    }
    const channelId = resolveRequestedChannelId(req);
    if (channelId && !channelExists(channelId)) {
        return res.status(404).json(errorRes(null, `Channel '${channelId}' not found`, 'NOT_FOUND'));
    }
    next();
};

// Token lifecycle (list/mint/revoke) and cookies stay env-admin-only.
export const isAdmin = (req, res, next) => {
    const tokenKey = req.headers['x-admin-token-key'];
    const apikey = req.headers['x-admin-api-key'];

    if (!tokenKey || !apikey) {
        return res.status(401).json(errorRes(null, 'Unauthorized: Admin Access Required!', 'FORBIDDEN'));
    }
    const adminTokenKey = secret.X_ADMIN_TOKEN_KEY;
    const adminApiKey = secret.X_ADMIN_API_KEY;
    if (!adminTokenKey || !adminApiKey) {
        return res.status(500).json(errorRes(null, 'Internal Server Error: Missing Admin Config', 'INTERNAL_SERVER_ERROR'));
    }
    if (adminApiKey !== apikey || adminTokenKey !== tokenKey) {
        return res.status(401).json(errorRes(null, 'Unauthorized: You have no admin access.', 'FORBIDDEN'));
    }
    next();
};
