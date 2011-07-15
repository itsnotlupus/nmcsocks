/* Wait.js
   poorly named module that keeps track of multiple async events and wait
   for things to be complete before moving on.

   Wait::start = Start to wait. if we're not waiting for anything, fire a "done" event.
   Wait::for = Add a function to wait for. Will keep waiting until that function runs.
*/

var EventEmitter = require("events").EventEmitter;

function Wait(){
  EventEmitter.call(this);

  this.counter = 0;
  this.ready = false;
}

Wait.prototype = {
  __proto__: EventEmitter.prototype,

  "for": function(func) {
    var self = this;
    self.counter++;
    return function() {
      try {
        var ret = func.apply(this, arguments);
      } finally {
        self.counter--;
        self.check();
        return ret;
      }
    };
  },
  check: function() {
    if (this.ready && !this.counter) {
      this.emit("done");
    }
  },
  start: function() {
    this.ready = true;
    this.check();
  } 
};

module.exports = Wait;
