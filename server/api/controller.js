import { errorRes, successRes } from "../utils/response.js";
import Service from "../services/apiService.js";
import logger from "../utils/logger.js";
import commonConfigService from "../services/commonConfigService.js";
import channelManager from "../lib/channelManager.js";

const service = new Service();

/**
 * ==========================================
 * Channel Management Controllers
 * ==========================================
 */

export const getAllChannels = async (req, res) => {
    try {
        const response = await service.getAllChannels();
        res.status(200).json(successRes(response, "Channels list fetched successfully"));
    } catch (error) {
        logger.error("Error in getAllChannels API", { error: error.message });
        res.status(500).json(errorRes(error, "Failed to fetch channels", "INTERNAL_SERVER_ERROR"));
    }
};

export const createChannel = async (req, res) => {
    try {
        if (!req.body?.id) {
            return res.status(400).json(errorRes(null, "Channel ID is required", "BAD_REQUEST"));
        }
        const response = await service.createChannel(req.body);
        res.status(201).json(successRes(response, "Channel created successfully"));
    } catch (error) {
        logger.error("Error in createChannel API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to create channel", "BAD_REQUEST"));
    }
};

export const getChannelDetails = async (req, res) => {
    try {
        const { channelId } = req.params;
        const channel = channelManager.getChannel(channelId);
        if (!channel) {
            return res.status(404).json(errorRes(null, `Channel '${channelId}' not found`, "NOT_FOUND"));
        }
        res.status(200).json(successRes(channel.getStatus(), "Channel status fetched successfully"));
    } catch (error) {
        logger.error("Error in getChannelDetails API", { error: error.message });
        res.status(500).json(errorRes(error, "Failed to fetch channel details", "INTERNAL_SERVER_ERROR"));
    }
};

export const deleteChannel = async (req, res) => {
    try {
        const { channelId } = req.params;
        if (!channelId) {
            return res.status(400).json(errorRes(null, "Channel ID is required", "BAD_REQUEST"));
        }
        const response = await service.deleteChannel(channelId);
        res.status(200).json(successRes(response, "Channel deleted successfully"));
    } catch (error) {
        logger.error("Error in deleteChannel API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to delete channel", "BAD_REQUEST"));
    }
};

export const updateChannel = async (req, res) => {
    try {
        const { channelId } = req.params;
        if (!channelId) {
            return res.status(400).json(errorRes(null, "Channel ID is required", "BAD_REQUEST"));
        }
        const response = await service.updateChannel(channelId, req.body || {});
        res.status(200).json(successRes(response, "Channel updated successfully"));
    } catch (error) {
        logger.error("Error in updateChannel API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to update channel", "BAD_REQUEST"));
    }
};

export const restartChannel = async (req, res) => {
    try {
        const { channelId } = req.params;
        const response = await service.restartChannel(channelId || 'default');
        res.status(200).json(successRes(response, "Channel playback restarted successfully"));
    } catch (error) {
        logger.error("Error in restartChannel API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to restart channel", "BAD_REQUEST"));
    }
};

/**
 * ==========================================
 * Playback Controllers (Channel Scoped)
 * ==========================================
 */

export const getCurrentSong = async (req, res) => {
    try {
        const channelId = req.params.channelId || 'default';
        const response = await service.getCurrentSong(channelId);
        res.status(200).json(successRes(response, "Current track fetched successfully"));
    } catch (error) {
        logger.error("Error in getCurrentSong API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to fetch current track", "BAD_REQUEST"));
    }
};

export const getUpcomingSong = async (req, res) => {
    try {
        const channelId = req.params.channelId || 'default';
        const response = await service.getUpcomingSong(channelId);
        res.status(200).json(successRes(response, "Upcoming track fetched successfully"));
    } catch (error) {
        logger.error("Error in getUpcomingSong API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to fetch upcoming track", "BAD_REQUEST"));
    }
};

export const skipSong = async (req, res) => {
    try {
        const channelId = req.params.channelId || 'default';
        await service.skip(channelId);
        res.status(200).json(successRes({ skipped: true, channelId }, "Skipped current song. Playing next track."));
    } catch (error) {
        logger.error("Error in skipSong API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to skip song", "BAD_REQUEST"));
    }
};

export const previousSong = async (req, res) => {
    try {
        const channelId = req.params.channelId || 'default';
        await service.previous(channelId);
        res.status(200).json(successRes({ previous: true, channelId }, "Switched to previous song."));
    } catch (error) {
        logger.error("Error in previousSong API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to play previous song", "BAD_REQUEST"));
    }
};

