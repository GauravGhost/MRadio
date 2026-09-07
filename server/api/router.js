import express from 'express';
import { 
    addSongToQueue, getCurrentSong, getQueueList, getUpcomingSong, skip, generateToken, 
    previousSong, blockCurrentSong, blockSongBySongName, unblockSongBySongName, unblockSongByIndex, 
    clearBlockList, getAllBlockList, isSongBlocked, removeSongFromQueue, addSongToTop, 
    removeLastSongRequestedByUser, addPlaylistToQueue, addPlaylistToTop, addDefaultPlaylists, 
    getCommonConfig, createConfigOrUpdateCommonConfig, getDefaultPlaylist, removeDefaultPlaylist, 
    updatePlaylistStatus, seekSong, getAllChannels, createChannel, deleteChannel 
} from './controller.js';
import { isAdmin, isValidUser } from './middleware.js';

const router = express.Router();

// Channel Management Routes
router.get("/channels", getAllChannels);
router.post("/channels", isValidUser, createChannel);
router.delete("/channels/:channelId", isValidUser, deleteChannel);

// Channel-Specific Song Routes
router.get("/channels/:channelId/songs/current", getCurrentSong);
router.get("/channels/:channelId/songs/queue", getQueueList);
router.get("/channels/:channelId/songs/upcoming", getUpcomingSong);
router.get("/channels/:channelId/songs/skip", isValidUser, skip);
router.get("/channels/:channelId/songs/seek/:seconds", isValidUser, seekSong);
router.get("/channels/:channelId/songs/previous", isValidUser, previousSong);

// Global / Default Channel Song Routes (Backward Compatible)
router.post("/songs/add", addSongToQueue);
router.get("/songs/queue", getQueueList);
router.get("/songs/current", getCurrentSong);
router.get("/songs/upcoming", getUpcomingSong);

router.get("/songs/skip", isValidUser, skip);
router.get("/songs/seek/:seconds", isValidUser, seekSong);
router.get("/songs/previous", isValidUser, previousSong);
router.post("/songs/add/top", isValidUser, addSongToTop);
router.delete("/songs/requests/last/:requestedBy", isValidUser, removeLastSongRequestedByUser);
router.delete("/songs/remove/:index", isValidUser, removeSongFromQueue);

router.post("/playlist/add", isValidUser, addPlaylistToQueue);
router.post("/playlist/add/top", isValidUser, addPlaylistToTop);

router.post("/playlist/default", isValidUser, addDefaultPlaylists);
router.get("/playlist/default", isValidUser, getDefaultPlaylist);
router.delete("/playlist/default/:index", isValidUser, removeDefaultPlaylist);
router.put("/playlist/default/:index/status", isValidUser, updatePlaylistStatus);

router.post("/songs/block/current", isValidUser, blockCurrentSong);
router.post("/songs/block", isValidUser, blockSongBySongName);
router.delete("/songs/block/:songName", isValidUser, unblockSongBySongName);
router.delete("/songs/block/all", isValidUser, clearBlockList);
router.delete("/songs/block/:index", isValidUser, unblockSongByIndex);
router.get("/songs/block/list", isValidUser, getAllBlockList);
router.get("/songs/block/check", isValidUser, isSongBlocked);

router.get("/config", isValidUser, getCommonConfig);
router.post("/config", isValidUser, createConfigOrUpdateCommonConfig);

router.post("/admin/token", isAdmin, generateToken);

export default router;
