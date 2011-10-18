var ndns = require('./ndns');

/**
 * resolver points to a ndns client when necessary.
 * otherwise, we close it and remove it.
 *
 * this allows node to end normally.
 */
var resolver;

var r_id = 1; // unique ID to map each DNS answer to a query.
var active_queries = 0;

function resolve (domain, rrtype, rrclass, server, cb) {

    if (!resolver) {
      resolver = ndns.createClient("udp4");
    }

    var req = resolver.request(53, server);
    var type = ndns.ns_t[rrtype.toLowerCase()];
    var class2 = ndns.ns_c[rrclass.toLowerCase()];

    active_queries++;

    r_id = (r_id+1)%65536;
    req.header.id = r_id;
    req.header.rd = 1; // recursion desired.
    req.header.qdcount = 1;
    req.addQuestion (domain, type, class2);
    req.send();

    resolver.on("response", function handler(res) {
      if (res.header.id == req.header.id) {
        resolver.removeListener("response", handler);
	active_queries--;
        if (!active_queries) {
          resolver.close();
          resolver = null;
        }
	if (res.header.opcode == ndns.ns_rcode.noerror) {
	    var addrs = [];
	    for (var i = 0; i < res.answer.length; i++) {
		var answer = res.answer[i];
		if (answer.type != type)
		    continue;
		if (answer.rdata.length == 1)
		    addrs.push(answer.rdata[0]);
		else
		    addrs.push(answer.rdata);
	    }
	    if (typeof cb === 'function')
		cb (null, addrs);
	}
	else {
	    if (typeof cb === 'function')
		cb (new Error(res.header.opcode));
	}
      }
    });
}

var resolve4 = function (domain, server, cb) {
    resolve(domain, "A", "IN", server, cb); 
};

module.exports = {
  resolve: resolve,
  resolve4: resolve4
};

