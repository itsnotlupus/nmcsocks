
# NmcSocks: A NameCoin socks proxy (and DNS server.)

Because you can never have too many namecoin socks proxies.

This one is written for node.js.  
It implements some of the new namecoin spec ( http://dot-bit.org/Domain_names )  
It gets namecoin records from namecoind on demand, rather than doing bulk grabs and caching.  
It tries pretty hard to "just work", although it has command line switches to fine tune its behavior.

Since v0.3, it includes an experimental DNS server too.

## usage

From the parent directory,

    node nmcsocks

By default, nmcsocks will attempt to chain connections into another local socks proxy on port 9050.
If such a proxy doesn't exist, connections are made directly.

To run in strict "Tor" mode, where DNS leaks are prevented and "tor" fields in Namecoin records are given priority, use

    node nmcsocks --tor

To start an experimental embedded DNS server that can resolve .bit domains, use

    node nmcsocks --dns

If you have a bind9 server, you can have it use this with a config like this

    zone "bit" { 
      type forward; 
      forwarders { 127.0.0.1 port 9053;};
    };

If you don't have bind9 laying around, you can use dig to test it, with

    dig gg.bit @127.0.0.1 -p 9053

To see all the settings, try

    node nmcsocks -h

## dependencies:

- node ( http://nodejs.org/ )
- optimist and binary ( `npm install optimist binary `)
- namecoin ( https://github.com/vinced/namecoin )

`namecoind` will need to be running for this proxy to be useful.

## todo

- ipv6 support
- support for the whole spec
- see what it takes to build standalone binaries
- test on windows.

## changelog

    v0.1: initial version
    v0.2: better draft spec support (delegate/import/alias stuff), infinite loop mitigation
    v0.3: embedded DNS server to resolve .bit domains
    v0.4: better DNS server support, various bug fixes
