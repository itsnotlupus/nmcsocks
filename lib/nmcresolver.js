/**
 * The point of this module is to do exactly one thing:
 *
 * Given a hostname, transform it according to the
 * Namecoin shared database.
 *
 * Ideally, whatever it returns can either be connected
 * to directly, or can be resolved through an ordinary 
 * DNS server.
 *
 * This code should obey the spec as best as possible,
 * avoid infinite loops, and avoid hax.
 *
 *
 */

var dns = require("dns");
var ndns = require("./ndns/ndns_client");
var net = require("net");
var nmcrpc = require("./nmcrpc");

// if true, disable external DNS resolution
var private_mode = false;
// if true, prefer Tor addresses over alternatives
var tor_mode = false;
// if true, prefer i2p addresses over alternatives
var i2p_mode = false;
// if true, load a test name file that override live namecoin values
var testing = false;
var testData = {};

/**
 * The SOCKS proxy only makes ANY requests, prioritized with the
 * *_mode flags above.
 *
 * The DNS server can make ANY, IPV4, IPV6 and probably HOST requests.
 *
 * Currently, the TOR and I2P types can only be triggered by running nmcresolver.js
 * manually.
 */
const types = {
  ANY: 0,
  IPV4: 1,
  IPV6: 2,
  TOR: 3,
  I2P: 4,
  HOST: 5
};

// mostly here to break infinite delegate loops or similar shenanigans
const MAX_SCAN = 10; // tweak if we start to see legitimate cases for more record access for a single name resolution

function resolveHostWithNamecoin(host, type, counter, callback) {

  if (counter > MAX_SCAN) {
    return callback(new Error("Too many loops to resolve."));
  }

  var chunks = host.toLowerCase().split(".").reverse();
  var TLD = chunks.shift();
  if (TLD==="") { TLD = chunks.shift(); }
  if (TLD!=="bit") {
    // not one of mine. we might still need to process it though.
    switch (type) {
      case types.ANY:
      case types.HOST:
      case types.TOR:
      case types.I2P:
        callback(null, resolverAnswer(host));
        break;
      case types.IPV4:
        if (net.isIP(host)==4) {
          callback(null, resolverAnswer(host));
        } else {
          // take our chances with a resolver, if we can.
          if (private_mode) {
            callback(new Error("Cannot resolve this host in private mode."));
          } else {
            dns.resolve4(host, function(err, data){
              callback(err, resolverAnswer(data));
            });
          }
        }
        break;
      case types.IPV6:
        if (net.isIP(host)==6) {
          callback(null, resolverAnswer(host));
        } else {
          if (private_mode) {
            callback(new Error("Cannot resolve this host in private mode."));
          } else {
            dns.resolve6(host, function(err, data){
              callback(err, resolverAnswer(data));
            });
          }
        }
        break;
    }
 
    return;
  }
  var domain = chunks.shift(); // chunks now has sub-domains, if any

  getRecord("d/"+domain, "", function(err, data) {
    if (err) { return callback(err); }

    resolveFromValue(host, type, null, chunks, data, counter, callback);
  });
}

function getRecord(key, sub, callback) {

  //console.log("Resolver: getRecord(",key,")");

  if (testing) {
    if (testData[key]!=null) {
      return nameHandler(null, [{
        name:key,
        value:JSON.stringify(testData[key])
      }]);
    } else {
    }
  }

  nmcrpc.call("name_scan", [key, 1], nameHandler);

  function nameHandler(err, data) {
    if (err) { return callback(err); }

    if (data.length != 1 || data[0].name!=key) {
      return callback(new Error("Namecoin key not found"));
    }

    try {
      //console.log("Value for",key,"with sub=",sub,"is",data[0].value);
      var value = JSON.parse(data[0].value);
      // crawl into the sub.
      if (sub!="") {
        var chunks = sub.split(".").reverse();
        for (var i=0,l=chunks.length;i<l;i++) {
          value = value.map[chunks[i]];
        }
      }
    } catch(e) {
      return callback(new Error("Invalid namecoin value"));
    }
    if (value != null) {
      callback(null, value);
    } else {
      callback(new Error("Empty namecoin value."));
    }
  }
}

function mergeKeys(from, to) {
  for (var key in from) {
    switch(typeof to[key]) {
      case "undefined":
        to[key] = from[key]; break;
      case "object":
        if (to[key] == null) { 
          to[key] = from[key];
        } else {
          mergeKeys(from[key], to[key]);
        }
        break;
      default:
        // the spec calls for not clobbering data with import, so do nothing.
    }
  }
}


