
# NmcSocks: A NameCoin socks proxy.

Because you can never have too many namecoin socks proxies.

This one is written for node.js.
It implements some of the new spec.
It gets namecoin records from namecoind on demand, rather than doing bulk grabs and caching.

## dependencies:

- node ( http://nodejs.org/ )
- optimist and binary ( `npm install optimist binary `)

## todo

- ipv6 support
- support for the whole spec
- see what it takes to build standalone binaries
- test on windows.

## usage

From the parent directory,

    node nmcsocks

There are a bunch of command line switches.
By default, nmcsocks will attempt to chain connections into another local socks proxy on port 9050.
If such a proxy doesn't exist, connections are made directly.
To see all the settings, try

    node nmcsocks -h

