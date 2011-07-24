
# NmcSocks: A NameCoin socks proxy (and DNS server.)

NmcSocks is a SOCKS proxy that resolves Namecoin hostnames.

In addition, it can chain its connections into another SOCKS proxy, primarily to allow Tor/I2P interoperability.  
It can also be used as a DNS server to resolve .bit domains specifically. See examples below.

It is designed to run side-by-side with namecoind, and its default settings will "just work" out of the box.  
It also has a number of command line switches to fine tune its behavior.

## get it

Binaries for linux32, osx32 and win32 are available at
https://github.com/itsnotlupus/nmcsocks/downloads

The source is also accessible at
https://github.com/itsnotlupus/nmcsocks

## usage

    Start a NameCoin Socks 5 Proxy.
    Usage: ./nmcsocks 
    
    Options:
      --ip, -i       IP Address for the proxy to listen on                                                   [default: "127.0.0.1"]
      --port, -p     Port for the proxy to listen on                                                         [default: 9055]
      --chain, -c    Proxy chain policy (always|never|auto)                                                  [default: "auto"]
      --shost        Socks Proxy host to chain into                                                          [default: "127.0.0.1"]
      --sport        Socks Proxy port to chain into                                                          [default: 9050]
      --private      Refuse to resolve NameCoin domains that would cause a DNS leak. Implies --chain=always
      --tor          Resolve Tor addresses preferably. Implies --private
      --i2p          Resolve I2P addresses preferably. Implies --private
      --dns          Start a DNS server to resolve Namecoin names
      --dnsport      Port for the DNS server to listen on                                                    [default: 9053]
      --dnsip        IP address for the DNS server to listen on                                              [default: "127.0.0.1"]
      --dir, -d      Namecoin configuration directory
      --help, -h     Display this help message
      --version, -v  Show version number and exit

By default, NmcSocks will start listening for SOCKS proxy requests on port 9055.

It will attempt to chain connections into another local socks proxy on port 9050.  
If such a proxy doesn't exist, connections are made directly.

To run in strict "Tor" mode, where DNS leaks are prevented and "tor" fields in Namecoin records are given priority, use

    ./nmcsocks --tor

To start an experimental embedded DNS server on port 9053 that can resolve .bit domains, use

    ./nmcsocks --dns

If you have a bind9 server, you can have it use this with a config like this

    zone "bit" { 
      type forward; 
      forwarders { 127.0.0.1 port 9053;};
    };

If you don't have bind9 laying around, you can use dig to test it, with

    dig gg.bit @127.0.0.1 -p 9053

To see all the settings, try

    ./nmcsocks -h

## dependencies:

This proxy requires namecoin to be installed, configured and running.  
You can get namecoin from https://github.com/vinced/namecoin  
Optionally, you can get precompiled namecoin binaries from http://dot-bit.org/

If you are using the source version, you will also need:  

- node ( http://nodejs.org/ )  
- optimist and binary ( `npm install optimist binary `)

If you are building from the top of the tree, you will also need:

- dcrypt . `npm install dcrypt` would normally work, but I rely on 
 a couple of patches that aren't in it yet, so you'll need to grab it from
 https://github.com/itsnotlupus/dcrypt . Put that under nmcsocks/node_modules/dcrypt,
 and build it with `node-waf configure build`. That ought to do it.

## new stuff to pay attention to:

If you're trying to use the new "fingerprint" support code, you'll need to add the
X.509 CA certificate NmcSocks creates locally into your browser. The procedure varies
for each browser. The CA certificate is located under <NmcSocksDataDir>/namecoin_root.crt  
On unix, <NmcSocksDataDir> is ~/.nmcsocks/  
On windows, it's %APP_DATA%/NmcSocks/  
Mac Users, look under ~/Library/Application\ Support/NmcSocks/

## todo

- ipv6 support
- support for the whole spec

## changelog

    v0.1: initial version
    v0.2: better draft spec support (delegate/import/alias stuff), infinite loop mitigation
    v0.3: embedded DNS server to resolve .bit domains
    v0.4: better DNS server support, various bug fixes
    v0.5: support for the "fingerprint" record field, enabled decentralized TLS certificate trust.
