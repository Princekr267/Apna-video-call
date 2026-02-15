import { Server } from "socket.io"

let connection = {}
let messages = {}
let timeOnline = {}

export const connectToSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            allowedHeaders: ["*"],
            credentials: true
        }
    });

    io.on("connection", (socket)=>{

        console.log("SOMETHING CONNECTED");

        socket.on("join-call", (path) => {
            if(connection[path] === undefined){
                connection[path] = []
            }
            connection[path].push(socket.id)
            
            timeOnline[socket.id] = new Date();

            for(let a=0; a<connection[path].length; a++){
                io.to(connection[path][a]).emit("user-joined", socket.id, connection[path]);
            }
        })
        socket.on("signal", (toId, message) => {
            io.to(toId).emit("signal", socket.id, message);
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
                console.log("messages", matchingRoom, ": ", sender, data);  //  KeyboardEvent is written in place of matching room if any error happens after this chage revert it

                connection[matchingRoom].forEach((ele) => {
                    io.to(ele).emit("chat-message", data, sender, socket.id);
                })
            }
        })
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
                        if(connection[key].length === 0){
                            delete connection[key];
                        }
                    }
                }
            }
        })
    })
    return io;
}