/**
 * This is used when nmcresolver.js is called as a
 * main module.
 *
 * Define test namecoin records here, and see if
 * nmcresolver.js handles them as expected.
 *
 * WARNING: This file doesn't enforce a strict JSON syntax.
 * Naively copy/pasting a chunk from this file to an 
 * actual record could yield unexpected results.
 *
 * FWIW, I've tried to stay JSON-happy. 
 */

module.exports = {
  "d/example1": {
    "alias":"test.com."
  },
  "d/example2": {
    "ip"      : "192.168.1.1",
    "ip6"     : "2001:4860:0:1001::68",
    "tor"     : "eqt5g4fuenphqinx.onion",
    "email"   : "hostmaster@example.bit",
    "info"    : "Example & Sons Co.",
    "service" : [ ["smtp", "tcp", 10, 0, 25, "mail"] ],
    "map": {
        "www" : { "alias": "" },
        "ftp" : { "ip": ["10.2.3.4", "10.4.3.2"] },
        "mail": { "dns": ["ns1.host.net", "ns12.host.net"] }
    }
  },
  "d/example3": {
    "ip6": ["2001:4860:0:1001::68", "2001:4860:0:1001::69", "2001:4860:0:1001::70"]
  },
  "d/example4": {
    "ip": "1.2.3.4",
    "map": {
      "us": {
        "ip": "2.3.4.5",
        "map": {
          "www": { "alias": "" }
        }
      }
    }
  },
  "d/domain": {
    "ip": "8.8.8.8",
    "map": {
      "us": {
        "ip": "1.2.3.4",
        "map": { "www": { "alias": "" } }
      },
      "eu": {
        "map": { "www": { "alias": "us.@" }, "ftp": { "translate": "us.@" } },
      },
      "*": { "alias": "" }
    }
  },
  "d/importexample": {
    "import": [ ["s/shareddata", "www"], ["s/shareddata", "ftp"] ],
    "ip":"10.2.3.4",
    "map": { "ftp": {"email":"example@mail.bit"}}
  },
  "s/shareddata": {
    "ip":"10.0.0.1",
    "map": {
      "www":{"alias":""},
      "ftp":{ "ip":"10.0.1.2", "email":"shared@mail.bit"}
    }
  },
  "d/delegateexample": {
    "ip": "8.9.10.11",
    "map": {
      "www": [ "d/importexample" ],
      "ftp": { "delegate": [ "d/domain", "eu" ] },
      "us": { "ip": "192.168.0.0" }
    }
  }

};
