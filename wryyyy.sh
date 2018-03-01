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

apt-get install -y curl

bash <(curl -L -s https://install.direct/go.sh)

curl -s -o caddy_install.sh  https://raw.githubusercontent.com/ToyoDAdoubi/doubi/master/caddy_install.sh && chmod +x caddy_install.sh && bash caddy_install.sh install http.forwardproxy

curl -s -o /etc/v2ray/config.json https://raw.githubusercontent.com/KiriKira/vTemplate/master/websocket%2BCaddy%2BTLS\(use%20path\)/config_server.json
curl -s -o wryyy.pyo https://github.com/KiriKira/scripts/raw/master/wryyy.pyo

Get_IP
python wryyy.pyo $ip

service v2ray restart
service caddy restart
