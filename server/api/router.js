import express from 'express';
import {
    // Channels
    getAllChannels,
    createChannel,
    getChannelDetails,
    updateChannel,
    deleteChannel,
    restartChannel,
    
    // Playback
    getCurrentSong,
    getUpcomingSong,
    skipSong,
    previousSong,
    pauseSong,
    resumeSong,
    seekSong,
    
    // Queue
    getQueueList,
    addSongToQueue,
    removeSongFromQueue,
    removeLastSongRequestedByUser,
    addPlaylistToQueue,
    clearQueue,
    
    // Playlists
    getDefaultPlaylists,
    addDefaultPlaylist,
    removeDefaultPlaylist,
    updateDefaultPlaylistStatus,
    
    // Blocklist
    getBlocklist,
    blockSong,
    unblockSongByName,
    unblockSongByIndex,
    clearBlocklist,
    checkSongBlocked,
    
    // Config, Admin & System
    getCommonConfig,
    updateCommonConfig,
    generateToken,
    getAllTokens,
    removeTokenByUsername,
    updateTokenChannels,
    getIcecastStatus,
    getHealth,
    updateCookies
} from './controller.js';
import { isAdmin, requireAdmin, requireChannel, requireUser } from './middleware.js';

const router = express.Router();

// 0. Health Check Route
router.get("/health", getHealth);

// 1. Channel Management Routes (Admin only)
router.get("/channels", getAllChannels);
router.post("/channels", requireAdmin, createChannel);
router.get("/channels/:channelId", requireChannel, getChannelDetails);
router.patch("/channels/:channelId", requireAdmin, updateChannel);
router.delete("/channels/:channelId", requireAdmin, deleteChannel);
router.post("/channels/:channelId/restart", requireAdmin, restartChannel);

// 2. Playback Control Routes (Channel Scoped)
router.get("/channels/:channelId/playback/current", requireChannel, getCurrentSong);
router.get("/channels/:channelId/playback/upcoming", requireChannel, getUpcomingSong);
router.post("/channels/:channelId/playback/pause", requireUser, pauseSong);
router.post("/channels/:channelId/playback/resume", requireUser, resumeSong);
router.post("/channels/:channelId/playback/skip", requireUser, skipSong);
router.post("/channels/:channelId/playback/previous", requireUser, previousSong);
router.post("/channels/:channelId/playback/seek", requireUser, seekSong);

// 3. Queue Management Routes (Channel Scoped)
router.get("/channels/:channelId/queue", requireChannel, getQueueList);
router.post("/channels/:channelId/queue/songs", requireUser, addSongToQueue);
router.delete("/channels/:channelId/queue/songs/:index", requireUser, removeSongFromQueue);
router.delete("/channels/:channelId/queue/songs/user/:requestedBy", requireUser, removeLastSongRequestedByUser);
router.post("/channels/:channelId/queue/playlists", requireUser, addPlaylistToQueue);
router.delete("/channels/:channelId/queue", requireUser, clearQueue);

// 4. System Default Playlists Routes
router.get("/playlists/default", requireUser, getDefaultPlaylists);
router.post("/playlists/default", requireUser, addDefaultPlaylist);
router.delete("/playlists/default/:index", requireUser, removeDefaultPlaylist);
router.patch("/playlists/default/:index/status", requireUser, updateDefaultPlaylistStatus);

// 5. Blocklist Routes
router.get("/blocklist", requireUser, getBlocklist);
router.post("/blocklist", requireUser, blockSong);
router.delete("/blocklist/name/:songName", requireUser, unblockSongByName);
router.delete("/blocklist/index/:index", requireUser, unblockSongByIndex);
router.delete("/blocklist", requireUser, clearBlocklist);
router.get("/blocklist/check", requireUser, checkSongBlocked);

// 6. System & Config Routes (Admin only)
router.get("/config", requireAdmin, getCommonConfig);
router.post("/config", requireAdmin, updateCommonConfig);
router.get("/admin/tokens", isAdmin, getAllTokens);
router.post("/admin/token", isAdmin, generateToken);
router.delete("/admin/tokens/username/:username", isAdmin, removeTokenByUsername);
router.patch("/admin/tokens/username/:username", isAdmin, updateTokenChannels);
router.post("/admin/cookies", isAdmin, updateCookies);
router.get("/channels/:channelId/icecast", requireChannel, getIcecastStatus);

export default router;
