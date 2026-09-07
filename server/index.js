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

    // 3. Initialize Icecast streaming for default channel if configured
    const icecastConfig = {
        host: secret.ICECAST_HOST,
        port: secret.ICECAST_PORT,
        password: secret.ICECAST_PASSWORD,
        mount: secret.ICECAST_MOUNT,
        name: secret.ICECAST_NAME,
        description: secret.ICECAST_DESCRIPTION,
        genre: secret.ICECAST_GENRE,
        bitrate: secret.ICECAST_BITRATE
    };

    if (icecastConfig.host && icecastConfig.port && icecastConfig.password) {
        const icecastInitialized = defaultChannel.initializeIcecast(icecastConfig);
        if (icecastInitialized) {
            logger.info('Icecast streaming enabled on default channel');
            logger.info(`Stream will be available at: http://${icecastConfig.host}:${icecastConfig.port}${icecastConfig.mount}`);
        } else {
            logger.warn('Failed to initialize Icecast streaming, falling back to direct HTTP streaming');
        }
    }

    // 4. Initialize socket.io with default channel
    socketManager.initialize(server, defaultChannel);

    // 5. Mount API Routes
    app.use("/api", router);

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

    // Icecast status endpoint
    app.get("/api/icecast/status", (req, res) => {
        const status = defaultChannel.getIcecastStatus();
        res.json(status);
    });

    server.listen(PORT, () => {
        console.log(`Radio Broadcast Server listening on port ${PORT}`);
        console.log(`Default Direct Stream: http://localhost:${PORT}/stream`);
        console.log(`Multi-Channel Endpoint: http://localhost:${PORT}/stream/:channelId`);
    });
})();

export { };
