import { Server } from "socket.io"

let connection = {}
let messages = {}
let timeOnline = {}
let roomHosts = {}
let roomLocks = {}
let socketToRoom = {}
let socketToUsername = {}
let socketToMediaState = {}
let roomScreenSharing = {} // Track who is screen sharing in each room
const whiteboardSnapshots = {}

// Helper function to check if a user is the host of a room
const isHost = (socketId, roomPath) => {
    return roomHosts[roomPath] === socketId;
};

export const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
        },
        destroyUpgrade: false
    });

    io.on("connection", (socket)=>{

        console.log("SOMETHING CONNECTED");

        socket.on("join-call", (path) => {
            // Check if room is locked (and has a host, meaning it exists)
            if (roomLocks[path] === true && roomHosts[path]) {
                socket.emit("join-rejected", { reason: "room_locked" });
                return;
            }

            if(connection[path] === undefined){
                connection[path] = []
                // First user becomes host
                roomHosts[path] = socket.id;
                roomLocks[path] = false;
            }
            connection[path].push(socket.id)

            // Track which room this socket is in
            socketToRoom[socket.id] = path;
            timeOnline[socket.id] = new Date();

            // Send host info to joining user
            socket.emit("room-host-info", {
                hostId: roomHosts[path],
                isLocked: roomLocks[path]
            });

            const roomUsernames = {};
            const roomMediaStates = {};
            if (connection[path]) {
                for (let a = 0; a < connection[path].length; a++) {
                    const id = connection[path][a];
                    if (socketToUsername[id]) {
                        roomUsernames[id] = socketToUsername[id];
                    }
                    if (socketToMediaState[id]) {
                        roomMediaStates[id] = socketToMediaState[id];
                    }
                }
            }
            socket.emit("all-users-names", roomUsernames);
            socket.emit("all-users-media-states", roomMediaStates);

            for(let a=0; a<connection[path].length; a++){
                io.to(connection[path][a]).emit("user-joined", socket.id, connection[path]);
            }
        })
        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
        })
        socket.on("set-username", (username) => {
            socketToUsername[socket.id] = username;
            const [matchingRoom, found] = Object.entries(connection)
                .reduce(([room, isFound], [roomKey, roomValue]) => {
                    if(!isFound && roomValue.includes(socket.id)) return [roomKey, true];
                    return [room, isFound];
                }, ['', false]);
            if(found){
                connection[matchingRoom].forEach(ele => {
                    io.to(ele).emit("user-username", socket.id, username);
                });
            }
        })

        socket.on("chat-message", (data, sender) => {

            const [matchingRoom, found] = Object.entries(connection)
                .reduce(([room, isFound], [roomKey, roomValue]) => {
                    if(!isFound && roomValue.includes(socket.id)){
                        return [roomKey, true];
                    }
                    return [room, isFound];
                }, ['', false]);
            if(found === true){
                if(messages[matchingRoom] === undefined){
                    messages[matchingRoom] = []
                }
                messages[matchingRoom].push({"sender": sender, "data": data, "socket-id-sender": socket.id})

                connection[matchingRoom].forEach((ele) => {
                    io.to(ele).emit("chat-message", data, sender, socket.id);
                })
            }
        })

        // ── BROADCAST STROKE TO ROOM ──────────────────────────────
        socket.on("whiteboard:draw", ({ roomId, strokeData }) => {
            if (connection[roomId]) {
                connection[roomId].forEach((ele) => {
                    if (ele !== socket.id) io.to(ele).emit("whiteboard:draw", { strokeData });
                });
            }
        });

        // ── CLEAR BOARD ───────────────────────────────────────────
        socket.on("whiteboard:clear", ({ roomId }) => {
            whiteboardSnapshots[roomId] = null;
            if (connection[roomId]) {
                connection[roomId].forEach((ele) => {
                    if (ele !== socket.id) io.to(ele).emit("whiteboard:clear");
                });
            }
        });

        // ── NEW USER REQUESTS CURRENT BOARD STATE ─────────────────
        socket.on("whiteboard:request-sync", ({ roomId }) => {
            const snapshot = whiteboardSnapshots[roomId] || null;
            socket.emit("whiteboard:sync", { imageData: snapshot });
        });

        // ── SAVE SNAPSHOT PERIODICALLY FROM CLIENTS ───────────────
        socket.on("whiteboard:save-snapshot", ({ roomId, imageData }) => {
            whiteboardSnapshots[roomId] = imageData;
        });

        socket.on("file-message", (fileData, sender) => {
            const [matchingRoom, found] = Object.entries(connection)
                .reduce(([room, isFound], [roomKey, roomValue]) => {
                    if(!isFound && roomValue.includes(socket.id)){
                        return [roomKey, true];
                    }
                    return [room, isFound];
                }, ['', false]);
            if(found === true){
                if(messages[matchingRoom] === undefined){
                    messages[matchingRoom] = []
                }
                messages[matchingRoom].push({
                    "sender": sender, 
                    "data": fileData, 
                    "socket-id-sender": socket.id,
                    "type": "file"
                })

                connection[matchingRoom].forEach((ele) => {
                    io.to(ele).emit("file-message", fileData, sender, socket.id);
                })
            }
        })

        socket.on("media-state-change", (mediaState) => {
            socketToMediaState[socket.id] = mediaState;
            const [matchingRoom, found] = Object.entries(connection)
                .reduce(([room, isFound], [roomKey, roomValue]) => {
                    if(!isFound && roomValue.includes(socket.id)){
                        return [roomKey, true];
                    }
                    return [room, isFound];
                }, ['', false]);
            if(found === true){
                connection[matchingRoom].forEach((ele) => {
                    io.to(ele).emit("media-state-change", socket.id, mediaState);
                })
            }
        })

        // ── Screen Sharing Events ────────────────────────────────────
        socket.on("screen-share-started", ({ roomPath }) => {
            roomScreenSharing[roomPath] = socket.id;
            if (connection[roomPath]) {
                connection[roomPath].forEach((ele) => {
                    io.to(ele).emit("screen-share-update", {
                        sharingSocketId: socket.id,
                        isSharing: true
                    });
                });
            }
        });

        socket.on("screen-share-stopped", ({ roomPath }) => {
            if (roomScreenSharing[roomPath] === socket.id) {
                delete roomScreenSharing[roomPath];
                if (connection[roomPath]) {
                    connection[roomPath].forEach((ele) => {
                        io.to(ele).emit("screen-share-update", {
                            sharingSocketId: null,
                            isSharing: false
                        });
                    });
                }
            }
        });

        // ── Emoji Reaction Events ────────────────────────────────────
        socket.on("emoji-reaction", ({ emoji, shouldRotate }) => {
            console.log('Backend received emoji-reaction:', { emoji, shouldRotate, socketId: socket.id });
            
            // Use socketToRoom to find the room quickly
            const roomPath = socketToRoom[socket.id];
            console.log('Room path:', roomPath);
            
            if (roomPath && connection[roomPath]) {
                console.log('Broadcasting to room participants:', connection[roomPath]);
                connection[roomPath].forEach((ele) => {
                    io.to(ele).emit("emoji-reaction", {
                        emoji,
                        shouldRotate: shouldRotate !== undefined ? shouldRotate : true,
                        senderSocketId: socket.id
                    });
                });
            } else {
                console.log('No room found for emoji emission, socketToRoom:', socketToRoom);
            }
        });

        // ── Host Features ─────────────────────────────────────────────────

        socket.on("host-force-mute-user", ({ targetSocketId, roomPath }) => {
            if (!isHost(socket.id, roomPath)) {
                socket.emit("error", { message: "Only host can mute users" });
                return;
            }
            io.to(targetSocketId).emit("force-muted");
        });

        socket.on("host-force-video-off", ({ targetSocketId, roomPath }) => {
            if (!isHost(socket.id, roomPath)) {
                socket.emit("error", { message: "Only host can control video" });
                return;
            }
            io.to(targetSocketId).emit("force-video-off");
        });

        socket.on("host-kick-user", ({ targetSocketId, roomPath }) => {
            if (!isHost(socket.id, roomPath)) {
                socket.emit("error", { message: "Only host can kick users" });
                return;
            }
            if (targetSocketId === socket.id) {
                socket.emit("error", { message: "Cannot kick yourself" });
                return;
            }

            // Notify target user they are being kicked
            io.to(targetSocketId).emit("kicked-from-room", {
                reason: "removed_by_host"
            });

            // Force disconnect the target user
            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
                targetSocket.disconnect(true);
            }
        });

        socket.on("host-toggle-room-lock", ({ roomPath, locked }) => {
            if (!isHost(socket.id, roomPath)) {
                socket.emit("error", { message: "Only host can lock room" });
                return;
            }

            roomLocks[roomPath] = locked;

            // Broadcast to all participants in the room
            if (connection[roomPath]) {
                connection[roomPath].forEach((id) => {
                    io.to(id).emit("room-lock-changed", {
                        isLocked: locked,
                        hostId: socket.id
                    });
                });
            }
        });

        socket.on("host-transfer-host", ({ targetSocketId, roomPath }) => {
            if (!isHost(socket.id, roomPath)) {
                socket.emit("error", { message: "Only host can transfer host privileges" });
                return;
            }

            if (!connection[roomPath] || !connection[roomPath].includes(targetSocketId)) {
                socket.emit("error", { message: "Target user not in room" });
                return;
            }

            const oldHostId = roomHosts[roomPath];
            roomHosts[roomPath] = targetSocketId;

            // Broadcast to all participants
            connection[roomPath].forEach((id) => {
                io.to(id).emit("host-changed", {
                    newHostId: targetSocketId,
                    oldHostId
                });
            });
        });

        // ────────────────────────────────────────────────────────────────

        socket.on("disconnect", () => {
            var diffTime = Math.abs(timeOnline[socket.id] - new Date())

            var key;

            for(const [k, v] of JSON.parse(JSON.stringify(Object.entries(connection)))) {
                for(let a=0; a<v.length; ++a){
                    if(v[a]===socket.id){
                        key = k;
                        for(let a = 0; a<connection[key].length; ++a){
                            io.to(connection[key][a]).emit("user-left", socket.id)
                        }
                        var index = connection[key].indexOf(socket.id);
                        connection[key].splice(index, 1);

                        // Handle host disconnection
                        if (roomHosts[key] === socket.id) {
                            if (connection[key].length > 0) {
                                // Transfer host to first remaining participant
                                const newHostId = connection[key][0];
                                roomHosts[key] = newHostId;

                                // Notify all remaining participants
                                connection[key].forEach((id) => {
                                    io.to(id).emit("host-changed", {
                                        newHostId,
                                        oldHostId: socket.id
                                    });
                                });
                            } else {
                                // Last person left - cleanup room data
                                delete roomHosts[key];
                                delete roomLocks[key];
                            }
                        }

                        // Handle screen sharing disconnection
                        if (roomScreenSharing[key] === socket.id) {
                            delete roomScreenSharing[key];
                            connection[key].forEach((ele) => {
                                io.to(ele).emit("screen-share-update", {
                                    sharingSocketId: null,
                                    isSharing: false
                                });
                            });
                        }

                        if(connection[key].length === 0){
                            delete connection[key];
                            delete roomHosts[key];
                            delete roomLocks[key];
                            delete roomScreenSharing[key];
                        }
                    }
                }
            }

            // Cleanup socket to room mapping
            delete socketToRoom[socket.id];
            delete socketToUsername[socket.id];
            delete socketToMediaState[socket.id];
        })
    })
    return io;
}