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
      switch (question.class2) {
      case ndns.ns_c.in:
      case ndns.ns_c.any:
        switch(question.type) {
          case ndns.ns_t.any:
            resolver.resolveFull(question.name, resolver.types.ANY, wait.for(answerHandler)); break;
          case ndns.ns_t.a:
            resolver.resolveFull(question.name, resolver.types.IPV4, wait.for(answerHandler)); break;
          case ndns.ns_t.aaaa:
            resolver.resolveFull(question.name, resolver.types.IPV6, wait.for(answerHandler)); break;
          default:
            console.log("unhandled type:",question.type);
            // XXX unhandled type. no idea what to do.
        }
        function answerHandler(err, data) {
          if (err) {
            return console.log("Resolver error:", err);
          }
          var answers = data.answer;
          for (var i=0,l=answers.length;i<l;i++) {
            var type, answer=answers[i];
            switch (net.isIP(answer)) {
              case 0: type = ndns.ns_t.cname; break;
              case 4: type = ndns.ns_t.a; break;
              case 6: type = ndns.ns_t.aaaa; break;
            }
            console.log("RR: ",question.name,type,answer);
            res.addRR(ndns.ns_s.an, question.name, type, ndns.ns_c.in, 60, answer);
          }
          console.log("Returning answer: ", data);
        }
        break;
      default:
        console.log("unhandled class:",question.class2);
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
