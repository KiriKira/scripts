#!/usr/bin/env python2
# -*- coding: utf-8 -*-
"""
    Simple V2Ray script for personal use.
    Please use git.io/kiri as far as possible.
    Author : KiriKira
    Version : 2.1
"""

import uuid
import json
import os
from shutil import copy2
from subprocess import call
from platform import linux_distribution

dict4choice = {
    "3": "TCP",
    "4": "http",
    "5": "mKcp",
    "6": "mKcp 伪装微信视频流量",
    "7": "websocket",
    "8": "websocket+TLS",
    "9": "websocket+Caddy+TLS(use path)",
    "10": "websocket+Caddy+TLS(use header)",
    "11": "Shadowsocks+mKcp"
}


def mycall(command):
    return call(command, shell=True)


def loadjson():
    return json.load(file("/etc/v2ray/config.json", "r"))


def write(config):
    myjsondump = json.dumps(config, indent=1)
    openjsonfile = file("/etc/v2ray/config.json", "w+")
    openjsonfile.writelines(myjsondump)
    openjsonfile.close()


def set_uuid(config):
    config[u"inbound"][u"settings"][u"clients"][0][u"id"] = str(uuid.uuid1())
    return config


def set_port(config):
    myport = raw_input("Input your port\n")
    config[u"inbound"][u"port"] = int(myport)
    mycall("iptables -I INPUT -m state --state NEW -m tcp -p tcp --dport " + myport + " -j ACCEPT")
    mycall("iptables -I INPUT -m state --state NEW -m tcp -p tcp --dport " + myport + " -j ACCEPT")
    if linux_distribution()[0] == "CentOS Linux":
        if raw_input("Do you want me to turn off your firewalld?(Y)\n") in ['Y', 'y']:
            mycall("systemctl stop firewalld")
            mycall("systemctl disable firewalld")
        else:
            print("Now you should deal with the firewalld by yourself")
    return config


# set a set of settings
def set_set(config, key_path=None, cer_path=None, passwd=None):
    config = set_port(config)
    if passwd is not None:
        config[u"inbound"][u"settings"][u"password"] = passwd
        write(config)
        return None
    config = set_uuid(config)
    if key_path is not None and cer_path is not None:
        config[u"inbound"][u"tlsSettings"][u"certificates"][0][u"keyFile"] = key_path
        config[u"inbound"][u"tlsSettings"][u"certificates"][0][u"certificateFile"] = cer_path
    write(config)


# generate the config
def generate(choice):
    key_path, cer_path, passwd = None, None, None
    name = dict4choice[choice]
    if os.path.isfile("/etc/v2ray/config.json"):
        os.remove("/etc/v2ray/config.json")
    copy2("./vTemplate/" + name + "/config_server.json", "/etc/v2ray/config.json")
    config = loadjson()
    if choice == '8':
        key_path = raw_input("Now enter your path to keyFile\n")
        cer_path = raw_input("Now enter your path to certificateFile\n")
    if choice == '11':
        passwd = raw_input("Now enter your password")
    set_set(config, key_path, cer_path, passwd)

    if choice in ['9', '10']:
        if os.path.isfile("/usr/local/caddy/Caddyfile"):
            os.remove("/usr/local/caddy/Caddyfile")
        copy2("./vTemplate/" + name + "/Caddyfile", "/usr/local/caddy/Caddyfile")
        if raw_input("Now you can edit Caddyfile by yourself(Y)\n") in ['Y', 'y']:
            mycall("vi /usr/local/caddy/Caddyfile")
            mycall("service caddy restart")

    mycall("service v2ray restart")
    print("Enjoy V2Ray now! Also, you can get config_client.json in GitHub -- https://git.io/kiri ")


if __name__ == "__main__":
    if linux_distribution() == "CentOS Linux":
        mycall("yum install git")
    else:
        mycall("apt-get install git")
    mycall("git clone https://github.com/KiriKira/vTemplate.git")
    mychoice = raw_input('''
    So that's just a simple script for v2ray.
    Please choose the number as you like.
    1.Install V2Ray
    2.Install caddy
    3.TCP
    4.HTTP
    5.mKcp
    6.mKcp(wechat_vedio)
    7.websocket
    8.websocket+TLS
    9.websocket+caddy(path)+TLS
    10.websocket+caddy(header)+TLS
    11.ss+mkcp
    12.configure date
''')
    if mychoice == "1":
        mycall("wget -qO- https://install.direct/go.sh | bash")
    elif mychoice == "2":
        mycall(("wget https://raw.githubusercontent.com/ToyoDAdoubi/doubi/master/caddy_install.sh"
                " && chmod +x caddy_install.sh && bash caddy_install.sh install http.forwardproxy"))
    elif mychoice == "12":
        date = raw_input("Enter the date, must format like \n2017-01-22 16:16:23\n")
        mycall("date --set=\"{}\"".format(date))
    else:
        generate(mychoice)
