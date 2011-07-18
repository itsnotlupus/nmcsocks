/**
 * This file is meant to provide TLS support for NmcSocks
 * for the purpose of escaping the evils of centralized control.
 *
 * Specifically, it should enable .bit domains that have a
 * certificate fingerprint in their record to appear to be
 * valid SSL sites.
 *
 * The idea is two-fold:
 *
 * when connecting to a host on port 443 with a known fingerprint,
 * handle the TLS negotiation entirely here, make sure the
 * certificate used match the fingerprint.
 *
 * then start a new tls session on the client socket, using a 
 * certificate signed by a very special root CA.
 *
 * (Step 0 of this cunning plan involves creating a root certificate
 *  at install time, and get the user to install that in their browsers.)
 *
 */

var crypto = require("crypto");
var tls = require("tls");
var dcrypt = require("dcrypt");
var qs = require("querystring");
var fs = require("fs");

var data_dir = null;

function getDefaultDataDir(app) {
  var lowapp = app.toLowerCase();
  switch(process.platform) {
    case "win32":
      return process.env.APPDATA + "/" + app;
    case "darwin":
      return process.env.HOME + "/Library/Application Support/" + app;
    case "linux":
    default:
      return process.env.HOME + "/."+lowapp;
  }
}

function getDataDir() {
  if (!data_dir) {
    return getDefaultDataDir("NmcSocks");
  } else {
    return data_dir;
  }
}

function setDataDir(dir) {
  data_dir = dir;
}

function initDataDir() {
  var dir = getDataDir();
  try { stats = fs.statSync(dir); } catch (e) { fs.mkdirSync(dir, 0755); }
  dir += "/certs";
  try { stats = fs.statSync(dir); } catch (e) { fs.mkdirSync(dir, 0755); }
}

function readFile(filename, callback) {
  initDataDir();
  var file = getDataDir() + "/" + filename;
  fs.readFile(file, callback);
}

function writeFile(filename, data, callback) {
  initDataDir();
  var file = getDataDir() + "/" + filename;
  fs.writeFile(file, data, callback);
}

function clientConnect(port, host, hostname, fingerprints, callback) {
  var socket = tls.connect(port, host, {}, function() {
    var cert = s.pair.ssl.getPeerCertificate();
    var subject = qs.parse(cert.subject,"/");
    var common_name = subject.CN.toLowerCase();
    var fingerprint = cert.fingerprint;
    if (cert.subject !== cert.issuer) {
      socket.destroy();
      return callback(new Error("Certificate is NOT self-signed."));
    }
    hostname = hostname.toLowerCase();
    if (hostname === common_name ||
        (common_name.charAt(0)=="*" && 
         (hostname.substr(hostname.length-common_name.length+1)==common_name.substr(1) ||
          hostname == common_name.substr(2))
        )
       ) {
      // CN matches.
    } else {
      return callback(new Error("Certificate Common Name did not match hostname."));
    }
    if (fingerprints.indexOf(fingerprint)==-1) {
      return callback(new Error("Certificate fingerprint did not match record."));
    }
    // still here? the certificate is legit.
    callback(null, socket);
  });
}

function serverConnect(socket, hostname, callback) {
  // 1. find an existing cert for this hostname if possible.
  readFile("certs/"+hostname+".cert", function(err, data) {
    if (err) {
      // we don't have one. create it.
      readFile("namecoin_root.crt", function(err, data) {
        var crt, pkey;
        if (err) {
          // we don't have a root CA? We must be new here.
          var cert = dcrypt.x509.createCert("XX", "NameCoin Internet Authoritah"); // respect it.
          // sign yourself.
          cert.x509 = dcrypt.x509.signCert(cert.x509, cert.x509, cert.pkey);
          writeFile("namecoin_root.crt", cert.x509, function(){
            writeFile("namecoin_root.key", cert.pkey, function(){
              crt = cert.x509;
              pkey = cert.pkey;
              generateCertFor(crt, pkey, hostname);
            });
          });
        } else { 
          crt = data.toString();
          readFile("namecoin_root.key", function(err, data) {
            if (err) {
              console.log("ERROR: root .crt file found, but root .key file missing. :(");
              throw(err);
            } else {
              pkey = data.toString();
              generateCertFor(crt, pkey, hostname);
            }
          });
        }
      });
  } else {
      var cert = JSON.parse(data.toString());
      startTls(socket, {cert:cert.x509, key:cert.pkey}, callback);
    }
  });
  // 2. if not, find the root CA, generate a new cert for it.
  function generateCertFor(crt, pkey, hostname) {
    var cert = dcrypt.x509.createCert("XX", hostname);
    cert.x509 = dcrypt.x509.signCert(cert.x509, crt, pkey);
    writeFile("certs/"+hostname+".cert", JSON.stringify(cert), function(){});
    startTls(socket, {cert:cert.x509, key:cert.pkey}, callback);
  }
}

// 3. use cert to startTLS on the socket. ( https://gist.github.com/848444 )
function startTls(socket, options, callback) {
  var sslcontext = crypto.createCredentials(options);
  var pair = tls.createSecurePair(sslcontext, false);
  var cleartext = pipe(pair, socket);

  pair.on("secure", function() {
    var verifyError = pair.ssl.verifyError();

    if (verifyError) {
      cleartext.authorized = false;
      cleartext.authorizationError = verifyError;
    } else {
      cleartext.authorized = true;
    }

    callback && callback();
  });

  cleartext._controlReleased = true;
  return cleartext;
}

function forwardEvents(events,emitterSource,emitterDestination) {
  var map = {}
  for(var i = 0; i < events.length; i++) {
    var name = events[i];
    var handler = (function generateForwardEvent(){
       return function forwardEvent(name) {
          return emitterDestination.emit.apply(emitterDestination,arguments)
       }
    })(name);
    map[name] = handler;
    emitterSource.on(name,handler);
  }
  return map;
}
function removeEvents(map,emitterSource) {
   for(var k in map) {
      emitter.removeListener(k,map[k])
   }
}

function pipe(pair, socket) {
  pair.encrypted.pipe(socket);
  socket.pipe(pair.encrypted);

  pair.fd = socket.fd;
  var cleartext = pair.cleartext;
  cleartext.socket = socket;
  cleartext.encrypted = pair.encrypted;
  cleartext.authorized = false;

  function onerror(e) {
    if (cleartext._controlReleased) {
      cleartext.emit('error', e);
    }
  }

  var map = forwardEvents(["timeout", "end", "close"],socket,cleartext);
  function onclose() {
    socket.removeListener('error', onerror);
    socket.removeListener('close', onclose);
    removeEvents(map,socket);
  }

  socket.on('error', onerror);
  socket.on('close', onclose);

  return cleartext;
}

// do a little bit of setup automatically. XXX
initDataDir();

module.exports = {
  clientConnect: clientConnect,
  serverConnect: serverConnect
};
