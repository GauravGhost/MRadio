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
    res.redirect('/stream');
});

(async () => {
    // 1. Initialize Initial Data
    await Initializer.init();

    // 2. Initialize Channel Manager & Default/Persisted Channels
    await channelManager.init();

    const defaultChannel = channelManager.getChannel('default');

    // 3. Initialize Icecast streaming across all channels if configured
    const icecastConfig = {
        host: secret.ICECAST_HOST,
        port: secret.ICECAST_PORT,
        password: secret.ICECAST_PASSWORD,
        mount: secret.ICECAST_MOUNT || '/radio.mp3',
        name: secret.ICECAST_NAME || 'MRadio',
        description: secret.ICECAST_DESCRIPTION || 'MRadio Broadcast',
        genre: secret.ICECAST_GENRE || 'Various',
        bitrate: secret.ICECAST_BITRATE || '128'
    };

    if (icecastConfig.host && icecastConfig.port && icecastConfig.password) {
        channelManager.setIcecastConfig(icecastConfig);
        logger.info(`Icecast multi-channel streaming enabled (host: ${icecastConfig.host}:${icecastConfig.port})`);
    } else {
        logger.info('Icecast not configured, direct HTTP streaming active for all channels');
    }


    // 4. Initialize socket.io with default channel
    socketManager.initialize(server, defaultChannel);

    // 5. Mount API Routes
    app.use("/api", router);

    // Health check route alias
    app.get("/health", (req, res) => {
        res.redirect("/api/health");
    });

    // 6. Direct HTTP Audio Stream Handler (Single-Port Multi-Channel)
    const handleChannelStream = (req, res, channelId = 'default') => {
        const targetChannel = channelManager.getChannel(channelId);
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

    // Default channel stream
    app.get("/stream", (req, res) => handleChannelStream(req, res, 'default'));

    // Named channel stream (e.g. /stream/lofi, /stream/pop)
    app.get("/stream/:channelId", (req, res) => handleChannelStream(req, res, req.params.channelId));

    // API channel stream alias
    app.get("/api/channels/:channelId/stream", (req, res) => handleChannelStream(req, res, req.params.channelId));


    server.listen(PORT, () => {
        console.log(`Radio Broadcast Server listening on port ${PORT}`);
        console.log(`Default Direct Stream: http://localhost:${PORT}/stream`);
        console.log(`Multi-Channel Endpoint: http://localhost:${PORT}/stream/:channelId`);
    });
})();

export { };
