
# NmcSocks: A NameCoin socks proxy.

Because you can never have too many namecoin socks proxies.

This one is written for node.js.  
It implements some of the new namecoin spec ( http://dot-bit.org/Domain_names )  
It gets namecoin records from namecoind on demand, rather than doing bulk grabs and caching.  
It tries pretty hard to "just work", although it has command line switches to fine tune its behavior.

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

## usage

From the parent directory,

    node nmcsocks

By default, nmcsocks will attempt to chain connections into another local socks proxy on port 9050.
If such a proxy doesn't exist, connections are made directly.

To run in strict "Tor" mode, where DNS leaks are prevented and "tor" fields in Namecoin records are given priority, use

    node nmcsocks --tor

To see all the settings, try

    node nmcsocks -h

