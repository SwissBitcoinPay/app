#!/bin/bash

cd $(dirname $0)

ROOT="$(pwd)/.."

ORG="SwissBitcoinPay"
REPO="bitbox-wallet-app"

rm -rf $REPO

git clone --depth 1 https://github.com/$ORG/$REPO.git

cd $REPO

# make dockerinit
docker build --pull --force-rm -t shiftcrypto/bitbox-wallet-app .

# make dockerdev
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"

container_name=bitbox-wallet-dev
repo_path="$DIR/.."

docker run \
        --rm \
        --detach \
        --platform "linux/amd64" \
        --interactive \
        --name=$container_name \
        --add-host="dev.shiftcrypto.ch:176.9.28.202" \
        --add-host="dev1.shiftcrypto.ch:176.9.28.155" \
        --add-host="dev2.shiftcrypto.ch:176.9.28.156" \
        -v "$repo_path":/opt/go/src/github.com/$ORG/$REPO \
        shiftcrypto/bitbox-wallet-app bash

docker exec -it "$container_name" groupadd -o -g "$(id -g)" dockergroup
docker exec -it "$container_name" useradd -u "$(id -u)" -m -g dockergroup dockeruser

docker exec --user=dockeruser -it $container_name bash -c "cd /opt/go/src/github.com/$ORG/$REPO/backend/mobileserver && make build-android"

docker stop bitbox-wallet-dev

cp ./backend/mobileserver/mobileserver.aar $ROOT/android/app/libs