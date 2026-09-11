FROM node:22-alpine

# Set the working directory
WORKDIR /usr/src/app

# Install runtime dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    bind-tools \
    ffmpeg \
    wget

RUN pip3 install --break-system-packages --upgrade yt-dlp \
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
