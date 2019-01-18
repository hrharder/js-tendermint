'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var url = require('url');
var debug = require('debug')('tendermint-node');
var _exec = require('execa');
var _spawn = require('cross-spawn');

var _require = require('./rpc.js'),
    RpcClient = _require.RpcClient;

var flags = require('./flags.js');

var logging = process.env.TM_LOG;
var binPath = process.env.TM_BINARY || require.resolve('../bin/tendermint');

function exec(command, opts, sync) {
  var args = [command].concat(_toConsumableArray(flags(opts)));
  debug('executing: tendermint ' + args.join(' '));
  var res = (sync ? _exec.sync : _exec)(binPath, args);
  maybeError(res);
  return res;
}

function spawn(command, opts) {
  var args = [command].concat(_toConsumableArray(flags(opts)));
  debug('spawning: tendermint ' + args.join(' '));
  var child = _spawn(binPath, args);

  setTimeout(function () {
    try {
      child.stdout.resume();
      child.stderr.resume();
    } catch (err) {}
  }, 4000);

  if (logging) {
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
  }

  var promise = new Promise(function (resolve, reject) {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  child.then = promise.then.bind(promise);
  child.catch = promise.catch.bind(promise);
  return child;
}

function maybeError(res) {
  if (res.killed) return;
  if (res.then != null) {
    return res.then(maybeError);
  }
  if (res.code !== 0) {
    throw Error('tendermint exited with code ' + res.code);
  }
}

function node(path) {
  var opts = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

  if (typeof path !== 'string') {
    throw Error('"path" argument is required');
  }

  opts.home = path;
  var child = spawn('node', opts);
  var rpcPort = getRpcPort(opts);
  return setupChildProcess(child, rpcPort);
}

function lite(target, chainId, path) {
  var opts = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};

  if (typeof target !== 'string') {
    throw Error('"target" argument is required');
  }
  if (typeof chainId !== 'string') {
    throw Error('"chainId" argument is required');
  }
  if (typeof path !== 'string') {
    throw Error('"path" argument is required');
  }

  opts.node = target;
  opts['chain-id'] = chainId;
  opts['home-dir'] = path;
  var child = spawn('lite', opts);
  var rpcPort = getRpcPort(opts, 8888);
  return setupChildProcess(child, rpcPort);
}

function setupChildProcess(child, rpcPort) {
  var rpc = RpcClient('http://localhost:' + rpcPort);
  var _started = void 0,
      _synced = void 0;

  return Object.assign(child, {
    rpc: rpc,
    started: function started(timeout) {
      if (_started) return _started;
      _started = waitForRpc(rpc, child, timeout);
      return _started;
    },
    synced: function synced() {
      var timeout = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : Infinity;

      if (_synced) return _synced;
      _synced = waitForSync(rpc, child, timeout);
      return _synced;
    }
  });
}

function getRpcPort(opts) {
  var defaultPort = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 26657;

  if (!opts || (!opts.rpc || !opts.rpc.laddr) && !opts.laddr) {
    return defaultPort;
  }
  var parsed = url.parse(opts.laddr || opts.rpc.laddr);
  return parsed.port;
}

var waitForRpc = wait(async function (client) {
  await client.status();
  return true;
});

var waitForSync = wait(async function (client) {
  var status = await client.status();
  return status.sync_info.catching_up === false && Number(status.sync_info.latest_block_height) > 0;
});

function wait(condition) {
  return async function (client, child) {
    var timeout = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 30 * 1000;

    var start = Date.now();
    while (true) {
      var elapsed = Date.now() - start;
      if (elapsed > timeout) {
        throw Error('Timed out while waiting');
      }

      try {
        if (await condition(client)) break;
      } catch (err) {}

      await sleep(1000);
    }
  };
}

function sleep(ms) {
  return new Promise(function (resolve) {
    return setTimeout(resolve, ms);
  });
}

module.exports = {
  node: node,
  lite: lite,
  init: function init(home) {
    return exec('init', { home: home });
  },
  initSync: function initSync(home) {
    return exec('init', { home: home }, true);
  },
  version: function version() {
    return exec('version', {}, true).stdout;
  },
  genValidator: function genValidator() {
    return exec('gen_validator', {}, true).stdout;
  }
};