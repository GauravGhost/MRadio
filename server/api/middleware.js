import TokenManager from "../utils/queue/tokenManager.js";
import secret from "../utils/secret.js";
import { errorRes } from "../utils/response.js";

export const isValidUser = (req, res, next) => {
    // Check if admin credentials are provided
    const adminTokenKey = req.headers['x-admin-token-key'];
    const adminApiKey = req.headers['x-admin-api-key'];
    if (adminTokenKey && adminApiKey && adminApiKey === secret.X_ADMIN_API_KEY && adminTokenKey === secret.X_ADMIN_TOKEN_KEY) {
        return next();
    }

    const token = req.headers['x-token-key'];
    if (!token) {
        return res.status(401).json(errorRes(null, 'Unauthorized: Token required', 'UNAUTHORIZED'));
    }
    const tokenManager = new TokenManager();
    if (!tokenManager.isTokenExist(token)) {
        return res.status(401).json(errorRes(null, 'Unauthorized: Invalid token', 'UNAUTHORIZED'));
    }
    next();
};


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