// This function could use some serious modularization.. XXX
function resolveFromValue(host, type, parent, chunks, value, counter, callback) {

  //console.log("resolveFromValue(",host,",",parent,",",chunks,",",value,",",counter,")");

  if (counter > MAX_SCAN) {
    return callback(new Error("Too many loops to resolve."));
  }

  // 1. delegate processing
  // we have a delegate situation if: we have a delegate key OR the whole value is an array.
  var delegate = (value instanceof Array)?value:value.delegate;
  if (delegate) {
    if (typeof delegate == "string") { delegate = [ delegate, "" ]; }
    return getRecord(delegate[0], delegate[1]||"", function(err, data) {
      if (err) { return callback(err); }

      resolveFromValue(host, type, parent, chunks, data, counter + 1, callback);
    });
  }

  // 2. import processing
  while (value.import instanceof Array && value.import.length) {
    // implemented by progressively modifying the current value.
    var import = value.import.shift();
    if (import instanceof Array) {
      return getRecord(import[0], import[1], function(err, data) {
        if (err) { 
          // XXX is this too lax?
          return resolveFromValue(host, type, parent, chunks, value, counter + 1, callback);
        }
        var subchunks = import[1].split(".").reverse();
        var base = value;
        while(subchunks.length) {
          var key = subchunks.shift();
          if (!base.map) { base.map = {}; }
          if (!base.map.key) { base.map[key] = {}; }
          base = base.map[key];
        }
        // merge items from data into base.
        mergeKeys(data, base);
        // restart processing with our changes
        resolveFromValue(host, type, parent, chunks, value, counter + 1, callback);
      });
    }
  }

  // 3. dns (/ns) resolvers are looked up here.
  var dns;
  if (value.ns&&!value.dns) { value.dns = value.ns; }
  if (value.dns) {
    dns = oneOf(value.dns);
  }

  // 4. translate should happen here
  if (value.translate) {
    var translate = value.translate;
    if (translate.substr(-1)=="@") {
      var domain=host.split(".").filter(function(e){return e!=""}).slice(-2).join("."); // XXX dammit cache me already.
      translate = translate.split("@")[0]+domain;
    }
    // XXX the spec currently says it should only apply to subs. ignoring that part for now.
    var new_host = (chunks.length?chunks.reverse().join(".")+".":"")+translate;
    return resolveHostWithNamecoin(new_host, type, counter+1, callback);
  }
  // 5. alias check.
  if (value.alias != undefined) {
    // 2 options: absolute (ends with "."), or relative to parent of current state
    var alias=value.alias;
    if (alias.substr(-1)==".") {
      // absolute alias. just use that value directly
      return resolveHostWithNamecoin(alias, type, counter+1, callback);
    }
    if (alias.substr(-1)=="@") { // something like "us.@"..
      var domain=host.split(".").filter(function(e){return e!=""}).slice(-2).join("."); // XXX could probably be cached from somewhere.
      return resolveHostWithNamecoin(alias.split("@")[0]+domain, type, counter + 1, callback);
    }
    // relative-to-parent alias..
    if (alias=="") {
      if (parent) {
        return resolveFromValue(host, type, null, [], parent, counter + 1, callback);
      }
    } else {
      // crawl the parent's map to resolve this alias..
      try {
        var aliasChunks = alias.split(".");
        var data = parent;
        while (aliasChunks.length) {
          data = data.map[aliasChunks.shift()];
        }
        return resolveFromValue(host, type, null, [], data, counter + 1, callback);
      } catch (e) {
        // XXX out-of-spec fallback. invalid relative alias, process as if it was an absolute alias.
        return resolveHostWithNamecoin(alias, type, counter+1, callback);
      }
    }
  }
  // 6. apply DNS if it is set.
  // (note: if private_mode is set, avoid this path and keep going to allow
  //  alternate resolution mechanisms to happen.)
  if (dns&&!private_mode) {
    // resolve host with @dns.
    //console.log("resolving ",host,"through dns server",dns);
    return resolveWithDNS(host, dns, function(err, data) {
      if (err) {
        postDNSprocessing();
      } else {
        callback(null, resolverAnswer(data, value.fingerprint));
      }
    });
  } else {
    postDNSprocessing();
  }

  // nominee for worst function name of 2011.
  function postDNSprocessing() {
  // map processing
  if (chunks.length) {
    var sub = chunks.shift();
    // check for a map match.
    if (!value.map || !value.map[sub]) {
      // check for a wildcard.
      if (value.map && value.map["*"]) {
        return resolveFromValue(host, type, value, [], value.map["*"], counter, callback);
      }
      // instead of giving an "host not found", do the map[""] case here.
      if (value.map && value.map[""]) {
        return resolveFromValue(host, type, parent, chunks, value.map[""], counter, callback);
      }
      // give up. if not, we'll end up resolving every sub-stuff as wildcards.
      return callback(new Error("Host not found."));
    } else {
      return resolveFromValue(host, type, value, chunks, value.map[sub], counter, callback);
    }
  }

  // 1. legacy crap: if value a string?
  if (typeof value == "string") {
    return callback(null, resolverAnswer(value)); // no fingerprints evar in this case
  }

  // enforce tor_mode
  if ((tor_mode || type==types.TOR) && value.tor) {
    return callback(null, resolverAnswer(value.tor, value.fingerprint)); // can .onion sites use https?
  }
  // enforce i2p_mode
  if ((i2p_mode || type==types.I2P) && value.i2p) {
    return callback(null, resolverAnswer(value.i2p.b32, value.fingerprint)); // I2P over SSL?
  }

  // 2. else, find some other hardcoded value to use.
  var ip;
  if (value.ip && (type==types.ANY || type==types.IPV4)) {
    ip = value.ip;
    // if it's not an ipv4 address, we ignore it.
    if (net.isIP(oneOf(ip))==4) {
      return callback(null, resolverAnswer(ip, value.fingerprint));
    }
  }
  if (value.ip6 && (type==types.ANY || type==types.IPV6)) {
    ip = value.ip6;
    // if it's not an ipv6 address, we ignore it.
    if (net.isIP(oneOf(ip))==6) {
      return callback(null, resolverAnswer(ip, value.fingerprint));
    }
  }

  // do the map[""] special case
  if (value.map && value.map[""]) {
    return resolveFromValue(host, type, parent, chunks, value.map[""], counter, callback);
  }

  callback(new Error("Host not found."));
  }
}

