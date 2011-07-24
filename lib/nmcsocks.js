
const VERSION = "0.4";

var net = require("net");
var binary = require("binary");
var resolver = require("./nmcresolver");
var rpc = require("./nmcrpc");
var nmctls = require("./nmctls");

var argv = require("optimist")
    .usage("Start a NameCoin Socks 5 Proxy.\nUsage: $0")
    .options("ip", {
      alias: "i",
      default: "127.0.0.1",
      describe: "IP Address for the proxy to listen on"
    })
    .options("port", {
      alias: "p",
      default: 9055,
      describe: "Port for the proxy to listen on"
    })
    .options("chain", {
      alias: "c",
      default: "auto",
      describe: "Proxy chain policy (always|never|auto)"
    })
    .options("shost", {
      default: "127.0.0.1",
      describe: "Socks Proxy host to chain into"
    })
    .options("sport", {
      default: 9050,
      describe: "Socks Proxy port to chain into"
    })
    .options("private", {
      default: false,
      describe: "Refuse to resolve NameCoin domains that would cause a DNS leak. Implies --chain=always"
    })
    .options("tor", {
      default: false,
      describe: "Resolve Tor addresses preferably. Implies --private"
    })
    .options("i2p", {
      default: false,
      describe: "Resolve I2P addresses preferably. Implies --private"
    })
    .options("dns", {
      default: false,
      describe: "Start a DNS server to resolve Namecoin names"
    })
    .options("dnsport", {
      default: 9053,
      describe: "Port for the DNS server to listen on"
    })
    .options("dnsip", {
      default: "127.0.0.1",
      describe: "IP address for the DNS server to listen on"
    })
    .options("dir", {
      describe: "Namecoin configuration directory"
    })
    .options("test", {
      describe: "Test mode. Enable some static namecoin records. Not for general use."
    })
    .options("help", {
      alias: "h",
      describe: "Display this help message"
    })
    .options("version", {
      alias: "v",
      describe: "Show version number and exit"
    })
    .argv;

// Usage/Version
switch(true){
  case argv.help:
    require("optimist").showHelp();
    process.exit(1);
  case argv.version:
    console.log("NmcSocks version",VERSION);
    process.exit(1);
}

// namecoin config directory handling
if (argv.dir) {
  try {
    fs.statSync(argv.dir);
    if (!fs.isDirectory) { throw "no"; }
  } catch (e) {
    console.log("Error: namecoin config --dir value is not a valid directory.");
    process.exit(1);
  }
  rpc.setDataDir(argv.dir);
  console.log("Using namecoin config directory: ", rpc.getDataDir());
}

// Tor mode
if (argv.tor) {
  resolver.setTorMode(true);
  argv.private = true;
  console.log("Tor mode is enabled.");
}
// I2P mode
if (argv.i2p) {
  resolver.setI2PMode(true);
  argv.private = true;
  console.log("I2P mode is enabled.");
}

// private mode handling (really meant for use with Tor.)
if (argv.private) {
  resolver.setPrivateMode(true);
  argv.chain = "always";
  console.log("Private mode is enabled.");
}

// test mode, mostly for dev stuff. don't use this, mm'kay?
if (argv.test) {
  resolver.testMode();
}

function namecoinRpcTester(next) {
  rpc.call("getinfo",[],function(err,data) {
    if (err) {
      console.log("Error: Communication with the Namecoin server failed.");
      console.log(" - Check the content of the file",rpc.getDataDir()+"/bitcoin.conf");
      console.log(" - Make sure the Namecoin server is running.");
      process.exit(1);
    } 
    next();
  });
}

function chainProxyTester(next) {
  switch (argv.chain) {
    case "never":
      argv.chain=false;
      break;
    case "always":
    case "auto": // test the existence of a proxy to chain into
      openSocksSocket(argv.shost, argv.sport, "yahoo.com", "80", function(err, socket) {
        if (err) {
          console.log("No socks proxy found on "+argv.shost+":"+argv.sport+".");
          if (argv.chain=="always") {
            console.log("Error: --chain=always, but no chain proxy found. Aborting.");
            process.exit(1);
          }
          argv.chain = false;
        } else {
          socket.destroy();
          argv.chain = true;
        }
        next();
      });
      return;
  }
  next();
}

