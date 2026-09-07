/**
 * Standard Success Response Handler
 * Format:
 * {
 *   success: true,
 *   message: string,
 *   data: T | null,
 *   error: null,
 *   timestamp: string
 * }
 */
export const successRes = (data = null, message = "Success") => ({
    success: true,
    message: typeof message === "string" && message.trim() ? message.trim() : "Success",
    data,
    error: null,
    timestamp: new Date().toISOString()
});

/**
 * Standard Error Response Handler
 * Format:
 * {
 *   success: false,
 *   message: string,  <-- ALWAYS the specific, human-readable error description
 *   data: null,
 *   error: {
 *     code: string,   <-- machine-readable error code (BAD_REQUEST, NOT_FOUND, etc.)
 *     details: string <-- identical specific error description
 *   },
 *   timestamp: string
 * }
 */
export const errorRes = (error = null, fallbackMessage = "Request failed", code = "BAD_REQUEST") => {
    let details = null;
    let finalCode = code;

    if (typeof error === "string" && error.trim()) {
        details = error.trim();
    } else if (error && typeof error === "object") {
        if (error.code && typeof error.code === "string") {
            finalCode = error.code;
        }
        details = error.message || error.details || null;
    } else if (error) {
        details = String(error);
    }

    // Prioritize specific error message from exception, then fallbackMessage
    const resolvedMessage = (typeof details === "string" && details.trim())
        ? details.trim()
        : (typeof fallbackMessage === "string" && fallbackMessage.trim() ? fallbackMessage.trim() : "Request failed");

    return {
        success: false,
        message: resolvedMessage,
        data: null,
        error: {
            code: finalCode,
            details: resolvedMessage
        },
        timestamp: new Date().toISOString()
    };
};

export const sendSuccess = (res, data = null, message = "Success", statusCode = 200) => {
    return res.status(statusCode).json(successRes(data, message));
};

export const sendError = (res, error = null, fallbackMessage = "Request failed", code = "BAD_REQUEST", statusCode = 400) => {
    return res.status(statusCode).json(errorRes(error, fallbackMessage, code));
};