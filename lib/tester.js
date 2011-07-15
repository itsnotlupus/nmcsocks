/**
 * something to test the nmcresolver only.
 */

var resolver = require("./nmcresolver");
var Wait = require("./Wait");

var tests = [
  { query:"example1.bit", type:"ANY", answer:["test.com."] },
  { query:"example1.bit", type:"IPV4", answer:["204.12.0.50"] },
  { query:"example1.bit", type:"IPV6", error:true },
  { query:"example1.bit", type:"HOST", answer:["test.com."] },
  { query:"example2.bit", type:"IPV4", answer:["192.168.1.1"] },
  { query:"example2.bit", type:"IPV6", answer:["2001:4860:0:1001::68"] },
  { query:"example2.bit", type:"TOR", answer:["eqt5g4fuenphqinx.onion"] },
  { query:"www.example2.bit", type:"IPV4", answer:["192.168.1.1"] },
  { query:"www.example2.bit", type:"IPV6", answer:["2001:4860:0:1001::68"] },
  { query:"www.example2.bit", type:"TOR", answer:["eqt5g4fuenphqinx.onion"] },
  { query:"ftp.example2.bit", type:"ANY", answer:["10.2.3.4", "10.4.3.2" ] },
  { query:"ftp.example2.bit", type:"IPV4", answer:["10.2.3.4", "10.4.3.2" ] },
  { query:"ftp.example2.bit", type:"IPV6", error:true },
  { query:"ftp.example2.bit", type:"HOST", error:true },
  { query:"example3.bit", type:"IPV4", error:true },
  { query:"example3.bit", type:"IPV6", answer:["2001:4860:0:1001::68", "2001:4860:0:1001::69", "2001:4860:0:1001::70"] },
  { query:"example3.bit", type:"ANY", answer:["2001:4860:0:1001::68", "2001:4860:0:1001::69", "2001:4860:0:1001::70"] },
  { query:"www.example3.bit", type:"ANY", error:true },
  { query:"example4.bit", type:"ANY", answer:["1.2.3.4"] },
  { query:"us.example4.bit", type:"ANY", answer:["2.3.4.5"] },
  { query:"www.us.example4.bit", type:"ANY", answer:["2.3.4.5"] },
  { query:"domain.bit", type:"ANY", answer:["8.8.8.8"] },
  { query:"oh.noez.domain.bit", type:"ANY", answer:["8.8.8.8"] },
  { query:"us.domain.bit", type:"ANY", answer:["1.2.3.4"] },
  { query:"www.us.domain.bit", type:"ANY", answer:["1.2.3.4"] },
  { query:"eu.domain.bit", type:"ANY", error:true },
  { query:"www.eu.domain.bit", type:"ANY", answer:["1.2.3.4"] },
  { query:"ftp.eu.domain.bit", type:"ANY", answer:["1.2.3.4"] },
  { query:"any.www.eu.domain.bit", type:"ANY", answer:["1.2.3.4"] },
  { query:"any.ftp.eu.domain.bit", type:"ANY", error:true },
  { query:"importexample.bit", type:"ANY", answer:["10.2.3.4"] },
  { query:"www.importexample.bit", type:"ANY", answer:["10.2.3.4"] },
  { query:"ftp.importexample.bit", type:"ANY", answer:["10.0.1.2"] },
  { query:"delegateexample.bit", type:"ANY", answer:["8.9.10.11"] },
  { query:"www.delegateexample.bit", type:"ANY", answer:["10.2.3.4"] },
  { query:"ftp.www.delegateexample.bit", type:"ANY", answer:["10.0.1.2"] },
  { query:"ftp.delegateexample.bit", type:"ANY", error: true },
  { query:"www.ftp.delegateexample.bit", type:"ANY", answer:["192.168.0.0"] },
  { query:"any.www.ftp.delegateexample.bit", type:"ANY", answer:["192.168.0.0"] },
  { query:"ftp.ftp.delegateexample.bit", type:"ANY", answer:["192.168.0.0"] },
  { query:"any.ftp.ftp.delegateexample.bit", type:"ANY", error: true }
];

var testCount, testPassed=0;

function runTests() {

  resolver.testMode();

  testCount = tests.length;
  console.log("Starting tests...");

  var wait = new Wait;
  while(tests.length) {
    runTest(tests.shift(), wait.for(function() {
      testPassed++;
      //console.log("PASSED. "+testPassed+"/"+testCount);
    }));
  }
  wait.on('done', function() {
    console.log("Test Complete. Passed "+testPassed+"/"+testCount+". "+(testCount-testPassed)+" failure(s).");
  });
  wait.start();
}

function runTest(test, done) {
  resolver.resolveFull(test.query, resolver.types[test.type], function(err, data) {
    //console.log("runTest: ",test);
    if (err&&test.error) { return done(); } // automatic success in preordained failure. :-/
    assert(!err&&!test.error, test, (err&&err.message)||"expected error, but got data: "+data); // the prophesized failure did not come to pass!
    assert(data, test, "data is null or undefined");
    assert(data.length==test.answer.length, test, "data length didn't match: "+data.length);
    for (var i=0,l=data.length;i<l;i++) {
      assert(data[i]==test.answer[i], test, "data didn't match: "+data);
    }
    done();
  });
}

function assert(bool, test, details) {
  if (bool) return;
  console.log("Test Failed! query=",test.query,"type=",test.type,"answer=",test.answer,"details=",details);
  throw new Error("Test Failed.");
}

runTests();
