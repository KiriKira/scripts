#!/bin/bash
# Program:
#	Simple shell script fot install caddy and configure the systemd-service.
# Author: Kiri 
# Usage: bash caddy-systemd.sh http.filemanager,http.forwardproxy
PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:~/bin
export PATH

install_caddy(){
    wget -qO- https://getcaddy.com | bash -s personal ${plugins}
}

service_caddy(){
    wget -O /etc/systemd/system/caddy.service https://raw.githubusercontent.com/KiriKira/scripts/master/caddy.service
    mkdir -p /etc/ssl/caddy
    mkdir /etc/caddy
    touch /etc/caddy/Caddyfile
    systemctl enable caddy.service
}

plugins=$1
install_caddy
service_caddy
