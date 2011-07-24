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

var serial=null;
function getSerial() {
  initDataDir();
  var file = getDataDir() + "/serial.txt";
  if (serial==null) {
    try {
      serial = fs.readFileSync(file)+0||0;
    } catch(e) {
      serial = 0;
    }
  }
  serial+=1;
  fs.writeFile(file, ""+serial); // don't need to block on that part.
  return serial;
}

function clientConnect(port, host, hostname, fingerprints, callback) {
  var socket = tls.connect(port, host, {}, function() {
    var cert = socket.pair.ssl.getPeerCertificate();
    var subject = qs.parse(cert.subject,"/");
    var common_name = subject.CN.toLowerCase();
    var fingerprint = cert.fingerprint.toLowerCase();
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
    if (fingerprints.map(function(v){return v.toLowerCase()}).indexOf(fingerprint)==-1) {
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
          var cert = dcrypt.x509.createCert( 1024, 365*20, getSerial(), {// a bit under 20 years.
            "C": "US",
            "CN": "NameCoin Internet Authoritah", // respect it.
            "O": "NameCoin",
            "OU": "NmcSocks"
          }, {
            "basicConstraints": "critical,CA:TRUE",
            "keyUsage": "critical,keyCertSign,cRLSign",
            "subjectKeyIdentifier": "hash",
            "nsCertType": "sslCA",
            "nsComment": "This certificate was generated locally and is used by NmcSocks to allow TLS to be usable with Namecoin domains without the need for a central authority."
          });
          // sign yourself.
          cert.x509 = dcrypt.x509.signCert(cert.x509, cert.x509, cert.pkey);
          writeFile("namecoin_root.crt", cert.x509, function(){
            writeFile("namecoin_root.key", cert.pkey, function(){
              crt = cert.x509;
              pkey = cert.pkey;
              // XXX now would be a great time to blow away the certs/ folder, or we might end up with bad host certs
              console.log("Root CA created. proceeding to generate a cert for "+hostname);
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
              console.log("Root CA loaded. proceeding to generate a cert for "+hostname);
              generateCertFor(crt, pkey, hostname);
            }
          });
        }
      });
  } else {
      var cert = JSON.parse(data.toString());
      console.log("certificate for "+hostname+" loaded.");
      startTls(socket, {cert:cert.x509, key:cert.pkey}, callback);
    }
  });
  // 2. if not, find the root CA, generate a new cert for it.
  function generateCertFor(crt, pkey, hostname) {
    var cert = dcrypt.x509.createCert( 1024, 365*10, getSerial(), {
      "C": "US",
      "CN": hostname
    }, {
      "nsComment": "This certificate was generated locally by NmcSocks."
    });
    cert.x509 = dcrypt.x509.signCert(cert.x509, crt, pkey);
    writeFile("certs/"+hostname+".cert", JSON.stringify(cert), function(){});
    startTls(socket, {cert:cert.x509, key:cert.pkey}, callback);
  }
}

// 3. use cert to startTLS on the socket. ( https://gist.github.com/848444 )
function startTls(socket, options, callback) {
  console.log("STARTTLS: begin");
  var sslcontext = crypto.createCredentials(options);
  var pair = tls.createSecurePair(sslcontext, true); // this "true" is important.
  var cleartext = pipe(pair, socket);
  cleartext._controlReleased = false;

  pair.on("secure", function() {
    console.log("startTls::on_secure!");
    pair.cleartext.authorized = false;
    pair.cleartext.npnProtocol = pair.npnProtocol;
      
    cleartext._controlReleased = true;

    callback && callback(pair.cleartext);
  });

  console.log("STARTTLS: end. waiting for 'secure' event!");
  return cleartext;
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
    console.log("pipe::error",e);
    if (cleartext._controlReleased) {
      cleartext.emit('error', e);
    }
  }

  function onclose() {
    console.log("pipe::close");
    socket.removeListener('error', onerror);
    socket.removeListener('close', onclose);
    socket.removeListener('timeout', ontimeout);
  }

  function ontimeout() {
    console.log("pipe::timeout");
    cleartext.emit('timeout');
  }

  socket.on('error', onerror);
  socket.on('close', onclose);
  socket.on('timeout', ontimeout);

  return cleartext;
}


// do a little bit of setup automatically. XXX
initDataDir();


module.exports = {
  clientConnect: clientConnect,
  serverConnect: serverConnect
};
