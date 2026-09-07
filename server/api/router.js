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
    removeTokenByIndex,
    getIcecastStatus
} from './controller.js';
import { isAdmin, isValidUser } from './middleware.js';

const router = express.Router();

// 1. Channel Management Routes
router.get("/channels", getAllChannels);
router.post("/channels", isValidUser, createChannel);
router.get("/channels/:channelId", getChannelDetails);
router.patch("/channels/:channelId", isValidUser, updateChannel);
router.delete("/channels/:channelId", isValidUser, deleteChannel);
router.post("/channels/:channelId/restart", isValidUser, restartChannel);

// 2. Playback Control Routes (Channel Scoped)
router.get("/channels/:channelId/playback/current", getCurrentSong);
router.get("/channels/:channelId/playback/upcoming", getUpcomingSong);
router.post("/channels/:channelId/playback/pause", isValidUser, pauseSong);
router.post("/channels/:channelId/playback/resume", isValidUser, resumeSong);
router.post("/channels/:channelId/playback/skip", isValidUser, skipSong);
router.post("/channels/:channelId/playback/previous", isValidUser, previousSong);
router.post("/channels/:channelId/playback/seek", isValidUser, seekSong);

// 3. Queue Management Routes (Channel Scoped)
router.get("/channels/:channelId/queue", getQueueList);
router.post("/channels/:channelId/queue/songs", isValidUser, addSongToQueue);
router.delete("/channels/:channelId/queue/songs/:index", isValidUser, removeSongFromQueue);
router.delete("/channels/:channelId/queue/songs/user/:requestedBy", isValidUser, removeLastSongRequestedByUser);
router.post("/channels/:channelId/queue/playlists", isValidUser, addPlaylistToQueue);
router.delete("/channels/:channelId/queue", isValidUser, clearQueue);

// 4. System Default Playlists Routes
router.get("/playlists/default", isValidUser, getDefaultPlaylists);
router.post("/playlists/default", isValidUser, addDefaultPlaylist);
router.delete("/playlists/default/:index", isValidUser, removeDefaultPlaylist);
router.patch("/playlists/default/:index/status", isValidUser, updateDefaultPlaylistStatus);

// 5. Blocklist Routes
router.get("/blocklist", isValidUser, getBlocklist);
router.post("/blocklist", isValidUser, blockSong);
router.delete("/blocklist/name/:songName", isValidUser, unblockSongByName);
router.delete("/blocklist/index/:index", isValidUser, unblockSongByIndex);
router.delete("/blocklist", isValidUser, clearBlocklist);
router.get("/blocklist/check", isValidUser, checkSongBlocked);

// 6. System & Config Routes
router.get("/config", isValidUser, getCommonConfig);
router.post("/config", isValidUser, updateCommonConfig);
router.get("/admin/tokens", isAdmin, getAllTokens);
router.post("/admin/token", isAdmin, generateToken);
router.delete("/admin/tokens/:index", isAdmin, removeTokenByIndex);
router.get("/system/icecast", getIcecastStatus);

export default router;
