#!/bin/sh

if [ ! -f "$1" ]
then
  echo "Build a binary version of NmcSocks using a node.js tarball."
  echo "Usage: $0 <node-tarball.tgz>"
  exit 1
fi


echo "* Flattening NmcSocks Source Files."
rm -rf flat/
mkdir -p flat
cp lib/*.js flat/
cp lib/ndns/*.js flat/
cp node_modules/optimist/index.js flat/optimist.js
cp node_modules/optimist/node_modules/wordwrap/index.js flat/wordwrap.js
cat node_modules/binary/index.js | perl -pe 's{./lib/vars.js}{vars}g' > flat/binary.js
cp node_modules/binary/lib/vars.js flat/vars.js
cp node_modules/binary/node_modules/put/index.js flat/put.js
cp node_modules/binary/node_modules/buffers/index.js flat/buffers.js
cp node_modules/binary/node_modules/chainsaw/index.js flat/chainsaw.js
cp node_modules/binary/node_modules/chainsaw/node_modules/traverse/index.js flat/traverse.js
cp lib/_third_party_main.js flat/_third_party_main.js

echo "* Unzipping node.js tarball."
rm -rf tmp/
mkdir -p tmp
cd tmp
tar zxf ../"$1"
cd *

echo "* Patching node.js"
cp ../../flat/* lib/
perl -pi -e 's{(node::ParseArgs\(argc, argv\);)}{//$1};' src/node.cc

echo "* Building node.js"
./configure && make
cd ../..
cp tmp/*/build/default/node nmcsocks
strip nmcsocks

echo "* nmcsocks is ready."
# error checking would be nice..

