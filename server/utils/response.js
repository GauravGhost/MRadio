export const successRes = (data = null, message = "Success") => ({
    success: true,
    message: typeof message === "string" ? message.trim() : "Success",
    data,
    error: null,
    timestamp: new Date().toISOString()
});

export const errorRes = (error = null, message = "Request failed", code = "BAD_REQUEST") => {
    let errorObj = null;
    if (typeof error === "string") {
        errorObj = { code, details: error };
    } else if (error && typeof error === "object") {
        errorObj = {
            code: error.code || code,
            details: error.message || error.details || "An error occurred"
        };
    } else if (error) {
        errorObj = { code, details: String(error) };
    } else {
        errorObj = { code, details: message };
    }

    return {
        success: false,
        message: typeof message === "string" ? message.trim() : "Request failed",
        data: null,
        error: errorObj,
        timestamp: new Date().toISOString()
    };
};