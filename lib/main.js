var Promise = require('bluebird');
var telnet = require('telnet-client');
var _ = require('lodash');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var emitter = false;
var connection = false;


module.exports.destroy = function () {
    if (connection) {
        connection.removeAllListeners();
        connection.end();
        connection.destroy();
        connection = false;
    }
}

module.exports.connect = (params) => {
    establishConnection(params)
        .then(OpenVPNLog)
        .then(() => {
            return OpenVPNManagement('pid');
        })
        .then(() => {
            return OpenVPNManagement('bytecount 1');
        })
        .then(() => {
            return OpenVPNManagement('hold release');
        })
        .then(() => {
            emitter.emit('connected');
        });

    return emitter
}

module.exports.connectAndKill = function (params) {
    establishConnection(params)
        .then(OpenVPNLog)
        .then(disconnectOpenVPN);

    return emitter;
}

module.exports.authorize = function (auth) {
    return OpenVPNManagement(util.format('username "Auth" "%s"', auth.user))
        .then(function () {
            OpenVPNManagement(util.format('password "Auth" "%s"', auth.pass));
        });
}

module.exports.disconnect = function () {
    return disconnectOpenVPN();
}

module.exports.cmd = function (cmd) {
    return OpenVPNManagement(cmd);
}

function establishConnection(params) {

    connection = new telnet();
    emitter = new EventEmitter();

    connection.on('end', function () {
        emitter.emit('end');
    });
    connection.on('close', function () {
        emitter.emit('close');
    });
    connection.on('error', function (error) {
        console.error(error);
        emitter.emit('error', error);
    });

    return new Promise(function (resolve) {
        resolve(
            connection.connect(
                _.defaults(params, {
                    host: '127.0.0.1',
                    port: 1337,
                    shellPrompt: '',
                    timeout: 2
                })
            )
        );
    });
}

function disconnectOpenVPN() {
    return OpenVPNManagement('signal SIGTERM');
}

function OpenVPNManagement(cmd) {
    return new Promise(function (resolve, reject) {
        setTimeout(function () {
            if (connection) {
                connection.exec(cmd, resolve);
            }
        }, 1000);
    });
}

function OpenVPNLog() {
    connection.exec('log on all', function (logsResponse) {
        connection.exec('state on', function (logsResponse) {
            connection.on('console-output', function (response) {

                _.each(response.split("\n"), function (res) {

                    if (res && res.substr(1, 5) == 'STATE') {
                        emitter.emit('state-change', res.substr(7).split(","));
                    } else if (res && res.substr(1, 4) == 'HOLD') {
                        emitter.emit('hold-waiting');
                    } else if ((res && res.substr(1, 5) == 'FATAL') || (res && res.substr(1, 5) == 'ERROR')) {
                        emitter.emit('error', res.substr(7));
                    } else if (res && res.substr(1, 9) == 'BYTECOUNT') {
                        emitter.emit('bytecount', res.substr(11).split(","));
                    } else if (res && res.substr(0, 7) == 'SUCCESS') {
                        if (res.substr(9, 3) == 'pid') {
                            emitter.emit('pid', res.substr(13));
                        }
                    } else {
                        if (res.length > 0) {
                            emitter.emit('console-output', res);
                        }
                    }
                });

            });
        });
    });
}


module.exports.getStatus = function () {
    connection.exec("status", (response) => {
        emitter.emit("console-output", response)
    })
}