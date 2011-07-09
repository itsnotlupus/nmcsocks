/**
 * The point of this module is to do exactly one thing:
 * Given a hostname, massage it according to the
 * Namecoin shared database.
 *
 * Ideally, whatever it returns can either be connected
 * to directly, or can be resolved through an ordinary 
 * DNS server.
 *
 * This code should obey the spec as best as possible,
 * avoid infinite loops, and avoid hax.q
 *
 *
 */

var dns = require("./ndns/ndns-client");

// if true, disable external DNS resolution
var private_mode = false;
// if true, prefer Tor addresses over alternatives
var tor_mode = false;
// if true, prefer i2p addresses over alternatives
var i2p_mode = false;

function resolveHostWithNamecoin(host, callback) {
  var chunks = host.toLowerCase().split(".").reverse();
  var TLD = chunks.shift();
  if (TLD==="") { TLD = chunks.shift(); }
  if (TLD!=="bit") {
    // not one of mine.
    callback(null, host);
    return;
  }
  var domain = chunks.shift(); // chunks now has sub-domains, if any
  require("./nmcrpc").call("name_scan", ['d/'+domain, 1], function(err, data) {
    if (err) {
      callback(err);
      return;
    }
    if (data.length!=1 || data[0].name!='d/'+domain) {
      callback(new Error("host not found"));
      return;
    }
    try {
      var value = JSON.parse(data[0].value);
    } catch (e) {
      callback(new Error("Invalid namecoin value"));
      return;
    }

    // we're in business. Try to resolve to something useful.
    resolveFromValue(host, chunks, value, callback);

  });
}

function resolveFromValue(host, chunks, value, callback) {
  // 1. delegate and import directives should be processed here. XXX :

  // 2. dns (/ns) resolvers should be looked up here. XXX
  var dns;
  if (value.ns&&!value.dns) { value.dns = value.ns; }
  if (value.dns) {
    if (typeof value.dns == "string") {
      dns = value.dns;
    } else if (value.dns instanceof Array) {
      dns = value.dns[~~(Math.random()*value.dns.length)];
    }
  }


  // 3. translate should happen here
  if (value.translate) {
    // XXX the spec currently says it should only apply to subs. ignoring that part for now.
    var new_host = chunks.reverse().join(".")+"."+value.translate;
    return resolveHostWithNamecoin(new_host, callback); // XXX add something to prevent two domains from playing translate ping-pong.
  }
  // 4. alias check.
  if (value.alias) {
    // I don't keep enough state to implement that right now. XXX :'(
  }
  // 5. apply DNS if it is set.
  // (note: if private_mode is set, avoid this path and keep going to allow
  //  alternate resolution mechanisms to happen.)
  if (dns&&!private_mode) {
    // resolve host with @dns.
    return resolveWithDNS(host, dns, callback);
  }

  // map processing
  if (chunks.length) {
    var sub = chunks.shift();
    // check for a map match.
    if (!value.map || !value.map[sub]) {
      // check for a wildcard.
      if (value.map && value.map["*"]) {
        return resolveFromValue(host, [], value.map["*"], callback);
      }
      return callback(new Error("Host not found"));
    }
    return resolveFromValue(host, chunks, value.map[sub], callback);
  }
  // 1. legacy crap: if value a string?
  if (typeof value == "string") {
    return callback(null, value);
  }

  // enforce tor_mode
  if (tor_mode && value.tor) {
    return callback(null, value.tor);
  }
  // enforce i2p_mode
  if (i2p_mode && value.i2p) {
    return callback(null, value.i2p.b32);
  }

  // 2. else, find some other hardcoded value to use.
  if (value.ip) {
    if (typeof value.ip == "string") {
      return callback(null, value.ip);
    }
    if (value.ip instanceof Array) {
      return callback(null, value.ip[~~(Math.random()*value.ip.length)]);
    }
  }

  // do the map[""] special case
  if (value.map && value.map[""]) {
    return resolveFromValue(host, chunks, value.map[""], callback);
  }

  // last-ditch attempts. Those are likely to fail.
  if (value.tor) { return callback(null, value.tor); }
  if (value.i2p) { return callback(null, value.i2p.b32); }

  callback(new Error("Host not found, or something's not implemented"));
}

function resolveWithDNS(host, server, callback) {
  if (private_mode) {
    // refuse to resolve
    return callback(new Error("Cannot use external DNS server in private mode."));
  }
  dns.resolve4(host, server, function(err, data) {
    if (err) {
      callback(err);
    } else {
      callback(null, data[~~(Math.random()*data.length)]);
    }
  });
}

function setPrivateMode(flag) {
  private_mode = !!flag;
}
function setTorMode(flag) {
  tor_mode = !!flag;
}
function setI2PMode(flag) {
  i2p_mode = !!flag;
}

// allow for easy command line testing.
// # node resolve.js some.domain.name
if (process.argv[1].indexOf("resolve.js")>-1) {
resolveHostWithNamecoin(process.argv[2], function(err, data) {
  if (err) { 
    console.log("ERROR: ", err.message);
  } else {
    console.log(data);
  }
});
}

module.exports = {
  resolve: resolveHostWithNamecoin,
  setPrivateMode: setPrivateMode,
  setTorMode: setTorMode,
  setI2PMode: setI2PMode
};