function startDNSServer() {
  require("./nmcdns").startServer(argv.dnsport, argv.dnsip, function() {
    console.log("DNS Server started on "+argv.dnsip+":"+argv.dnsport);
  });
}

function startProxyServer() {
  var server = net.createServer(function(client) {
    client.setNoDelay(true);
    new_client(client);
  });
  server.on("error", function(e) {
    if (e.code == 'EADDRINUSE') {
      console.log("Error: Address is already in use.");
      process.exit(1);
    }
    console.log("Error:",e.message);
    process.exit(1);
  });

  if (argv.ip!="") {
    server.listen(+argv.port, argv.ip, serverHandler);
  } else {
    server.listen(+argv.port, serverHandler);
  }

  function serverHandler() {
    console.log("Success! NmcProxy started on "+argv.ip+":"+argv.port);
  }
}

// Refuse to die. (Think of stack traces on the console as the proxy coughing blood.)
process.on('uncaughtException', function(err) { console.log(err.stack)});
// run a few sanity tests and start the proxy
namecoinRpcTester(function() {
  chainProxyTester(function() {
    console.log("Chain proxying is", argv.chain?"enabled to "+argv.shost+":"+argv.sport+".":"disabled.");
    if (argv.dns) {
      startDNSServer();
    }
    startProxyServer();
  });
});

var failBuffer = new Buffer([ 5, 255]);
// New client subroutine. This implements the 
// subset of socks 5 we support.
function new_client(client) {
  var t, i, buff, ord, success;

  binary(client).word8("version").word8("method_count").tap(function(vars) {
    if (vars.version != 5) { client.end(failBuffer); return; } // must be SOCKS 5
    this.buffer('methods', vars.method_count).tap(function(vars) {
      var success = false;
      method: for (var i=0,l=vars.methods.length;i<l;i++) {
        switch(vars.methods[i]) {
        case 0:
          client.write(new Buffer([ 5, 0]));
          success = true;
          break method;
        default:
          // some auth method I don't implement. ignore.
        }
      }
      if (!success) {
        // whine and close
        client.end(failBuffer);
      } else {
        var response = [5, 0, 0], command, host = "", port;
        this.word8("version").word8("command").word8("reserved").word8("addr_type").tap(function(vars) {
          if (vars.version != 5) { client.end(failBuffer); return; }
          if (vars.reserved != 0) { client.end(failBuffer); return; }
          command = vars.command;
          switch(vars.addr_type) {
            case 1: // IPv4
              this.buffer("ipv4", 4).tap(function(vars) {
                var i = vars.ipv4;
                response.push(1, i[0], i[1], i[2], i[3]);
                host = [ i[0], i[1], i[2], i[3] ].join(".");
                readPort.call(this);
              }); break;
            case 3: // Domain name
              this.word8("host_length").tap(function(vars){
                response.push(3, vars.host_length);
                this.buffer("host", vars.host_length).tap(function(vars){
		  response = response.concat(Array.prototype.slice.call(vars.host,0));
                  host = vars.host.toString("ascii");
                  readPort.call(this);
                });
              }); break;
            case 4: // IPv6
              this.buffer("ipv6", 16).tap(function(vars){
                // XXX not implemented
              }); 
            default:
              client.end(failBuffer); return;
          }
        });

        function readPort() {
          this.word16bu("port").tap(function(vars) {
            response.push(vars.port>>8, vars.port&255);
            port = vars.port;
            // done with binary parsing. unplug node-binary
            client.removeAllListeners("data");
            socks_do(command, client, host, port, response);
          });
        }
      }
    });
  });
}

