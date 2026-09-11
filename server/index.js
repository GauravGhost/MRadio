import express from "express";
import http from "http";
import socketManager from "./lib/socketManager.js";
import channelManager from "./lib/channelManager.js";
import router from "./api/router.js";
import Initializer from "./services/initializer.js";
import secret from "./utils/secret.js";
import logger from "./utils/logger.js";

const PORT = 9126;
const app = express();
const server = http.createServer(app);

app.use(express.json());

app.get("/", function (req, res) {
    res.redirect('/api/channels');
});

(async () => {
    // 1. Initialize Initial Data
    await Initializer.init();

    // 2. Initialize Channel Manager & Persisted Channels
    await channelManager.init();

    // 3. Initialize Icecast streaming across all channels if configured
    const icecastConfig = {
        host: secret.ICECAST_HOST,
        port: secret.ICECAST_PORT,
        password: secret.ICECAST_PASSWORD,
        bitrate: secret.ICECAST_BITRATE || '128'
    };

    if (icecastConfig.host && icecastConfig.port && icecastConfig.password) {
        channelManager.setIcecastConfig(icecastConfig);
        logger.info(`Icecast multi-channel streaming enabled (host: ${icecastConfig.host}:${icecastConfig.port})`);
    } else {
        logger.info('Icecast not configured, direct HTTP streaming active for all channels');
    }


    // 4. Initialize socket.io
    socketManager.initialize(server);

    // 5. Mount API Routes
    app.use("/api", router);

    // Health check route alias
    app.get("/health", (req, res) => {
        res.redirect("/api/health");
    });

    // 6. Direct HTTP Audio Stream Handler
    const handleChannelStream = (req, res, channelId) => {
        const targetChannel = channelManager.getChannel(channelId);
        if (!targetChannel) {
            return res.status(404).json({ success: false, message: `Channel '${channelId}' not found` });
        }
        const { id, client } = targetChannel.addClient();

        res.set({
            "Content-Type": "audio/mp3",
            "Transfer-Encoding": "chunked",
        }).status(200);

        client.pipe(res);

        req.on("close", () => {
            targetChannel.removeClient(id);
        });
    };

    // Named channel stream
    app.get("/stream/:channelId", (req, res) => handleChannelStream(req, res, req.params.channelId));

    // API channel stream alias
    app.get("/api/channels/:channelId/stream", (req, res) => handleChannelStream(req, res, req.params.channelId));


    server.listen(PORT, () => {
        console.log(`Radio Broadcast Server listening on port ${PORT}`);
        console.log(`Channel Stream Endpoint: http://localhost:${PORT}/stream/:channelId`);
    });
})();

export { };
