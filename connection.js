
var Q = require("q-util");
var TTY = require("tty");
var Stream = require("net").Stream;
var Terminal = require("./terminal").Terminal;
var UUID = require("uuid");
var Queue = require("q/queue").Queue;

var timeout = 60000;
var sessions = {};
function Session(host) {

    var id = UUID.generate();
    var terminal = Terminal();
    var replay = "";
    var width;
    var height;
    var obsolesence = Q.defer();
    var readQueue = Queue();

    // construct the child
    var tty;
    tty = TTY.open("telnet", [host]);
    var fd = tty[0];
    var child = tty[1];
    var stream = new Stream(fd);
    stream.readable = stream.writable = true;
    stream.resume();
    stream.on("data", function (data) {
        write(data.toString("binary"));
    });
    child.on("exit", function (code) {
        write("\r\nexit: " + code);
    });

    var accumulate = function (text) {
        replay += text;
        replay = replay.slice(replay.length - 80 * 24 * 10, replay.length);
        terminal.write(text);
    };

    var connection;
    function write(text) {
        accumulate(text);
        update();
    }
    function update() {
        if (connection)
            connection.put(terminal.toHtml());
    }

    function attach(_connection) {
        console.log("attaching", id);
        connection = _connection;
        obsolesence.reject();
        obsolesence = Q.defer();
        connection.put(id);
        Q.when(connection.closed, function () {
            console.log("connection lost", id);
            if (connection === _connection)
                delete connection;
            setTimeout(obsolesence.resolve, timeout);
        });
        Q.when(obsolesence.promise, function () {
            console.log("session abandoned", id);
            child.kill();
            delete sessions[id];
        });
        function readLoop() {
            return Q.when(connection.get(), function (message) {
                readQueue.put(message);
                return readLoop();
            });
        }
        readLoop()
    }

    function readLoop() {
        return Q.when(readQueue.get(), function (message) {
            message = JSON.parse(message);
            if (typeof message === "string") {
                //console.log("stdin", JSON.stringify(message));
                write(message);
            } else {
                if (message.to === "size") {
                    var size = message.content;
                    width = size.width;
                    height = size.height;
                    TTY.setWindowSize(fd, {rows: height, columns: width});
                    terminal = Terminal(width, height);
                    terminal.write(replay);
                    update();
                }
            }
            return readLoop();
        });
    }
    readLoop();

    function writeLoop() {
        return Q.when(terminal.read(), function (message) {
            stream.write(message);
            return writeLoop();
        });
    }
    writeLoop();

    var self = {"attach": attach};
    sessions[id] = self;
    return self;
}

exports.connect = function (connection) {
    return Q.when(connection.get(), function (message) {
        console.log(message);
        message = JSON.parse(message);
        var id = message.id;
        var session;
        var match = /^#([\w\.\-]+)$/.exec(message.location || "");
        var host = match ? match[1] : "towel.blinkenlights.nl";
        if (id === "") {
            // initial connection
            console.log('new session');
            return Session(host).attach(connection);
        } else {
            if (sessions[id]) {
                // reconnection
                console.log('restore session');
                return sessions[id].attach(connection);
            } else {
                // resetting session
                console.log('dropping session');
                return Session(host).attach(connection);
            }
        }
    }, Q.error);
};