export const seekSong = async (req, res) => {
    try {
        const seconds = req.body?.seconds ?? req.params?.seconds;
        if (seconds === undefined || isNaN(+seconds)) {
            return res.status(400).json(errorRes(null, "Invalid or missing 'seconds' parameter", "BAD_REQUEST"));
        }
        const channelId = req.params.channelId || 'default';
        const response = await service.seekSong(parseInt(seconds), channelId);
        res.status(200).json(successRes({ seeked: response, seconds: parseInt(seconds), channelId }, "Seek operation completed"));
    } catch (error) {
        logger.error("Error in seekSong API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to seek song", "BAD_REQUEST"));
    }
};

export const pauseSong = async (req, res) => {
    try {
        const channelId = req.params.channelId || 'default';
        const response = await service.pauseSong(channelId);
        res.status(200).json(successRes(response, "Playback paused successfully"));
    } catch (error) {
        logger.error("Error in pauseSong API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to pause playback", "BAD_REQUEST"));
    }
};

export const resumeSong = async (req, res) => {
    try {
        const channelId = req.params.channelId || 'default';
        const response = await service.resumeSong(channelId);
        res.status(200).json(successRes(response, "Playback resumed successfully"));
    } catch (error) {
        logger.error("Error in resumeSong API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to resume playback", "BAD_REQUEST"));
    }
};

/**
 * ==========================================
 * Queue Controllers (Channel Scoped)
 * ==========================================
 */

export const getQueueList = async (req, res) => {
    try {
        const channelId = req.params.channelId || 'default';
        const response = await service.getQueueList(channelId);
        res.status(200).json(successRes(response, "Queue list fetched successfully"));
    } catch (error) {
        logger.error("Error in getQueueList API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to fetch queue list", "BAD_REQUEST"));
    }
};

export const addSongToQueue = async (req, res) => {
    try {
        if (!req.body?.songName) {
            return res.status(400).json(errorRes(null, "Song name is required", "BAD_REQUEST"));
        }
        const channelId = req.params.channelId || 'default';
        const isTop = req.body.position === "top";
        const response = isTop 
            ? await service.addSongToTop({ ...req.body, channelId })
            : await service.addSongToQueue({ ...req.body, channelId });
            
        res.status(200).json(successRes(response, "Song added to queue successfully"));
    } catch (error) {
        logger.error("Error in addSongToQueue API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to add song to queue", "BAD_REQUEST"));
    }
};

export const removeSongFromQueue = async (req, res) => {
    try {
        const index = parseInt(req.params.index);
        if (isNaN(index)) {
            return res.status(400).json(errorRes(null, "Invalid song index", "BAD_REQUEST"));
        }
        const channelId = req.params.channelId || 'default';
        const response = await service.removeFromQueue({ index, channelId });
        res.status(200).json(successRes(response, "Song removed from queue successfully"));
    } catch (error) {
        logger.error("Error in removeSongFromQueue API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to remove song from queue", "BAD_REQUEST"));
    }
};

export const removeLastSongRequestedByUser = async (req, res) => {
    try {
        const { requestedBy } = req.params;
        if (!requestedBy) {
            return res.status(400).json(errorRes(null, "Username parameter 'requestedBy' is required", "BAD_REQUEST"));
        }
        const channelId = req.params.channelId || 'default';
        const response = await service.removeLastSongRequestedByUser({ requestedBy, channelId });
        res.status(200).json(successRes(response, `Removed last song requested by user @${requestedBy}`));
    } catch (error) {
        logger.error("Error in removeLastSongRequestedByUser API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to remove last user request", "BAD_REQUEST"));
    }
};

export const addPlaylistToQueue = async (req, res) => {
    try {
        if (!req.body?.playlistId) {
            return res.status(400).json(errorRes(null, "Playlist ID is required", "BAD_REQUEST"));
        }
        const channelId = req.params.channelId || 'default';
        const isTop = req.body.position === "top";
        const response = isTop
            ? await service.addPlaylistToTop({ ...req.body, channelId })
            : await service.addPlaylistToQueue({ ...req.body, channelId });

        res.status(200).json(successRes(response, `Added ${response.total} songs to queue from playlist`));
    } catch (error) {
        logger.error("Error in addPlaylistToQueue API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to add playlist to queue", "BAD_REQUEST"));
    }
};

