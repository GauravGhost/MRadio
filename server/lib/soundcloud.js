import SoundCloudScraper from "soundcloud-scraper";
import logger from "../utils/logger.js";
import secret from "../utils/secret.js";
import { checkSimilarity } from "../utils/utils.js";

const GENRES = ['pop', 'rock', 'hip-hop', 'electronic', 'classical', 'jazz'];

class SoundCloud {
    constructor() {
        this.client = new SoundCloudScraper.Client(secret.SOUNDCLOUD_API_KEY);
    }

    async getSongBySongName(songName, retryCount = 1) {
        try {
            // Search for the song
            const songs = await this.client.search(songName, 'track');
            if (!songs || songs.length === 0) {
                return;
            }

            const songData = songs.find(track => checkSimilarity(songName, track.name) > 60) || songs[0];
            if (!songData) {
                return;
            }
            const song = await this.client.getSongInfo(songData.url);
            if (!song) return;

            // Check duration (convert ms to seconds)
            const duration = Math.floor(song.duration / 1000);
            if (duration > 600) {
                throw new Error("Song Duration is more than 10 minutes.");
            }
            const streamUrl = song.streams?.progressive;
            if (!streamUrl || !streamUrl.includes('/stream/progressive')) {
                return;
            }
            return {
                title: song.title,
                url: song.url || songData.url,
                duration: duration,
            };
        } catch (error) {
            logger.error(error);
            logger.error("Failed after retrying:", { error });
            return;
        }
    }

    async fetchStreamUrl(url) {
        try {
            const stream = await this.client.fetchStreamURL(url);
            return stream;
        } catch (error) {
            logger.error(error);
            throw error;
        }
    }
}

export default SoundCloud;
