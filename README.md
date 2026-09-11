# MRadio - Radio Broadcasting System

A powerful radio streaming platform built for multi-channel broadcasting, dynamic queues, and seamless music streaming.

## Features

- **Multi-Platform Music**: Stream from YouTube, JioSaavn, and SoundCloud
- **Live Broadcasting**: Icecast server integration + direct HTTP MP3 streaming
- **Queue Management**: Dynamic song queuing with priority support
- **Real-Time Updates**: WebSocket integration for live client notifications
- **Smart Caching**: Automatic file caching with LRU eviction (1GB limit)
- **Multi-Channel**: Support for multiple radio channels
- **Admin Controls**: Token-based authentication and admin panel
- **Docker Ready**: Easy containerized deployment

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [FFmpeg](https://ffmpeg.org/) (audio processing)
- [Docker](https://www.docker.com/) (optional)

### 1. Clone & Install

```bash
git clone https://github.com/GauravGhost/MRadio
cd MRadio
npm install
```

### 2. Configure Environment

Create a `.env` file in the root directory:

```env
# === REQUIRED ===
X_ADMIN_API_KEY=your_admin_api_key_here
X_ADMIN_TOKEN_KEY=your_admin_token_key_here

# === OPTIONAL: Music Platform APIs ===
# Get Spotify keys: https://developer.spotify.com/dashboard
SPOTIFY_CLIEND_ID=your_spotify_client_id
SPOTIFY_CLIEND_SECRET_ID=your_spotify_client_secret

# Get SoundCloud key: https://soundcloud.com/you/apps
SOUNDCLOUD_API_KEY=your_soundcloud_api_key

# === OPTIONAL: Default Playlist ===
INITIAL_PLAYLIST_ID=1134543272
INITIAL_PLAYLIST_SOURCE=jiosaavn
INITIAL_PLAYLIST_TITLE="Top 50 Songs"

# === OPTIONAL: Icecast Streaming ===
ICECAST_HOST=localhost
ICECAST_PORT=8000
ICECAST_PASSWORD=your_icecast_password
ICECAST_BITRATE=128

# === OPTIONAL: Server Settings ===
PORT=9126
NODE_ENV=development
LOG_LEVEL=info
TZ=Asia/Kolkata
```

### 3. Create Required Directories

```bash
mkdir -p cache data logs media/tracks media/fallback config
```

### 4. Start the Server

```bash
npm start```

The server starts on port **9126**. Access:
- **Web Stream**: http://localhost:9126/stream/main
- **Health Check**: http://localhost:9126/api/health

---

## Docker Deployment

### Using Docker Compose

1. Create `.env` file with required variables (see above)

2. Build and run:
```bash
docker compose up -d
```

### Using run.sh Script

```bash
./run.sh
```

### Production Deployment

```bash
docker compose -f docker-compose.prod.yml up -d
```

---

## API Reference

### Authentication

| Header | Description |
|--------|-------------|
| `x-token-key` | User token for music endpoints (playback, queue, playlists, blocklist) |
| `x-admin-api-key` | Admin API key (master credential) |
| `x-admin-token-key` | Admin token key (master credential) |

**Token roles.** Tokens issued via `/api/admin/token` carry a `role`:

| Role | Access |
|------|--------|
| `user` (default) | Playback, queue, default playlists, blocklist — but only for the channels assigned to the token. Cannot touch channel setup or config. |
| `admin` | Everything `user` can do, on every channel, plus create/update/delete/restart channels and read/update config. Ignores `channels`. |

**Channel assignment.** Each token carries a `channels` list. A `user` token may only act on the
channels in that list — requests for any other channel return `403`. This is enforced per channel, so
you can hand a client a key that controls only its own channel:

```json
{ "token": "<hex>", "username": "krBot", "role": "user", "channels": ["korean"] }
```

**Unknown channels are rejected.** Any channel-scoped request naming a channel that does not exist
returns `404` (`NOT_FOUND`) — for every caller, including admin tokens and the env admin credentials.

On a fresh install the server seeds a single ordinary channel with id `main`
that plays the default playlist. (Icecast mount `/main.mp3`).

Fallback playlists can be added to a channel (`channelId`); a channel with its own
active playlists uses only those, otherwise it falls back to the global (channel-less) playlist pool.

Env admin credentials (`x-admin-api-key` + `x-admin-token-key`) are the master key: they satisfy every route and are the only credential that can list, mint, or revoke tokens. In the tables below, `Token` means any valid `x-token-key` (role `user` or `admin`) or the env admin credentials.

### Generate a Token (Admin Only)

```bash
curl -X POST http://localhost:9126/api/admin/token \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: YOUR_ADMIN_API_KEY" \
  -H "x-admin-token-key: YOUR_ADMIN_TOKEN_KEY" \
  -d '{"username": "krBot", "role": "user", "channels": ["korean"]}'
```

`role` is optional and defaults to `user`. `channels` is required — a token must name the channel(s)
it may act on. Allowed roles: `user`, `admin`. Every channel in `channels` must already exist.

### Reassign a Token's Channels (Admin Only)

```bash
curl -X PATCH http://localhost:9126/api/admin/tokens/username/krBot \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: YOUR_ADMIN_API_KEY" \
  -H "x-admin-token-key: YOUR_ADMIN_TOKEN_KEY" \
  -d '{"channels": ["main", "korean"]}'
```

### Revoke a Token (Admin Only)

```bash
# By username
curl -X DELETE http://localhost:9126/api/admin/tokens/username/grab-bot \
  -H "x-admin-api-key: YOUR_ADMIN_API_KEY" \
  -H "x-admin-token-key: YOUR_ADMIN_TOKEN_KEY"

# By 1-based index
curl -X DELETE http://localhost:9126/api/admin/tokens/1 \
  -H "x-admin-api-key: YOUR_ADMIN_API_KEY" \
  -H "x-admin-token-key: YOUR_ADMIN_TOKEN_KEY"
```

### Channel Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/channels` | List all channels | No |
| POST | `/api/channels` | Create new channel | Admin |
| GET | `/api/channels/:id` | Get channel details | No |
| PATCH | `/api/channels/:id` | Update channel | Admin |
| DELETE | `/api/channels/:id` | Delete channel | Admin |
| POST | `/api/channels/:id/restart` | Restart channel | Admin |

### Playback Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/channels/:id/playback/current` | Current song | No |
| GET | `/api/channels/:id/playback/upcoming` | Next song | No |
| POST | `/api/channels/:id/playback/skip` | Skip song | Token |
| POST | `/api/channels/:id/playback/previous` | Previous song | Token |
| POST | `/api/channels/:id/playback/pause` | Pause playback | Token |
| POST | `/api/channels/:id/playback/resume` | Resume playback | Token |
| POST | `/api/channels/:id/playback/seek` | Seek position | Token |

### Queue Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/channels/:id/queue` | Get queue | No |
| POST | `/api/channels/:id/queue/songs` | Add song | Token |
| DELETE | `/api/channels/:id/queue/songs/:index` | Remove song | Token |
| DELETE | `/api/channels/:id/queue/songs/user/:name` | Remove user's last request | Token |
| POST | `/api/channels/:id/queue/playlists` | Add playlist | Token |
| DELETE | `/api/channels/:id/queue` | Clear queue | Token |

### Example: Add Song to Queue

```bash
curl -X POST http://localhost:9126/api/channels/main/queue/songs \
  -H "Content-Type: application/json" \
  -H "x-token-key: YOUR_TOKEN" \
  -d '{"songName": "Shape of You Ed Sheeran", "requestedBy": "user1"}'
```

### Playlist Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/playlists/default` | List default playlists | Token |
| POST | `/api/playlists/default` | Add default playlist | Token |
| DELETE | `/api/playlists/default/:index` | Remove playlist | Token |
| PATCH | `/api/playlists/default/:index/status` | Toggle playlist | Token |

### Blocklist Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/blocklist` | Get blocked songs | Token |
| POST | `/api/blocklist` | Block a song | Token |
| DELETE | `/api/blocklist/name/:name` | Unblock by name | Token |
| DELETE | `/api/blocklist/index/:index` | Unblock by index | Token |
| DELETE | `/api/blocklist` | Clear blocklist | Token |
| GET | `/api/blocklist/check?songName=X` | Check if blocked | Token |

Blocking a specific song (`{"songName": "..."}`) is global. Blocking the currently playing track
(`{"target": "current"}`) is channel-scoped and requires `channelId` in the body — there is no
implicit channel.

### System Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/health` | Health check | No |
| GET | `/api/channels/:id/icecast` | Icecast status for a channel | No |
| GET | `/api/config` | Get config | Admin |
| POST | `/api/config` | Update config | Admin |
| GET | `/api/admin/tokens` | List all tokens | Admin |
| POST | `/api/admin/token` | Generate token | Admin |
| DELETE | `/api/admin/tokens/username/:username` | Revoke token by username | Admin |
| PATCH | `/api/admin/tokens/username/:username` | Reassign token channels | Admin |
| POST | `/api/admin/cookies` | Update cookies | Admin |

### Stream URLs

| URL | Description |
|-----|-------------|
| `http://localhost:9126/stream/:channelId` | Channel stream (channel id is required) |
| `http://localhost:8000/:channelId.mp3` | Icecast mount for a channel (e.g. `/main.mp3`) |

---

## WebSocket Events

Connect via Socket.IO to receive real-time updates:

```javascript
const socket = io('http://localhost:9126');

socket.on('newSong', (songData) => {
  console.log('Now playing:', songData.title);
});

socket.on('playbackProgress', (progress) => {
  console.log('Progress:', progress.percentage + '%');
});

socket.on('queueUpdate', (queueData) => {
  console.log('Queue updated');
});
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `9126` | Server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `LOG_LEVEL` | No | `info` | Logging level |
| `TZ` | No | `Asia/Kolkata` | Timezone |
| `QUEUE_BUFFER_SIZE` | No | `2` | Queue buffer size |
| `RESUME_MAX_GAP_SECONDS` | No | `180` | Max gap for session resume |
| `X_ADMIN_API_KEY` | **Yes** | - | Admin API key |
| `X_ADMIN_TOKEN_KEY` | **Yes** | - | Admin token key |
| `SPOTIFY_CLIEND_ID` | No | - | Spotify Client ID |
| `SPOTIFY_CLIEND_SECRET_ID` | No | - | Spotify Client Secret |
| `SOUNDCLOUD_API_KEY` | No | - | SoundCloud API Key |
| `INITIAL_PLAYLIST_ID` | No | - | Default playlist ID |
| `INITIAL_PLAYLIST_SOURCE` | No | - | Playlist source (youtube/jiosaavn/soundcloud) |
| `INITIAL_PLAYLIST_TITLE` | No | - | Default playlist title |
| `ICECAST_HOST` | No | - | Icecast server host |
| `ICECAST_PORT` | No | - | Icecast server port |
| `ICECAST_PASSWORD` | No | - | Icecast source password |
| `ICECAST_BITRATE` | No | `128` | Stream bitrate (kbps) |

---

## Icecast Setup (Optional)

For professional broadcasting, set up an Icecast server:

### Docker (Recommended)

```bash
docker run -d --name icecast \
  -p 8000:8000 \
  -e ICECAST_ADMIN_PASSWORD=admin123 \
  -e ICECAST_SOURCE_PASSWORD=source123 \
  -e ICECAST_RELAY_PASSWORD=relay123 \
  moul/icecast
```

Then configure in `.env`:
```env
ICECAST_HOST=localhost
ICECAST_PORT=8000
ICECAST_PASSWORD=source123
```

Each channel publishes to its own mount — `/{channelId}.mp3` (e.g. `/main.mp3`), with the stream name,
description and genre taken from the channel.

### Local Installation

**Ubuntu/Debian:**
```bash
sudo apt-get install icecast2
```

**macOS:**
```bash
brew install icecast
```

Edit `/etc/icecast2/icecast.xml`:
```xml
<icecast>
  <listen-socket>
    <port>8000</port>
  </listen-socket>
  <authentication>
    <source-password>your_source_password</source-password>
    <admin-password>your_admin_password</admin-password>
  </authentication>
</icecast>
```

---

## Project Structure

```
MRadio/
├── server/
│   ├── api/           # REST API routes & controllers
│   ├── lib/           # Platform integrations (YouTube, JioSaavn, etc.)
│   ├── services/      # Business logic
│   └── utils/         # Utilities & constants
├── cache/             # Cached audio files
├── data/              # Runtime data (queues, configs)
├── logs/              # Application logs
├── media/
│   ├── tracks/        # Downloaded tracks
│   └── fallback/      # Fallback audio
├── config/            # Configuration files
├── docker-compose.yml
├── Dockerfile
└── package.json
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| FFmpeg not found | Install FFmpeg: `sudo apt install ffmpeg` or `brew install ffmpeg` |
| Port already in use | Change `PORT` in `.env` or kill process using port 9126 |
| Permission denied | Run: `chmod -R 755 cache data logs media config` |
| No audio stream | Check FFmpeg installation and verify file permissions |
| Icecast connection failed | Verify Icecast is running: `curl -I http://localhost:8000/` |
| API auth errors | Verify `.env` has correct admin keys and token is included in headers |

---

## License

MIT License - see [LICENSE](LICENSE) for details.