export const clearQueue = async (req, res) => {
    try {
        const channelId = req.params.channelId || 'default';
        const response = await service.clearQueue(channelId);
        res.status(200).json(successRes(response, "Channel queue cleared successfully"));
    } catch (error) {
        logger.error("Error in clearQueue API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to clear channel queue", "BAD_REQUEST"));
    }
};

/**
 * ==========================================
 * Default Playlists Controllers
 * ==========================================
 */

export const getDefaultPlaylists = async (req, res) => {
    try {
        const response = await service.getDefaultPlaylist();
        res.status(200).json(successRes(response, "Default playlists fetched successfully"));
    } catch (error) {
        logger.error("Error in getDefaultPlaylists API", { error: error.message });
        res.status(500).json(errorRes(error, "Failed to fetch default playlists", "INTERNAL_SERVER_ERROR"));
    }
};

export const addDefaultPlaylist = async (req, res) => {
    try {
        const { playlistId, title, source } = req.body;
        if (!playlistId || !title || !source) {
            return res.status(400).json(errorRes(null, "Missing required fields: playlistId, title, source", "BAD_REQUEST"));
        }
        const response = await service.addDefaultPlaylist(req.body);
        res.status(201).json(successRes(response, `Added ${response.total} tracks to Default Playlist: ${title}`));
    } catch (error) {
        logger.error("Error in addDefaultPlaylist API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to add default playlist", "BAD_REQUEST"));
    }
};

export const removeDefaultPlaylist = async (req, res) => {
    try {
        const index = parseInt(req.params.index);
        if (isNaN(index)) {
            return res.status(400).json(errorRes(null, "Invalid index parameter", "BAD_REQUEST"));
        }
        const response = await service.removeDefaultPlaylist({ index });
        res.status(200).json(successRes(response, "Default playlist removed successfully"));
    } catch (error) {
        logger.error("Error in removeDefaultPlaylist API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to remove default playlist", "BAD_REQUEST"));
    }
};

export const updateDefaultPlaylistStatus = async (req, res) => {
    try {
        const index = parseInt(req.params.index);
        const { isActive } = req.body;
        if (isNaN(index) || isActive === undefined) {
            return res.status(400).json(errorRes(null, "Index parameter and isActive boolean state are required", "BAD_REQUEST"));
        }
        const response = await service.updatePlaylistStatus({ index, isActive });
        res.status(200).json(successRes(response, "Playlist status updated successfully"));
    } catch (error) {
        logger.error("Error in updateDefaultPlaylistStatus API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to update default playlist status", "BAD_REQUEST"));
    }
};

/**
 * ==========================================
 * Blocklist Controllers
 * ==========================================
 */

export const getBlocklist = async (req, res) => {
    try {
        const response = await service.getAllBlockList();
        res.status(200).json(successRes(response, "Blocklist fetched successfully"));
    } catch (error) {
        logger.error("Error in getBlocklist API", { error: error.message });
        res.status(500).json(errorRes(error, "Failed to fetch blocklist", "INTERNAL_SERVER_ERROR"));
    }
};

export const blockSong = async (req, res) => {
    try {
        const { target, songName, requestedBy, channelId } = req.body;
        let response;
        if (target === "current" || !songName) {
            response = await service.blockCurrentSong(requestedBy, channelId || 'default');
        } else {
            response = await service.blockSongBySongName(songName, requestedBy);
        }
        res.status(200).json(successRes(response, "Song blocked successfully"));
    } catch (error) {
        logger.error("Error in blockSong API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to block song", "BAD_REQUEST"));
    }
};

export const unblockSongByName = async (req, res) => {
    try {
        const { songName } = req.params;
        if (!songName) {
            return res.status(400).json(errorRes(null, "Song name parameter is required", "BAD_REQUEST"));
        }
        const response = await service.unblockSongBySongName(songName);
        res.status(200).json(successRes(response, `Unblocked song '${songName}' successfully`));
    } catch (error) {
        logger.error("Error in unblockSongByName API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to unblock song", "BAD_REQUEST"));
    }
};

export const unblockSongByIndex = async (req, res) => {
    try {
        const index = parseInt(req.params.index);
        if (isNaN(index)) {
            return res.status(400).json(errorRes(null, "Index parameter is required", "BAD_REQUEST"));
        }
        const response = await service.unblockSongByIndex(index);
        res.status(200).json(successRes(response, `Unblocked song at index ${index} successfully`));
    } catch (error) {
        logger.error("Error in unblockSongByIndex API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to unblock song by index", "BAD_REQUEST"));
    }
};

