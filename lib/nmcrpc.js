const USER_AGENT = "node_socks_proxy";

var default_host = "127.0.0.1";
var default_port = 8332;
var default_user = "rpcuser";
var default_password = "rpcpassword";
var default_usessl = false;
var config_ready = false;
var data_dir;

function getConfig(callback) {
  if (config_ready) {
    return callback();
  }
  require("fs").readFile(getDataDir()+"/bitcoin.conf", function(err, data) {
    if (err) throw err;
    var lines=  data.toString().split("\n");
    var obj= {};
    for (var i=0;i<lines.length;i++) {
      var line=lines[i].trim();
      if (line.charAt(0)=="#" || line.length==0) continue;
      var tmp=line.split("=",2);
      obj[tmp[0]]=tmp[1];
    }

    default_host = obj.rpcconnect || default_host;
    default_port = obj.rpcport || default_port;
    default_user = obj.rpcuser;
    default_password = obj.rpcpassword;
    config_ready = true;

    callback();
  });
}

function getDefaultDataDir() {
  switch(process.platform) {
    case "win32":
      return process.env.APPDATA + "/Namecoin";
    case "darwin":
      return process.env.HOME + "/Library/Application Support/Namecoin";
    case "linux":
    default:
      return process.env.HOME + "/.namecoin";
  }
}

function getDataDir() {
  if (!data_dir) {
    return getDefaultDataDir();
  } else {
    return data_dir;
  }
}

function setDataDir(dir) {
  data_dir = dir;
}

function callRPC(method, args, host, port, user, password, useSSL, callback) {

  var a = arguments;
  if (!config_ready) {
    return getConfig(function() { callRPC.apply(null,a); });
  }

  if (a.length<8) {
    callback = a[a.length-1];
    a[a.length-1] = null;
  }

  // default values;
  args=args||[];
  host=host||default_host;
  port=port||default_port;
  user=user||default_user;
  password=password||default_password;
  useSSL=useSSL||default_usessl;

  // craft request together..

  var content = JSON.stringify({
    method: method,
    params: args,
    id: "some_id"
  });
  var headers = {
    host: host,
    port: port,
    path: "/",
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Host": host,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Content-Length": content.length,
      "Authorization": "Basic " + new Buffer(user+":"+password).toString("base64")
    }
  };

  var transport = require(useSSL?"https":"http");
  var req = transport.request(headers, function(res) {
    if (res.statusCode != 200) {
      callback(new Error("RPC Error: "+res.statusCode));
      return;
    }
    res.setEncoding('utf8');
    var body=[];
    res.on('data', function(chunk) {
      body.push(chunk.toString());
    });
    res.on('end', function() {
      try {
        var obj = JSON.parse(body.join(''));
      } catch (e) {
        callback(e);
        return;
      }
      if (obj.error) {
        callback(new Error(obj.error));
        return;
      }
      callback(null, obj.result);
    });
  });

  req.on('error', function(e) {
    callback(e);
  });

  req.write(content);
  req.end();
}

module.exports = {
  call: callRPC,
  setDataDir: setDataDir,
  getDataDir: getDataDir
};
