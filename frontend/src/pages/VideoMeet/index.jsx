import React, { useEffect, useRef, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import "../../styles/videoComponent.css";
import "../../styles/emojiStyles.css";
import io from 'socket.io-client';
import { GoogleGenAI } from "@google/genai";
import { AuthContext } from '../../context/AuthContext';

// Import our new components
import { createBlankStream } from './utils/mediaHelpers';
import VideoTile from './components/VideoTile';
import Lobby from './components/Lobby';
import ChatPanel from './components/ChatPanel';
import ParticipantsPanel from './components/ParticipantsPanel';
import ConfirmDialog from './components/ConfirmDialog';
import ControlBar from './components/ControlBar';
import Whiteboard from '../components/Whiteboard';
import FloatingEmoji from './components/FloatingEmoji';
import servers from '../../enviroment';
import ShareIcon from '@mui/icons-material/Share';
import CheckIcon from '@mui/icons-material/Check';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

const SERVER_URL = servers;
const AI_SENDER  = "🤖 AI Assistant";

// Module-level WebRTC peer connections map
const connections = {};

const peerConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function VideoMeetComponent() {

    const navigate = useNavigate();
    const { getUserProfile } = useContext(AuthContext);

    // Refs
    const socketRef       = useRef();
    const socketIdRef     = useRef();
    const localVideoRef   = useRef();
    const videoListRef    = useRef([]);
    const messagesEndRef  = useRef();
    const fileInputRef    = useRef();
    const addFloatingEmojiRef = useRef();

    // Device availability
    let [videoAvailable, setVideoAvailable] = useState(true);
    let [audioAvailable, setAudioAvailable] = useState(true);
    let [screenAvailable, setScreenAvailable] = useState(false);

    // Media state
    let [video,  setVideo]  = useState();
    let [audio,  setAudio]  = useState();
    let [screen, setScreen] = useState();

    // Refs to track current media state for socket handlers (avoids stale closures)
    const videoStateRef = useRef(video);
    const audioStateRef = useRef(audio);

    // UI panels
    let [showModal,      setModal]      = useState(false);
    let [showUsersPanel, setShowUsersPanel] = useState(false);
    let [showWhiteboard,    setShowWhiteboard]    = useState(false);

    // Chat
    let [messages,    setMessages]    = useState([]);
    let [message,     setMessage]     = useState('');
    let [newMessages, setNewMessages] = useState(0);
    let [selectedFile, setSelectedFile] = useState(null);

    // Lobby / user identity
    let [askForUsername, setAskForUsername] = useState(true);
    let [username,       setUsername]       = useState('');
    let [usernameError,  setUsernameError]  = useState(false);

    // Lobby media controls (refs keep async getPermissions in sync)
    let [lobbyVideo, setLobbyVideo] = useState(true);
    let [lobbyAudio, setLobbyAudio] = useState(true);
    const lobbyVideoRef = useRef(true);
    const lobbyAudioRef = useRef(true);

    // Participants
    const [socketToUsername, setSocketToUsername] = useState({});
    const socketToUsernameRef = useRef({});
    const [connectedUsers,   setConnectedUsers]   = useState([]);
    const [participantMediaState, setParticipantMediaState] = useState({});

    // Host features
    const [hostSocketId, setHostSocketId] = useState(null);
    const [isHost, setIsHost] = useState(false);
    const [isRoomLocked, setIsRoomLocked] = useState(false);
    const [showKickConfirm, setShowKickConfirm] = useState(null);
    const [showTransferConfirm, setShowTransferConfirm] = useState(null);

    // Flash notifications
    const [notification, setNotification] = useState(null);

    // Remote video streams
    let [videos, setVideos] = useState([]);

    // Screen sharing state
    const [screenSharingSocketId, setScreenSharingSocketId] = useState(null);

    // Pinned participant state
    const [pinnedSocketId, setPinnedSocketId] = useState(null);

    // Share button state
    const [shareCopied, setShareCopied] = useState(false);

    // Floating emojis state
    const [floatingEmojis, setFloatingEmojis] = useState([]);

    const handleShare = async () => {
        const shareUrl = window.location.href;
        try {
            await navigator.clipboard.writeText(shareUrl);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = shareUrl;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
    };

    // ── Emoji reactions ─────────────────────────────────────────────────────
    const handleEmojiSelect = (emoji, shouldRotate) => {
        console.log('Emoji selected:', emoji, 'shouldRotate:', shouldRotate);
        
        // Add to local state immediately for responsiveness
        addFloatingEmoji(emoji, shouldRotate);
        
        // Emit emoji to all users
        if (socketRef.current && socketRef.current.connected) {
            console.log('Emitting emoji-reaction to server');
            socketRef.current.emit('emoji-reaction', { emoji, shouldRotate });
        } else {
            console.error('Socket not connected!', socketRef.current);
        }
    };

    const addFloatingEmoji = (emoji, shouldRotate = true) => {
        const id = Date.now() + Math.random();
        console.log('Adding floating emoji:', { id, emoji, shouldRotate });
        setFloatingEmojis(prev => [...prev, { id, emoji, shouldRotate }]);
    };
    
    // Keep the ref updated so socket listeners always have fresh function
    addFloatingEmojiRef.current = addFloatingEmoji;

    const removeFloatingEmoji = (id) => {
        setFloatingEmojis(prev => prev.filter(e => e.id !== id));
    };

    // ── Permissions & initial stream ────────────────────────────────────────
    const getPermissions = async () => {
        try {
            const vid = await navigator.mediaDevices.getUserMedia({ video: true });
            setVideoAvailable(!!vid);
            vid?.getTracks().forEach(t => t.stop());

            const aud = await navigator.mediaDevices.getUserMedia({ audio: true });
            setAudioAvailable(!!aud);
            aud?.getTracks().forEach(t => t.stop());

            setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);

            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });
            if (stream) {
                window.localStream = stream;
                // Honour lobby toggles the user may have clicked while we were loading
                if (!lobbyVideoRef.current) stream.getVideoTracks().forEach(t => t.stop());
                if (!lobbyAudioRef.current) stream.getAudioTracks().forEach(t => t.stop());
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            }
        } catch (err) {
            console.error('Permission error:', err);
        }
    };

    useEffect(() => { getPermissions(); }, []);

    // Keep refs in sync with media state (for socket handlers)
    useEffect(() => {
        videoStateRef.current = video;
        audioStateRef.current = audio;
    }, [video, audio]);

    useEffect(() => {
        getUserProfile()
            .then(data => { if (data?.name) setUsername(data.name); })
            .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Lock body scroll while in meeting (prevents keyboard/viewport shift)
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            window.localStream?.getTracks().forEach(t => t.stop());
            Object.values(connections).forEach(c => c.close());
            socketRef.current?.disconnect();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-scroll chat
    useEffect(() => {
        const chatContainer = messagesEndRef.current?.closest('.chatContainer');
        if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }, [messages]);

    // ── Local stream management ─────────────────────────────────────────────
    const onLocalStreamReady = (stream) => {
        try { window.localStream?.getTracks().forEach(t => t.stop()); } catch (_) {}

        window.localStream = stream;
        localVideoRef.current.srcObject = stream;

        // Replace tracks for all existing peers
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];

        for (const id in connections) {
            if (id === socketIdRef.current) continue;
            
            const senders = connections[id].getSenders();
            const videoSender = senders.find(s => s.track?.kind === 'video');
            const audioSender = senders.find(s => s.track?.kind === 'audio');

            // Replace or add tracks
            if (videoTrack) {
                if (videoSender) {
                    videoSender.replaceTrack(videoTrack).catch(console.error);
                } else {
                    connections[id].addTrack(videoTrack, stream);
                }
            }
            if (audioTrack) {
                if (audioSender) {
                    audioSender.replaceTrack(audioTrack).catch(console.error);
                } else {
                    connections[id].addTrack(audioTrack, stream);
                }
            }

            // Renegotiate
            connections[id].createOffer()
                .then(desc => connections[id].setLocalDescription(desc))
                .then(() => socketRef.current.emit('signal', id,
                    JSON.stringify({ sdp: connections[id].localDescription })))
                .catch(console.error);
        }

        // When a track ends, fall back to blank stream
        stream.getTracks().forEach(track => {
            track.onended = () => {
                setVideo(false);
                setAudio(false);
                try { localVideoRef.current.srcObject?.getTracks().forEach(t => t.stop()); } catch (_) {}

                const blank = createBlankStream();
                window.localStream = blank;
                localVideoRef.current.srcObject = blank;

                // Replace tracks with blank stream
                for (const id in connections) {
                    if (id === socketIdRef.current) continue;
                    const senders = connections[id].getSenders();
                    const videoSender = senders.find(s => s.track?.kind === 'video');
                    if (videoSender && blank.getVideoTracks()[0]) {
                        videoSender.replaceTrack(blank.getVideoTracks()[0]).catch(console.error);
                    }
                }
            };
        });
    };

    const getUserMedia = () => {
        const needVideo = video && videoAvailable;
        const needAudio = audio && audioAvailable;

        if (needVideo || needAudio) {
            navigator.mediaDevices.getUserMedia({
                video: needVideo,
                audio: needAudio
            })
                .then(onLocalStreamReady)
                .catch(console.error);
        } else {
            // If both are false, use blank stream
            try {
                localVideoRef.current.srcObject?.getTracks().forEach(t => t.stop());
            } catch (_) {}
            const blank = createBlankStream();
            window.localStream = blank;
            localVideoRef.current.srcObject = blank;
            
            // Replace tracks for all existing peers with blank stream
            for (const id in connections) {
                if (id === socketIdRef.current) continue;
                const senders = connections[id].getSenders();
                const videoSender = senders.find(s => s.track?.kind === 'video');
                const audioSender = senders.find(s => s.track?.kind === 'audio');
                
                if (videoSender && blank.getVideoTracks()[0]) {
                    videoSender.replaceTrack(blank.getVideoTracks()[0]).catch(console.error);
                }
                if (audioSender && blank.getAudioTracks()[0]) {
                    audioSender.replaceTrack(blank.getAudioTracks()[0]).catch(console.error);
                }
            }
        }
    };

    useEffect(() => {
        if (video !== undefined && audio !== undefined) getUserMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [video, audio]);

    // ── Screen share ────────────────────────────────────────────────────────
    const onDisplayStreamReady = (stream) => {
        // Store previous camera state to restore later
        const prevVideoState = videoStateRef.current;
        const prevAudioState = audioStateRef.current;
        
        // Stop current local stream tracks
        try { 
            window.localStream?.getTracks().forEach(t => t.stop()); 
        } catch (_) {}

        window.localStream = stream;
        localVideoRef.current.srcObject = stream;

        // Replace tracks for all existing peers using replaceTrack for seamless switching
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];

        for (const id in connections) {
            if (id === socketIdRef.current) continue;

            const senders = connections[id].getSenders();
            // Find any video sender (could have track or null track)
            const videoSender = senders.find(s => 
                s.track?.kind === 'video' || 
                (s.track === null) ||
                // Check if sender was added for video by checking transceiver mid
                (connections[id].getTransceivers?.()?.find(t => t.sender === s && t.receiver?.track?.kind === 'video'))
            );
            const audioSender = senders.find(s => s.track?.kind === 'audio');

            // Handle video track - replace if sender exists, otherwise add new track
            if (videoTrack) {
                if (videoSender) {
                    // Replace existing video track
                    videoSender.replaceTrack(videoTrack)
                        .then(() => {
                            // Renegotiate after successful replace
                            connections[id].createOffer()
                                .then(desc => connections[id].setLocalDescription(desc))
                                .then(() => socketRef.current.emit('signal', id,
                                    JSON.stringify({ sdp: connections[id].localDescription })))
                                .catch(console.error);
                        })
                        .catch(err => {
                            console.error('Error replacing video track:', err);
                            // Fallback: try adding track if replace fails
                            try {
                                connections[id].addTrack(videoTrack, stream);
                                // Renegotiate after adding track
                                connections[id].createOffer()
                                    .then(desc => connections[id].setLocalDescription(desc))
                                    .then(() => socketRef.current.emit('signal', id,
                                        JSON.stringify({ sdp: connections[id].localDescription })))
                                    .catch(console.error);
                            } catch (e) {
                                console.error('Error adding video track as fallback:', e);
                            }
                        });
                } else {
                    // No video sender exists, add the track
                    try {
                        connections[id].addTrack(videoTrack, stream);
                        // Renegotiate after adding track
                        connections[id].createOffer()
                            .then(desc => connections[id].setLocalDescription(desc))
                            .then(() => socketRef.current.emit('signal', id,
                                JSON.stringify({ sdp: connections[id].localDescription })))
                            .catch(console.error);
                    } catch (e) {
                        console.error('Error adding video track:', e);
                    }
                }
            }

            // Replace audio track if screen share has audio (don't renegotiate again)
            if (audioTrack && audioSender) {
                audioSender.replaceTrack(audioTrack).catch(console.error);
            } else if (audioTrack && !audioSender) {
                try {
                    connections[id].addTrack(audioTrack, stream);
                } catch (e) {
                    console.error('Error adding audio track:', e);
                }
            }
        }

        // Notify all users that this user is sharing screen
        socketRef.current.emit('screen-share-started', { roomPath: window.location.href });

        // When screen share track ends (user clicks "Stop sharing" in browser UI)
        stream.getVideoTracks().forEach(track => {
            track.onended = () => {
                setScreen(false);
                socketRef.current.emit('screen-share-stopped', { roomPath: window.location.href });
                
                // Stop all screen share tracks
                try { 
                    stream.getTracks().forEach(t => t.stop()); 
                } catch (_) {}

                // Return to previous camera/audio state
                restoreCameraAfterScreenShare(prevVideoState, prevAudioState);
            };
        });
    };

    // Restore camera stream after screen sharing ends
    const restoreCameraAfterScreenShare = (restoreVideo, restoreAudio) => {
        const needVideo = restoreVideo && videoAvailable;
        const needAudio = restoreAudio && audioAvailable;

        if (needVideo || needAudio) {
            navigator.mediaDevices.getUserMedia({
                video: needVideo,
                audio: needAudio
            })
                .then((stream) => {
                    try { window.localStream?.getTracks().forEach(t => t.stop()); } catch (_) {}
                    
                    window.localStream = stream;
                    localVideoRef.current.srcObject = stream;

                    const videoTrack = stream.getVideoTracks()[0];
                    const audioTrack = stream.getAudioTracks()[0];

                    // Replace tracks for all peers
                    for (const id in connections) {
                        if (id === socketIdRef.current) continue;

                        const senders = connections[id].getSenders();
                        const videoSender = senders.find(s => s.track?.kind === 'video' || (s.track === null));
                        const audioSender = senders.find(s => s.track?.kind === 'audio');

                        if (videoTrack && videoSender) {
                            videoSender.replaceTrack(videoTrack).catch(console.error);
                        }
                        if (audioTrack && audioSender) {
                            audioSender.replaceTrack(audioTrack).catch(console.error);
                        }

                        // Renegotiate
                        connections[id].createOffer()
                            .then(desc => connections[id].setLocalDescription(desc))
                            .then(() => socketRef.current.emit('signal', id,
                                JSON.stringify({ sdp: connections[id].localDescription })))
                            .catch(console.error);
                    }
                })
                .catch(console.error);
        } else {
            // Return to blank stream
            try { window.localStream?.getTracks().forEach(t => t.stop()); } catch (_) {}
            const blank = createBlankStream();
            window.localStream = blank;
            localVideoRef.current.srcObject = blank;

            // Update peers with blank stream
            for (const id in connections) {
                if (id === socketIdRef.current) continue;
                const senders = connections[id].getSenders();
                const videoSender = senders.find(s => s.track?.kind === 'video');
                if (videoSender) {
                    videoSender.replaceTrack(blank.getVideoTracks()[0]).catch(console.error);
                }
            }
        }

        // Restore states
        setVideo(restoreVideo);
        setAudio(restoreAudio);
    };

    const getDisplayMedia = () => {
        if (screen && navigator.mediaDevices.getDisplayMedia) {
            navigator.mediaDevices.getDisplayMedia({ 
                video: {
                    cursor: 'always',
                    displaySurface: 'monitor'
                }, 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            })
                .then(onDisplayStreamReady)
                .catch((err) => {
                    console.error('Screen share error:', err);
                    setScreen(false);
                });
        }
    };

    useEffect(() => {
        if (screen === true) getDisplayMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [screen]);

    // ── WebRTC signalling ───────────────────────────────────────────────────
    const gotMessageFromServer = (fromId, rawMessage) => {
        const signal = JSON.parse(rawMessage);

        if (signal.sdp) {
            connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp))
                .then(() => {
                    if (signal.sdp.type !== 'offer') return;
                    connections[fromId].createAnswer()
                        .then(desc => connections[fromId].setLocalDescription(desc))
                        .then(() => socketRef.current.emit('signal', fromId,
                            JSON.stringify({ sdp: connections[fromId].localDescription })))
                        .catch(console.error);
                })
                .catch(console.error);
        }

        if (signal.ice) {
            connections[fromId]
                .addIceCandidate(new RTCIceCandidate(signal.ice))
                .catch(console.error);
        }
    };

    // ── Chat ────────────────────────────────────────────────────────────────
    const addMessage = (data, sender, senderSocketId, type = 'text') => {
        setMessages(prev => [...prev, { sender, data, type }]);
        if (senderSocketId !== socketIdRef.current) {
            setNewMessages(prev => prev + 1);
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file size (5MB limit)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            alert('File size must be less than 5MB');
            e.target.value = '';
            return;
        }

        // Store file for preview, don't send yet
        const reader = new FileReader();
        reader.onload = (event) => {
            setSelectedFile({
                name: file.name,
                size: file.size,
                type: file.type,
                data: event.target.result
            });
        };
        reader.readAsDataURL(file);
        
        // Reset file input
        e.target.value = '';
    };

    const clearSelectedFile = () => {
        setSelectedFile(null);
    };

    const sendFile = () => {
        if (selectedFile) {
            socketRef.current.emit('file-message', selectedFile, username);
            setSelectedFile(null);
        }
    };

    const sendMessage = () => {
        // Send file if selected
        if (selectedFile) {
            sendFile();
            return;
        }
        
        // Send text message
        if (!message.trim()) return;
        socketRef.current.emit('chat-message', message, username);
        if (message.toLowerCase().startsWith('@ai') || message.toLowerCase().startsWith('#ai')) {
            askAI(message);
        }
        setMessage('');
    };

    const askAI = async (userMessage) => {
        const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GOOGLE_GEMINI_API_KEY });

        // Detect "#ai <question>" — includes full chat history as context
        const isContextAware = userMessage.toLowerCase().startsWith('#ai');
        let prompt;

        if (isContextAware) {
            const question = userMessage.replace(/#ai/i, '').trim();
            const transcript = messages
                .filter(m => m.type === 'text' && m.sender !== AI_SENDER)
                .map(m => `[${m.sender}]: ${m.data}`)
                .join('\n');
            prompt = transcript
                ? `You are an AI assistant in a video meeting. Below is the full chat transcript so far — use it as context to answer the question.\n\nChat transcript:\n${transcript}\n\nUser's question: ${question}`
                : question;
        } else {
            // Plain "@ai <question>" — no chat context
            prompt = userMessage.replace(/@ai/i, '').trim();
        }

        try {
            // Use streaming so chunks appear in real-time (much faster perceived response)
            const stream = await ai.models.generateContentStream({
                model: 'gemini-3.1-flash-lite-preview',
                contents: prompt,
            });

            let accumulated = '';
            // Insert a placeholder message that we'll update live
            setMessages(prev => [...prev, { sender: AI_SENDER, data: '…', type: 'text' }]);

            for await (const chunk of stream) {
                accumulated += chunk.text;
                setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { sender: AI_SENDER, data: accumulated, type: 'text' };
                    return updated;
                });
            }

            // Remove the local streaming message; the socket echo will re-add it for everyone
            setMessages(prev => prev.slice(0, -1));
            socketRef.current.emit('chat-message', accumulated, AI_SENDER);
        } catch (e) {
            const code = e?.status || e?.code;
            const msg =
                code === 429 ? 'Rate limit reached. Please wait a moment.' :
                code === 503 ? 'AI is currently busy. Please try again shortly.' :
                (code === 401 || code === 403) ? 'Invalid API key.' :
                'Something went wrong. Try again.';
            socketRef.current.emit('chat-message', msg, AI_SENDER);
        }
    };

    // ── Socket connection ───────────────────────────────────────────────────

    // Show flash notification
    const showNotification = (message, type = 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const connectToSocketServer = () => {
        socketRef.current = io.connect(SERVER_URL);
        socketRef.current.on('signal', gotMessageFromServer);

        socketRef.current.on('connect', () => {
            socketRef.current.emit('join-call', window.location.href);
            socketRef.current.emit('set-username', username);
            socketIdRef.current = socketRef.current.id;

            // Broadcast initial media state so others know our audio/video status
            setTimeout(() => {
                if (socketRef.current) {
                    socketRef.current.emit('media-state-change', {
                        video: videoStateRef.current,
                        audio: audioStateRef.current
                    });
                }
            }, 500);

            // Seed our own entry immediately so our name shows in VideoTile lookups
            setSocketToUsername(prev => ({ ...prev, [socketRef.current.id]: username }));
            // Add ourselves to the list (peers will arrive via user-joined)
            setConnectedUsers(prev => {
                if (prev.find(u => u.socketId === socketRef.current.id)) return prev;
                return [...prev, { socketId: socketRef.current.id, name: username }];
            });

            socketRef.current.on('all-users-names', (namesDict) => {
                socketToUsernameRef.current = { ...socketToUsernameRef.current, ...namesDict };
                setSocketToUsername(prev => ({ ...prev, ...namesDict }));
                setConnectedUsers(prev => prev.map(u => namesDict[u.socketId] ? { ...u, name: namesDict[u.socketId] } : u));
            });

            socketRef.current.on('all-users-media-states', (mediaStatesDict) => {
                setParticipantMediaState(prev => ({ ...prev, ...mediaStatesDict }));
            });

            socketRef.current.on('chat-message', addMessage);

            socketRef.current.on('file-message', (fileData, sender, socketIdSender) => {
                addMessage(fileData, sender, socketIdSender, 'file');
            });

            socketRef.current.on('media-state-change', (socketId, mediaState) => {
                setParticipantMediaState(prev => ({
                    ...prev,
                    [socketId]: mediaState
                }));
            });

            socketRef.current.on('user-username', (socketId, uname) => {
                socketToUsernameRef.current[socketId] = uname;
                setSocketToUsername(prev => ({ ...prev, [socketId]: uname }));
                setConnectedUsers(prev => {
                    const exists = prev.find(u => u.socketId === socketId);
                    if (exists) return prev.map(u => u.socketId === socketId ? { ...u, name: uname } : u);
                    return [...prev, { socketId, name: uname }];
                });
            });

            socketRef.current.on('user-left', (id) => {
                setVideos(prev => prev.filter(v => v.socketId !== id));
                setConnectedUsers(prev => prev.filter(u => u.socketId !== id));
            });

            socketRef.current.on('user-joined', (id, clients) => {
                if (!Array.isArray(clients)) return;

                clients.forEach((peerId) => {
                    connections[peerId] = new RTCPeerConnection(peerConfig);

                    connections[peerId].onicecandidate = (event) => {
                        if (event.candidate) {
                            socketRef.current.emit('signal', peerId,
                                JSON.stringify({ ice: event.candidate }));
                        }
                    };

                    // Use ontrack for track handling
                    // Note: ontrack fires once per track (video + audio), so we check if entry exists
                    connections[peerId].ontrack = (event) => {
                        const stream = event.streams[0];
                        if (!stream) return;
                        
                        // Check using the ref to get latest state (avoids stale closure)
                        const exists = videoListRef.current.find(v => v.socketId === peerId);
                        if (exists) {
                            // Update existing entry with potentially new stream
                            setVideos(prev => {
                                const updated = prev.map(v =>
                                    v.socketId === peerId ? { ...v, stream: stream } : v);
                                videoListRef.current = updated;
                                return updated;
                            });
                        } else {
                            // Add new entry only if it doesn't exist
                            setVideos(prev => {
                                // Double-check in prev state to avoid race condition
                                if (prev.find(v => v.socketId === peerId)) {
                                    return prev;
                                }
                                const updated = [...prev, { socketId: peerId, stream: stream }];
                                videoListRef.current = updated;
                                return updated;
                            });
                        }
                    };

                    const localStream = window.localStream ?? (() => {
                        const blank = createBlankStream();
                        window.localStream = blank;
                        return blank;
                    })();
                    
                    // Use addTrack instead of deprecated addStream for better track control
                    localStream.getTracks().forEach(track => {
                        connections[peerId].addTrack(track, localStream);
                    });

                    if (peerId !== socketIdRef.current) {
                        setConnectedUsers(prev => {
                            if (prev.find(u => u.socketId === peerId)) return prev;
                            const uname = socketToUsernameRef.current[peerId] || 'User';
                            return [...prev, { socketId: peerId, name: uname }];
                        });
                    }
                });

                // If we're the newly joined user, create offers to everyone
                if (id === socketIdRef.current) {
                    for (const peerId in connections) {
                        if (peerId === socketIdRef.current) continue;
                        connections[peerId].createOffer()
                            .then(desc => connections[peerId].setLocalDescription(desc))
                            .then(() => socketRef.current.emit('signal', peerId,
                                JSON.stringify({ sdp: connections[peerId].localDescription })))
                            .catch(console.error);
                    }
                }
            });

            // ── Host Feature Events ─────────────────────────────────────────

            socketRef.current.on('room-host-info', ({ hostId, isLocked }) => {
                setHostSocketId(hostId);
                setIsHost(hostId === socketRef.current.id);
                setIsRoomLocked(isLocked);
            });

            socketRef.current.on('force-muted', () => {
                setAudio(false);
                if (socketRef.current) {
                    socketRef.current.emit('media-state-change', {
                        video: videoStateRef.current,
                        audio: false
                    });
                }
                showNotification('The host has muted your microphone', 'warning');
            });

            socketRef.current.on('force-video-off', () => {
                setVideo(false);
                if (socketRef.current) {
                    socketRef.current.emit('media-state-change', {
                        video: false,
                        audio: audioStateRef.current
                    });
                }
                showNotification('The host has turned off your camera', 'warning');
            });

            socketRef.current.on('kicked-from-room', ({ reason }) => {
                showNotification('You have been removed from the meeting by the host', 'error');
                setTimeout(() => handleEndCall(), 2000);
            });

            socketRef.current.on('join-rejected', ({ reason }) => {
                if (reason === 'room_locked') {
                    showNotification('This meeting room is locked and not accepting new participants', 'error');
                    setTimeout(() => navigate('/'), 2000);
                }
            });

            socketRef.current.on('room-lock-changed', ({ isLocked, hostId }) => {
                setIsRoomLocked(isLocked);
            });

            socketRef.current.on('host-changed', ({ newHostId, oldHostId }) => {
                setHostSocketId(newHostId);
                setIsHost(newHostId === socketRef.current.id);

                if (newHostId === socketRef.current.id) {
                    showNotification('You are now the host of this meeting', 'success');
                }
            });

            // ── Screen Sharing Events ────────────────────────────────────
            socketRef.current.on('screen-share-update', ({ sharingSocketId, isSharing }) => {
                setScreenSharingSocketId(isSharing ? sharingSocketId : null);
            });

            // ── Emoji Reaction Events ────────────────────────────────────────
            socketRef.current.on('emoji-reaction', ({ emoji, shouldRotate, senderSocketId }) => {
                console.log('Received emoji-reaction:', { emoji, shouldRotate, senderSocketId, mySocketId: socketIdRef.current });
                // Don't show our own emoji again (we already showed it locally)
                if (senderSocketId !== socketIdRef.current) {
                    console.log('Adding emoji from other user');
                    // Use the ref to avoid stale closure issues
                    if (addFloatingEmojiRef.current) {
                        addFloatingEmojiRef.current(emoji, shouldRotate);
                    }
                } else {
                    console.log('Ignoring own emoji (already shown locally)');
                }
            });
        });
    };

    // ── Controls ────────────────────────────────────────────────────────────
    const connect = () => {
        if (!username.trim()) { setUsernameError(true); return; }
        setUsernameError(false);
        setAskForUsername(false);
        // Carry lobby toggle states into the call
        const initialVideo = videoAvailable && lobbyVideo;
        const initialAudio = audioAvailable && lobbyAudio;
        setVideo(initialVideo);
        setAudio(initialAudio);
        // Update refs immediately so they're available for socket handlers
        videoStateRef.current = initialVideo;
        audioStateRef.current = initialAudio;
        connectToSocketServer();
    };

    const handleEndCall = () => {
        try { localVideoRef.current.srcObject?.getTracks().forEach(t => t.stop()); } catch (_) {}
        navigate('/');
    };

    // ── Host Controls ───────────────────────────────────────────────────────

    const handleMuteUser = (targetSocketId) => {
        const roomPath = window.location.href;
        socketRef.current.emit('host-force-mute-user', {
            targetSocketId,
            roomPath
        });
    };

    const handleVideoOffUser = (targetSocketId) => {
        const roomPath = window.location.href;
        socketRef.current.emit('host-force-video-off', {
            targetSocketId,
            roomPath
        });
    };

    const handleKickUser = (targetSocketId) => {
        const roomPath = window.location.href;
        socketRef.current.emit('host-kick-user', {
            targetSocketId,
            roomPath
        });
        setShowKickConfirm(null);
    };

    const handleToggleRoomLock = () => {
        const roomPath = window.location.href;
        socketRef.current.emit('host-toggle-room-lock', {
            roomPath,
            locked: !isRoomLocked
        });
    };

    const handleTransferHost = (targetSocketId) => {
        const roomPath = window.location.href;
        socketRef.current.emit('host-transfer-host', {
            targetSocketId,
            roomPath
        });
        setShowTransferConfirm(null);
    };

    // ── Pin Feature ─────────────────────────────────────────────────────────
    const handlePinUser = (targetSocketId) => {
        if (pinnedSocketId === targetSocketId) {
            // Unpin if already pinned
            setPinnedSocketId(null);
        } else {
            // Pin the selected user
            setPinnedSocketId(targetSocketId);
        }
    };

    // ────────────────────────────────────────────────────────────────────────

    const handleChatToggle = () => {
        if (!showModal) {
            setShowUsersPanel(false);
            setShowWhiteboard(false);
            setNewMessages(0);
        }
        setModal(prev => !prev);
    };

    const handleUsersToggle = () => {
        if (!showUsersPanel) {
            setModal(false);
            setShowWhiteboard(false);
        }
        setShowUsersPanel(prev => !prev);
    };

    const handleWhiteboardToggle = () => {
        if (!showWhiteboard) {
            setModal(false);
            setShowUsersPanel(false);
        }
        setShowWhiteboard(prev => !prev);
    };

    // ── Render ───────────────────────────────────────────────────────────────
    if (askForUsername) {
        return (
            <Lobby 
                username={username}
                usernameError={usernameError}
                setUsername={setUsername}
                setUsernameError={setUsernameError}
                lobbyVideo={lobbyVideo}
                setLobbyVideo={setLobbyVideo}
                lobbyVideoRef={lobbyVideoRef}
                lobbyAudio={lobbyAudio}
                setLobbyAudio={setLobbyAudio}
                lobbyAudioRef={lobbyAudioRef}
                localVideoRef={localVideoRef}
                connect={connect}
                handleEndCall={handleEndCall}
            />
        );
    }

    return (
        <div className="meetVideoContainer">
            <ChatPanel 
                showModal={showModal}
                messages={messages}
                username={username}
                AI_SENDER={AI_SENDER}
                fileInputRef={fileInputRef}
                handleFileSelect={handleFileSelect}
                selectedFile={selectedFile}
                clearSelectedFile={clearSelectedFile}
                message={message}
                setMessage={setMessage}
                sendMessage={sendMessage}
                messagesEndRef={messagesEndRef}
                handleChatToggle={handleChatToggle}
            />

            <ParticipantsPanel
                showUsersPanel={showUsersPanel}
                connectedUsers={connectedUsers}
                isHost={isHost}
                isRoomLocked={isRoomLocked}
                handleToggleRoomLock={handleToggleRoomLock}
                participantMediaState={participantMediaState}
                socketIdRef={socketIdRef}
                hostSocketId={hostSocketId}
                video={video}
                audio={audio}
                handleMuteUser={handleMuteUser}
                handleVideoOffUser={handleVideoOffUser}
                setShowTransferConfirm={setShowTransferConfirm}
                setShowKickConfirm={setShowKickConfirm}
                handleUsersToggle={handleUsersToggle}
                handlePinUser={handlePinUser}
                pinnedSocketId={pinnedSocketId}
            />

            <div style={{ display: showWhiteboard ? 'block' : 'none', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
                <Whiteboard
                    roomId={window.location.pathname}
                    onClose={handleWhiteboardToggle}
                    socket={socketRef.current}
                />
            </div>

            {/* ── Floating Share Button ─────────────────────────────────── */}
            <Tooltip title={shareCopied ? 'Link copied!' : 'Copy meeting link'} placement="right">
                <IconButton
                    onClick={handleShare}
                    className={`meeting-share-btn${shareCopied ? ' copied' : ''}`}
                    aria-label="Copy meeting link"
                >
                    {shareCopied ? <CheckIcon /> : <ShareIcon />}
                </IconButton>
            </Tooltip>

            <ConfirmDialog 
                showKickConfirm={showKickConfirm}
                setShowKickConfirm={setShowKickConfirm}
                handleKickUser={handleKickUser}
                showTransferConfirm={showTransferConfirm}
                setShowTransferConfirm={setShowTransferConfirm}
                handleTransferHost={handleTransferHost}
                connectedUsers={connectedUsers}
            />

            <ControlBar
                video={video}
                setVideo={setVideo}
                audio={audio}
                setAudio={setAudio}
                screen={screen}
                setScreen={setScreen}
                screenAvailable={screenAvailable}
                socketRef={socketRef}
                handleEndCall={handleEndCall}
                newMessages={newMessages}
                handleChatToggle={handleChatToggle}
                showModal={showModal}
                connectedUsersLength={connectedUsers.length}
                handleUsersToggle={handleUsersToggle}
                showUsersPanel={showUsersPanel}
                handleWhiteboardToggle={handleWhiteboardToggle}
                showWhiteboard={showWhiteboard}
                onEmojiSelect={handleEmojiSelect}
            />

            {/* ── Floating Emojis ─────────────────────────────────────────── */}
            <FloatingEmoji emojis={floatingEmojis} onComplete={removeFloatingEmoji} />

            {/* ── Local Video PIP ──────────────────────────────────────── */}
            <div className="localVideoWrapper" style={{ display: showWhiteboard ? 'none' : 'block' }}>
                <video
                    ref={localVideoRef}
                    className="meetUserVideo"
                    autoPlay
                    muted
                    style={{ display: video === false ? 'none' : undefined }}
                />
                {video === false && (
                    <div className="localVideoAvatar">
                        <span>{(username || 'Y')[0].toUpperCase()}</span>
                        <small>Cam off</small>
                    </div>
                )}
            </div>

            {/* ── Remote Videos ────────────────────────────────────────── */}
            <div className="conferenceView">
                {videos
                    .filter(v => {
                        // If someone is pinned, only show that user's video
                        if (pinnedSocketId) {
                            return v.socketId === pinnedSocketId;
                        }
                        // If someone is sharing screen, only show that user's video
                        if (screenSharingSocketId) {
                            return v.socketId === screenSharingSocketId;
                        }
                        return true;
                    })
                    .map((v) => (
                        <VideoTile
                            key={v.socketId}
                            stream={v.stream}
                            socketId={v.socketId}
                            username={connectedUsers.find(u => u.socketId === v.socketId)?.name || socketToUsername[v.socketId] || ''}
                            mediaState={participantMediaState[v.socketId]}
                            isScreenSharing={screenSharingSocketId === v.socketId}
                            isPinned={pinnedSocketId === v.socketId}
                        />
                    ))}
            </div>

            {/* Flash Notification */}
            {notification && (
                <div className={`flash-notification ${notification.type}`}>
                    {notification.message}
                </div>
            )}
        </div>
    );
}
