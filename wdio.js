const selenium = require('selenium-standalone');
const webdriverio = require('webdriverio');
const Future = require('fibers/future');
const Fiber = require('fibers');
const portastic = require('portastic');

function getAsyncCommandWrapper(fn) {
    return function (arg1, arg2, arg3, arg4, arg5) {
        if (!Fiber.current) {
            throw new Error('It seems you\'ve forgotten to wrap a call to webdriver.io method into w wdio.wrap. For details see\n' +
                'https://github.com/ziolko/wdio#errors-description');
        }

        return Future.fromPromise(fn.call(this, arg1, arg2, arg3, arg4, arg5)).wait();
    }
}

function getWaitUntilCommandWrapper(fn) {
    return getAsyncCommandWrapper(function (condition, ms, interval) {
        return fn.call(this, function () {
            return new Promise(function (resolve, reject) {
                Fiber(function () {
                    try {
                        resolve(condition());
                    } catch (error) {
                        reject(error)
                    }
                }).run();
            });
        }, ms, interval);
    });
}

exports.getBrowser = function getBrowser(options) {
    var instance = webdriverio.remote(options);

    const SYNC_COMMANDS = ['domain', '_events', '_maxListeners', 'setMaxListeners', 'emit',
        'addListener', 'on', 'once', 'removeListener', 'removeAllListeners', 'listeners',
        'getMaxListeners', 'listenerCount'];

    const SPECIAL_COMMANDS = ['waitUntil'];

    Object.keys(Object.getPrototypeOf(instance)).forEach(function (commandName) {
        if (SYNC_COMMANDS.indexOf(commandName) === -1 && SPECIAL_COMMANDS.indexOf(commandName) === -1) {
            instance[commandName] = getAsyncCommandWrapper(instance[commandName]);
        }
    });

    instance.waitUntil = getWaitUntilCommandWrapper(instance.waitUntil);

    return instance;
};

exports.wrap = function wrap(code) {
    return function (callback) {
        if (!callback) {
            var message = 'No callback for the wdio.wrap provided. For details see\n' +
                'https://github.com/ziolko/wdio#errors-description';
            throw new Error(message)
        }

        var self = this;
        Fiber(function () {
            try {
                code.call(self);
                callback();
            } catch (error) {
                callback(error);
            }
        }).run();
    }
};

exports.initSelenium = function (options, done) {
    const SELENIUM_PORT = 4444;

    if (typeof options === 'function') {
        done = options;
        options = {};
    }

    portastic.test(SELENIUM_PORT)
        .then(function (isFree) {
            if (!isFree) return done();

            selenium.install(options.install || {}, function (err) {
                if (err) return done(err);

                selenium.start(options.start || {}, function (err, process) {
                    done(err, process);
                });
            })
        })
        .catch(done);
};

exports.endSelenium = function (process) {
    if (process) process.kill();
};