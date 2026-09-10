FROM node:18

# Set the working directory
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    dnsutils \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*


# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose the port the app runs on
EXPOSE 9126

# Command to run the application
CMD ["node", "server/index.js"]
