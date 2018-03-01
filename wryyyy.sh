#!/usr/bin/bash

Get_IP(){
	ip=$(wget -qO- -t1 -T2 ipinfo.io/ip)
	if [[ -z "${ip}" ]]; then
		ip=$(wget -qO- -t1 -T2 api.ip.sb/ip)
		if [[ -z "${ip}" ]]; then
			ip=$(wget -qO- -t1 -T2 members.3322.org/dyndns/getip)
			if [[ -z "${ip}" ]]; then
				ip="VPS_IP"
			fi
		fi
	fi
}

wget https://install.direct/go.sh && bash go.sh

wget https://raw.githubusercontent.com/ToyoDAdoubi/doubi/master/caddy_install.sh && chmod +x caddy_install.sh && bash caddy_install.sh install http.forwardproxy

wget wget -O config.json https://raw.githubusercontent.com/KiriKira/vTemplate/master/websocket%2BCaddy%2BTLS\(use%20path\)/config_server.json

Get_IP
python wryyy.pyo $ip

service v2ray restart
service caddy restart