function oneOf(value) {
  if (typeof value == "string") { return value; }
  if (value instanceof Array) {
    return value[~~(Math.random()*value.length)];
  }
  return null;
}
function arrayOf(value) {
  if (value instanceof Array) { return value; }
  if (typeof value == "string") { return [ value ];}
  return [];
}

function resolveWithDNS(host, server, callback) {
  if (private_mode) {
    // refuse to resolve
    return callback(new Error("Cannot use external DNS server in private mode."));
  }
  ndns.resolve4(host, server, function(err, data) {
    if (err) {
      callback(err);
    } else {
      if (!data.length) { return callback(new Error("DNS server returned no results.")); }
      callback(null, data);
    }
  });
}

function resolverAnswer(answer, fingerprint) {
  return {
    answer: arrayOf(answer),
    fingerprint: arrayOf(fingerprint)
  };
}

function testMode() {
  testing = true;
  testData = require("./name_scan");
}
// allow for easy command line testing.
// # node resolve.js some.domain.name
if (process.argv[1].indexOf("nmcresolver.js")>-1) {
  if (process.argv.length<3) {
    console.log("node ./nmcresolverjs <hostname> <type>");
    process.exit(1);
  }
  testMode();
  resolveHostWithNamecoin(process.argv[2], +process.argv[3]||types.ANY, 0, function(err, data) {
    if (err) { 
      console.log("ERROR: ", err.message);
    } else {
      console.log("ANSWER:",data);
    }
  });
}

module.exports = {
  types: types,
  resolve: function(host, callback) {
    return resolveHostWithNamecoin(host, types.ANY, 0, function(err, value){
      callback(err, value);
    });
  },
  /**
   *
   */
  resolveFull: function(host, type, callback) {
    return resolveHostWithNamecoin(host, type, 0, function(err,value) {
      callback(err, value);
    });
  },
  setPrivateMode: function(flag) { private_mode = !!flag; },
  setTorMode: function(flag) { tor_mode = !!flag; },
  setI2PMode: function(flag) { i2p_mode = !!flag; },

  testMode: testMode
};

