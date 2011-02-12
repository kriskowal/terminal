(function (global, require) {

function debug(message) {
    //typeof console !== "undefined" && console.log(message);
}

var Q = require("q");

var terminal;

function main() {
    document.onkeypress = keypress;
    document.onkeydown = keydown;
    window.WEB_SOCKET_SWF_LOCATION = "/websocket.swf";

    var terminal = document.getElementById("terminal");
    var metrics = document.createElement("div");

    function resize() {
        metrics.setAttribute("style", "font-family: monospace; position: absolute; visibility: hidden");
        metrics.innerHTML = "X";
        document.body.appendChild(metrics);
        // first approximation
        var height = Math.max(0, Math.floor(window.innerHeight / metrics.clientHeight));
        var width = Math.max(0, Math.floor(window.innerWidth / metrics.clientWidth));
        // second approximation
        metrics.innerHTML = Array(width + 1).join("X") + Array(height).join("<br>X");
        var width = Math.max(0, Math.floor(window.innerWidth / (metrics.clientWidth / width)));
        var height = Math.max(0, Math.floor(window.innerHeight / (metrics.clientHeight / height)));
        document.body.removeChild(metrics);
        send({
            "to": "size",
            "content": {
                "height": height,
                "width": width
            }
        });
    }

    window.onresize = resize;

    var reconnect = Q.defer();
    function connectionLoop() {
        return Q.when(reconnect.promise, function () {
            reconnect = Q.defer();
            connect();
            return connectionLoop();
        });
    }
    connectionLoop();

    var id = "";
    function connect() {
        debug("connecting");
        var receiver = function () {};

        var socket = new io.Socket();
        socket.connect();
        socket.on("connect", function () {
            debug("connected");
            accumulator = "";
            send = sendText = function (text) {
                debug(text);
                socket.send(JSON.stringify(text));
            };
            send({"id": id, "location": location.hash});
            resize();
            sendText(accumulator);
            receiver = function (_id) {
                id = _id;
                receiver = function (message) {
                    terminal.innerHTML = message;
                };
            };
            document.body.className = "connected";
        });
        socket.on("message", function (message) {
            debug("message received", JSON.stringify(message));
            receiver(message);
        });
        socket.on("disconnect", function () {
            debug("disconnected");
            sendText = accumulate;
            send = ignore;
            document.body.className = "disconnected";
            setTimeout(function () {
                reconnect.resolve();
            }, 5000);
        });
    }

    reconnect.resolve();

}

var accumulator = "", send;
var accumulate = sendText = function (text) {
    accumulator += text;
}
var send, ignore;
send = ignore = function () {
};

var whichCodes = {
    "9": "\t",      // tab
    "8": "\x7f",    // backspace
    "27": "\x1b",   // escape
    "33": "[5~",    // pgUp
    "34": "[6~",    // pgDn
    "35": "[4~",    // end
    "36": "[1~",    // home
    "37": "[D",     // left
    "38": "[A",     // up
    "39": "[C",     // right
    "40": "[B",     // down
    "45": "[2~",    // ins
    "46": "[3~",    // del
    "112": "[[A",   // f1
    "113": "[[B",   // f2
    "114": "[[C",   // f3
    "115": "[[D",   // f4
    "116": "[[E",   // f5
    "117": "[17~",  // f6
    "118": "[18~",  // f7
    "119": "[19~",  // f8
    "120": "[20~",  // f9
    "121": "[21~",  // f10
    "122": "[23~",  // f11
    "123": "[24~"   // f12
};

var ctrlCodes = {
    "54":  30, // Ctrl-^
    "109": 31, // Ctrl-_
    "219": 27, // Ctrl-[
    "220": 28, // Ctrl-\
    "221": 29, // Ctrl-]
    "219": 29, // Ctrl-]
    "219": 0   // Ctrl-@
};

// keycodes that don't appear in key presses on IE,
// that must be forwarded from keydown to keypress
var forwardableCodes = {
    9: 1,
    8: 1,
    27: 1,
    33: 1,
    34: 1,
    35: 1,
    36: 1,
    37: 1,
    38: 1,
    39: 1,
    40: 1,
    45: 1,
    46: 1,
    112: 1,
    113: 1,
    114: 1,
    115: 1,
    116: 1,
    117: 1,
    118: 1,
    119: 1,
    120: 1,
    121: 1,
    122: 1,
    123: 1
};

function keypress(event) {
    if (!event)
        event = global.event;
    var keyCode = event.keyCode || event.which;
    var key = "";

    if (event.altKey) {
        if (keyCode >= 65 && keyCode <= 90) {
            keyCode += 32;
        }
        if (keyCode >= 97 && keyCode <= 122) {
            key = "\x1b" + String.fromCharCode(keyCode);
        }
    } else if (event.ctrlKey) {
        if (keyCode >= 65 && keyCode <= 90) {
            key = String.fromCharCode(keyCode - 64);
        } else if (keyCode >= 97 && keyCode <= 122) {
            key = String.fromCharCode(keyCode - 96);
        } else {
            key = String.fromCharCode(ctrlCodes[keyCode]);
        }
    } else if (event.metaKey) {
        return true;
    } else if (!event.which) {
        key = whichCodes[keyCode] || "";
        if (key.length)
            key = "\x1b" + key;
    } else {
        if (keyCode === 8) {
            key = String.fromCharCode(127);
        } else {
            key = String.fromCharCode(keyCode);
        }
    }

    if (key.length)
        send(key);

    // w3c
    event.stopPropagation && event.stopPropagation();
    event.preventDefault && event.preventDefault();
    // ie
    event.cancelBubble = true;
    return false;
}

function keydown(event) {
    if (!event)
        event = global.event;
    var keyCode = event.which;
    if (keyCode) {
        if (forwardableCodes[keyCode] || event.ctrlKey || event.altKey) {
            event.which = 0;
            return keypress(event);
        }
    }
}

main();

})(
    this,
    typeof exports !== "undefined" ? require : function (id) {
        return window["/" + id];
    }
);
