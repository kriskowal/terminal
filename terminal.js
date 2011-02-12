
var HTML = require("./html");
var Q = require("q");

var tabWidth = 8;

exports.Terminal = Terminal;
function Terminal(width, height, screen) {
    width = width || 80;
    height = height || 24;

    var cursorBits = 0x000700;
    var cursorTop = 0;
    var cursorLeft = 0;
    var cursorTopSave = 0;
    var cursorLeftSave = 0;
    var screenTop = 0;
    var screenBottom = height;
    var screenLeft = 0;
    var screenRight = width;
    var overflow = false;
    var input = "";
    var output = "";
    var readable = Q.defer();

    if (!screen)
        reset();

    function write(output) {
        Array.prototype.forEach.call(output, function (character) {
            if (input.length || escapeSequences[character]) {
                input += character;
                escapeDispatch();
            } else if (character == "\x1b") {
                input += character;
            } else {
                echo(character);
            }
        });
    }

    function read() {
        return Q.when(readable.promise, function () {
            readable = Q.defer();
            var result = output;
            output = "";
            return output;
        });
    }

    function innerWrite(_output) {
        output += _output;
        readable.resolve();
    };

    function echo(character) {
        if (overflow) {
            cursorDown();
            cursorLeft = 0;
            overflow = false;
        }
        screen[
            width * cursorTop + cursorLeft
        ] = cursorBits | character.charCodeAt();
        cursorRight();
    }

    function reset() {
        screenTop = 0;
        screenBottom = height - 1;
        cursorLeftSave = cursorLeft = 0;
        cursorTopSave = cursorTop = 0;
        overflow = false;
        cursorBits = 0x000700;
        screen = [];
        for (var i = 0, ii = width * height; i < ii; i++) {
            screen[i] = cursorBits;
        }
        input = ""; //?
        output = ""; //?
    }

    function cursorDown() {
        if (
            cursorTop >= screenTop &&
            cursorTop <= screenBottom
        ) {
            overflow = overflow;
            var quotient = Math.floor((cursorTop + 1) / (screenBottom + 1));
            var remainder = Math.floor((cursorTop + 1) % (screenBottom + 1));
            if (quotient) {
                scrollUp(screenTop, screenBottom);
                cursorTop = screenBottom;
            } else {
                cursorTop = remainder;
            }
        }
    }

    function cursorRight() {
        var quotient = Math.floor((cursorLeft + 1) / width);
        var remainder = (cursorLeft + 1) % width;
        if (quotient) {
            overflow = true;
        } else {
            cursorLeft = remainder;
        }
    }

    function scrollUp(y1, y2) {
        poke(y1, 0, peek(y1 + 1, 0, y2, width));
        zero(y2, 0, y2, width - 1);
    }

    function scrollDown(y1, y2) {
        poke(y1 + 1, 0, peek(y1, 0, y2 - 1, width));
        zero(y1, 0, y1, width - 1);
    }

    function scrollRight(y, x) {
        poke(y, x + 1, peek(y, x, y, width));
        zero(y, x, y, x);
    }

    function peek(y1, x1, y2, x2) {
        return screen.slice(
            width * y1 + x1,
            width * y2 + x2
        );
    }

    function poke(y, x, cells) {
        var position = width * y + x;
        cells = Array.prototype.slice.call(cells);
        screen.splice.apply(
            screen,
            [
                position,
                position + cells.length
            ].concat(cells)
        );
    }

    function zero(y1, x1, y2, x2) {
        var length = width * (y2 - y1) + (x2 - x1) + 1;
        var zeroes = [];
        for (var i = 0; i < length; i++)
            zeroes[i] = 0x000700;
        screen.splice.apply(
            screen,
            [
                width * y1 + x1,
                width * y2 + x2 + 1
            ].concat(zeroes)
        );
    }

    function escapeDispatch() {
        if (input.length > 32) {
            // ERROR
            input = "";
        } else if (escapeSequences[input]) {
            escapeSequences[input](input);
            input = "";
        } else {
            for (
                var i = 0, ii = escapeExpressions.length;
                i < ii;
                i++
            ) {
                var pair = escapeExpressions[i];
                var expression = pair[0];
                var callback = pair[1];
                var match = expression.exec(input);
                if (match) {
                    callback(input, match);
                    input = "";
                    break;
                }
            }
        }
    }

    var escapeSequences = {
        "\x00": escapeIgnore,
        "\x05": escapeDa,
        "\x07": escapeIgnore,
        "\x08": escape0x08,
        "\x09": escape0x09,
        "\x0a": escape0x0a,
        "\x0b": escape0x0a,
        "\x0c": escape0x0a,
        "\x0d": escape0x0d,
        "\x0e": escapeIgnore,
        "\x0f": escapeIgnore,
        "\x1b#8": escapeIgnore,
        "\x1b=": escapeIgnore,
        "\x1b>": escapeIgnore,
        "\x1b(0": escapeIgnore,
        "\x1b(A": escapeIgnore,
        "\x1b(B": escapeIgnore,
        "\x1b[c": escapeDa,
        "\x1b[0c": escapeDa,
        "\x1b]R": escapeIgnore,
        "\x1b7": escapeSave,
        "\x1b8": escapeRestore,
        "\x1bD": escapeIgnore,
        "\x1bE": escapeIgnore,
        "\x1bH": escapeIgnore,
        "\x1bM": escapeRi,
        "\x1bN": escapeIgnore,
        "\x1bO": escapeIgnore,
        "\x1bZ": escapeDa,
        "\x1ba": escapeIgnore,
        "\x1bc": reset,
        "\x1bn": escapeIgnore,
        "\x1bo": escapeIgnore,
    };

    var escapeExpressions = [
        [/\[\??([0-9;]*)([@ABCDEFGHJKLMPXacdefghlmnqrstu`])/, controlDispatch],
        [/\]([^\x07]+)\x07/, escapeIgnore]
    ];

    function escapeIgnore() {
        /*pass*/
    }

    function escape0x08() {
        cursorLeft = Math.max(0, cursorLeft - 1);
    }

    function escape0x09() { // tab
        var advance = cursorLeft + tabWidth;
        var tabCount = Math.floor(advance / 8);
        cursorLeft = (tabCount * tabWidth) % width;
    }

    function escape0x0a() { // cr / carriage-return
        cursorDown();
    }

    function escape0x0d() { // lf / line-feed
        overflow = false;
        cursorLeft = 0;
    }

    function escapeDa() {
        // TODO figure out what this is.
        // do not understand?
        innerWrite("\x1b[?6c");
    }

    function escapeSave() {
        cursorLeftSave = cursorLeft;
        cursorTopSave = cursorTop;
    }

    function escapeRestore() {
        cursorLeft = cursorLeftSave;
        cursorTop = cursorTopSave;
        overflow = false;
    }

    function escapeRi() { // TODO figure out what this means
        cursorTop = Math.max(screenTop, cursorTop - 1);
        if (cursorTop === screenTop) {
            scrollDown(screenTop, screenBottom);
        }
    }

    function controlDispatch(sequence, match) {
        var args = match[1];
        var code = match[2];
        var callback = controlSequences[code];
        if (callback) {
            var nan = false;
            var terms = args.split(";").map(function (arg) {
                if (isNaN(arg))
                    nan = true;
                return Math.min(1024, +arg);
            });
            if (nan)
                terms = controlDefaults[code] || [1];
            callback.apply(undefined, terms);
        }
    }

    var controlSequences = {
        "@": function (count) {
            for (var i = 0; i < count; i++) {
                scrollRight(cursorTop, cursorLeft);
            }
        },
        "A": function (term) {
            cursorTop = Math.max(screenTop, cursorTop - term);
        },
        "B": function (term) {
            cursorTop = Math.min(screenBottom, cursorTop + term);
        },
        "C": function (term) {
            cursorLeft = Math.min(width - 1, cursorLeft + term);
            overflow = false;
        },
        "D": function (term) {
            cursorLeft = Math.max(0, cursorLeft - term);
            overflow = false;
        },
        "E": function (term) {
            controlSequences.B(term);
            cursorLeft = 0;
            overflow = false;
        },
        "F": function (term) {
            controlSequences.A(term);
            cursorLeft = 0;
            overflow = false;
        },
        "G": function (term) {
            cursorLeft = Math.min(width, term) - 1;
        },
        "H": function (top, left) {
            cursorTop = Math.min(height, top || 1) - 1;
            cursorLeft = Math.min(width, left || 1) - 1;
            overflow = false;
        },
        "J": function (mode) {
            if (mode === 0) {
                zero(cursorTop, cursorLeft, height - 1, width - 1);
            } else if (mode === 1) {
                zero(0, 0, cursorTop, cursorLeft);
            } else if (mode === 2) {
                zero(0, 0, height - 1, width - 1);
            }
        },
        "K": function (mode) {
            if (mode === 0) {
                zero(cursorTop, cursorLeft, cursorTop, width - 1);
            } else if (mode === 1) {
                zero(cursorTop, 0, cursorTop, cursorWidth);
            } else if (mode === 2) {
                zero(cursorTop, 0, cursorTop, width - 1);
            }
        },
        "L": function (length) {
            for (var i = 0; i < length; i++) {
                if (cursorTop < screenBottom) {
                    scrollDown(cursorTop, screenBottom);
                }
            }
        },
        "M": function (length) {
            if (cursorTop >= screenTop && cursorTop < screenBottom) {
                for (var i = 0; i < length; i++) {
                    scrollUp(cursorTop, screenBottom);
                }
            }
        },
        "P": function (length) {
            var end = peek(cursorTop, cursorLeft, cursorTop, width);
            controlSequences.K(length);
            poke(cursorTop, cursorLeft, end.slice(length));
        },
        "X": function (length) {
            zero(cursorTop, cursorLeft, cursorTop, cursorLeft + length);
        },
        "a": function (term) {
            controlSequences.C(term);
        },
        "c": function (term) {
            // '\x1b[?0c' 0-8 cursor size XXX ?
        },
        "d": function (top) {
            cursorTop = Math.min(height, top) - 1;
        },
        "e": function (term) {
            controlSequences.B(term);
        },
        "f": function (term) {
            controlSequences.H(term);
        },
        "h": function (term) {
            if (term === 4)
                ; // insert on
        },
        "l": function (term) {
            if (term === 4)
                ; // insert off
        },
        "m": function () { // color
            Array.prototype.forEach.call(arguments, function (term) {
                if (~[0, 39, 49, 27].indexOf(term)) {
                    cursorBits = 0x000700;
                } else if (term === 1) {
                    cursorBits = cursorBits | 0x000800;
                } else if (term === 7) {
                    cursorBits = 0x070000;
                } else if (30 <= term && term <= 37) {
                    var color = term - 30;
                    cursorBits = (cursorBits & 0xFF08FF) | (color << 8);
                } else if (40 <= term && term <= 47) {
                    var color = term - 40;
                    cursorBits = (cursorBits & 0x00FFFF) | (color << 16);
                } else {
                    // XXX
                }
            });
        },
        "r": function (top, bottom) {
            screenTop = Math.min(height - 1, top - 1);
            screenBottom = Math.min(height - 1, bottom - 1);
            screenBottom = Math.max(screenTop, screenBottom);
        },
        "s": escapeSave,
        "u": escapeRestore
    };

    controlSequences["`"] = controlSequences["G"];

    var controlDefaultParts = {
        "J": [0],
        "K": [0]
    };

    function toHtml() {
        var html = "";
        var span = ""; // accumulates a span
        var _background, _foreground, _cursor;
        function flush() {
            if (span.length) {
                html += (
                    '<span class="f' +
                    _foreground + ' b' +
                    _background + 
                    (_cursor ? ' cursor' : '') +
                    '">' +
                    HTML.escape(span) + '</span>'
                );
            }
            span = "";
            _background = background;
            _foreground = foreground;
            _cursor = cursor;
        }
        for (var i = 0, ii = width * height; i < ii; i++) {
            var cell = screen[i];
            var background = cell >> 16 & 0xFF;
            var foreground = cell >> 8 & 0xFF;
            var character = cell >> 0 & 0xFF;
            var cursor = i === cursorTop * width + cursorLeft;
            if (i === cursorTop * width + cursorLeft) {
                background = 0;
                foreground = 7;
            }
            if (
                cursor !== _cursor ||
                background !== _background ||
                (
                    foreground !== _foreground &&
                    character !== 0x20 &&
                    character !== 0
                ) ||
                i === height * width
            ) {
                flush();
            }
            span += String.fromCharCode(character || 0x20);
            if (!((i + 1) % width)) {
                span += "\n";
            }
        }
        flush();
        return "<pre>" + html + "</pre>";
    }

    return {
        "read": read,
        "write": write,
        "toHtml": toHtml
    };
}

function demo() {
    var terminal = Terminal();
    for (var i = 0; i < 100; i++) {
        terminal.write("\x1b[3" + (i % 7) + "m" + i + "\r\n");
    }
    terminal.write("\x1b[37m");
    terminal.write("\x1b[31mHi");
    console.log(terminal.toHtml().replace(/ /g, "_"));
}

if (module === require.main) 
    demo();