function socks_do(t, client, hostname, port, response) {

  // resolve "host" through NameCoin, if applicable
  resolver.resolve(hostname, function(err, data) {

  if (err) {
    response[1] = 4;
    client.end(new Buffer(response));
    console.log("ERROR: ", err.message);
    return;
  }

  var host = data.answer[0]; // XXX for extra point, loop through the answer if the previous ones fail.

  switch (t) {
  case 1:
    if (data.fingerprint && data.fingerprint.length && port == 443) { // hardcoded port.. this is not awesome, design-wise.
      // take the SSL MITM path instead.
      nmctls.clientConnect(port, host, hostname, data.fingerprint, function(err, socket) {
     
        if(err) {
          console.log("10: NmcSocks frowns upon your puny SSL server.",err);
          return;
        }
        console.log("10: NmcSocks approves of your SSL connection.");
        // needed to allow the other side of the TLS setup to work
        client.on("data", function(data){ 
          console.log("browser sent: ",data);
        });
        nmctls.serverConnect(client, hostname, function(client) {
          console.log("30: It seems to have worked. piping the two ends now.");
          client.setMaxListeners(30);
          socket.setMaxListeners(30);

          client.pipe(socket);
          socket.pipe(client);
        });
        client.write(new Buffer(response));
        console.log("20: ok, waiting for tls initiation to be done on the client side now.");
      });
    } else {
      socks_connect(client, host, port, response);
    }
    break;
  case 2:
    socks_bind(client, host, port); break;
  case 3:
    socks_udp_associate(client, host, port); break;
  default:
  }

  });
}

function openSocksSocket(sock_host, sock_port, host, port, callback) {
  var socket = new net.Socket({type: 'tcp4'});
  socket.connect(sock_port, sock_host, function() {
    socket.write(new Buffer([05, 01, 00])); // socks 5, one method, unauthenticated.
    socket.once("data", function(data) {
      if (data[0]!=5 || data[1]!=0) { // socks 5, unauthenticated.
        socket.destroy();
        return callback(new Error("No love from chained proxy."));
      }
      var buf = [ 05, 01, 00 ]; // socks 5, tcp, reserved.
      switch(net.isIP(host)) {
        case 0: // it's a hostname. probably.
          buf.push( 3, host.length);
          buf.push.apply(buf, host.split("").map(function(a){return a.charCodeAt()}));
          break;
        case 4:
          buf.push( 1);
          buf.push.apply(buf, host.split(".").map(Number));
          break;
        case 6:
          // not implemented. XXX
          break;
      }
      // port
      buf.push( port>>8, port&255);
      socket.write(new Buffer(buf));
      socket.once("data", function(data) {
        if (data[0]!=5 || data[1]!=0) { // socks 5, gravy.
          socket.destroy();
          return callback(new Error("Can't connect to that host, or something."));
        }
        // if we're here, we should have a usable socket that pipes stuff to host:port.
        callback(null, socket);
      });
    });
  });
  socket.once("error", function(e) {
    socket.destroy();
    callback(e);
  });
}

function socks_connect(client, host, port, response) {

  var socket;

  //console.log("Starting connection to "+host+":"+port);

  if (argv.chain == "never") {
      socket = new net.Socket({type: 'tcp4'});
      socket.connect(port, host, function() {
        socketHandler(client, socket, response);
      });
      socket.once("error", socketErrorHandler);
  } else {
    openSocksSocket(argv.shost, argv.sport, host, port, function(err, data){
      if (err) {
        if (argv.chain == "always") {
          // critical error. we cannot proceed.
          socketErrorHandler(new Error("Couldn't chain through "+argv.shost+":"+argv.sport+" and --chain="+argv.chain+". Dropping connection."));
        } else {
          socket = new net.Socket({type: 'tcp4'});
          socket.once("error", socketErrorHandler);
          socket.connect(port, host, function() {
            socketHandler(client, socket, response);
          });
        }
      } else {
        socket = data;
        socket.once("error", socketErrorHandler);
        socketHandler(client, socket, response);
      }
    });
  }

  function socketErrorHandler(e) {
    response[1]=4; // XXX may not be the right error..
    client.end(new Buffer(response));
    console.log("Error: ",e.message," while connecting to ",host,":",port);
  }
}

function socketHandler(client, socket, response) {

  client.setMaxListeners(30);
  socket.setMaxListeners(30);

  client.pipe(socket);
  socket.pipe(client);

  // everything is setup. let the client know about it.
  try { 
    client.write(new Buffer(response));
  } catch (e) {
    // the client hang up on me? lame.
  }

};

function socks_bind(client, host, port) {
  throw new Error("socks_bind not implemented.");
}

function socks_udp_associate(client, host, port) {
  throw new Error("socks_udp_associate not implemented.");
}

