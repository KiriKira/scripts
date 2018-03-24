#!/bin/bash
# Program:
#	Simple shell script fot install caddy and configure the systemd-service.
# Author: Kiri 
PATH=/bin:/sbin:/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/sbin:~/bin
export PATH

install_caddy(){
    curl https://getcaddy.com | bash -s personal ${plugins}
}

service_caddy(){
    
}

