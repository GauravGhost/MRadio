import channelManager from "./channelManager.js";

// Proxy wrapper for backward compatibility
const queueProxy = new Proxy({}, {
    get(target, prop) {
        const defaultChannel = channelManager.getChannel("default");
        if (typeof defaultChannel[prop] === 'function') {
            return defaultChannel[prop].bind(defaultChannel);
        }
        return defaultChannel[prop];
    },
    set(target, prop, value) {
        const defaultChannel = channelManager.getChannel("default");
        defaultChannel[prop] = value;
        return true;
    }
});

export default queueProxy;