export const clearBlocklist = async (req, res) => {
    try {
        const response = await service.clearBlockList();
        res.status(200).json(successRes(response, "Cleared entire blocklist successfully"));
    } catch (error) {
        logger.error("Error in clearBlocklist API", { error: error.message });
        res.status(500).json(errorRes(error, "Failed to clear blocklist", "INTERNAL_SERVER_ERROR"));
    }
};

export const checkSongBlocked = async (req, res) => {
    try {
        const { songName } = req.query;
        if (!songName) {
            return res.status(400).json(errorRes(null, "Query parameter 'songName' is required", "BAD_REQUEST"));
        }
        const isBlocked = await service.isSongBlocked(songName);
        res.status(200).json(successRes({ songName, isBlocked }, "Checked song block status"));
    } catch (error) {
        logger.error("Error in checkSongBlocked API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to check song block status", "BAD_REQUEST"));
    }
};

/**
 * ==========================================
 * Config, Admin & System Controllers
 * ==========================================
 */

export const getCommonConfig = async (req, res) => {
    try {
        const response = await commonConfigService.get(req.query.key);
        res.status(200).json(successRes(response, "Common config fetched successfully"));
    } catch (error) {
        logger.error("Error in getCommonConfig API", { error: error.message });
        res.status(500).json(errorRes(error, "Failed to fetch common config", "INTERNAL_SERVER_ERROR"));
    }
};

export const updateCommonConfig = async (req, res) => {
    try {
        if (!req.body?.key || req.body?.value === undefined) {
            return res.status(400).json(errorRes(null, "Missing required fields: key, value", "BAD_REQUEST"));
        }
        const isPartial = req.query.partial === 'true' || req.query.partial === true;
        const response = await commonConfigService.update(req.body.key, req.body.value, isPartial);
        res.status(200).json(successRes(response, "Config updated successfully"));
    } catch (error) {
        logger.error("Error in updateCommonConfig API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to update common config", "BAD_REQUEST"));
    }
};

export const generateToken = async (req, res) => {
    try {
        if (!req.body?.username) {
            return res.status(400).json(errorRes(null, "Username parameter is required", "BAD_REQUEST"));
        }
        const response = await service.generateToken(req.body.username);
        res.status(200).json(successRes(response, "Admin user token generated successfully"));
    } catch (error) {
        logger.error("Error in generateToken API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to generate token", "BAD_REQUEST"));
    }
};

export const getAllTokens = async (req, res) => {
    try {
        const response = await service.getAllTokens();
        res.status(200).json(successRes(response, "Admin tokens fetched successfully"));
    } catch (error) {
        logger.error("Error in getAllTokens API", { error: error.message });
        res.status(500).json(errorRes(error, "Failed to fetch tokens", "INTERNAL_SERVER_ERROR"));
    }
};

export const removeTokenByIndex = async (req, res) => {
    try {
        const { index } = req.params;
        if (!index || isNaN(+index)) {
            return res.status(400).json(errorRes(null, "Valid token index parameter is required", "BAD_REQUEST"));
        }
        const response = await service.removeTokenByIndex(parseInt(index));
        res.status(200).json(successRes(response, "Token revoked successfully"));
    } catch (error) {
        logger.error("Error in removeTokenByIndex API", { error: error.message });
        res.status(400).json(errorRes(error, "Failed to revoke token", "BAD_REQUEST"));
    }
};

export const getIcecastStatus = async (req, res) => {
    try {
        const defaultChannel = channelManager.getChannel('default');
        const status = defaultChannel.getIcecastStatus();
        res.status(200).json(successRes(status, "Icecast status fetched successfully"));
    } catch (error) {
        logger.error("Error in getIcecastStatus API", { error: error.message });
        res.status(500).json(errorRes(error, "Failed to fetch Icecast status", "INTERNAL_SERVER_ERROR"));
    }
};

export const getHealth = async (req, res) => {
    try {
        const channels = channelManager.getAllChannels();
        const defaultChannel = channelManager.getChannel('default');
        const icecast = defaultChannel ? defaultChannel.getIcecastStatus() : null;

        res.status(200).json(successRes({
            status: "healthy",
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
            activeChannels: Array.isArray(channels) ? channels.length : 0,
            playingChannels: Array.isArray(channels) ? channels.filter(c => c.playing).length : 0,
            icecastConnected: !!icecast?.connected,
            version: "1.0.0",
        }, "MRadio server is healthy"));
    } catch (error) {
        logger.error("Error in getHealth API", { error: error.message });
        res.status(500).json(errorRes(error, "Health check failed", "INTERNAL_SERVER_ERROR"));
    }
};

