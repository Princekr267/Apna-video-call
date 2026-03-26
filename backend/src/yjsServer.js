/**
 * Yjs WebSocket Server for Collaborative Notepad
 * Integrated with main HTTP server on /yjs path
 */

import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';

const docs = new Map();
const conns = new Map();        // Set<WebSocket> per room
const awareness = new Map();    // awarenessProtocol.Awareness per room

const getYDoc = (roomName) => {
    if (!docs.has(roomName)) {
        const doc = new Y.Doc();
        docs.set(roomName, doc);
        conns.set(roomName, new Set());

        // Create a shared Awareness instance for the room
        const roomAwareness = new awarenessProtocol.Awareness(doc);
        awareness.set(roomName, roomAwareness);

        // Broadcast doc updates to all clients in the room
        doc.on('update', (update) => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 0);
            syncProtocol.writeUpdate(encoder, update);
            const message = encoding.toUint8Array(encoder);

            conns.get(roomName)?.forEach((conn) => {
                if (conn.readyState === 1) { // WebSocket.OPEN
                    conn.send(message);
                }
            });
        });

        // Broadcast awareness updates to all OTHER clients in the room
        roomAwareness.on('update', ({ added, updated, removed }, origin) => {
            const changedClients = added.concat(updated).concat(removed);
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 1); // awareness message type
            encoding.writeVarUint8Array(
                encoder,
                awarenessProtocol.encodeAwarenessUpdate(roomAwareness, changedClients)
            );
            const message = encoding.toUint8Array(encoder);

            conns.get(roomName)?.forEach((conn) => {
                // Send to all clients including the sender so everyone is in sync
                if (conn.readyState === 1) {
                    conn.send(message);
                }
            });
        });
    }
    return docs.get(roomName);
};

export const setupYjsWebSocket = (server) => {
    const wss = new WebSocketServer({
        noServer: true,
        path: '/yjs'
    });

    // Handle upgrade requests for /yjs path
    server.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

        if (pathname.startsWith('/yjs')) {
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request);
            });
        }
    });

    wss.on('connection', (ws, req) => {
        // Extract room name from URL path (e.g., /yjs/room123)
        const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
        const roomName = pathname.replace('/yjs/', '') || 'default';
        const doc = getYDoc(roomName);
        const roomAwareness = awareness.get(roomName);

        // Add connection to room
        conns.get(roomName).add(ws);

        console.log(`[Yjs] Client connected to room: ${roomName}`);

        // Send sync step 1
        const encoderSync = encoding.createEncoder();
        encoding.writeVarUint(encoderSync, 0);
        syncProtocol.writeSyncStep1(encoderSync, doc);
        ws.send(encoding.toUint8Array(encoderSync));

        // Track which awareness clientIds belong to this WebSocket connection
        const wsClientIds = new Set();

        const messageHandler = (message) => {
            try {
                const decoder = decoding.createDecoder(new Uint8Array(message));
                const encoder = encoding.createEncoder();
                const messageType = decoding.readVarUint(decoder);

                switch (messageType) {
                    case 0: // Sync
                        encoding.writeVarUint(encoder, 0);
                        syncProtocol.readSyncMessage(decoder, encoder, doc, ws);
                        if (encoding.length(encoder) > 1) {
                            ws.send(encoding.toUint8Array(encoder));
                        }
                        break;
                    case 1: // Awareness — apply and let the room awareness 'update' event broadcast it
                        awarenessProtocol.applyAwarenessUpdate(
                            roomAwareness,
                            decoding.readVarUint8Array(decoder),
                            ws
                        );
                        // Record this client's awareness clientIds for cleanup on disconnect
                        roomAwareness.getStates().forEach((_, clientId) => {
                            wsClientIds.add(clientId);
                        });
                        break;
                }
            } catch (err) {
                console.error(`[Yjs] Message handling error in room ${roomName}:`, err.message);
            }
        };

        ws.on('message', messageHandler);

        ws.on('close', () => {
            conns.get(roomName)?.delete(ws);
            // Remove only this connection's awareness states (cursor/user info)
            if (wsClientIds.size > 0) {
                awarenessProtocol.removeAwarenessStates(
                    roomAwareness,
                    Array.from(wsClientIds),
                    null
                );
            }
            console.log(`[Yjs] Client disconnected from room: ${roomName}`);
        });

        ws.on('error', (error) => {
            console.error(`[Yjs] WebSocket error in room ${roomName}:`, error.message);
        });
    });

    wss.on('error', (error) => {
        console.error('[Yjs] Server error:', error.message);
    });

    console.log('[Yjs] WebSocket server integrated on path /yjs');
};
