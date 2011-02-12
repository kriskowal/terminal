
var PROCESS = process;
var CONN = require("q-comm/socket.io-server");
var Q = require("q-util");
var SOCKET_IO = require("socket.io");
var HTTP = require("q-http");
var JAQUE = require("jaque");
var UTIL = require("n-util");
var SYS = require("util");
var connect = require("./connection").connect;

var port = process.argv[2] || 80;
//var development = !!process.argv[3];

// create a JSGI app that serves up the index and scripts
var app = (
   //development ?
        JAQUE.Branch({
            "": JAQUE.File("www/terminal.html"),
            "index.html": JAQUE.PermanentRedirect("/")
        }, JAQUE.FileTree("www"))
   //:
   //    JAQUE.Branch({
   //        "": JAQUE.File("www/build.html"),
   //        "index.html": JAQUE.PermanentRedirect("/"),
   //        "build.js": JAQUE.File("www/build.js"),
   //        "terminal.css": JAQUE.File("www/terminal.css")
   //    })
);

// create a JSGI server
var server = HTTP.Server(JAQUE.Decorators([
    JAQUE.Error,
    JAQUE.Log,
    JAQUE.ContentLength
], app));

// start a socket.io server on the same node server
var socketIo = SOCKET_IO.listen(server.nodeServer);

// start the JSGI server
Q.when(server.listen(port), function () {
    console.log("Listining on " + port);

    CONN.Server(socketIo, connect);

    var siginted;
    PROCESS.on("SIGINT", function () {
        if (siginted)
            throw new Error("Force-stopped.");
        siginted = true;
        server.stop();
    });

    return Q.when(server.stopped, function () {
        return Q.when(server.stop(), function () {
            console.log("Server stopped");
        });
    });

}, Q.error);

