FROM node:18

# Set the working directory
WORKDIR /usr/src/app

# wget is required by the compose healthcheck probe
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    dnsutils \
    ffmpeg \
    wget \
    && rm -rf /var/lib/apt/lists/*


RUN pip3 install --no-cache-dir --break-system-packages --upgrade yt-dlp \
    || (apt-get update && apt-get install -y yt-dlp && rm -rf /var/lib/apt/lists/*) \
    && mkdir -p /opt/yt-dlp \
    && ln -sf "$(command -v yt-dlp)" /opt/yt-dlp/yt-dlp \
    && /opt/yt-dlp/yt-dlp --version

ENV YOUTUBE_DL_DIR=/opt/yt-dlp

COPY package*.json ./

RUN npm install --ignore-scripts

# Copy the rest of the application files
COPY . .

# Expose the port the app runs on
EXPOSE 9126

# Command to run the application
CMD ["node", "server/index.js"]
