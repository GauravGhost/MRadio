import axios from "axios";
import { JIO_SAAVN_PLAYLIST_SEARCH, JIO_SAAVN_SONG_SEARCH } from "../utils/constant.js";
import { checkSimilarity } from "../utils/utils.js";
import logger from "../utils/logger.js";

class JioSaavn {
    async getSongBySongName(songName, retryCount = 1) {
        try {
            const response = await axios.get(JIO_SAAVN_SONG_SEARCH(songName));
            if (!response.data?.results || response.data.results.length === 0) return;
            const results = response.data.results.find(track => checkSimilarity(songName, track.title) > 60) || response.data.results[0];
            if (!results) return;
            const moreInfo = results.more_info;

            if(moreInfo.duration > 600){
                throw new Error("Song Duration is more than 10 minutes.")
            }
            return {
                title: results.title,
                url: moreInfo.encrypted_media_url,
                duration: moreInfo.duration
            }
        } catch (error) {
            logger.error(error);
            logger.error("Failed after retrying:", { error });
            return;
        }
    }

    async getPlaylistDetail(playlistId) {
        try {
            const response = await axios.get(JIO_SAAVN_PLAYLIST_SEARCH(playlistId));
            const { list } = response.data;
            if(list.length <= 0){
                throw new Error("Invalid Playlist ID");
            }
            return list;
        } catch (error) {
            logger.error(error);
            logger.error("Error fetching Playlist");    
            return null;
        }
    }
}

export default JioSaavn;
