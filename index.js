'use strict';
const sysPath = require('path');
const spawn = require('child_process').spawn;
const debug = require('debug')('brunch:server');
const logger = require('loggy');
const pushserve = require('pushserve');

const longCallbackTime = 4000; // ms.

// config: {port, hostname, command, path, publicPath}
const launch = (serverOpts, callback) => {
  if (!callback) callback = Function.prototype;
  const port = parseInt(serverOpts.port, 10);
  const host = serverOpts.hostname || 'localhost';
  const serverCommand = serverOpts.command;
  const serverPath = serverOpts.path;
  const publicPath = serverOpts.publicPath;
  let customServerTimeout;
  let server;

  const serverCb = () => {
    clearTimeout(customServerTimeout);
    const isCustom = serverPath || serverCommand;
    logger.info(isCustom ?
      'custom server started, initializing watcher' :
      `application started on http://${host}:${port}/`
    );
    callback(null, server);
  };
  if (serverPath) {
    logger.info('starting custom server');
    try {
      server = require(sysPath.resolve(serverPath));
    } catch (error) {
      logger.error(`couldn't load server ${serverPath}: ${error}`);
    }
    const serverFn = (() => {
      if (typeof server === 'function') {
        return server;
      } else if (server && typeof server.startServer === 'function') {
        return server.startServer.bind(server);
      } else {
        throw new Error('Brunch server file needs to export server function');
      }
    })();
    const opts = {port: port, hostname: host, path: publicPath};
    const serverConfig = Object.assign(opts, serverOpts.config || {});
    debug(`Invoking custom startServer with: ${JSON.stringify(serverConfig)}`);
    customServerTimeout = setTimeout(() => {
      logger.warn('custom server taking a long time to start');
      return logger.warn("**don\'t forget to invoke callback()**");
    }, longCallbackTime);
    switch (serverFn.length) {
      case 1:
        return serverFn(serverCb);
      case 2:
        return serverFn(serverConfig, serverCb);
      default:
        return serverFn(port, publicPath, serverCb);
    }
  } else if (serverCommand) {
    const commandComponents = serverCommand.split(' ');
    debug(`Invoking custom server command with: ${serverCommand}`);
    if (!commandComponents.length) {
      throw new Error('Invalid custom server command');
    }
    /* fn to kill the custom server */
    const child = spawn(commandComponents.shift(), commandComponents, {
      stdio: 'inherit'
    });
    child.close = cb => {
      child.kill();
      return typeof cb === 'function' ? cb() : undefined;
    };
    setImmediate(serverCb);
    return child;
  } else {
    const opts = {noLog: true, path: publicPath};
    return pushserve(Object.assign(opts, serverOpts), serverCb);
  }
};

exports.serve = (config) => {
  if (!config) config = {run: true};
  if (!config.run) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    let server;
    server = launch(config, error => {
      if (error) return reject(error);
      return resolve(server);
    });
  });
};
