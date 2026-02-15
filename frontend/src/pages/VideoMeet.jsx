import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import "../styles/videoComponent.css";
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import io from 'socket.io-client';
import IconButton from '@mui/material/IconButton';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import ChatIcon from '@mui/icons-material/Chat';
import Badge from '@mui/material/Badge';

const server_url = "http://localhost:3000";

var connections = {};

const peerConfigConnections = {
    "iceServers":[
        {"urls": "stun:stun.l.google.com:19302"}
    ]
}

export default function VideoMeetComponent(){

    const navigate = useNavigate();
    const socketRef = useRef();
    const socketIdRef = useRef();
    
    let localVideoRef = useRef();

    let [videoAvailable, setVideoAvailable] = useState(true);
    
    let [audioAvailable, setAudioAvailable] = useState(true);

    let [video, setVideo] = useState();

    let [audio, setAudio] = useState();

    let [screen, setScreen] = useState();

    let [showModal, setModal] = useState(false);

    let [screenAvailable, setScreenAvailable] = useState();

    let [messages, setMessages] = useState([]);

    let [message, setMessage] = useState("");

    let [newMessages, setNewMessages] = useState(0);

    let [askForUsername, setAskForUsername] = useState(true);

    let [username, setUsername] = useState("");

    const videoRef = useRef([]);

    let [videos, setVideos] = useState([]);

    // if(isChrome() === false){

    // }

    const getPermissions = async () => {
        try{
            const videoPermission = await navigator.mediaDevices.getUserMedia({video: true});
                if(videoPermission){
                    setVideoAvailable(true);
                } else{
                    setVideoAvailable(false);
                }

            const audioPermission = await navigator.mediaDevices.getUserMedia({audio: true});
                if(audioPermission){
                    setAudioAvailable(true);
                } else{
                    setAudioAvailable(false);
                }
            
                if(navigator.mediaDevices.getDisplayMedia){
                    setScreenAvailable(true);
                } else{
                    setScreenAvailable(false);
                }

                if(videoAvailable || audioAvailable){
                    const userMediaStream = await navigator.mediaDevices.getUserMedia({video: videoAvailable, audio: audioAvailable});

                    if(userMediaStream){
                        window.localStream = userMediaStream;
                        if(localVideoRef.current){
                            localVideoRef.current.srcObject = userMediaStream;
                        }
                    }
                }
        } catch(err){
            console.log(err);
        }
    }

    useEffect(() => {
        getPermissions();
    }, []);

    let getUserMediaSuccess = (stream) => {
        try{
            window.localStream.getTracks().forEach(track => track.stop())
        } catch(e){
            console.log(e);
        }
        window.localStream = stream;
        localVideoRef.current.srcObject = stream;

        for(let id in connections) {
            if(id === socketIdRef.current) continue;

            connections[id].addStream(window.localStream)

            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                .then(() => {
                    socketRef.current.emit("signal", id, JSON.stringify({"sdp": connections[id].localDescription}))
                })
                .catch(e => console.log(e))
            })
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setVideo(false);
            setAudio(false);

            try{
                let tracks = localVideoRef.current.srcObject.getTracks()
                tracks.forEach(track => track.stop())
            } catch (e) { console.log(e) }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()])
            window.localStream = blackSilence();
            localVideoRef.current.srcObject = window.localStream;

            for(let id in connections){
                connections[id].addStream(window.localStream)
                connections[id].createOffer().then((description) => {
                    connections[id].setLocalDescription(description)
                        .then(() => {
                            socketRef.current.emit("signal", id, JSON.stringify({"sdp": connections[id].localDescription}))
                        }).catch(e => console.log(e));
                })
            }
        })
    }

    let silence = () => {
        let ctx = new AudioContext()
        let oscillator = ctx.createOscillator();

        let dst = oscillator.connect(ctx.createMediaStreamDestination());


        oscillator.start();
        ctx.resume();
        return Object.assign(dst.stream.getAudioTracks()[0], {enabled: false})
    }

    let black = ({width = 640, height = 480} ={}) => {
        let canvas = Object.assign(document.createElement("canvas"), {width, height});

        canvas.getContext('2d').fillRect(0, 0, width, height);
        let stream = canvas.captureStream();
        return Object.assign(stream.getVideoTracks()[0], {enabled: false})
    }

    let getUserMedia = () => {
        if((video && videoAvailable) || (audio && audioAvailable)){
            navigator.mediaDevices.getUserMedia({video: video, audio: audio})
            .then(getUserMediaSuccess)
            .then((stream)=>{})
            .catch((e) => console.log(e))
        } else{
            try {
                let tracks = localVideoRef.current.srcObject.getTracks();
                tracks.forEach(track => track.stop());
            } catch(e){

            }
        }
    }
    useEffect(() => {
        if(video !== undefined && audio !== undefined){
            getUserMedia();
        }
    }, [video, audio]);

    let gotMessageFromServer = (fromId, message) => {
        let signal = JSON.parse(message)
        if(signal.sdp){
            connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(()=>{
                if(signal.sdp.type === "offer"){
                    connections[fromId].createAnswer().then((description) => {
                        connections[fromId].setLocalDescription(description).then(()=>{
                            socketRef.current.emit("signal", fromId, JSON.stringify({"sdp": connections[fromId].localDescription}))
                        }).catch(e => console.log(e))
                    }).catch(e => console.log(e))
                }
            }).catch(e => console.log(e))
        }

        if(signal.ice){
            connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e))
        }
        
    }

    let addMessage = (data, sender, socketIdSender) => {
        setMessages((prevMessages) => [
            ...prevMessages,
            {sender: sender, data: data}
        ]);
        if(socketIdSender !== socketIdRef.current){
            setNewMessages((prevNewMessages) => prevNewMessages+1)
        }
    }

    let connectToSocketServer = () => {
        socketRef.current = io.connect(server_url, {secure: false})

        socketRef.current.on("signal", gotMessageFromServer)

        socketRef.current.on("connect", () => {
            socketRef.current.emit("join-call", window.location.href)

            socketIdRef.current = socketRef.current.id

            socketRef.current.on("chat-message", addMessage)

            socketRef.current.on("user-left", (id) => {
                setVideos((videos) => videos.filter((video) => video.socketId !== id))
            })

            socketRef.current.on("user-joined", (id, clients) => {
                console.log('user-joined event received:', { id, clients });
    
                if (!clients || !Array.isArray(clients)) {
                    console.warn('Clients is undefined or not an array');
                    clients = []; // Set to empty array to prevent error
                }
                clients.forEach((socketListId) => {
                    connections[socketListId] = new RTCPeerConnection(peerConfigConnections)

                    connections[socketListId].onicecandidate = (event) => {
                        if(event.candidate != null){
                            socketRef.current.emit("signal", socketListId, JSON.stringify({'ice': event.candidate}))
                        }
                    }

                    connections[socketListId].onaddstream = (event) => {

                        let videoExists = videoRef.current.find(video => video.socketId === socketListId)

                        if(videoExists){
                            setVideos(videos => {
                                const updateVideos = videos.map(video =>
                                    video.socketId === socketListId ? {...video, stream: event.stream} : video
                                );
                                    videoRef.current = updateVideos;
                                    return updateVideos;
                        })
                        } else{
                            let newVideo = {
                                socketId: socketListId,
                                stream: event.stream,
                                autoPlay: true,
                                playsinline: true
                            }
                            setVideos(videos => {
                                const updateVideos = [...videos, newVideo];
                                videoRef.current = updateVideos;
                                return updateVideos;
                            });
                        }

                    };
                    if(window.localStream !== undefined && window.localStream !==null){
                        connections[socketListId].addStream(window.localStream);

                    } else{
                        let blackSilence = (...args) => new MediaStream([black(...args), silence()])
                        window.localStream = blackSilence();
                        connections[socketListId].addStream(window.localStream);
                    }

                });

                if(id===socketIdRef.current){
                    for(let id2 in connections) {
                        if(id2 === socketIdRef.current) continue

                        try{
                            connections[id2].addStream(window.localStream)
                        } catch(e) {}

                        connections[id2].createOffer().then((description) => {
                            connections[id2].setLocalDescription(description)
                            .then(() => {
                                socketRef.current.emit("signal", id2, JSON.stringify({"sdp": connections[id2].localDescription}))
                            })
                            .catch(e => console.log(e))
                        })
                    }
                }
            })
        })
    }

    let getMedia = () => {
        setVideo(videoAvailable);
        setAudio(audioAvailable);

        connectToSocketServer();
    }

    let routeTo = useNavigate();
    
    let connect = () => {
        setAskForUsername(false);
        getMedia(); 
    }

    let handleVideo = () => {
        setVideo(!video)
    }
    let handleAudio = () => {
        setAudio(!audio)
    }

    let handleScreen = () => {
        setScreen(!screen);
    }

    let getDisplayMediaSuccess = (stream) => {
        try{
            window.localStream.getTracks().forEach(track => track.stop())
        } catch(e) {console.log(e)}

        window.localStream = stream;
        localVideoRef.current.secObject = stream;

        for(let id in connections){
            if(id === socketIdRef.current) continue;

            connections[id].addStream(window.localStream)
            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                .then(() => {
                    socketRef.current.emit("signal", id, JSON.stringify({"sdp": connections[id].localDescription}))
                })
                .catch(e => console.log(e));
            })
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setScreen(false);

            try{
                let tracks = localVideoRef.current.srcObject.getTracks()
                tracks.forEach(track => track.stop())
            } catch (e) { console.log(e) }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()])
            window.localStream = blackSilence();
            localVideoRef.current.srcObject = window.localStream;

            getUserMedia();
        })
    }

    let getDisplayMedia = () => {
        if(screen){
            if(navigator.mediaDevices.getDisplayMedia){
                navigator.mediaDevices.getDisplayMedia({video:true, audio: true})
                    .then(getDisplayMediaSuccess)
                    .then((stream) => {})
                    .catch(e => console.log(e))
            }
        }
    }
    useEffect(() => {
        if(screen !== undefined){
            getDisplayMedia();
        }
    }, [screen])

    let sendMessage = () => {
        socketRef.current.emit("chat-message", message, username);
        setMessage("");
    }

    let handleEndCall = () => {
        try{
            let tracks = localVideoRef.current.srcObject.getTracks();
            tracks.forEach(track => track.stop())
        } catch(e){}
        navigate("/"); 
    }
    return (
        <div>
            {
            askForUsername === true? 
            <div>

                <h2>Enter into Lobby</h2>
                <TextField id="outlined-basic" label="outlined" value={username} onChange={e => setUsername(e.target.value)} variant="outlined" />
                <Button variant="contained" onClick={connect}>Connect</Button>

                <div>
                    <video ref = {localVideoRef} autoPlay muted></video>
                </div>
            </div> : <div className='meetVideoContainer'>
                
                {showModal ? <div className="chatRoom">
                    <div className="chatContainer">
                        <h1>Chat</h1>

                        <div className="chattingDisplay">
                            {messages.map((item, index) => {
                                return (
                                    <div className='msg-box' key= {index}>
                                        <p style={{fontWeight: "bold"}}>{item.sender}</p>
                                        <p>{item.data}</p>
                                    </div>

                                )
                            })}
                        </div>

                        <div className="chattingArea">

                            <TextField value={message} onChange={(e) => setMessage(e.target.value)} id="standard-basic" label="Type your message" variant="standard" />
                            <Button variant="outlined" onClick={sendMessage}>Send</Button>

                        </div>
                    </div>
                </div> : <></> }

                <div className="buttonContainers">
                    <IconButton onClick={handleVideo} style={{color: "white"}}>
                        {(video === true) ? <VideocamIcon/> : <VideocamOffIcon/>}
                    </IconButton>
                    <IconButton onClick={handleEndCall} style={{color: "red"}}>
                        <CallEndIcon />
                    </IconButton>
                    <IconButton onClick={handleAudio} style={{color: "white"}}>
                        {(audio === true) ? <MicIcon/> : <MicOffIcon/>}
                    </IconButton>
                    {(screenAvailable === true) ? 
                        <IconButton onClick={handleScreen} style={{color: 'white'}}>
                            <ScreenShareIcon/>
                        </IconButton> : <IconButton style={{color: 'white'}}>
                            <StopScreenShareIcon/>
                        </IconButton>
                    }
                    <Badge badgeContent={newMessages} max={999} color='secondary'>
                        <IconButton onClick={() => setModal(!showModal)} style={{color: 'white'}}>
                            <ChatIcon/>
                        </IconButton>
                    </Badge>
                    
                </div>
                
                <video className='meetUserVideo' ref={localVideoRef} autoPlay muted></video>
                <div className='conferenceView'>
                {videos.map((video) => (
                    <div key={video.socketId}>
                        {/* <h2>{video.socketId}</h2> */}

                        <video
                        data-socket = {video.socketId}
                        ref={ref => {
                            if(ref && video.stream){
                                ref.srcObject = video.stream;
                            }
                        }}
                        autoPlay
                        ></video>
                    </div>
                ))}
                </div>
            </div>
            }

        </div>
    )
}