import { Server } from 'socket.io';
let io = null;

class SocketManager {
    constructor() {
        if (!SocketManager.instance) {
            SocketManager.instance = this;
            this.heartbeatInterval = 30000;
            this.heartbeatTimeout = 5000;
            this.connectedClients = new Map();
            this.bufferHeader = null;
        }
        return SocketManager.instance;
    }

    initialize(server, queue) {
        if (!io) {
            io = new Server(server);
            this.queue = queue;
            this._setupSocketEvents();
        }
        return io;
    }

    _setupSocketEvents() {
        io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);
            this.connectedClients.set(socket.id, {
                lastHeartbeat: Date.now(),
                isAlive: true
            });

            const heartbeatInterval = setInterval(() => {
                this._checkHeartbeat(socket);
            }, this.heartbeatInterval);

            socket.on('pong', () => {
                const client = this.connectedClients.get(socket.id);
                if (client) {
                    client.lastHeartbeat = Date.now();
                    client.isAlive = true;
                }
            });

            if (this.queue.bufferHeader) {
                socket.emit("bufferHeader", this.queue.bufferHeader);
            }

            socket.on('ping', () => {
                socket.emit('pong');
            });

            socket.on("bufferHeader", (header) => {
                this.queue.bufferHeader = header;
                socket.broadcast.emit("bufferHeader", this.queue.bufferHeader);
            });

            socket.on("stream", (packet) => {
                if (!this.queue.bufferHeader) return;

                socket.broadcast.emit("stream", packet);
            });

            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
                clearInterval(heartbeatInterval);
                this.connectedClients.delete(socket.id);
            });

            socket.on('joinChannel', (channelId = 'default') => {
                const room = `channel:${channelId}`;
                socket.join(room);
                console.log(`Socket ${socket.id} joined ${room}`);
            });

            socket.on('reconnect', () => {
                console.log('Client reconnected:', socket.id);
                this.connectedClients.set(socket.id, {
                    lastHeartbeat: Date.now(),
                    isAlive: true
                });
            });
        });
    }

    _checkHeartbeat(socket) {
        const client = this.connectedClients.get(socket.id);
        if (!client) return;

        if (!client.isAlive) {
            console.log('Client unresponsive, terminating:', socket.id);
            socket.disconnect(true);
            this.connectedClients.delete(socket.id);
            return;
        }

        client.isAlive = false;
        socket.emit('ping');
    }

    getIO() {
        if (!io) {
            throw new Error('Socket.io not initialized. Call initialize() first.');
        }
        return io;
    }

    getConnectedClients() {
        return Array.from(this.connectedClients.keys());
    }

    isClientConnected(socketId) {
        return this.connectedClients.has(socketId);
    }

    emit(event, data) {
        if (!io) {
            throw new Error('Socket.io not initialized. Call initialize() first.');
        }
        io.emit(event, data);
    }

    emitToClient(socketId, event, data) {
        if (!io) {
            throw new Error('Socket.io not initialized. Call initialize() first.');
        }
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
            socket.emit(event, data);
        }
    }

    broadcast(socketId, event, data) {
        if (!io) {
            throw new Error('Socket.io not initialized. Call initialize() first.');
        }
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
            socket.broadcast.emit(event, data);
        }
    }

    emitToRoom(room, event, data) {
        if (!io) {
            throw new Error('Socket.io not initialized. Call initialize() first.');
        }
        io.to(room).emit(event, data);
    }

    joinRoom(socketId, room) {
        if (!io) {
            throw new Error('Socket.io not initialized. Call initialize() first.');
        }
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
            socket.join(room);
        }
    }

    leaveRoom(socketId, room) {
        if (!io) {
            throw new Error('Socket.io not initialized. Call initialize() first.');
        }
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
            socket.leave(room);
        }
    }
}

const socketManager = new SocketManager();
export default socketManager;
