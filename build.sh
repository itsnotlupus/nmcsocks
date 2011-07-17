#!/bin/sh

if [ ! -f "$1" ]
then
  echo "Build a binary version of NmcSocks using a node.js tarball."
  echo "Usage: $0 <node-tarball.tgz> [openssl_dir]"
  exit 1
fi

# This is for MingW, which apparently needs to be told where openssl hangs at.
if [ -d "$2" ]
then
  echo "Using $2 as openssl build directory.."
  FLAGS=" --openssl-libpath=$2 --openssl-includes=$2/include"
else
  FLAGS=""
fi


echo "* Flattening NmcSocks Source Files."
rm -rf flat/
mkdir -p flat
cp lib/*.js flat/
cp lib/ndns/*.js flat/
cp node_modules/optimist/index.js flat/optimist.js
cp node_modules/optimist/node_modules/wordwrap/index.js flat/wordwrap.js
#cat node_modules/binary/index.js | perl -pe 's{./lib/vars.js}{vars}g' > flat/binary.js
cp node_modules/binary/index.js flat/binary.js
cp node_modules/binary/lib/vars.js flat/vars.js
cp node_modules/binary/node_modules/put/index.js flat/put.js
cp node_modules/binary/node_modules/buffers/index.js flat/buffers.js
cp node_modules/binary/node_modules/chainsaw/index.js flat/chainsaw.js
cp node_modules/binary/node_modules/chainsaw/node_modules/traverse/index.js flat/traverse.js
cp lib/_third_party_main.js flat/_third_party_main.js
cp lib/_dcrypt.js flat/dcrypt.js
# convert all require("./path/file") to require("file")
cd flat
for file in *
do
  perl -pi -e 's{require\(['\''"][^"'\'']+/([^"'\''/]+)['\''"]\)}{require("$1")}g' "$file"
done
cd ..

echo "* Unzipping node.js tarball."
rm -rf tmp/
mkdir -p tmp
cd tmp
tar zxf ../"$1"
cd *

echo "* Patching node.js"
cp ../../flat/* lib/
perl -pi -e 's{(node::ParseArgs\(&?argc, argv\);)}{//$1};' src/node.cc

echo "* Building node.js"
./configure $FLAGS && make
cd ../..
cp tmp/*/build/default/node nmcsocks
if [ -f nmcsocks.exe ]
then
  strip nmcsocks.exe
elif [ -f nmcsocks ]
then
  strip nmcsocks
else
  echo "## Something went wrong. No executable was built."
  exit 1
fi

echo "* nmcsocks is ready."
# more error checking would be nice..

