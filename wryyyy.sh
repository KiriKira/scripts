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

curl -o caddy_install.sh  https://raw.githubusercontent.com/ToyoDAdoubi/doubi/master/caddy_install.sh && chmod +x caddy_install.sh && bash caddy_install.sh install http.forwardproxy

curl -o /etc/v2ray/config.json https://raw.githubusercontent.com/KiriKira/vTemplate/master/websocket%2BCaddy%2BTLS\(use%20path\)/config_server.json

curl -o wryyy.py https://raw.githubusercontent.com/KiriKira/scripts/master/wryyy.py

Get_IP
python wryyy.py $ip

service v2ray restart
echo "等待五分钟以保证dns记录生效, 当然你也可以退出脚本一会自己重启caddy, 如果等待完caddy依然没起来就手动重启吧"
sleep 5m
service caddy restart
