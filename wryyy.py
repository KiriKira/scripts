#!/usr/bin/python
# -*- coding: utf-8 -*-

import json, uuid, os, sys
from subprocess import call

uuid_config = str(uuid.uuid1())

caddyfile_template = \
'''
https://{}.lovekiri.cf {{
    gzip
    tls {}

    proxy / https://www.google.com.hk/ {{ 
        except /test 
        }}

    proxy /test localhost:1234 {{
        websocket
        header_upstream -Origin
        }}
}}
'''

cmd_template = \
'''
curl -X GET "https://api.kirikira.moe/kiri.php?name={}.lovekiri.cf&content={}" 
'''

result_template = \
'''
配置已完毕,以下是你的配置信息:
域名(服务器): {}.lovekiri.cf
端口: 443
V2Ray uuid: {}
传输方式: websocket
TLS: ON
ws path: /test
加密: 随意
Alterid: 100
接下来先在浏览器中尝试打开域名, 如果什么都打不开的话先打开主域名 lovekiri.cf 确认域名存活, 再把v2ray和caddy重启一遍并检查日志.
'''

def load_json():
    with open("/etc/v2ray/config.json","r") as f:
        return json.load(f)

def save_json(dicty):
    myjsondump = json.dumps(dicty, indent=4)
    with open("/etc/v2ray/config.json","w") as f:
        f.writelines(myjsondump)

if __name__ == '__main__':
    begin_text = \
'''
欢迎使用Kiri的辣鸡v2ray+caddy+wss+cdn脚本.
请务必注意使用本脚本带来的所有风险将由您自己负担.
风险可能包括:暴露自己的源站ip地址;公用域名在一段时间后被回收;域名解析记录失效;脚本运行失败等.
同时,caddy默认的配置将提供咕果的镜像(也就是在浏览器中输入域名后将可不用代理使用咕果),
我推荐您不要修改,这样Kiri可以将对应域名公开作为公益节点(放心, 不会公开您的源站 ip 和 V2Ray 信息)
按下回车继续运行本脚本即表示您已经知晓并且同意上述内容.
'''
    raw_input(begin_text)

    ip = sys.argv[1]
    ip_check = raw_input(ip + '\n这是你的ip吗?如果是请直接回车,如果不是请手动输入\n')
    if ip_check:
        ip = ip_check

    subdomain = raw_input("请输入一个你喜欢的单词,作为二级域名的前缀,不要太常见的否则可能撞车.也不要太长.\n")

    print('正在修改V2Ray配置文件...')
    v2conf = load_json()
    v2conf[u'inbound'][u'settings'][u'clients'][0][u'id'] = uuid_config
    save_json(v2conf)
    print('完毕')

    mail = raw_input('请输入你的邮箱,这是Caddy申请证书用的\n')
    caddyfile = caddyfile_template.format(subdomain, mail)
    cmd = cmd_template.format(subdomain, ip)

    print('正在修改Caddy配置文件...')
    with open('/usr/local/caddy/Caddyfile', 'w') as f:
        f.write(caddyfile)
    print('完毕')


    print('正在向cf添加记录...')
    call(cmd, shell=True)
    print('完毕')

    result = result_template.format(subdomain, uuid_config)
    print(result)

    




    










