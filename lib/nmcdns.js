/**
 * This is why using your early product's main functionality 
 * as its name is a bad idea.
 *
 * Anyway yes NmcSocks is also a DNS server. sorry.
 */

var ndns = require("./ndns/ndns");
var net = require("net");
var resolver = require("./nmcresolver");
var Wait = require("./Wait");


function startServer(port, host, callback) {
  function listener (req, res) {
    //console.log("req=",req);

    var wait = new Wait;

    for (var i=0,l=req.question.length;i<l;i++) {
      var question = req.question[i];
      console.log("Question: What is",question.name,"?");
      switch (question.class) {
      case ndns.ns_c.in:
      case ndns.ns_c.any:
        switch(question.type) {
          // XXX tweak the resolver API to accept constraints on answer types
          // XXX also, allow multiple responses. the proxy doesn't need it, but this does.
          case ndns.ns_t.any:
          case ndns.ns_t.a:
          case ndns.ns_t.aaaa:
            resolver.resolve(question.name, wait.for(function(err, answer) {
              if (err) {
                return console.log("Resolver error:", err);
              }
              var type;
              switch (net.isIP(answer)) {
                case 0: type = ndns.ns_t.cname; break;
                case 4: type = ndns.ns_t.a; break;
                case 6: type = ndns.ns_t.aaaa; break;
              }
              res.addRR(ndns.ns_s.an, question.name, type, ndns.ns_c.in, 60, answer);
              console.log("Returning answer: ",answer);
            }));
            break;
          default:
            console.log("unhandled type:",question.type);
            // XXX unhandled type. no idea what to do.
        }
        break;
      default:
        console.log("unhandled class:",question.class);
        // XXX unhandled class. What's the right answer for that?
      }
    }

    res.header.ra = 1;

    wait.on("done", function() {
      res.send();
    });
    wait.start();

  }

  var server = ndns.createServer ('udp4');
  server.bind (port, host);
  server.on ('request', listener);

  callback();
}

module.exports.startServer = startServer;
